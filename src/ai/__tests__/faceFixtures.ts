import type { FaceLandmarkerResult } from '@mediapipe/tasks-vision';
import type { NfcsAction, NfcsWindowSummary } from '../../domain/types';
import { UNAVAILABLE_ACTIONS } from '../nfcsFeatures';

/**
 * Inputs for the on-device coding layer.
 *
 * The vision modules take MediaPipe results and browser drawables, neither of
 * which exists under `environment: 'node'`. This builds landmark sets whose
 * measured geometry is known by construction, plus the minimum canvas and image
 * surface `canonicaliseFace` touches. It supplies inputs only; nothing here
 * stands in for a module under test.
 *
 * Two mistakes are worth not repeating, because both produced a confident wrong
 * answer while the fixture looked fine:
 *
 *  - Setting two extreme landmarks does NOT control the landmark spread, because
 *    the eye corners and chin are placed at fixed offsets and dominated it. The
 *    whole set has to be scaled. `measuresAreScaleFree` pins that scaling does
 *    not disturb the measures.
 *  - An image class that does not extend the installed `HTMLImageElement` makes
 *    `canonicaliseFace` return null silently, because it tests with `instanceof`.
 */

export const IMAGE_PX = 512;

/** Normalised x distance between the outer eye corners; the measure normaliser. */
const EYE_SPAN = 0.2;

const L_EYE = { top: 159, bottom: 145, outer: 33, inner: 133, brow: 105 };
const R_EYE = { top: 386, bottom: 374, outer: 263, inner: 362, brow: 334 };
const MOUTH = { top: 13, bottom: 14, left: 61, right: 291 };
const FACE = { top: 10, chin: 152 };

export interface FaceSpec {
  /** Mean eye aperture as a fraction of interocular distance. */
  aperture?: number;
  /** Brow to upper eyelid, as a fraction of interocular distance. */
  browToEye?: number;
  /** Lip separation, as a fraction of interocular distance. */
  mouthOpening?: number;
  mouthWidth?: number;
  faceProportion?: number;
  /** Largest landmark spread in normalised units; what the quality gate reads. */
  faceFraction?: number;
  count?: number;
}

/** A landmark set that measures to the requested geometry. */
export const makeFace = ({
  aperture = 0.13,
  browToEye = 0.26,
  mouthOpening = 0.01,
  mouthWidth = 0.5,
  faceProportion = 1.8,
  faceFraction = 0.5,
  count = 478,
}: FaceSpec = {}) => {
  const u = (v: number) => v * EYE_SPAN;
  const cx = 0.5;
  const cy = 0.5;
  const pts = Array.from({ length: count }, () => ({ x: cx, y: cy, z: 0 }));
  const set = (i: number, x: number, y: number) => {
    pts[i] = { x, y, z: 0 };
  };

  set(L_EYE.outer, cx - EYE_SPAN / 2, cy);
  set(R_EYE.outer, cx + EYE_SPAN / 2, cy);
  set(L_EYE.inner, cx - EYE_SPAN / 6, cy);
  set(R_EYE.inner, cx + EYE_SPAN / 6, cy);

  for (const [E, sign] of [
    [L_EYE, -1],
    [R_EYE, 1],
  ] as const) {
    const ex = cx + sign * (EYE_SPAN / 2);
    set(E.top, ex, cy - u(aperture) / 2);
    set(E.bottom, ex, cy + u(aperture) / 2);
    set(E.brow, ex, cy - u(aperture) / 2 - u(browToEye));
  }

  set(MOUTH.top, cx, cy + u(0.6) - u(mouthOpening) / 2);
  set(MOUTH.bottom, cx, cy + u(0.6) + u(mouthOpening) / 2);
  set(MOUTH.left, cx - u(mouthWidth) / 2, cy + u(0.6));
  set(MOUTH.right, cx + u(mouthWidth) / 2, cy + u(0.6));
  set(FACE.top, cx, cy - u(faceProportion) / 2);
  set(FACE.chin, cx, cy + u(faceProportion) / 2);

  // Every measure is normalised by interocular distance, so scaling the whole
  // set about its centre fixes the spread without moving any measured ratio.
  const spread = Math.max(
    Math.max(...pts.map((p) => p.x)) - Math.min(...pts.map((p) => p.x)),
    Math.max(...pts.map((p) => p.y)) - Math.min(...pts.map((p) => p.y)),
  );
  const k = faceFraction / spread;
  for (const p of pts) {
    p.x = cx + (p.x - cx) * k;
    p.y = cy + (p.y - cy) * k;
  }
  return pts;
};

/** Column-major 4x4 carrying the yaw and pitch the quality gate reads. */
export const makeMatrix = (yawDeg = 0, pitchDeg = 0) => {
  const d = new Array(16).fill(0);
  d[0] = 1;
  d[5] = 1;
  d[10] = 1;
  d[15] = 1;
  const yaw = (yawDeg * Math.PI) / 180;
  const pitch = (pitchDeg * Math.PI) / 180;
  d[8] = -Math.sin(yaw) * Math.cos(pitch);
  d[10] = Math.cos(yaw) * Math.cos(pitch);
  d[9] = Math.sin(pitch);
  return { data: d, rows: 4, columns: 4 };
};

export const makeResult = ({
  face = makeFace(),
  blend = {},
  yaw = 0,
  pitch = 0,
  withMatrix = true,
  noFace = false,
}: {
  face?: ReturnType<typeof makeFace>;
  blend?: Record<string, number>;
  yaw?: number;
  pitch?: number;
  withMatrix?: boolean;
  noFace?: boolean;
} = {}): FaceLandmarkerResult =>
  ({
    faceLandmarks: noFace ? [] : [face],
    faceBlendshapes: noFace
      ? []
      : [
          {
            categories: Object.entries(blend).map(([categoryName, score]) => ({
              categoryName,
              score,
              index: 0,
              displayName: '',
            })),
            headIndex: 0,
            headName: '',
          },
        ],
    facialTransformationMatrixes: noFace || !withMatrix ? [] : [makeMatrix(yaw, pitch)],
  }) as unknown as FaceLandmarkerResult;

/** Blendshape map driving `rawActivations` to chosen activations. */
export const blendFor = ({
  brow = 0,
  eyeSquint = 0,
  sneer = 0,
  jaw = 0,
  stretch = 0,
}: { brow?: number; eyeSquint?: number; sneer?: number; jaw?: number; stretch?: number } = {}): Record<
  string,
  number
> => ({
  browDownLeft: brow,
  browDownRight: brow,
  browInnerUp: 0,
  eyeSquintLeft: eyeSquint,
  eyeSquintRight: eyeSquint,
  eyeBlinkLeft: 0,
  eyeBlinkRight: 0,
  cheekSquintLeft: 0,
  cheekSquintRight: 0,
  noseSneerLeft: sneer,
  noseSneerRight: sneer,
  mouthUpperUpLeft: sneer,
  mouthUpperUpRight: sneer,
  jawOpen: jaw,
  mouthStretchLeft: stretch,
  mouthStretchRight: stretch,
  mouthFunnel: 0,
});

/** A sine at `hz`, optionally with a second harmonic, as cry audio would carry. */
export const tone = (hz: number, sampleRate = 48000, samples = 2048, harmonic = 0): Float32Array => {
  const b = new Float32Array(samples);
  for (let i = 0; i < samples; i++) {
    b[i] =
      0.5 * Math.sin((2 * Math.PI * hz * i) / sampleRate) +
      harmonic * 0.5 * Math.sin((2 * Math.PI * 2 * hz * i) / sampleRate);
  }
  return b;
};

/** Deterministic pseudo-noise, so a failure is reproducible. */
export const noise = (samples = 2048, seed = 1): Float32Array => {
  const b = new Float32Array(samples);
  let s = seed;
  for (let i = 0; i < samples; i++) {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    b[i] = (s / 0x3fffffff - 1) * 0.5;
  }
  return b;
};

/** A window summary with the achievable maxima consistent with `secondsUsable`. */
export const makeSummary = (over: Partial<NfcsWindowSummary> = {}): NfcsWindowSummary => {
  const secondsUsable = over.secondsUsable ?? 10;
  const actions: NfcsAction[] = [
    'brow_bulge',
    'eye_squeeze',
    'nasolabial_furrow',
    'open_lips',
    'vertical_mouth_stretch',
    'horizontal_mouth_stretch',
    'taut_tongue',
  ];
  const codeable = actions.filter((a) => !UNAVAILABLE_ACTIONS.includes(a)).length;
  return {
    windowSeconds: 10,
    framesScored: secondsUsable * 15,
    proportionPresent: Object.fromEntries(actions.map((a) => [a, 0])) as Record<NfcsAction, number>,
    nfcs7Sum: 0,
    nfcsP3Sum: 0,
    nfcs7AchievableMax: codeable * secondsUsable,
    nfcsP3AchievableMax: 3 * secondsUsable,
    actionsUnavailable: [...UNAVAILABLE_ACTIONS],
    nfcs7Complete: UNAVAILABLE_ACTIONS.length === 0,
    meanQuality: 0.9,
    secondsUsable,
    ...over,
  };
};

/**
 * The canvas and image surface `canonicaliseFace` needs. It never reads pixels
 * back, so a recording stub suffices; that also means no resampling happens, so
 * the stability re-measure legitimately sees identical landmarks.
 */
export const installDom = (): void => {
  if ((globalThis as Record<string, unknown>).__TENDER_TEST_DOM__) return;
  class CanvasStub {
    width = 0;
    height = 0;
    ops: unknown[][] = [];
    getContext() {
      const ops = this.ops;
      return {
        set fillStyle(v: string) {
          ops.push(['fillStyle', v]);
        },
        set imageSmoothingEnabled(v: boolean) {
          ops.push(['smoothing', v]);
        },
        set imageSmoothingQuality(v: string) {
          ops.push(['quality', v]);
        },
        fillRect: (...a: number[]) => ops.push(['fillRect', ...a]),
        drawImage: (...a: unknown[]) => ops.push(['drawImage', ...a.slice(1)]),
      };
    }
  }
  class ImageStub {
    naturalWidth = IMAGE_PX;
    naturalHeight = IMAGE_PX;
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    set src(_v: string) {
      setTimeout(() => this.onload?.(), 0);
    }
  }
  const g = globalThis as Record<string, unknown>;
  g.HTMLCanvasElement = CanvasStub;
  g.HTMLImageElement = ImageStub;
  g.document = {
    createElement: (t: string) => {
      if (t === 'canvas') return new CanvasStub();
      throw new Error(`test DOM only provides canvas, asked for ${t}`);
    },
  };
  g.Image = ImageStub;
  g.__TENDER_TEST_DOM__ = true;
};

/**
 * Set the dimensions a decoded image reports. Must extend the installed
 * HTMLImageElement or `canonicaliseFace` fails its instanceof test and returns
 * null, which silently removes the crop from every assertion downstream.
 */
export const setImageSize = (w: number, h: number): void => {
  installDom();
  const g = globalThis as Record<string, unknown>;
  const Base = g.HTMLImageElement as new () => { naturalWidth: number; naturalHeight: number };
  g.Image = class extends Base {
    constructor() {
      super();
      this.naturalWidth = w;
      this.naturalHeight = h;
    }
  };
};

/** A decoded image of the installed stub class, typed for the module under test. */
export const newImage = (w?: number, h?: number): HTMLImageElement => {
  if (w !== undefined && h !== undefined) setImageSize(w, h);
  else installDom();
  const Ctor = (globalThis as Record<string, unknown>).Image as new () => unknown;
  return new Ctor() as HTMLImageElement;
};

/** Stands in for FaceLandmarkerService, returning queued results in order. */
export class FakeLandmarker {
  private queue: FaceLandmarkerResult[];
  calls = 0;

  constructor(results: FaceLandmarkerResult[]) {
    this.queue = [...results];
  }

  detectStill(): FaceLandmarkerResult | null {
    this.calls += 1;
    return this.queue.length === 1 ? this.queue[0] : (this.queue.shift() ?? null);
  }

  detect(): FaceLandmarkerResult | null {
    return this.detectStill();
  }

  async load() {
    return this as unknown as never;
  }

  async loadStill() {
    return this as unknown as never;
  }

  close(): void {}
}
