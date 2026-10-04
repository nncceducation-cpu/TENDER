import { describe, it, expect } from 'vitest';
import { codeFrame, summariseWindow, UNAVAILABLE_ACTIONS, actionThreshold, codeAction } from '../nfcsFeatures';
import { TransparentIndex } from '../painModel';
import { buildSuggestions } from '../suggestions';
import { analyseStills, describeStills } from '../stillAnalysis';
import { NFCS_P3 } from '../../data/scales/nfcs';
import type { FaceLandmarkerService } from '../faceLandmarker';
import type { NfcsAction, NfcsFrame } from '../../domain/types';
import {
  makeFace,
  makeResult,
  blendFor,
  installDom,
  setImageSize,
  FakeLandmarker,
} from './faceFixtures';

const P3_ON: Record<NfcsAction, boolean> = {
  brow_bulge: true,
  eye_squeeze: true,
  nasolabial_furrow: true,
  open_lips: false,
  vertical_mouth_stretch: false,
  horizontal_mouth_stretch: false,
  taut_tongue: false,
};
const NONE_ON: Record<NfcsAction, boolean> = Object.fromEntries(
  (Object.keys(P3_ON) as NfcsAction[]).map((a) => [a, false]),
) as Record<NfcsAction, boolean>;

const window_ = (usableSeconds: number, quality = 1, windowSeconds = 10, actions = P3_ON) =>
  summariseWindow(
    Array.from({ length: usableSeconds }, (_, i): NfcsFrame => ({
      t: i * 1000,
      actions,
      activations: {} as Record<NfcsAction, number>,
      faceDetected: true,
      quality,
    })),
    windowSeconds,
  );

/**
 * The invariant that caught the escalation defect in the protocol engine, applied
 * here: a measurement that could not be taken must never produce a more
 * reassuring result than a benign measurement that was.
 */
describe('a blind window is never more reassuring than a measured calm one', () => {
  it('abstains on the facial arm when no second of the window was usable', async () => {
    const blind = window_(10, 0.1);
    expect(blind.secondsUsable).toBe(0);

    const r = await new TransparentIndex().infer({ facial: blind });
    expect(r.abstentions.join(' ')).toMatch(/blind spot, not a reassuring reading/);
    expect(r.contributions.find((c) => c.feature.startsWith('NFCS-P-3'))).toBeUndefined();
  });

  it('distinguishes a blind window from a settled infant', async () => {
    const index = new TransparentIndex();
    const blind = await index.infer({ facial: window_(10, 0.1) });
    const calm = await index.infer({ facial: window_(10, 1, 10, NONE_ON) });

    // Both legitimately value 0; what must differ is what the output says about
    // why. Before the fix the two were indistinguishable except by confidence.
    expect(blind.value).toBe(0);
    expect(calm.value).toBe(0);
    expect(blind.abstentions).not.toEqual(calm.abstentions);
    expect(blind.confidence).toBeLessThan(calm.confidence);
  });
});

describe('NFCS sums are normalised against what the window could reach', () => {
  /**
   * Both sums are counts of seconds, so their ceiling is set by how many seconds
   * were coded. Measured against the old fixed denominator of 30, a maximal
   * facial signal scored 0.100 over one usable second, 0.200 over two and 0.400
   * over four - under-reporting pain in the direction that withholds analgesia.
   */
  it.each([1, 2, 4, 6, 8, 10])(
    'reads a maximal facial signal as full scale over %i usable seconds',
    async (seconds) => {
      const s = window_(seconds);
      expect(s.nfcsP3Sum).toBe(3 * seconds);
      expect(s.nfcsP3AchievableMax).toBe(3 * seconds);

      const r = await new TransparentIndex().infer({ facial: s });
      const facial = r.contributions.find((c) => c.feature.startsWith('NFCS-P-3'));
      expect(facial).toBeDefined();
      expect(facial!.value).toBeCloseTo(1, 6);
    },
  );

  it('carries the coverage penalty in confidence rather than in the value', async () => {
    const index = new TransparentIndex();
    const short = await index.infer({ facial: window_(2, 1, 10) });
    const full = await index.infer({ facial: window_(10, 1, 10) });
    expect(short.value).toBeCloseTo(full.value, 6);
    expect(short.confidence).toBeLessThan(full.confidence);
  });

  it('reports the achievable maxima and the unavailable actions', () => {
    const s = window_(10);
    expect(s.nfcs7AchievableMax).toBe(6 * 10);
    expect(s.nfcsP3AchievableMax).toBe(3 * 10);
    expect(s.actionsUnavailable).toEqual([...UNAVAILABLE_ACTIONS]);
    expect(s.nfcs7Complete).toBe(UNAVAILABLE_ACTIONS.length === 0);
  });

  /**
   * The published 7-action total runs 0-70. This one cannot reach it, and the
   * type comment used to claim it could. See
   * REVIEW_FLAGS['nfcs7-total-cannot-reach-70'].
   */
  it('cannot reach the published 7-action maximum while an action is unsignalled', () => {
    const everything = Object.fromEntries(
      (Object.keys(P3_ON) as NfcsAction[]).map((a) => [a, true]),
    ) as Record<NfcsAction, boolean>;
    const s = window_(10, 1, 10, everything);
    expect(s.nfcs7Sum).toBe(60);
    expect(s.nfcs7Sum).toBe(s.nfcs7AchievableMax);
    expect(s.nfcs7Sum).toBeLessThan(70);
  });
});

describe('short NFCS-P-3 windows are not scored as subclinical', () => {
  const threshold = NFCS_P3.bands.find((b) => b.min > 0)!.min;

  /**
   * With two usable seconds the ceiling is 6 against a published threshold of
   * 9/30, so any score would read as below threshold however distressed the
   * infant was. Measured before the guard: items filled as 2/2/2 at confidence
   * 1.00. See REVIEW_FLAGS['nfcs-short-window-items-withheld'].
   */
  it.each([1, 2])('withholds items when %i usable second(s) cannot reach the threshold', (seconds) => {
    const r = buildSuggestions('NFCS_P3', window_(seconds, 1, seconds), undefined, undefined);
    expect(Object.keys(r.suggestions)).toHaveLength(0);
    expect(r.abstentions.join(' ')).toMatch(/below the published/);
    expect(3 * seconds).toBeLessThan(threshold);
  });

  it.each([3, 4, 10])('still scores %i usable seconds, whose ceiling reaches the threshold', (seconds) => {
    const r = buildSuggestions('NFCS_P3', window_(seconds, 1, seconds), undefined, undefined);
    expect(r.suggestions['brow_bulge']).toBeDefined();
    expect(r.suggestions['brow_bulge'].value).toBe(seconds);
    expect(3 * seconds).toBeGreaterThanOrEqual(threshold);
  });

  it('states the ceiling in the rationale it offers', () => {
    const r = buildSuggestions('NFCS_P3', window_(4, 1, 4), undefined, undefined);
    expect(r.suggestions['brow_bulge'].rationale).toMatch(/reachable from this window is 12/);
  });
});

describe('faceDetected reports what the landmarker returned', () => {
  it('is false for a result with no landmarks', () => {
    expect(codeFrame(makeResult({ noFace: true }), null, 0.9, 0).faceDetected).toBe(false);
  });

  it('is true for a result with landmarks', () => {
    expect(codeFrame(makeResult({ blend: blendFor({ brow: 0.5 }) }), null, 0.9, 0).faceDetected).toBe(true);
  });

  /**
   * summariseWindow filters on `faceDetected && quality >= 0.45`. While the flag
   * was the literal `true`, that half of the gate did nothing for any frame the
   * module produced.
   */
  it('makes the faceDetected half of the window gate load-bearing', () => {
    const frames: NfcsFrame[] = [
      { t: 0, actions: P3_ON, activations: {} as Record<NfcsAction, number>, faceDetected: true, quality: 1 },
      { t: 1000, actions: P3_ON, activations: {} as Record<NfcsAction, number>, faceDetected: false, quality: 1 },
    ];
    expect(summariseWindow(frames, 2).secondsUsable).toBe(1);
  });
});

describe('the presence threshold has one implementation', () => {
  const base = { median: 0.1, robustSd: 0.02, samples: 30 };

  it('applies the floor when baseline variability is near zero', () => {
    expect(actionThreshold({ median: 0.1, robustSd: 0, samples: 30 }, 3)).toBeCloseTo(0.15, 6);
  });

  it('uses k robust SDs when they exceed the floor', () => {
    expect(actionThreshold({ median: 0.1, robustSd: 0.05, samples: 30 }, 3)).toBeCloseTo(0.25, 6);
  });

  /**
   * null is "not codeable", which is not the same as absent. An unavailable
   * action and an action with no baseline both return null; callers that need a
   * boolean must say so rather than inheriting false by accident.
   */
  it('separates not-codeable from absent', () => {
    const cal = { baselines: { brow_bulge: base }, k: 3 };
    expect(codeAction('taut_tongue', Number.NaN, cal)).toBeNull();
    expect(codeAction('eye_squeeze', 0.9, cal)).toBeNull();
    expect(codeAction('brow_bulge', 0.9, cal)).toBe(true);
    expect(codeAction('brow_bulge', 0.11, cal)).toBe(false);
    expect(codeAction('brow_bulge', 0.9, null)).toBeNull();
  });
});

describe('a frame below the quality gate carries no COMFORT level', () => {
  const face = makeFace({ aperture: 0.09, browToEye: 0.14, mouthOpening: 0.35, faceFraction: 0.4 });
  const result = makeResult({ face, blend: blendFor({ brow: 0.5, jaw: 0.5 }) });
  const service = () => new FakeLandmarker([result]) as unknown as FaceLandmarkerService;

  /**
   * The small-face penalty used to be applied after the gate, so the gate tested
   * one number and the frame was stored with a lower one. Measured before the
   * fix: a 400x300 photograph passed at 0.600, produced a level, and was stored
   * at 0.436; describeStills has no quality filter and surfaced the level anyway.
   */
  it.each([
    [400, 300],
    [320, 240],
    [260, 200],
  ])('offers no assessment for a %ix%i photograph stored below the gate', async (w, h) => {
    installDom();
    setImageSize(w, h);
    const frames = await analyseStills(service(), [{ name: 'small.jpg', dataUrl: 'data:,' }]);
    expect(frames[0].quality).toBeLessThan(0.45);
    expect(frames[0].assessment).toBeNull();
    expect(describeStills(frames)[0].assessment).toBeNull();
  });

  it('still offers an assessment for a well-sized photograph', async () => {
    installDom();
    setImageSize(1280, 960);
    const frames = await analyseStills(service(), [{ name: 'good.jpg', dataUrl: 'data:,' }]);
    expect(frames[0].quality).toBeGreaterThanOrEqual(0.45);
    expect(frames[0].assessment).not.toBeNull();
  });

  it('never surfaces a level for a frame it stored below the gate', async () => {
    installDom();
    for (const [w, h] of [[1280, 960], [640, 480], [480, 360], [400, 300], [320, 240]] as const) {
      setImageSize(w, h);
      const frames = await analyseStills(service(), [{ name: 'x', dataUrl: 'data:,' }]);
      for (const d of describeStills(frames)) {
        if (d.frame.quality < 0.45) expect(d.assessment).toBeNull();
      }
    }
  });
});
