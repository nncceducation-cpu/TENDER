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

describe('clip sampling rate', () => {
  it('keeps the requested rate for a short range', async () => {
    const { effectiveFps } = await import('../clipAnalysis');
    expect(effectiveFps(15, 20)).toBe(15);
  });

  it('reduces the rate rather than the range for a long clip', async () => {
    const { effectiveFps, estimateFrames } = await import('../clipAnalysis');
    // Two minutes at 15 fps would be 1800 samples, each a seek plus an inference.
    const fps = effectiveFps(15, 120);
    expect(fps).toBeLessThan(15);
    expect(estimateFrames(15, 120)).toBeLessThanOrEqual(600);
  });

  it('holds the floor rather than the budget when they conflict', async () => {
    const { effectiveFps, estimateFrames } = await import('../clipAnalysis');
    // An hour cannot be sampled within the budget without falling below the
    // floor, so the floor holds and the pass simply takes longer.
    expect(effectiveFps(15, 3600)).toBe(4);
    expect(estimateFrames(15, 3600)).toBeGreaterThan(600);
  });
});

describe('still image coding', () => {
  const still = (name: string, v: number, quality = 0.9) => ({
    index: 0,
    name,
    activations: activations(v),
    quality,
    problems: [],
    faceFound: true,
    assessment: null,
  });

  it('refuses to calibrate from too few images', async () => {
    const { calibrateFromStills, MIN_BASELINE_STILLS } = await import('../stillAnalysis');
    const r = calibrateFromStills('BED-1', [still('a', 0.05), still('b', 0.05)]);
    expect('error' in r).toBe(true);
    if ('error' in r) expect(r.error).toMatch(new RegExp(`${MIN_BASELINE_STILLS} are needed`));
  });

  it('says when no face was found rather than blaming the count', async () => {
    const { calibrateFromStills } = await import('../stillAnalysis');
    const r = calibrateFromStills('BED-1', [
      {
        index: 0,
        name: 'a',
        activations: {} as never,
        quality: 0,
        problems: [],
        faceFound: false,
        assessment: null,
      },
    ]);
    expect('error' in r).toBe(true);
    if ('error' in r) expect(r.error).toMatch(/No face was detected in any/);
  });

  it('calibrates from enough usable images', async () => {
    const { calibrateFromStills } = await import('../stillAnalysis');
    const frames = Array.from({ length: 8 }, (_, i) => still(`b${i}`, 0.05 + (i % 3) * 0.01));
    const r = calibrateFromStills('BED-1', frames);
    expect('error' in r).toBe(false);
  });

  it('codes each image and skips the ones it cannot use', async () => {
    const { calibrateFromStills, codeStills } = await import('../stillAnalysis');
    const c = calibrateFromStills(
      'BED-1',
      Array.from({ length: 8 }, (_, i) => still(`b${i}`, 0.05 + (i % 3) * 0.01)),
    );
    if ('error' in c) throw new Error(c.error);

    const r = codeStills(
      [still('calm.jpg', 0.05), still('grimace.jpg', 0.9), still('blurred.jpg', 0.5, 0.2)],
      c,
      false,
    );
    expect(r.usableCount).toBe(2);
    expect(r.skipped).toHaveLength(1);
    expect(r.coded[0].actions.brow_bulge).toBe(false);
    expect(r.coded[1].actions.brow_bulge).toBe(true);
  });

  it('produces no proportion for images that are not a sequence', async () => {
    const { calibrateFromStills, codeStills } = await import('../stillAnalysis');
    const c = calibrateFromStills(
      'BED-1',
      Array.from({ length: 8 }, (_, i) => still(`b${i}`, 0.05 + (i % 3) * 0.01)),
    );
    if ('error' in c) throw new Error(c.error);
    expect(codeStills([still('a', 0.9), still('b', 0.9)], c, false).summary).toBeNull();
    expect(codeStills([still('a', 0.9), still('b', 0.9)], c, true).summary).not.toBeNull();
  });

  it('treats a sequence as one coding unit per image', async () => {
    const { calibrateFromStills, codeStills } = await import('../stillAnalysis');
    const c = calibrateFromStills(
      'BED-1',
      Array.from({ length: 8 }, (_, i) => still(`b${i}`, 0.05 + (i % 3) * 0.01)),
    );
    if ('error' in c) throw new Error(c.error);
    const r = codeStills(
      Array.from({ length: 4 }, (_, i) => still(`s${i}`, i < 3 ? 0.9 : 0.05)),
      c,
      true,
    );
    // Three of four images show the action, so the proportion is 0.75.
    expect(r.summary!.proportionPresent.brow_bulge).toBeCloseTo(0.75, 6);
  });
});

describe('describing a baseline honestly', () => {
  const settled = (n: number) =>
    Array.from({ length: n }, (_, i) => ({
      activations: activations(0.05 + (i % 3) * 0.01),
      quality: 0.9,
    }));

  it('reports still baselines as images, not seconds', async () => {
    const { calibrate, describeCalibration } = await import('../nfcsFeatures');
    const c = calibrate('BED-1', settled(8), { fps: 1, minSeconds: 5, source: 'stills' });
    if ('error' in c) throw new Error(c.error);
    expect(describeCalibration(c)).toBe('8 settled images');
    expect(c.notes.join(' ')).toMatch(/8 settled images/);
  });

  it('reports video baselines in seconds', async () => {
    const { calibrate, describeCalibration } = await import('../nfcsFeatures');
    const c = calibrate('BED-1', settled(450), { elapsedSeconds: 30, source: 'clip' });
    if ('error' in c) throw new Error(c.error);
    expect(describeCalibration(c)).toBe('30 s of recorded video');
  });

  it('records the sample count whatever the source', async () => {
    const { calibrate } = await import('../nfcsFeatures');
    const c = calibrate('BED-1', settled(12), { fps: 1, minSeconds: 5, source: 'stills' });
    if ('error' in c) throw new Error(c.error);
    expect(c.baselineSamples).toBe(12);
  });
});

describe('self-referenced scoring, when no calm material exists', () => {
  const set = (values: number[]) =>
    values.map((v) => ({ activations: activations(v), quality: 0.9 }));

  it('refuses a single sample, which cannot reference itself', async () => {
    const { selfReference } = await import('../nfcsFeatures');
    const r = selfReference('BED-1', set([0.5]), { minSamples: 5 });
    expect('error' in r).toBe(true);
    if ('error' in r) expect(r.error).toMatch(/at least 5 are needed/);
  });

  it('says when no face was found rather than blaming the count', async () => {
    const { selfReference } = await import('../nfcsFeatures');
    const r = selfReference('BED-1', [], {});
    expect('error' in r).toBe(true);
    if ('error' in r) expect(r.error).toMatch(/No face was detected/);
  });

  it('builds a reference from the median of the material', async () => {
    const { selfReference } = await import('../nfcsFeatures');
    const r = selfReference('BED-1', set([0.1, 0.12, 0.14, 0.5, 0.9, 0.11, 0.13]), {});
    if ('error' in r) throw new Error(r.error);
    expect(r.source).toBe('self');
    expect(r.baselines.brow_bulge!.median).toBeCloseTo(0.13, 6);
  });

  it('always carries the under-reporting caveat', async () => {
    const { selfReference, SELF_REFERENCE_CAVEAT, isSelfReferenced } = await import(
      '../nfcsFeatures'
    );
    const r = selfReference('BED-1', set([0.1, 0.2, 0.3, 0.4, 0.5, 0.6]), {});
    if ('error' in r) throw new Error(r.error);
    expect(isSelfReferenced(r)).toBe(true);
    expect(r.notes).toContain(SELF_REFERENCE_CAVEAT);
    expect(SELF_REFERENCE_CAVEAT).toMatch(/under-reported/);
  });

  it('under-reports when the material is uniformly activated, as documented', async () => {
    const { selfReference, codeFrame } = await import('../nfcsFeatures');
    void codeFrame;
    // Every sample high: the median is high too, so nothing exceeds it.
    const r = selfReference('BED-1', set([0.85, 0.86, 0.87, 0.88, 0.86, 0.87]), {});
    if ('error' in r) throw new Error(r.error);
    const base = r.baselines.brow_bulge!;
    const threshold = Math.max(base.median + r.k * base.robustSd, base.median + 0.05);
    expect(0.87 > threshold).toBe(false);
  });

  it('describes itself as referencing the material, not a settled epoch', async () => {
    const { selfReference, describeCalibration } = await import('../nfcsFeatures');
    const r = selfReference('BED-1', set([0.1, 0.2, 0.3, 0.4, 0.5, 0.6]), {});
    if ('error' in r) throw new Error(r.error);
    expect(describeCalibration(r)).toMatch(/samples of the material itself/);
  });
});

describe('describing stills with no reference at all', () => {
  it('produces an ordering and no coding', async () => {
    const { describeStills } = await import('../stillAnalysis');
    const frame = {
      index: 0,
      name: 'one.jpg',
      activations: { ...activations(0), brow_bulge: 0.8, eye_squeeze: 0.2 } as never,
      quality: 0.9,
      problems: [],
      faceFound: true,
      assessment: null,
    };
    const [d] = describeStills([frame]);
    expect(d.ranked[0].action).toBe('brow_bulge');
    expect(d.ranked[0].activation).toBeCloseTo(0.8, 6);
    // Nothing in the output claims presence or absence.
    expect(Object.keys(d).sort()).toEqual(['assessment', 'frame', 'ranked']);
  });

  it('omits actions it cannot measure', async () => {
    const { describeStills } = await import('../stillAnalysis');
    const [d] = describeStills([
      {
        index: 0,
        name: 'one.jpg',
        activations: activations(0.4),
        quality: 0.9,
        problems: [],
        faceFound: true,
        assessment: null,
      },
    ]);
    expect(d.ranked.some((r) => r.action === 'taut_tongue')).toBe(false);
  });

  it('skips images with no face', async () => {
    const { describeStills } = await import('../stillAnalysis');
    expect(
      describeStills([
        {
        index: 0,
        name: 'a',
        activations: {} as never,
        quality: 0,
        problems: [],
        faceFound: false,
        assessment: null,
      },
      ]),
    ).toHaveLength(0);
  });
});

describe('reading a single image from geometry', () => {
  const pt = (x = 0, y = 0) => ({ x, y });
  const POINTS = {
    leftEye: { top: pt(), bottom: pt(), outer: pt(), inner: pt(), brow: pt() },
    rightEye: { top: pt(), bottom: pt(), outer: pt(), inner: pt(), brow: pt() },
    mouth: { top: pt(), bottom: pt(), left: pt(), right: pt() },
    face: { top: pt(), chin: pt() },
    box: { x: 0, y: 0, w: 100, h: 100 },
  };

  const measures = (over: Partial<Record<string, number>> = {}) => ({
    eyeAperture: 0.12,
    mouthOpening: 0.01,
    mouthWidth: 0.75,
    browToEye: 0.3,
    faceProportion: 1.6,
    points: POINTS,
    ...over,
  });

  it('reads a relaxed face as level 2, never level 1', async () => {
    const { readSingleImage } = await import('../faceGeometry');
    const r = readSingleImage(measures());
    expect(r.facialTension).toBe(2);
    expect(r.caveats.join(' ')).toMatch(/Level 1, total relaxation, is never produced/);
  });

  it('never produces level 1 for any input', async () => {
    const { readSingleImage } = await import('../faceGeometry');
    for (let eye = 0; eye <= 0.3; eye += 0.01) {
      for (let mouth = 0; mouth <= 0.5; mouth += 0.05) {
        const r = readSingleImage(measures({ eyeAperture: eye, mouthOpening: mouth }));
        expect(r.facialTension).toBeGreaterThanOrEqual(2);
        expect(r.facialTension).toBeLessThanOrEqual(5);
      }
    }
  });

  it('escalates as more regions show tension', async () => {
    const { readSingleImage } = await import('../faceGeometry');
    const calm = readSingleImage(measures());
    const oneRegion = readSingleImage(measures({ eyeAperture: 0.03 }));
    const everything = readSingleImage(
      measures({ eyeAperture: 0.005, mouthOpening: 0.4, browToEye: 0.12 }),
    );
    expect(oneRegion.facialTension).toBeGreaterThan(calm.facialTension);
    expect(everything.facialTension).toBeGreaterThan(oneRegion.facialTension);
    expect(everything.facialTension).toBe(5);
  });

  it('weights the brow least, since resting brow height varies between infants', async () => {
    const { readSingleImage } = await import('../faceGeometry');
    const brow = readSingleImage(measures({ browToEye: 0.12 }));
    const eyes = readSingleImage(measures({ eyeAperture: 0.02 }));
    expect(brow.regions.find((r) => r.region === 'Brow')!.reliability).toBe('weak');
    expect(eyes.overallTension).toBeGreaterThan(brow.overallTension);
  });

  it('always states that it is uncalibrated and not comparable', async () => {
    const { readSingleImage } = await import('../faceGeometry');
    const c = readSingleImage(measures()).caveats.join(' ');
    expect(c).toMatch(/Uncalibrated/);
    expect(c).toMatch(/Not comparable between infants/);
    expect(c).toMatch(/Never auto-filled/);
  });

  it('warns that closed eyes and sleep are indistinguishable in one frame', async () => {
    const { readSingleImage } = await import('../faceGeometry');
    const r = readSingleImage(measures({ eyeAperture: 0.005 }));
    expect(r.caveats.join(' ')).toMatch(/what sleep looks like/);
  });

  it('warns when face proportions suggest the head is turned', async () => {
    const { readSingleImage } = await import('../faceGeometry');
    expect(readSingleImage(measures({ faceProportion: 0.7 })).caveats.join(' ')).toMatch(
      /head may be turned/,
    );
  });

  it('refuses to measure a landmark set that is too small', async () => {
    const { measureGeometry } = await import('../faceGeometry');
    expect(measureGeometry({ faceLandmarks: [[]] } as never, 640, 480)).toBeNull();
    expect(measureGeometry({ faceLandmarks: [] } as never, 640, 480)).toBeNull();
  });

  it('normalises away face size, so distance from the camera does not change the level', async () => {
    const { measureGeometry, readSingleImage } = await import('../faceGeometry');
    const make = (scale: number) => ({
      faceLandmarks: [
        Array.from({ length: 468 }, (_, i) => {
          const pts: Record<number, [number, number]> = {
            33: [0.5 - 0.1 * scale, 0.5],
            263: [0.5 + 0.1 * scale, 0.5],
            159: [0.4, 0.5 - 0.01 * scale],
            145: [0.4, 0.5 + 0.01 * scale],
            386: [0.6, 0.5 - 0.01 * scale],
            374: [0.6, 0.5 + 0.01 * scale],
            105: [0.4, 0.5 - 0.06 * scale],
            334: [0.6, 0.5 - 0.06 * scale],
            13: [0.5, 0.7],
            14: [0.5, 0.7 + 0.002 * scale],
            61: [0.5 - 0.08 * scale, 0.7],
            291: [0.5 + 0.08 * scale, 0.7],
            10: [0.5, 0.5 - 0.16 * scale],
            152: [0.5, 0.5 + 0.16 * scale],
          };
          const [x, y] = pts[i] ?? [0.5, 0.5];
          return { x, y, z: 0 };
        }),
      ],
    });
    const near = measureGeometry(make(1.5) as never, 800, 800);
    const far = measureGeometry(make(0.6) as never, 800, 800);
    expect(near).not.toBeNull();
    expect(far).not.toBeNull();
    expect(near!.eyeAperture).toBeCloseTo(far!.eyeAperture, 6);
    expect(readSingleImage(near!).facialTension).toBe(readSingleImage(far!).facialTension);
  });
});
