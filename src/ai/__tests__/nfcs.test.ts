import { describe, it, expect } from 'vitest';
import { calibrate, summariseWindow, UNAVAILABLE_ACTIONS, DEFAULT_K } from '../nfcsFeatures';
import { buildSuggestions } from '../suggestions';
import { TransparentIndex } from '../painModel';
import type { NfcsAction, NfcsFrame } from '../../domain/types';

const ACTIONS: NfcsAction[] = [
  'brow_bulge',
  'eye_squeeze',
  'nasolabial_furrow',
  'open_lips',
  'vertical_mouth_stretch',
  'horizontal_mouth_stretch',
  'taut_tongue',
];

const activations = (v: number) =>
  Object.fromEntries(ACTIONS.map((a) => [a, a === 'taut_tongue' ? Number.NaN : v])) as Record<
    NfcsAction,
    number
  >;

const frame = (t: number, present: NfcsAction[], quality = 0.9): NfcsFrame => ({
  t,
  actions: Object.fromEntries(ACTIONS.map((a) => [a, present.includes(a)])) as Record<NfcsAction, boolean>,
  activations: activations(0),
  faceDetected: true,
  quality,
});

describe('per-infant calibration', () => {
  const baseline = (n: number, jitter = 0.01) =>
    Array.from({ length: n }, (_, i) => ({
      activations: activations(0.05 + ((i % 3) - 1) * jitter),
      quality: 0.9,
    }));

  it('refuses to calibrate from too short a baseline', () => {
    const r = calibrate('BED-1', baseline(60), { elapsedSeconds: 4, minSeconds: 20 });
    expect('error' in r).toBe(true);
    if ('error' in r) expect(r.error).toMatch(/at least 20 s is required/);
  });

  it('builds a baseline from a long enough settled epoch', () => {
    const r = calibrate('BED-1', baseline(450), { elapsedSeconds: 30, minSeconds: 20 });
    expect('error' in r).toBe(false);
    if ('error' in r) return;
    expect(r.baselineSeconds).toBeCloseTo(30, 0);
    expect(r.k).toBe(DEFAULT_K);
  });

  it('measures duration against the wall clock, not an assumed frame rate', () => {
    // The same 10 real seconds must be rejected whether the loop ran at 30 or 60 fps.
    const at30 = calibrate('BED-1', baseline(300), { elapsedSeconds: 10, minSeconds: 20 });
    const at60 = calibrate('BED-1', baseline(600), { elapsedSeconds: 10, minSeconds: 20 });
    expect('error' in at30).toBe(true);
    expect('error' in at60).toBe(true);
  });

  it('distinguishes no face at all from a short epoch', () => {
    const r = calibrate('BED-1', [], { elapsedSeconds: 30 });
    expect('error' in r).toBe(true);
    if ('error' in r) expect(r.error).toMatch(/No face was detected at any point/);
  });

  it('distinguishes a detected face that was never usable', () => {
    const poor = Array.from({ length: 600 }, () => ({ activations: activations(0.05), quality: 0.1 }));
    const r = calibrate('BED-1', poor, { elapsedSeconds: 30 });
    expect('error' in r).toBe(true);
    if ('error' in r) expect(r.error).toMatch(/never at usable quality/);
  });

  it('never builds a baseline for an action it cannot measure', () => {
    const r = calibrate('BED-1', baseline(450), { elapsedSeconds: 30 });
    if ('error' in r) throw new Error(r.error);
    for (const a of UNAVAILABLE_ACTIONS) expect(r.baselines[a]).toBeUndefined();
  });

  it('warns when the baseline looks unsettled', () => {
    const noisy = Array.from({ length: 450 }, (_, i) => ({
      activations: activations(i % 2 === 0 ? 0.05 : 0.8),
      quality: 0.9,
    }));
    const r = calibrate('BED-1', noisy, { elapsedSeconds: 30 });
    if ('error' in r) throw new Error(r.error);
    expect(r.notes.join(' ')).toMatch(/may not have been settled/);
  });

  it('discards low-quality frames and reports the proportion lost', () => {
    const mixed = [
      ...Array.from({ length: 200 }, () => ({ activations: activations(0.05), quality: 0.2 })),
      ...Array.from({ length: 100 }, () => ({ activations: activations(0.05), quality: 0.9 })),
    ];
    // 30 s elapsed, but only a third of frames usable, so 10 s of usable baseline.
    const r = calibrate('BED-1', mixed, { elapsedSeconds: 30, minSeconds: 20 });
    expect('error' in r).toBe(true);
    if ('error' in r) expect(r.error).toMatch(/67% of frames were discarded/);
  });
});

describe('epoch summary', () => {
  it('collapses frames into seconds so the score does not depend on frame rate', () => {
    const at30fps: NfcsFrame[] = [];
    const at15fps: NfcsFrame[] = [];
    for (let s = 0; s < 10; s++) {
      for (let f = 0; f < 30; f++) at30fps.push(frame(s * 1000 + f * 33, ['brow_bulge']));
      for (let f = 0; f < 15; f++) at15fps.push(frame(s * 1000 + f * 66, ['brow_bulge']));
    }
    expect(summariseWindow(at30fps, 10).nfcsP3Sum).toBe(summariseWindow(at15fps, 10).nfcsP3Sum);
  });

  it('counts a second only when the action is present in most of its frames', () => {
    const frames: NfcsFrame[] = [];
    for (let f = 0; f < 10; f++) frames.push(frame(f * 100, f < 3 ? ['brow_bulge'] : []));
    expect(summariseWindow(frames, 1).nfcsP3Sum).toBe(0);
  });

  it('sums the three-action constellation out of thirty over ten seconds', () => {
    const frames: NfcsFrame[] = [];
    for (let s = 0; s < 10; s++) {
      for (let f = 0; f < 10; f++) {
        frames.push(frame(s * 1000 + f * 100, ['brow_bulge', 'eye_squeeze', 'nasolabial_furrow']));
      }
    }
    const summary = summariseWindow(frames, 10);
    expect(summary.nfcsP3Sum).toBe(30);
    expect(summary.secondsUsable).toBe(10);
  });

  it('excludes unusable frames from the denominator', () => {
    const frames: NfcsFrame[] = [];
    for (let s = 0; s < 10; s++) {
      for (let f = 0; f < 10; f++) {
        frames.push(frame(s * 1000 + f * 100, ['brow_bulge'], s < 5 ? 0.9 : 0.1));
      }
    }
    expect(summariseWindow(frames, 10).secondsUsable).toBe(5);
  });
});

describe('PIPP-R facial suggestions', () => {
  const summaryWith = (proportion: number) => ({
    windowSeconds: 30,
    framesScored: 450,
    proportionPresent: Object.fromEntries(ACTIONS.map((a) => [a, proportion])) as Record<NfcsAction, number>,
    nfcs7Sum: 0,
    nfcsP3Sum: Math.round(proportion * 30),
    meanQuality: 0.9,
    secondsUsable: 30,
  });

  it.each([
    [0.05, 0],
    [0.2, 1],
    [0.5, 2],
    [0.85, 3],
  ])('maps %f of the window to the published band %i', (proportion, expected) => {
    const { suggestions } = buildSuggestions('PIPP_R', summaryWith(proportion), undefined, undefined);
    expect(suggestions['brow_bulge'].value).toBe(expected);
    expect(suggestions['eye_squeeze'].value).toBe(expected);
    expect(suggestions['nasolabial_furrow'].value).toBe(expected);
  });

  it('states the measured proportion in the rationale', () => {
    const { suggestions } = buildSuggestions('PIPP_R', summaryWith(0.42), undefined, undefined);
    expect(suggestions['brow_bulge'].rationale).toMatch(/42%/);
  });

  it('withholds facial suggestions when too little of the window was usable', () => {
    const poor = { ...summaryWith(0.9), secondsUsable: 3, meanQuality: 0.5 };
    const { suggestions, abstentions } = buildSuggestions('PIPP_R', poor, undefined, undefined);
    expect(Object.keys(suggestions)).toHaveLength(0);
    expect(abstentions.join(' ')).toMatch(/withheld/);
  });

  it('suggests physiologic items from measured deltas', () => {
    const { suggestions } = buildSuggestions('PIPP_R', summaryWith(0.1), undefined, {
      deltaHeartRate: 18,
      deltaSpo2: -6,
      rmssd: null,
    });
    expect(suggestions['hr_change'].value).toBe(2);
    expect(suggestions['spo2_change'].value).toBe(2);
  });
});

describe('COMFORTneo facial tension mapping', () => {
  const summaryWith = (props: Partial<Record<NfcsAction, number>>) => ({
    windowSeconds: 30,
    framesScored: 450,
    proportionPresent: {
      ...(Object.fromEntries(ACTIONS.map((a) => [a, 0])) as Record<NfcsAction, number>),
      ...props,
    },
    nfcs7Sum: 0,
    nfcsP3Sum: 0,
    meanQuality: 0.9,
    secondsUsable: 30,
  });

  it('never proposes level 1, because coding cannot establish total relaxation', () => {
    const { suggestions } = buildSuggestions('COMFORTneo', summaryWith({}), undefined, undefined);
    expect(suggestions['facial_tension'].value).toBe(2);
  });

  it('proposes level 3 for brief tension in one action', () => {
    const { suggestions } = buildSuggestions(
      'COMFORTneo',
      summaryWith({ brow_bulge: 0.25 }),
      undefined,
      undefined,
    );
    expect(suggestions['facial_tension'].value).toBe(3);
  });

  it('proposes level 4 when tension is spread across actions', () => {
    const { suggestions } = buildSuggestions(
      'COMFORTneo',
      summaryWith({ brow_bulge: 0.9, eye_squeeze: 0.5 }),
      undefined,
      undefined,
    );
    expect(suggestions['facial_tension'].value).toBe(4);
  });

  it('proposes level 5 only for a single sustained dominant action', () => {
    const { suggestions } = buildSuggestions(
      'COMFORTneo',
      summaryWith({ brow_bulge: 0.95 }),
      undefined,
      undefined,
    );
    expect(suggestions['facial_tension'].value).toBe(5);
  });

  it('labels the mapping as a local convention', () => {
    const { suggestions } = buildSuggestions(
      'COMFORTneo',
      summaryWith({ brow_bulge: 0.5 }),
      undefined,
      undefined,
    );
    expect(suggestions['facial_tension'].rationale).toMatch(/local convention/);
  });

  it('stays inside the instrument range for every input', () => {
    for (let p = 0; p <= 1.001; p += 0.05) {
      const { suggestions } = buildSuggestions(
        'COMFORTneo',
        summaryWith({ brow_bulge: p, eye_squeeze: p / 2, nasolabial_furrow: p / 3 }),
        undefined,
        undefined,
      );
      const v = suggestions['facial_tension'].value;
      expect(v).toBeGreaterThanOrEqual(1);
      expect(v).toBeLessThanOrEqual(5);
    }
  });
});

describe('transparent index', () => {
  it('abstains entirely when it has no features', async () => {
    const out = await new TransparentIndex().infer({});
    expect(out.value).toBe(0);
    expect(out.confidence).toBe(0);
    expect(out.abstentions.length).toBeGreaterThan(0);
  });

  it('never claims to be calibrated', async () => {
    const out = await new TransparentIndex().infer({
      facial: {
        windowSeconds: 10,
        framesScored: 150,
        proportionPresent: Object.fromEntries(ACTIONS.map((a) => [a, 1])) as Record<NfcsAction, number>,
        nfcs7Sum: 60,
        nfcsP3Sum: 30,
        meanQuality: 1,
        secondsUsable: 10,
      },
    });
    expect(out.calibrated).toBe(false);
    expect(out.value).toBeGreaterThan(0);
  });

  it('exposes every contributing feature and its weight', async () => {
    const out = await new TransparentIndex().infer({
      physiologic: { deltaHeartRate: 30, deltaSpo2: -10, rmssd: null },
    });
    expect(out.contributions.map((c) => c.feature)).toEqual(['Heart rate rise', 'Saturation fall']);
    expect(out.contributions.every((c) => Number.isFinite(c.weight))).toBe(true);
  });

  it('carries a model card that states it is unvalidated', () => {
    expect(new TransparentIndex().card.reportedPerformance).toMatch(/Unvalidated/);
  });
});
