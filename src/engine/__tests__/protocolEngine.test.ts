import { describe, it, expect } from 'vitest';
import {
  classifySurgery,
  checkEligibility,
  calculateInitialDoses,
  planWeaning,
  decideEscalation,
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
