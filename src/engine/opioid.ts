import { OPIOID_CONVERSION, POSTOP_DOSING } from '../data/protocol/ach';

/**
 * Opioid equianalgesic conversion.
 *
 * Rewritten from the v1 `calculateOpioidConversion` with four changes, each of
 * which addresses a defect that could reach a patient:
 *
 *  1. Every input carries an explicit unit. v1's own comments could not decide
 *     whether existing oral doses were mg or mcg, and the code multiplied by 1000
 *     regardless. A unit mismatch in an oral opioid dose is a thousand-fold error.
 *  2. Invalid input returns a typed failure. v1 divided by weight without guarding
 *     zero, so a blank weight rendered `Infinity` into a dose field.
 *  3. Incomplete cross-tolerance is shown. v1 applied none. Both the unreduced and
 *     the reduced figures are returned so the prescriber chooses knowingly.
 *  4. The breakthrough dose is checked against the protocol's own bolus ceiling.
 *     v1's 10%-of-daily-dose rule and the protocol's 1 mcg/kg fentanyl bolus
 *     disagreed by roughly fivefold with nothing in the UI to say so.
 */

export type Unit = 'mg' | 'mcg';

export interface DoseEntry {
  /** Continuous infusion rate. */
  infusionPerKgPerHour?: number;
  /** Intermittent dose amount. */
  bolusPerKg?: number;
  /** Number of intermittent doses in 24 hours. */
  bolusesPerDay?: number;
  unit: Unit;
}

export interface ConversionInput {
  weightKg: number;
  ivMorphine?: DoseEntry;
  ivFentanyl?: DoseEntry;
  ivHydromorphone?: DoseEntry;
  /** Oral doses already prescribed, total daily amount. */
  oralMorphineDaily?: { amount: number; unit: Unit };
  oralHydromorphoneDaily?: { amount: number; unit: Unit };
}

export interface OralSchedule {
  dailyMcg: number;
  dailyMg: number;
  q6hDoseMcg: number;
  q4hDoseMcg: number;
}

export interface ConversionResult {
  ok: true;
  /** Total daily dose expressed as IV morphine equivalent, in mcg. */
  totalIvMorphineEquivalentMcg: number;
  /** Per-drug contribution, for transparency. */
  contributions: { drug: string; ivMorphineEquivalentMcg: number; share: number }[];
  rotation: {
    /** Straight equianalgesic conversion, no reduction. Matches v1 behaviour. */
    unreduced: RotationTargets;
    /** Same conversion with the incomplete cross-tolerance reduction applied. */
    reduced: RotationTargets;
    reductionPercent: number;
  };
  oral: {
    morphine: OralSchedule;
    hydromorphone: OralSchedule;
  };
  breakthrough: {
    fractionOfDailyDose: number;
    morphineMcg: number;
    fentanylMcg: number;
    hydromorphoneMcg: number;
    /** Set when the derived fentanyl bolus exceeds the protocol's own bolus rule. */
    conflictsWithProtocolBolus: {
      protocolBolusMcg: number;
      derivedBolusMcg: number;
      ratio: number;
    } | null;
  };
  methadone: { initialDoseMg: number; frequency: string };
  warnings: string[];
  assumptions: string[];
}

export interface ConversionFailure {
  ok: false;
  errors: string[];
}

export interface RotationTargets {
  morphineMcgPerKgPerHour: number;
  fentanylMcgPerKgPerHour: number;
  hydromorphoneMcgPerKgPerHour: number;
  morphineDailyMcg: number;
  fentanylDailyMcg: number;
  hydromorphoneDailyMcg: number;
}

const toMcg = (amount: number, unit: Unit): number => (unit === 'mg' ? amount * 1000 : amount);

const dailyMcg = (entry: DoseEntry | undefined, weightKg: number): number => {
  if (!entry) return 0;
  const infusion = toMcg(entry.infusionPerKgPerHour ?? 0, entry.unit) * weightKg * 24;
  const boluses =
    toMcg(entry.bolusPerKg ?? 0, entry.unit) * weightKg * (entry.bolusesPerDay ?? 0);
  return infusion + boluses;
};

const validate = (input: ConversionInput): string[] => {
  const errors: string[] = [];
  if (!Number.isFinite(input.weightKg) || input.weightKg <= 0) {
    errors.push('Weight must be a positive number. Conversion cannot proceed without it.');
  } else if (input.weightKg > 10) {
    errors.push(
      `Weight of ${input.weightKg} kg is outside the neonatal range this tool covers. Check the entry.`,
    );
  }

  const entries: [string, DoseEntry | undefined][] = [
    ['IV morphine', input.ivMorphine],
    ['IV fentanyl', input.ivFentanyl],
    ['IV hydromorphone', input.ivHydromorphone],
  ];
  for (const [name, e] of entries) {
    if (!e) continue;
    for (const [field, v] of Object.entries(e)) {
      if (field === 'unit') continue;
      if (v !== undefined && (!Number.isFinite(v as number) || (v as number) < 0)) {
        errors.push(`${name}: ${field} must be a non-negative number.`);
      }
    }
    if ((e.bolusPerKg ?? 0) > 0 && !(e.bolusesPerDay && e.bolusesPerDay > 0)) {
      errors.push(`${name}: a bolus dose was entered without a number of doses per day.`);
    }
  }
  return errors;
};

const makeSchedule = (totalMcg: number): OralSchedule => ({
  dailyMcg: totalMcg,
  dailyMg: totalMcg / 1000,
  q6hDoseMcg: totalMcg / 4, // four doses per day
  q4hDoseMcg: totalMcg / 6, // six doses per day
});

export const convertOpioids = (
  input: ConversionInput,
): ConversionResult | ConversionFailure => {
  const errors = validate(input);
  if (errors.length > 0) return { ok: false, errors };

  const w = input.weightKg;
  const C = OPIOID_CONVERSION;

  const morphineMcg = dailyMcg(input.ivMorphine, w);
  const fentanylMcg = dailyMcg(input.ivFentanyl, w);
  const hydromorphoneMcg = dailyMcg(input.ivHydromorphone, w);

  const fromMorphine = morphineMcg;
  const fromFentanyl = fentanylMcg * C.ivFentanylToIvMorphine;
  const fromHydromorphone = hydromorphoneMcg * C.ivHydromorphoneToIvMorphine;
  const totalIvme = fromMorphine + fromFentanyl + fromHydromorphone;

  const warnings: string[] = [];
  const assumptions: string[] = [
    `IV fentanyl to IV morphine ratio 1:${C.ivFentanylToIvMorphine} (local protocol value).`,
    `IV hydromorphone to IV morphine ratio 1:${C.ivHydromorphoneToIvMorphine}.`,
    `IV morphine to oral morphine ratio 1:${C.ivMorphineToOralMorphine}.`,
    `Oral hydromorphone to oral morphine ratio 1:${C.oralHydromorphoneToOralMorphine}.`,
  ];

  if (C.ivFentanylToIvMorphine !== 100) {
    warnings.push(
      `This tool converts fentanyl to morphine at 1:${C.ivFentanylToIvMorphine}. Many published paediatric tables use 1:100. Confirm which table your unit has adopted before rotating.`,
    );
  }

  if (totalIvme === 0) {
    warnings.push('No opioid doses were entered, so every derived figure below is zero.');
  }

  const targets = (ivmeMcg: number): RotationTargets => ({
    morphineDailyMcg: ivmeMcg,
    fentanylDailyMcg: ivmeMcg / C.ivFentanylToIvMorphine,
    hydromorphoneDailyMcg: ivmeMcg / C.ivHydromorphoneToIvMorphine,
    morphineMcgPerKgPerHour: ivmeMcg / 24 / w,
    fentanylMcgPerKgPerHour: ivmeMcg / C.ivFentanylToIvMorphine / 24 / w,
    hydromorphoneMcgPerKgPerHour: ivmeMcg / C.ivHydromorphoneToIvMorphine / 24 / w,
  });

  const reduction = C.incompleteCrossToleranceReduction;
  const rotation = {
    unreduced: targets(totalIvme),
    reduced: targets(totalIvme * (1 - reduction)),
    reductionPercent: reduction * 100,
  };

  // Oral arm. Existing oral doses are converted with an explicit declared unit.
  const existingOralMorphineMcg = input.oralMorphineDaily
    ? toMcg(input.oralMorphineDaily.amount, input.oralMorphineDaily.unit)
    : 0;
  const existingOralHydromorphoneMcg = input.oralHydromorphoneDaily
    ? toMcg(input.oralHydromorphoneDaily.amount, input.oralHydromorphoneDaily.unit)
    : 0;

  const oralMorphineEquivMcg =
    totalIvme * C.ivMorphineToOralMorphine +
    existingOralMorphineMcg +
    existingOralHydromorphoneMcg * C.oralHydromorphoneToOralMorphine;

  const oral = {
    morphine: makeSchedule(oralMorphineEquivMcg),
    hydromorphone: makeSchedule(oralMorphineEquivMcg / C.oralHydromorphoneToOralMorphine),
  };

  // Breakthrough dosing, checked against the protocol's own bolus rule.
  const f = C.prnFractionOfTotalDailyDose;
  const derivedFentanylBolusMcg = (totalIvme * f) / C.ivFentanylToIvMorphine;
  const protocolBolusMcg = POSTOP_DOSING.fentanyl.bolusMcgPerKg * w;
  const ratio = protocolBolusMcg > 0 ? derivedFentanylBolusMcg / protocolBolusMcg : 0;

  const conflictsWithProtocolBolus =
    totalIvme > 0 && ratio > 1.5
      ? { protocolBolusMcg, derivedBolusMcg: derivedFentanylBolusMcg, ratio }
      : null;

  if (conflictsWithProtocolBolus) {
    warnings.push(
      `The breakthrough dose derived here (${derivedFentanylBolusMcg.toFixed(1)} mcg fentanyl) is ${ratio.toFixed(1)} times the protocol's post-operative bolus of ${POSTOP_DOSING.fentanyl.bolusMcgPerKg} mcg/kg (${protocolBolusMcg.toFixed(1)} mcg). Decide which rule applies before prescribing.`,
    );
  }

  const contributions = [
    { drug: 'IV morphine', ivMorphineEquivalentMcg: fromMorphine },
    { drug: 'IV fentanyl', ivMorphineEquivalentMcg: fromFentanyl },
    { drug: 'IV hydromorphone', ivMorphineEquivalentMcg: fromHydromorphone },
  ]
    .filter((c) => c.ivMorphineEquivalentMcg > 0)
    .map((c) => ({ ...c, share: totalIvme > 0 ? c.ivMorphineEquivalentMcg / totalIvme : 0 }));

  return {
    ok: true,
    totalIvMorphineEquivalentMcg: totalIvme,
    contributions,
    rotation,
    oral,
    breakthrough: {
      fractionOfDailyDose: f,
      morphineMcg: totalIvme * f,
      fentanylMcg: derivedFentanylBolusMcg,
      hydromorphoneMcg: (totalIvme * f) / C.ivHydromorphoneToIvMorphine,
      conflictsWithProtocolBolus,
    },
    methadone: {
      initialDoseMg: C.methadone.initialMgPerKgPerDose * w,
      frequency: C.methadone.frequency,
    },
    warnings,
    assumptions,
  };
};
