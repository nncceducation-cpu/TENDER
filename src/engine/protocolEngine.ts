import {
  ASSESSMENT_SCHEDULE,
  ELIGIBILITY,
  ESCALATION,
  MINOR_SURGERIES,
  ORIGINAL_DOSE_DEFINITION,
  POSTOP_DOSING,
  WEANING_READINESS,
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

export interface WeaningReadiness {
  ready: boolean;
  /** True when the answer is "not yet, ask again", rather than "never". */
  recheck: boolean;
  recheckInHours: number | null;
  blockers: string[];
  satisfied: string[];
  headline: string;
}

/**
 * The gate the pathway puts in front of the first taper step.
 *
 * The 24-hour mark is not a start signal. It is the earliest moment the question
 * can be asked, and the question has two parts: is the infant comfortable on the
 * current rate, and has the rate been left alone. Fail either and the pathway
 * loops back to three-hourly scoring rather than proceeding.
 *
 * `hoursSincePostOp` is hours since return from theatre. Pass null when it has not
 * been entered; the gate then reports what it cannot judge instead of assuming.
 */
export const checkWeaningReadiness = (params: {
  hoursSincePostOp: number | null;
  correctedNpass: number | null;
  recentUptitration: boolean;
}): WeaningReadiness => {
  const { hoursSincePostOp, correctedNpass, recentUptitration } = params;
  const blockers: string[] = [];
  const satisfied: string[] = [];
  const R = WEANING_READINESS;

  const unknown: string[] = [];

  if (hoursSincePostOp === null || !Number.isFinite(hoursSincePostOp)) {
    unknown.push('Hours since return from theatre has not been entered.');
  } else if (hoursSincePostOp < R.earliestHoursPostOp) {
    blockers.push(
      `${hoursSincePostOp} hours post-operatively. The pathway holds the rate for the first ${R.earliestHoursPostOp} hours.`,
    );
  } else {
    satisfied.push(`${hoursSincePostOp} hours post-operatively, past the ${R.earliestHoursPostOp}-hour hold.`);
  }

  if (correctedNpass === null) {
    unknown.push('No N-PASS score is recorded, so comfort on the current rate cannot be judged.');
  } else if (correctedNpass > R.maxNpass) {
    blockers.push(
      `Corrected N-PASS is ${correctedNpass}. Weaning starts only at ${R.maxNpass} or below.`,
    );
  } else {
    satisfied.push(`Corrected N-PASS is ${correctedNpass}, within the 0 to ${R.maxNpass} band.`);
  }

  if (recentUptitration) {
    blockers.push(
      `An up-titration was recorded within the last ${R.noUptitrationWithinHours} hours. The new rate has not yet been shown to hold.`,
    );
  } else {
    satisfied.push(`No up-titration in the last ${R.noUptitrationWithinHours} hours.`);
  }

  if (unknown.length > 0) {
    // Anything already known to block is reported alongside what is missing. An
    // earlier version returned only the missing items, so an infant 12 hours
    // post-operatively with no score recorded was told the score was missing and
    // nothing about the 24-hour hold.
    return {
      ready: false,
      recheck: true,
      recheckInHours: null,
      blockers: [...unknown, ...blockers],
      satisfied,
      headline: 'Cannot tell yet whether weaning may start',
    };
  }

  if (blockers.length > 0) {
    return {
      ready: false,
      recheck: true,
      recheckInHours: R.recheckIntervalHours,
      blockers,
      satisfied,
      headline: `Do not start weaning. Reassess in ${R.recheckIntervalHours} hours.`,
    };
  }

  return {
    ready: true,
    recheck: false,
    recheckInHours: null,
    blockers: [],
    satisfied,
    headline: 'Weaning may start',
  };
};

export const ORIGINAL_DOSE_NOTE = ORIGINAL_DOSE_DEFINITION;

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

/**
 * Count the run of elevated scores ending at the most recent one.
 *
 * Takes scores oldest first, as the session stores them. Returns 0 when the last
 * score is not elevated, which is the case that resets the count. The pathway
 * counts scores taken 30 to 60 minutes apart; this function counts scores in
 * order and does not police the interval, because the timestamps in a session
 * reflect when the nurse had a hand free rather than the protocol clock.
 */
export const countConsecutiveElevated = (
  scores: { scaleId: string; total: number }[],
): number => {
  let n = 0;
  for (let i = scores.length - 1; i >= 0; i -= 1) {
    const s = scores[i];
    const threshold =
      s.scaleId === 'WAT_1' ? ESCALATION.wat1ChecklistThreshold : ESCALATION.npassChecklistThreshold;
    if (s.total >= threshold) n += 1;
    else break;
  }
  return n;
};

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
  /**
   * How many consecutive scores, including this one, have sat at or above a
   * threshold. Defaults to 1, which is the first strike.
   */
  consecutiveElevated?: number;
}): EscalationResult => {
  const {
    correctedNpass,
    wat1,
    opioidExposureDays,
    recentUptitration,
    consecutiveElevated = 1,
  } = params;
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

  // The pathway pauses the wean on the second consecutive elevated score, not the
  // first. A single reading buys the checklist and a rescore.
  const strikesMet = consecutiveElevated >= ESCALATION.consecutiveElevatedBeforePause;
  const strikeNote = strikesMet
    ? `This is elevated score ${consecutiveElevated} in a row, so the wean pauses.`
    : `First elevated score. The wean pauses only if the score ${ASSESSMENT_SCHEDULE.reassessAfterInterventionMinutes[0]} to ${ASSESSMENT_SCHEDULE.reassessAfterInterventionMinutes[1]} minutes from now is still elevated.`;

  if (painHigh || withdrawalHigh) {
    const actions = [
      'Give the PRN opioid dose per protocol.',
      'Complete the multisensorial comfort checklist.',
    ];
    actions.push(
      strikesMet
        ? `Pause the wean for ${ESCALATION.pauseWeanHours[0]} to ${ESCALATION.pauseWeanHours[1]} hours.`
        : `Hold today's taper step and rescore before deciding on a ${ESCALATION.pauseWeanHours[0]} to ${ESCALATION.pauseWeanHours[1]} hour pause.`,
    );
    actions.push(
      `Rescore N-PASS, and WAT-1 if indicated, ${ASSESSMENT_SCHEDULE.reassessAfterPrnMinutes} minutes after the PRN dose.`,
    );
    return {
      urgency: 'high',
      headline: 'Rescue dose indicated',
      actions,
      drivers: [...drivers, strikeNote],
      reassessInMinutes: ASSESSMENT_SCHEDULE.reassessAfterPrnMinutes,
    };
  }

  if (painMid || withdrawalMid) {
    const actions = [
      'Complete the multisensorial comfort checklist before any pharmacological step.',
      `Rescore in ${ASSESSMENT_SCHEDULE.reassessAfterInterventionMinutes[0]} to ${ASSESSMENT_SCHEDULE.reassessAfterInterventionMinutes[1]} minutes.`,
    ];
    actions.push(
      strikesMet
        ? `Two consecutive elevated scores. Give the PRN dose and pause the wean for ${ESCALATION.pauseWeanHoursMidBand} hours.`
        : 'If the repeat score stays at or above threshold, escalate to a PRN dose.',
    );
    return {
      urgency: strikesMet ? 'high' : 'medium',
      headline: strikesMet
        ? 'Second consecutive elevated score: escalate'
        : 'Comfort measures first, then rescore',
      actions,
      drivers: [...drivers, strikeNote],
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
