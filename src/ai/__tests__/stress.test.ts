import { describe, it, expect } from 'vitest';
import { measureGeometry, readSingleImage } from '../faceGeometry';
import { assessFrameQuality } from '../faceLandmarker';
import { summariseWindow, calibrate, selfReference, codeAction } from '../nfcsFeatures';
import { analyseClip, sampleRange } from '../clipAnalysis';
import type { FaceLandmarkerService } from '../faceLandmarker';
import { TransparentIndex } from '../painModel';
import { buildSuggestions } from '../suggestions';
import { makeFace, makeResult, tone } from './faceFixtures';
import { detectF0 } from '../cry';
import { decideEscalation } from '../../engine/protocolEngine';
import { scoreAssessment, applicableItems } from '../../engine/scoring';
import { SCALES } from '../../data/scales';
import type { PatientContext, NfcsFrame } from '../../domain/types';

const ctx: PatientContext = { localId: 'synthetic', gestationalAgeAtBirth: { weeks: 30, days: 0 }, postnatalAgeDays: 5, weightKg: 3, ventilation: 'spontaneous', modifiers: [], hepaticDysfunction: false, postOpDay: null, infusions: [] };
const actions = { brow_bulge: true, eye_squeeze: true, nasolabial_furrow: true, open_lips: true, vertical_mouth_stretch: true, horizontal_mouth_stretch: true, taut_tongue: false };
const frame = (t: number, quality = 1): NfcsFrame => ({ t, quality, faceDetected: true, actions, activations: {} as NfcsFrame['activations'] });

describe('release stress matrix (synthetic, not clinical validation)', () => {
  it('enumerates every legal item combination for each instrument and ventilation mode', () => {
    let combinations = 0;
    for (const ventilation of ['spontaneous', 'invasive_ventilation'] as const) {
      const context = { ...ctx, ventilation };
      for (const scale of Object.values(SCALES)) {
        const required = applicableItems(scale, context);
        const visit = (index: number, values: number[]) => {
          if (index < required.length) {
            for (const option of required[index].options) visit(index + 1, [...values, option.value]);
            return;
          }
          const items = required.map((item, i) => ({ itemId: item.id, value: values[i], source: 'clinician' as const }));
          combinations++;
          const a = scoreAssessment({ scale, ctx: context, items, scoredBy: 'synthetic' });
          expect(Number.isFinite(a.total)).toBe(true);
          expect(a.band).not.toBeNull();
        };
        visit(0, []);
      }
    }
    console.info(`Legal score combinations checked: ${combinations}`);
  }, 120000);

  it('keeps geometry finite and scale invariant across 9,471 expression combinations', () => {
    for (let eye = 0; eye <= 40; eye++) for (let mouth = 0; mouth <= 20; mouth++) for (let brow = 0; brow <= 10; brow++) {
      const r = makeResult({ face: makeFace({ aperture: eye / 200, mouthOpening: mouth / 40, browToEye: 0.10 + brow / 50 }) });
      const a = readSingleImage(measureGeometry(r, 512, 512)!);
      const b = readSingleImage(measureGeometry(r, 2048, 2048)!);
      expect(a.facialTension).toBe(b.facialTension);
      expect(a.overallTension).toBeCloseTo(b.overallTension, 10);
      expect(a.overallTension).toBeGreaterThanOrEqual(0);
      expect(a.overallTension).toBeLessThanOrEqual(1);
    }
  }, 120000);

  it.each([[], [{ x: Number.NaN, y: 0.5, z: 0 }], makeFace().map((p, i) => i === 13 ? { ...p, y: Infinity } : p)].map(face => [face]))('rejects malformed landmarks', (face) => {
    const r = makeResult({ face });
    expect(assessFrameQuality(r, 1280, 720).usable).toBe(false);
    expect(measureGeometry(r, 1280, 720)).toBeNull();
  });

  it.each([0, -1, Number.NaN, Infinity])('rejects invalid image dimensions %s', (dimension) => {
    const r = makeResult();
    expect(assessFrameQuality(r, dimension, 720).usable).toBe(false);
    expect(measureGeometry(r, dimension, 720)).toBeNull();
  });

  it('excludes negative, nonfinite and endpoint timestamps from a window', () => {
    const s = summariseWindow([-1000, Number.NaN, Infinity, 0, 1000, 9999, 10000].map(t => frame(t)), 10);
    expect(s.secondsUsable).toBe(3);
    expect(s.nfcsP3Sum).toBe(9);
    expect(s.meanQuality).toBe(1);
  });

  it('rejects nonfinite quality and invalid durations', async () => {
    for (const duration of [0, -1, Number.NaN, Infinity]) {
      const s = summariseWindow([frame(0)], duration);
      expect(s.secondsUsable).toBe(0);
      const r = await new TransparentIndex().infer({ facial: s });
      expect(r.confidence).toBe(0);
      expect(r.contributions).toHaveLength(0);
    }
    expect(summariseWindow([frame(0, Infinity)], 10).secondsUsable).toBe(0);
  });

  it('withholds malformed facial summaries rather than suggesting reassuring zeros', async () => {
    const valid = summariseWindow(Array.from({ length: 10 }, (_, i) => frame(i * 1000)), 10);
    for (const invalid of [Number.NaN, Infinity, -1]) {
      const facial = { ...valid, meanQuality: invalid };
      expect(Object.keys(buildSuggestions('PIPP_R', facial, undefined, undefined).suggestions)).toHaveLength(0);
      const r = await new TransparentIndex().infer({ facial });
      expect(r.confidence).toBe(0);
      expect(r.contributions).toHaveLength(0);
    }
  });

  it('missing and invalid pain scores cannot suppress an elevated withdrawal score', () => {
    for (const days of [6, 9, 30]) for (const wat1 of Array.from({ length: 13 }, (_, i) => i)) for (const correctedNpass of [null, Number.NaN, Infinity, -Infinity]) {
      const r = decideEscalation({ correctedNpass, wat1, opioidExposureDays: days, recentUptitration: false });
      if (wat1 >= 6) expect(r.urgency).toBe('high');
      else expect(r.headline).not.toBe('Continue the current plan');
    }
  });

  it('invalid scores are explicitly treated as outstanding assessments', () => {
    for (const bad of [Number.NaN, Infinity, -Infinity]) {
      const r = decideEscalation({ correctedNpass: bad, wat1: bad, opioidExposureDays: 9, recentUptitration: false });
      expect(r.headline).not.toBe('Continue the current plan');
      expect(r.drivers.join(' ')).toMatch(/blind/);
    }
  });

  it('sweeps frequencies and amplitudes at three audio sample rates', () => {
    for (const sr of [16000, 44100, 48000]) for (const hz of [80, 120, 180, 250, 310, 350, 450, 600, 700, 800, 1000, 1200]) for (const amplitude of [0.01, 0.1, 1]) {
      const samples = tone(hz, sr).map(x => x * amplitude);
      const f = detectF0(samples, sr);
      if (hz >= 310 && hz <= 700) {
        expect(f).not.toBeNull();
        expect(Math.abs(f! - hz) / hz).toBeLessThan(0.03);
      } else expect(f, `sample rate ${sr}, tone ${hz}, amplitude ${amplitude}`).toBeNull();
    }
  });

  it('keeps per-second sums identical over frame rates and long windows', () => {
    for (const seconds of [1, 3, 10, 30, 120, 600]) for (const fps of [1, 4, 15, 30, 60]) {
      const s = summariseWindow(Array.from({ length: seconds * fps }, (_, i) => frame(i * 1000 / fps)), seconds);
      expect(s.secondsUsable).toBe(seconds);
      expect(s.nfcsP3Sum).toBe(3 * seconds);
      expect(s.nfcs7Sum).toBe(6 * seconds);
    }
  });

  it('rejects invalid calibration settings and nonfinite quality', () => {
    const baseline = Array.from({ length: 30 }, () => ({ quality: 1, activations: {} as NfcsFrame['activations'] }));
    for (const bad of [Number.NaN, Infinity, -1]) {
      expect('error' in calibrate('synthetic', baseline, { elapsedSeconds: bad })).toBe(true);
      expect('error' in selfReference('synthetic', baseline, { k: bad })).toBe(true);
    }
    expect('error' in calibrate('synthetic', baseline.map(f => ({ ...f, quality: Infinity })), { elapsedSeconds: 30 })).toBe(true);
    expect(codeAction('brow_bulge', .5, { k: 3, baselines: { brow_bulge: { median: Number.NaN, robustSd: .01, samples: 30 } } })).toBeNull();
  });

  it('rejects malformed clip ranges before seeking or inference', async () => {
    const service = {} as FaceLandmarkerService;
    const video = { duration: 30 } as HTMLVideoElement;
    for (const bad of [Number.NaN, Infinity, -1, 31]) {
      expect(await analyseClip(service, video, { localId: 'synthetic', baseline: null, scoring: [0, bad] })).toHaveProperty('error');
    }
    for (const bad of [Number.NaN, Infinity, -1, 0]) {
      await expect(sampleRange(service, video, 0, 10, 0, { fps: bad })).rejects.toThrow(/Invalid/);
    }
  });
});
