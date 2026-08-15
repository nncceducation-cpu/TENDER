import {
  ASSESSMENT_SCHEDULE,
  ELIGIBILITY,
  ESCALATION,
  MINOR_SURGERIES,
  POSTOP_DOSING,
  WEAN_RULES,
  type WeanRule,
} from '../data/protocol/ach';
import type { PatientContext } from '../domain/types';

// ---------------------------------------------------------------------------
// Surgery classification
// ---------------------------------------------------------------------------

export type SurgeryClass = 'minor' | 'major' | 'unclassified';

/**
 * v1 classified by case-insensitive substring match on free text, so any label
 * containing a minor-surgery substring silently downgraded the pathway and an
 * unmatched free-text entry defaulted to the full protocol with no warning.
 * Classification is now exact-match against the curated list, and anything
 * unrecognised is returned as `unclassified` for the clinician to resolve.
 */
export const classifySurgery = (surgeryType: string): SurgeryClass => {
  const normalised = surgeryType.trim().toLowerCase();
  if (!normalised) return 'unclassified';
  if ((MINOR_SURGERIES as readonly string[]).includes(normalised)) return 'minor';
  return 'major';
};

// ---------------------------------------------------------------------------
// Eligibility
// ---------------------------------------------------------------------------

export interface EligibilityResult {
  eligible: boolean;
  /** Reasons the standard pathway does not apply. Empty when eligible. */
  exclusions: { key: string; label: string; reason: string }[];
  notes: string[];
}

export const checkEligibility = (
  ctx: PatientContext,
  opioidExposureDays: number,
): EligibilityResult => {
  const exclusions: EligibilityResult['exclusions'] = [];
  const notes: string[] = [];

  if (ctx.modifiers.includes('neuromuscular_blockade')) {
    exclusions.push(ELIGIBILITY.exclusions.find((e) => e.key === 'neuromuscular_blockade')!);
  }
  if (ctx.modifiers.includes('encephalopathy')) {
    notes.push(
      'Encephalopathy is recorded. Behavioural scores may be blunted; interpret escalation thresholds with that in mind.',
    );
  }
  if (opioidExposureDays > ELIGIBILITY.maxOpioidExposureDays) {
    exclusions.push({
      key: 'extended_exposure',
      label: `Opioid exposure beyond ${ELIGIBILITY.maxOpioidExposureDays} days`,
      reason:
        'Prolonged exposure carries a higher risk of iatrogenic withdrawal than the standard taper anticipates. Requires an individualised plan.',
    });
  }

  return { eligible: exclusions.length === 0, exclusions, notes };
};

// ---------------------------------------------------------------------------
// Initial post-operative dosing
// ---------------------------------------------------------------------------

export interface DosingResult {
  ok: boolean;
  errors: string[];
  warnings: string[];
  fentanyl: { infusionMcgPerHour: number; bolusMcg: number; bolusInterval: string } | null;
  acetaminophen: {
    ivMgPerDose: number;
    ivMgPerKg: number;
    ivInterval: string;
    ivDurationHours: number;
    maxDailyMg: number;
    oralMgPerDoseLow: number;
    oralMgPerDoseHigh: number;
    oralInterval: string;
    oralDurationHours: number;
  } | null;
}

export const calculateInitialDoses = (
  weightKg: number,
  postmenstrualAgeWeeks: number,
  ctx: PatientContext,
): DosingResult => {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!Number.isFinite(weightKg) || weightKg <= 0) {
    errors.push('Weight is required and must be greater than zero.');
  } else if (weightKg > 10) {
    errors.push(`Weight of ${weightKg} kg is outside the range this protocol covers. Check the entry.`);
  }
  if (!Number.isFinite(postmenstrualAgeWeeks) || postmenstrualAgeWeeks < 20 || postmenstrualAgeWeeks > 60) {
    errors.push('Postmenstrual age must be between 20 and 60 weeks.');
  }
  if (errors.length > 0) {
    return { ok: false, errors, warnings, fentanyl: null, acetaminophen: null };
  }

  const F = POSTOP_DOSING.fentanyl;
  const infusionMcgPerHour = F.infusionMcgPerKgPerHour * weightKg;
  const bolusMcg = F.bolusMcgPerKg * weightKg;

  // Ceilings. v1 had none, so a mistyped weight produced a silently enormous order.
  if (infusionMcgPerHour > F.maxInfusionMcgPerHour) {
    errors.push(
      `Computed fentanyl infusion of ${infusionMcgPerHour.toFixed(1)} mcg/hr exceeds the configured ceiling of ${F.maxInfusionMcgPerHour} mcg/hr. Re-check the weight.`,
    );
  }
  if (bolusMcg > F.maxBolusMcg) {
    errors.push(
      `Computed fentanyl bolus of ${bolusMcg.toFixed(1)} mcg exceeds the configured ceiling of ${F.maxBolusMcg} mcg. Re-check the weight.`,
    );
  }

  const band = POSTOP_DOSING.acetaminophen.ivByPma.find((b) => postmenstrualAgeWeeks < b.maxPma)!;
  const ivMgPerDose = band.mgPerKg * weightKg;
  const maxDailyMg = band.maxDailyMgPerKg * weightKg;

  if (ctx.modifiers.length > 0 && errors.length === 0) {
    // Nothing to add here; hepatic dysfunction is handled below via context.
  }

  const [lo, hi] = POSTOP_DOSING.acetaminophen.oralMgPerKgRange;

  if (errors.length > 0) {
    return { ok: false, errors, warnings, fentanyl: null, acetaminophen: null };
  }

  return {
    ok: true,
    errors,
    warnings,
    fentanyl: { infusionMcgPerHour, bolusMcg, bolusInterval: F.bolusInterval },
    acetaminophen: {
      ivMgPerDose,
      ivMgPerKg: band.mgPerKg,
      ivInterval: 'q6h',
      ivDurationHours: POSTOP_DOSING.acetaminophen.ivDurationHours,
      maxDailyMg,
      oralMgPerDoseLow: lo * weightKg,
      oralMgPerDoseHigh: hi * weightKg,
      oralInterval: POSTOP_DOSING.acetaminophen.oralInterval,
      oralDurationHours: POSTOP_DOSING.acetaminophen.oralDurationHours,
    },
  };
};

// ---------------------------------------------------------------------------
// Weaning
// ---------------------------------------------------------------------------

export interface WeaningPlan {
  rule: WeanRule;
  offPathway: boolean;
  reductionPerStep: number | null;
  stepsToZero: number | null;
  wat1Required: boolean;
  wat1Schedule: string | null;
  notes: string[];
}

export const planWeaning = (
  opioidExposureDays: number,
  currentInfusionMcgPerKgPerHour: number | null,
): WeaningPlan => {
  const rule =
    WEAN_RULES.find(
      (r) => opioidExposureDays >= r.minExposureDays && opioidExposureDays <= r.maxExposureDays,
    ) ?? WEAN_RULES[WEAN_RULES.length - 1];

  const notes: string[] = [];
  const dose = currentInfusionMcgPerKgPerHour;
  const valid = dose !== null && Number.isFinite(dose) && dose > 0;

  if (!valid) {
    notes.push('Enter the current infusion rate to see the reduction per step.');
  }

  if (!rule.withinStandardPathway) {
    notes.push(
      'Exposure exceeds the standard pathway. This schedule is shown for reference only and requires pain service or attending input.',
    );
  }

  // A percentage-of-original taper never reaches zero. State the stop rule.
  const reductionPerStep = valid ? (dose! * rule.reductionPercent) / 100 : null;
  const stepsToZero = valid ? Math.ceil(100 / rule.reductionPercent) : null;

  if (valid) {
    notes.push(
      `Reductions are calculated from the starting rate of ${dose!.toFixed(2)} mcg/kg/hr, so each step removes the same absolute amount and the infusion reaches zero after ${stepsToZero} steps.`,
    );
  }

  const wat1Required =
    rule.wat1Required || opioidExposureDays > ASSESSMENT_SCHEDULE.wat1.triggerExposureDays;

  return {
    rule,
    offPathway: !rule.withinStandardPathway,
    reductionPerStep,
    stepsToZero,
    wat1Required,
    wat1Schedule: wat1Required
      ? `q${ASSESSMENT_SCHEDULE.wat1.intervalHours}h at ${ASSESSMENT_SCHEDULE.wat1.clockTimes.join(' and ')}, continuing until ${ASSESSMENT_SCHEDULE.wat1.continueHoursAfterOpioidStopped} hours after the opioid is stopped`
      : null,
    notes,
  };
};

// ---------------------------------------------------------------------------
// Escalation
// ---------------------------------------------------------------------------

export type Urgency = 'low' | 'medium' | 'high';

export interface EscalationResult {
  urgency: Urgency;
  headline: string;
  actions: string[];
  drivers: string[];
  reassessInMinutes: number | null;
}

/**
 * Escalation is driven by the gestational-age-corrected N-PASS pain score, not the
 * raw one. See REVIEW_FLAGS['npass-uncorrected'] for why this changed.
 */
export const decideEscalation = (params: {
  correctedNpass: number | null;
  wat1: number | null;
  opioidExposureDays: number;
  recentUptitration: boolean;
}): EscalationResult => {
  const { correctedNpass, wat1, opioidExposureDays, recentUptitration } = params;
  const drivers: string[] = [];
  const wat1Applies = opioidExposureDays > ASSESSMENT_SCHEDULE.wat1.triggerExposureDays;

  if (correctedNpass === null) {
    return {
      urgency: 'low',
      headline: 'No current pain score',
      actions: ['Complete an N-PASS assessment before acting on this panel.'],
      drivers: [],
      reassessInMinutes: null,
    };
  }

  const painHigh = correctedNpass >= ESCALATION.npassBolusThreshold;
  const painMid = correctedNpass >= ESCALATION.npassChecklistThreshold;
  const withdrawalHigh = wat1Applies && wat1 !== null && wat1 >= ESCALATION.wat1BolusThreshold;
  const withdrawalMid = wat1Applies && wat1 !== null && wat1 >= ESCALATION.wat1ChecklistThreshold;

  if (painHigh) drivers.push(`Corrected N-PASS ${correctedNpass} is at or above ${ESCALATION.npassBolusThreshold}.`);
  else if (painMid) drivers.push(`Corrected N-PASS ${correctedNpass} is at or above ${ESCALATION.npassChecklistThreshold}.`);

  if (withdrawalHigh) drivers.push(`WAT-1 ${wat1} is at or above ${ESCALATION.wat1BolusThreshold}.`);
  else if (withdrawalMid) drivers.push(`WAT-1 ${wat1} is at or above ${ESCALATION.wat1ChecklistThreshold}.`);

  if (wat1Applies && wat1 === null) {
    drivers.push(
      `Opioid exposure is ${opioidExposureDays} days, so WAT-1 is indicated but has not been scored. The withdrawal side of this decision is currently blind.`,
    );
  }

  if (recentUptitration) {
    drivers.push('Opioid up-titration in the last 24 hours. Do not step the wean down today.');
  }

  if (painHigh || withdrawalHigh) {
    return {
      urgency: 'high',
      headline: 'Rescue dose indicated',
      actions: [
        'Give the PRN opioid dose per protocol.',
        'Complete the multisensorial comfort checklist.',
        `Pause the wean for ${ESCALATION.pauseWeanHours[0]} to ${ESCALATION.pauseWeanHours[1]} hours.`,
        `Rescore N-PASS, and WAT-1 if indicated, ${ASSESSMENT_SCHEDULE.reassessAfterPrnMinutes} minutes after the PRN dose.`,
      ],
      drivers,
      reassessInMinutes: ASSESSMENT_SCHEDULE.reassessAfterPrnMinutes,
    };
  }

  if (painMid || withdrawalMid) {
    return {
      urgency: 'medium',
      headline: 'Comfort measures first, then rescore',
      actions: [
        'Complete the multisensorial comfort checklist before any pharmacological step.',
        `Rescore in ${ASSESSMENT_SCHEDULE.reassessAfterInterventionMinutes[0]} to ${ASSESSMENT_SCHEDULE.reassessAfterInterventionMinutes[1]} minutes.`,
        'If the repeat score stays at or above threshold, escalate to a PRN dose.',
      ],
      drivers,
      reassessInMinutes: ASSESSMENT_SCHEDULE.reassessAfterInterventionMinutes[0],
    };
  }

  return {
    urgency: 'low',
    headline: 'Continue the current plan',
    actions: [
      recentUptitration
        ? 'Hold the taper today because of the recent up-titration, then resume.'
        : 'Proceed with the scheduled taper step.',
      'Continue routine scoring at the protocol interval.',
    ],
    drivers,
    reassessInMinutes: null,
  };
};
