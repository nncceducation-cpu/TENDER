import { describe, it, expect } from 'vitest';
import { scoreAssessment, IncompleteAssessmentError, applicableItems } from '../scoring';
import { PIPP_R } from '../../data/scales/pippR';
import { N_PASS } from '../../data/scales/npass';
import { COMFORTNEO } from '../../data/scales/comfortneo';
import { NIPS } from '../../data/scales/nips';
import type { PatientContext, ScoredItem } from '../../domain/types';

const ctx = (over: Partial<PatientContext> = {}): PatientContext => ({
  localId: 'BED-1',
  gestationalAgeAtBirth: { weeks: 30, days: 0 },
  postnatalAgeDays: 5,
  weightKg: 1.2,
  ventilation: 'spontaneous',
  modifiers: [],
  postOpDay: null,
  infusions: [],
  ...over,
});

const items = (map: Record<string, number>): ScoredItem[] =>
  Object.entries(map).map(([itemId, value]) => ({ itemId, value, source: 'clinician' as const }));

describe('PIPP-R contextual indicator rule', () => {
  it('returns zero when every core indicator is zero, regardless of gestational age', () => {
    const a = scoreAssessment({
      scale: PIPP_R,
      ctx: ctx({ gestationalAgeAtBirth: { weeks: 26, days: 0 } }),
      scoredBy: 'test',
      items: items({
        hr_change: 0,
        spo2_change: 0,
        brow_bulge: 0,
        eye_squeeze: 0,
        nasolabial_furrow: 0,
        behavioural_state: 3,
        gestational_age: 3,
      }),
    });
    // The original PIPP would have scored 6 here from context alone.
    expect(a.total).toBe(0);
    expect(a.workings.join(' ')).toContain('suppresses both contextual indicators');
  });

  it('adds contextual indicators once any core indicator is positive', () => {
    const a = scoreAssessment({
      scale: PIPP_R,
      ctx: ctx({ gestationalAgeAtBirth: { weeks: 26, days: 0 } }),
      scoredBy: 'test',
      items: items({
        hr_change: 1,
        spo2_change: 0,
        brow_bulge: 0,
        eye_squeeze: 0,
        nasolabial_furrow: 0,
        behavioural_state: 2,
        gestational_age: 0,
      }),
    });
    // core 1 + GA 3 (derived from context, not from the entered item) + state 2
    expect(a.total).toBe(6);
  });

  it('derives the gestational age band from the patient record, not the entered item', () => {
    const a = scoreAssessment({
      scale: PIPP_R,
      ctx: ctx({ gestationalAgeAtBirth: { weeks: 34, days: 3 } }),
      scoredBy: 'test',
      items: items({
        hr_change: 2,
        spo2_change: 0,
        brow_bulge: 0,
        eye_squeeze: 0,
        nasolabial_furrow: 0,
        behavioural_state: 0,
        gestational_age: 3, // deliberately wrong entry
      }),
    });
    expect(a.total).toBe(3); // 2 + GA band 1 + state 0
  });

  it('bands a maximal score as moderate to severe', () => {
    const a = scoreAssessment({
      scale: PIPP_R,
      ctx: ctx({ gestationalAgeAtBirth: { weeks: 27, days: 0 } }),
      scoredBy: 'test',
      items: items({
        hr_change: 3,
        spo2_change: 3,
        brow_bulge: 3,
        eye_squeeze: 3,
        nasolabial_furrow: 3,
        behavioural_state: 3,
        gestational_age: 3,
      }),
    });
    expect(a.total).toBe(21);
    expect(a.band?.severity).toBe('severe');
  });
});

describe('N-PASS prematurity correction', () => {
  it('adds three points below 28 weeks and crosses the escalation threshold', () => {
    const raw = {
      crying_irritability: 1,
      behaviour_state: 1,
      facial_expression: 1,
      extremities_tone: 1,
      vital_signs: 0,
    };
    const preterm = scoreAssessment({
      scale: N_PASS,
      ctx: ctx({ gestationalAgeAtBirth: { weeks: 26, days: 0 } }),
      scoredBy: 'test',
      items: items(raw),
    });
    const term = scoreAssessment({
      scale: N_PASS,
      ctx: ctx({ gestationalAgeAtBirth: { weeks: 39, days: 0 } }),
      scoredBy: 'test',
      items: items(raw),
    });

    expect(term.total).toBe(4);
    expect(preterm.total).toBe(7);
    // The same observed behaviour moves the 26-weeker into the rescue band.
    expect(term.band?.severity).toBe('moderate');
    expect(preterm.band?.severity).toBe('moderate');
    expect(preterm.total).toBeGreaterThanOrEqual(7);
  });

  it('reports the sedation arm separately and does not correct it', () => {
    const a = scoreAssessment({
      scale: N_PASS,
      ctx: ctx({ gestationalAgeAtBirth: { weeks: 26, days: 0 } }),
      scoredBy: 'test',
      items: items({
        crying_irritability: -2,
        behaviour_state: -2,
        facial_expression: -1,
        extremities_tone: -1,
        vital_signs: 0,
      }),
    });
    expect(a.secondary?.value).toBe(-6);
    expect(a.secondary?.band?.severity).toBe('oversedated');
    expect(a.total).toBe(3); // correction only, no positive items
  });

  it('warns that the total is uninterpretable under neuromuscular blockade', () => {
    const a = scoreAssessment({
      scale: N_PASS,
      ctx: ctx({ modifiers: ['neuromuscular_blockade'] }),
      scoredBy: 'test',
      items: items({
        crying_irritability: 0,
        behaviour_state: 0,
        facial_expression: 0,
        extremities_tone: 0,
        vital_signs: 0,
      }),
    });
    expect(a.workings.join(' ')).toContain('cannot express pain');
  });
});

describe('COMFORTneo item applicability', () => {
  it('scores the ventilator item and omits crying when ventilated', () => {
    const applicable = applicableItems(COMFORTNEO, ctx({ ventilation: 'invasive_ventilation' }));
    const ids = applicable.map((i) => i.id);
    expect(ids).toContain('respiratory_response');
    expect(ids).not.toContain('crying');
    expect(applicable).toHaveLength(6);
  });

  it('scores crying and omits the ventilator item when breathing spontaneously', () => {
    const ids = applicableItems(COMFORTNEO, ctx()).map((i) => i.id);
    expect(ids).toContain('crying');
    expect(ids).not.toContain('respiratory_response');
  });

  it('rejects an item that does not apply to this patient', () => {
    expect(() =>
      scoreAssessment({
        scale: COMFORTNEO,
        ctx: ctx(),
        scoredBy: 'test',
        items: items({
          alertness: 1,
          calmness: 1,
          crying: 1,
          respiratory_response: 1,
          body_movement: 1,
          facial_tension: 1,
          muscle_tone: 1,
        }),
      }),
    ).toThrow(/do not apply/);
  });
});

describe('refusing to score an incomplete assessment', () => {
  it('throws rather than treating missing items as zero', () => {
    expect(() =>
      scoreAssessment({
        scale: NIPS,
        ctx: ctx(),
        scoredBy: 'test',
        items: items({ facial_expression: 1, cry: 2 }),
      }),
    ).toThrow(IncompleteAssessmentError);
  });

  it('names every unscored item', () => {
    try {
      scoreAssessment({
        scale: NIPS,
        ctx: ctx(),
        scoredBy: 'test',
        items: items({ facial_expression: 0 }),
      });
      expect.unreachable();
    } catch (e) {
      expect((e as IncompleteAssessmentError).missing).toHaveLength(5);
    }
  });

  it('rejects a value that is not a valid option', () => {
    expect(() =>
      scoreAssessment({
        scale: NIPS,
        ctx: ctx(),
        scoredBy: 'test',
        items: items({
          facial_expression: 5,
          cry: 0,
          breathing: 0,
          arms: 0,
          legs: 0,
          arousal: 0,
        }),
      }),
    ).toThrow(/not a valid option/);
  });
});
