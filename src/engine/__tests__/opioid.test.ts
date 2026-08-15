import { describe, it, expect } from 'vitest';
import { convertOpioids, type ConversionResult } from '../opioid';
import { OPIOID_CONVERSION, POSTOP_DOSING } from '../../data/protocol/ach';

const ok = (r: ReturnType<typeof convertOpioids>): ConversionResult => {
  if (!r.ok) throw new Error(`expected success, got: ${r.errors.join('; ')}`);
  return r;
};

describe('input guards', () => {
  it('refuses a zero weight instead of returning Infinity', () => {
    const r = convertOpioids({ weightKg: 0, ivFentanyl: { infusionPerKgPerHour: 2, unit: 'mcg' } });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors[0]).toMatch(/positive number/);
  });

  it('refuses a weight outside the neonatal range', () => {
    const r = convertOpioids({ weightKg: 35, ivFentanyl: { infusionPerKgPerHour: 2, unit: 'mcg' } });
    expect(r.ok).toBe(false);
  });

  it('refuses a bolus entered without a frequency', () => {
    const r = convertOpioids({
      weightKg: 3,
      ivMorphine: { bolusPerKg: 0.05, unit: 'mg' },
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.join(' ')).toMatch(/without a number of doses/);
  });

  it('never produces a non-finite number on valid input', () => {
    const r = ok(convertOpioids({ weightKg: 0.6, ivFentanyl: { infusionPerKgPerHour: 1, unit: 'mcg' } }));
    const numbers = JSON.stringify(r).match(/-?\d+\.?\d*e?[+-]?\d*/g) ?? [];
    expect(numbers.every((n) => Number.isFinite(Number(n)))).toBe(true);
  });
});

describe('units are explicit', () => {
  it('treats mg and mcg oral entries as a thousandfold apart, deliberately', () => {
    const base = { weightKg: 3, ivMorphine: { infusionPerKgPerHour: 0, unit: 'mcg' as const } };
    const inMg = ok(convertOpioids({ ...base, oralMorphineDaily: { amount: 1, unit: 'mg' } }));
    const inMcg = ok(convertOpioids({ ...base, oralMorphineDaily: { amount: 1, unit: 'mcg' } }));
    expect(inMg.oral.morphine.dailyMcg).toBe(1000);
    expect(inMcg.oral.morphine.dailyMcg).toBe(1);
  });

  it('converts an mg infusion entry to mcg internally', () => {
    const a = ok(convertOpioids({ weightKg: 2, ivMorphine: { infusionPerKgPerHour: 0.01, unit: 'mg' } }));
    const b = ok(convertOpioids({ weightKg: 2, ivMorphine: { infusionPerKgPerHour: 10, unit: 'mcg' } }));
    expect(a.totalIvMorphineEquivalentMcg).toBeCloseTo(b.totalIvMorphineEquivalentMcg, 6);
  });
});

describe('equianalgesic arithmetic', () => {
  it('converts fentanyl to morphine equivalents at the configured ratio', () => {
    const r = ok(convertOpioids({ weightKg: 3, ivFentanyl: { infusionPerKgPerHour: 2, unit: 'mcg' } }));
    // 2 mcg/kg/h * 3 kg * 24 h = 144 mcg fentanyl/day
    const expected = 144 * OPIOID_CONVERSION.ivFentanylToIvMorphine;
    expect(r.totalIvMorphineEquivalentMcg).toBeCloseTo(expected, 6);
  });

  it('sums contributions from several opioids and reports each share', () => {
    const r = ok(
      convertOpioids({
        weightKg: 3,
        ivFentanyl: { infusionPerKgPerHour: 1, unit: 'mcg' },
        ivMorphine: { infusionPerKgPerHour: 10, unit: 'mcg' },
      }),
    );
    expect(r.contributions).toHaveLength(2);
    const total = r.contributions.reduce((s, c) => s + c.share, 0);
    expect(total).toBeCloseTo(1, 6);
  });

  it('round-trips back to the starting rate when rotating to the same drug', () => {
    const r = ok(convertOpioids({ weightKg: 2.5, ivFentanyl: { infusionPerKgPerHour: 1.5, unit: 'mcg' } }));
    expect(r.rotation.unreduced.fentanylMcgPerKgPerHour).toBeCloseTo(1.5, 6);
  });

  it('applies the incomplete cross-tolerance reduction to the reduced target only', () => {
    const r = ok(convertOpioids({ weightKg: 3, ivMorphine: { infusionPerKgPerHour: 20, unit: 'mcg' } }));
    const factor = 1 - OPIOID_CONVERSION.incompleteCrossToleranceReduction;
    expect(r.rotation.reduced.morphineDailyMcg).toBeCloseTo(
      r.rotation.unreduced.morphineDailyMcg * factor,
      6,
    );
  });
});

describe('oral schedules', () => {
  it('divides the daily dose into four q6h doses and six q4h doses', () => {
    const r = ok(convertOpioids({ weightKg: 3, ivMorphine: { infusionPerKgPerHour: 10, unit: 'mcg' } }));
    const daily = r.oral.morphine.dailyMcg;
    expect(r.oral.morphine.q6hDoseMcg * 4).toBeCloseTo(daily, 6);
    expect(r.oral.morphine.q4hDoseMcg * 6).toBeCloseTo(daily, 6);
  });

  it('applies the IV to oral morphine ratio', () => {
    const r = ok(convertOpioids({ weightKg: 3, ivMorphine: { infusionPerKgPerHour: 10, unit: 'mcg' } }));
    expect(r.oral.morphine.dailyMcg).toBeCloseTo(
      r.totalIvMorphineEquivalentMcg * OPIOID_CONVERSION.ivMorphineToOralMorphine,
      6,
    );
  });
});

describe('the breakthrough dose conflict this tool used to hide', () => {
  it('flags the derived PRN dose against the protocol bolus on a standard post-op infusion', () => {
    const weightKg = 3;
    const r = ok(convertOpioids({ weightKg, ivFentanyl: { infusionPerKgPerHour: 2, unit: 'mcg' } }));

    // 2 mcg/kg/h over 24 h on a 3 kg infant is 144 mcg of fentanyl a day.
    // Ten percent of that is 14.4 mcg, against a protocol bolus of 1 mcg/kg = 3 mcg.
    const conflict = r.breakthrough.conflictsWithProtocolBolus;
    expect(conflict).not.toBeNull();
    expect(conflict!.derivedBolusMcg).toBeCloseTo(14.4, 6);
    expect(conflict!.protocolBolusMcg).toBeCloseTo(POSTOP_DOSING.fentanyl.bolusMcgPerKg * weightKg, 6);
    expect(conflict!.ratio).toBeCloseTo(4.8, 6);
    expect(r.warnings.join(' ')).toMatch(/times the protocol/);
  });

  it('does not flag a conflict when nothing is prescribed', () => {
    const r = ok(convertOpioids({ weightKg: 3 }));
    expect(r.breakthrough.conflictsWithProtocolBolus).toBeNull();
  });
});

describe('transparency', () => {
  it('states every conversion ratio it used', () => {
    const r = ok(convertOpioids({ weightKg: 3, ivFentanyl: { infusionPerKgPerHour: 1, unit: 'mcg' } }));
    expect(r.assumptions).toHaveLength(4);
    expect(r.assumptions.join(' ')).toContain(`1:${OPIOID_CONVERSION.ivFentanylToIvMorphine}`);
  });

  it('warns when the fentanyl ratio departs from the commonly published 1:100', () => {
    const r = ok(convertOpioids({ weightKg: 3, ivFentanyl: { infusionPerKgPerHour: 1, unit: 'mcg' } }));
    if (OPIOID_CONVERSION.ivFentanylToIvMorphine !== 100) {
      expect(r.warnings.join(' ')).toMatch(/1:100/);
    }
  });
});
