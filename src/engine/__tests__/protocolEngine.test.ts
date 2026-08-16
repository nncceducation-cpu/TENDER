import { describe, it, expect } from 'vitest';
import {
  classifySurgery,
  checkEligibility,
  calculateInitialDoses,
  planWeaning,
  decideEscalation,
  checkWeaningReadiness,
  countConsecutiveElevated,
} from '../protocolEngine';
import type { PatientContext } from '../../domain/types';

const ctx = (over: Partial<PatientContext> = {}): PatientContext => ({
  localId: 'BED-1',
  gestationalAgeAtBirth: { weeks: 30, days: 0 },
  postnatalAgeDays: 5,
  weightKg: 1.5,
  ventilation: 'spontaneous',
  modifiers: [],
  postOpDay: 1,
  infusions: [],
  ...over,
});

describe('surgery classification', () => {
  it('classifies a listed minor surgery', () => {
    expect(classifySurgery('circumcision')).toBe('minor');
  });

  it('classifies an unlisted procedure as major rather than downgrading it', () => {
    expect(classifySurgery('congenital diaphragmatic hernia')).toBe('major');
  });

  it('returns unclassified for empty input instead of silently defaulting', () => {
    expect(classifySurgery('   ')).toBe('unclassified');
  });

  it('does not downgrade a major procedure whose label contains a minor substring', () => {
    // v1 used substring matching, so this string matched 'minor exploratory'.
    expect(classifySurgery('laparotomy after failed minor exploratory')).toBe('major');
  });
});

describe('eligibility', () => {
  it('excludes an infant under neuromuscular blockade and says why', () => {
    const r = checkEligibility(ctx({ modifiers: ['neuromuscular_blockade'] }), 3);
    expect(r.eligible).toBe(false);
    expect(r.exclusions[0].reason).toMatch(/cannot express pain/);
  });

  it('excludes exposure beyond ten days', () => {
    expect(checkEligibility(ctx(), 11).eligible).toBe(false);
    expect(checkEligibility(ctx(), 10).eligible).toBe(true);
  });

  it('notes encephalopathy without excluding the infant', () => {
    const r = checkEligibility(ctx({ modifiers: ['encephalopathy'] }), 2);
    expect(r.eligible).toBe(true);
    expect(r.notes.join(' ')).toMatch(/blunted/);
  });
});

describe('initial dosing', () => {
  it('scales fentanyl by weight', () => {
    const r = calculateInitialDoses(2, 38, ctx());
    expect(r.ok).toBe(true);
    expect(r.fentanyl!.infusionMcgPerHour).toBe(4);
    expect(r.fentanyl!.bolusMcg).toBe(2);
  });

  it('selects the acetaminophen band by postmenstrual age', () => {
    expect(calculateInitialDoses(1, 30, ctx()).acetaminophen!.ivMgPerKg).toBe(7.5);
    expect(calculateInitialDoses(2, 34, ctx()).acetaminophen!.ivMgPerKg).toBe(10);
    expect(calculateInitialDoses(3, 39, ctx()).acetaminophen!.ivMgPerKg).toBe(15);
  });

  it('refuses a blank weight instead of ordering zero', () => {
    const r = calculateInitialDoses(Number.NaN, 38, ctx());
    expect(r.ok).toBe(false);
    expect(r.errors.join(' ')).toMatch(/Weight is required/);
  });

  it('blocks a dose that exceeds the configured ceiling', () => {
    const r = calculateInitialDoses(9.5, 40, ctx());
    expect(r.ok).toBe(false);
    expect(r.errors.join(' ')).toMatch(/ceiling/);
  });

  it('rejects an implausible postmenstrual age', () => {
    expect(calculateInitialDoses(3, 4, ctx()).ok).toBe(false);
  });
});

describe('weaning', () => {
  it('selects the fast rule at five days and the standard rule at six', () => {
    expect(planWeaning(5, 2).rule.reductionPercent).toBe(25);
    expect(planWeaning(6, 2).rule.reductionPercent).toBe(20);
  });

  it('marks the eleven-day-plus schedule as off the standard pathway', () => {
    const p = planWeaning(14, 2);
    expect(p.offPathway).toBe(true);
    expect(p.notes.join(' ')).toMatch(/pain service/);
  });

  it('requires WAT-1 beyond five days of exposure', () => {
    expect(planWeaning(4, 2).wat1Required).toBe(false);
    expect(planWeaning(7, 2).wat1Required).toBe(true);
  });

  it('states how many steps reach zero', () => {
    const p = planWeaning(3, 2);
    expect(p.reductionPerStep).toBeCloseTo(0.5, 6);
    expect(p.stepsToZero).toBe(4);
  });

  it('asks for the infusion rate rather than computing from nothing', () => {
    const p = planWeaning(3, null);
    expect(p.reductionPerStep).toBeNull();
    expect(p.notes.join(' ')).toMatch(/Enter the current infusion rate/);
  });
});

describe('escalation', () => {
  it('does not act without a score', () => {
    const r = decideEscalation({ correctedNpass: null, wat1: null, opioidExposureDays: 3, recentUptitration: false });
    expect(r.urgency).toBe('low');
    expect(r.actions[0]).toMatch(/Complete an N-PASS/);
  });

  it('escalates to rescue at the corrected N-PASS bolus threshold', () => {
    const r = decideEscalation({ correctedNpass: 7, wat1: null, opioidExposureDays: 3, recentUptitration: false });
    expect(r.urgency).toBe('high');
    expect(r.reassessInMinutes).toBe(60);
  });

  it('takes comfort measures first in the middle band', () => {
    const r = decideEscalation({ correctedNpass: 4, wat1: null, opioidExposureDays: 3, recentUptitration: false });
    expect(r.urgency).toBe('medium');
    expect(r.actions[0]).toMatch(/checklist before any pharmacological step/);
  });

  it('ignores WAT-1 below the exposure trigger', () => {
    const r = decideEscalation({ correctedNpass: 1, wat1: 9, opioidExposureDays: 3, recentUptitration: false });
    expect(r.urgency).toBe('low');
  });

  it('acts on WAT-1 once exposure passes the trigger', () => {
    const r = decideEscalation({ correctedNpass: 1, wat1: 6, opioidExposureDays: 8, recentUptitration: false });
    expect(r.urgency).toBe('high');
  });

  it('says so when WAT-1 is indicated but has not been scored', () => {
    const r = decideEscalation({ correctedNpass: 1, wat1: null, opioidExposureDays: 8, recentUptitration: false });
    expect(r.drivers.join(' ')).toMatch(/currently blind/);
  });

  it('holds the taper after a recent up-titration', () => {
    const r = decideEscalation({ correctedNpass: 1, wat1: null, opioidExposureDays: 3, recentUptitration: true });
    expect(r.actions[0]).toMatch(/Hold the taper/);
  });
});


describe('weaning readiness gate', () => {
  it('will not judge without the hours since theatre', () => {
    const r = checkWeaningReadiness({
      hoursSincePostOp: null,
      correctedNpass: 2,
      recentUptitration: false,
    });
    expect(r.ready).toBe(false);
    expect(r.recheckInHours).toBeNull();
    expect(r.blockers.join(' ')).toMatch(/has not been entered/);
  });

  it('reports a known blocker alongside what is missing', () => {
    const r = checkWeaningReadiness({
      hoursSincePostOp: 12,
      correctedNpass: null,
      recentUptitration: false,
    });
    expect(r.blockers.join(' ')).toMatch(/No N-PASS score/);
    expect(r.blockers.join(' ')).toMatch(/holds the rate for the first 24 hours/);
  });

  it('will not judge without a pain score', () => {
    const r = checkWeaningReadiness({
      hoursSincePostOp: 30,
      correctedNpass: null,
      recentUptitration: false,
    });
    expect(r.ready).toBe(false);
    expect(r.blockers.join(' ')).toMatch(/No N-PASS score/);
  });

  it('holds the rate inside the first 24 hours even with a settled infant', () => {
    const r = checkWeaningReadiness({
      hoursSincePostOp: 18,
      correctedNpass: 0,
      recentUptitration: false,
    });
    expect(r.ready).toBe(false);
    expect(r.recheckInHours).toBe(3);
    expect(r.blockers.join(' ')).toMatch(/holds the rate for the first 24 hours/);
  });

  it('holds when the infant is past 24 hours but scoring above the lowest band', () => {
    const r = checkWeaningReadiness({
      hoursSincePostOp: 26,
      correctedNpass: 4,
      recentUptitration: false,
    });
    expect(r.ready).toBe(false);
    expect(r.blockers.join(' ')).toMatch(/Weaning starts only at 3 or below/);
    // The 24-hour condition passed, and the gate says which one did.
    expect(r.satisfied.join(' ')).toMatch(/past the 24-hour hold/);
  });

  it('holds after a recent up-titration even at N-PASS 0 and 48 hours', () => {
    const r = checkWeaningReadiness({
      hoursSincePostOp: 48,
      correctedNpass: 0,
      recentUptitration: true,
    });
    expect(r.ready).toBe(false);
    expect(r.blockers.join(' ')).toMatch(/up-titration/);
  });

  it('opens the gate when both conditions hold together', () => {
    const r = checkWeaningReadiness({
      hoursSincePostOp: 24,
      correctedNpass: 3,
      recentUptitration: false,
    });
    expect(r.ready).toBe(true);
    expect(r.blockers).toHaveLength(0);
    expect(r.satisfied).toHaveLength(3);
  });
});

describe('consecutive elevated scores', () => {
  it('counts nothing when the last score is in band', () => {
    expect(
      countConsecutiveElevated([
        { scaleId: 'N_PASS', total: 5 },
        { scaleId: 'N_PASS', total: 2 },
      ]),
    ).toBe(0);
  });

  it('counts the run ending at the most recent score', () => {
    expect(
      countConsecutiveElevated([
        { scaleId: 'N_PASS', total: 1 },
        { scaleId: 'N_PASS', total: 5 },
        { scaleId: 'N_PASS', total: 6 },
      ]),
    ).toBe(2);
  });

  it('uses the WAT-1 threshold for WAT-1 rows', () => {
    // 3 is elevated on WAT-1 and in band on N-PASS.
    expect(countConsecutiveElevated([{ scaleId: 'WAT_1', total: 3 }])).toBe(1);
    expect(countConsecutiveElevated([{ scaleId: 'N_PASS', total: 3 }])).toBe(0);
  });
});

describe('the two-strike pause rule', () => {
  it('does not pause the wean on a single mid-band score', () => {
    const r = decideEscalation({
      correctedNpass: 5,
      wat1: null,
      opioidExposureDays: 3,
      recentUptitration: false,
      consecutiveElevated: 1,
    });
    expect(r.urgency).toBe('medium');
    expect(r.actions.join(' ')).not.toMatch(/pause the wean/i);
    expect(r.drivers.join(' ')).toMatch(/First elevated score/);
  });

  it('escalates a second consecutive mid-band score to a dose and a pause', () => {
    const r = decideEscalation({
      correctedNpass: 5,
      wat1: null,
      opioidExposureDays: 3,
      recentUptitration: false,
      consecutiveElevated: 2,
    });
    expect(r.urgency).toBe('high');
    expect(r.actions.join(' ')).toMatch(/pause the wean for 12 hours/i);
  });

  it('gives the rescue dose on the first high-band score but defers the pause', () => {
    const r = decideEscalation({
      correctedNpass: 8,
      wat1: null,
      opioidExposureDays: 3,
      recentUptitration: false,
      consecutiveElevated: 1,
    });
    expect(r.urgency).toBe('high');
    expect(r.actions[0]).toMatch(/Give the PRN opioid dose/);
    expect(r.actions.join(' ')).toMatch(/Hold today's taper step/);
  });

  it('pauses for the full window on a second high-band score', () => {
    const r = decideEscalation({
      correctedNpass: 8,
      wat1: null,
      opioidExposureDays: 3,
      recentUptitration: false,
      consecutiveElevated: 2,
    });
    expect(r.actions.join(' ')).toMatch(/Pause the wean for 12 to 24 hours/);
  });

  it('defaults to the first strike when the caller does not track the run', () => {
    const r = decideEscalation({
      correctedNpass: 5,
      wat1: null,
      opioidExposureDays: 3,
      recentUptitration: false,
    });
    expect(r.urgency).toBe('medium');
  });
});
