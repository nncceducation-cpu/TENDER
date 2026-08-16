import type { FaceLandmarkerResult } from '@mediapipe/tasks-vision';
import type { NfcsAction, NfcsFrame, NfcsWindowSummary } from '../domain/types';

/**
 * Facial action extraction targeted at the Neonatal Facial Coding System.
 *
 * Two problems have to be solved honestly here.
 *
 * First, the blendshape head shipped with a general-purpose face landmarker is
 * trained overwhelmingly on adult and older-child faces. Neonatal facial
 * proportions differ, and a preterm infant's face differs again. Absolute
 * blendshape values are therefore not trustworthy as thresholds.
 *
 * Second, NFCS is defined relative to the individual infant's resting face.
 * "Brow bulge" means bulging relative to this infant at rest, not relative to a
 * population mean.
 *
 * Both problems have the same answer: calibrate per infant. A quiet baseline
 * epoch is recorded, the distribution of each raw activation is measured, and
 * an action is coded present when the activation exceeds that infant's own
 * baseline by a configurable number of robust standard deviations. This is why
 * `calibrate()` is not optional, and why the extractor abstains when it has no
 * baseline for the infant in front of it.
 */

// MediaPipe blendshape categories used, by name.
const BS = {
  browDownLeft: 'browDownLeft',
  browDownRight: 'browDownRight',
  browInnerUp: 'browInnerUp',
  eyeSquintLeft: 'eyeSquintLeft',
  eyeSquintRight: 'eyeSquintRight',
  eyeBlinkLeft: 'eyeBlinkLeft',
  eyeBlinkRight: 'eyeBlinkRight',
  cheekSquintLeft: 'cheekSquintLeft',
  cheekSquintRight: 'cheekSquintRight',
  noseSneerLeft: 'noseSneerLeft',
  noseSneerRight: 'noseSneerRight',
  mouthUpperUpLeft: 'mouthUpperUpLeft',
  mouthUpperUpRight: 'mouthUpperUpRight',
  jawOpen: 'jawOpen',
  mouthStretchLeft: 'mouthStretchLeft',
  mouthStretchRight: 'mouthStretchRight',
  mouthFunnel: 'mouthFunnel',
} as const;

const scores = (r: FaceLandmarkerResult): Map<string, number> => {
  const m = new Map<string, number>();
  const shapes = r.faceBlendshapes?.[0]?.categories ?? [];
  for (const c of shapes) m.set(c.categoryName, c.score);
  return m;
};

const mean = (...v: number[]) => v.reduce((a, b) => a + b, 0) / (v.length || 1);
const get = (m: Map<string, number>, k: string) => m.get(k) ?? 0;

/**
 * Raw, uncalibrated activation for each NFCS action.
 *
 * `taut_tongue` is deliberately absent from the blendshape mapping. There is no
 * signal in a general face-landmarker that corresponds to a cupped, tensed
 * tongue, and inventing one would put a fabricated number into a clinical
 * instrument. The extractor reports it as unavailable and the 7-action sum is
 * flagged incomplete whenever it is requested.
 */
export const UNAVAILABLE_ACTIONS: NfcsAction[] = ['taut_tongue'];

export const rawActivations = (r: FaceLandmarkerResult): Record<NfcsAction, number> => {
  const s = scores(r);

  const browBulge = mean(get(s, BS.browDownLeft), get(s, BS.browDownRight));
  const eyeSqueeze = Math.max(
    mean(get(s, BS.eyeSquintLeft), get(s, BS.eyeSquintRight)),
    0.7 * mean(get(s, BS.eyeBlinkLeft), get(s, BS.eyeBlinkRight)),
    0.6 * mean(get(s, BS.cheekSquintLeft), get(s, BS.cheekSquintRight)),
  );
  const nasolabial = mean(
    get(s, BS.noseSneerLeft),
    get(s, BS.noseSneerRight),
    get(s, BS.mouthUpperUpLeft),
    get(s, BS.mouthUpperUpRight),
  );
  const jaw = get(s, BS.jawOpen);
  const stretch = mean(get(s, BS.mouthStretchLeft), get(s, BS.mouthStretchRight));

  return {
    brow_bulge: browBulge,
    eye_squeeze: eyeSqueeze,
    nasolabial_furrow: nasolabial,
    open_lips: Math.max(jaw, get(s, BS.mouthFunnel) * 0.8),
    // Vertical stretch is jaw opening without horizontal pull; horizontal stretch
    // is the reverse. Separating them prevents one wide-open mouth from scoring
    // as two distinct actions.
    vertical_mouth_stretch: Math.max(0, jaw - stretch),
    horizontal_mouth_stretch: Math.max(0, stretch - jaw * 0.4),
    taut_tongue: Number.NaN,
  };
};

// ---------------------------------------------------------------------------
// Per-infant calibration
// ---------------------------------------------------------------------------

export interface ActionBaseline {
  median: number;
  /** Median absolute deviation, scaled to approximate a standard deviation. */
  robustSd: number;
  samples: number;
}

/**
 * Where a baseline came from. A calibration built from still images has a sample
 * count, not a duration, and describing it in seconds was misleading: eight
 * photographs were reported as "8 s of video".
 */
export type CalibrationSource = 'live' | 'clip' | 'stills';

export interface InfantCalibration {
  localId: string;
  createdAt: string;
  source: CalibrationSource;
  baselines: Partial<Record<NfcsAction, ActionBaseline>>;
  /** How many robust SDs above baseline count as the action being present. */
  k: number;
  /** Seconds of usable baseline for video sources; sample count for stills. */
  baselineSeconds: number;
  /** Usable samples the baseline was built from, whatever the source. */
  baselineSamples: number;
  notes: string[];
}

/** One line describing the baseline, phrased for the source it came from. */
export const describeCalibration = (c: InfantCalibration): string =>
  c.source === 'stills'
    ? `${c.baselineSamples} settled images`
    : `${c.baselineSeconds.toFixed(0)} s of ${c.source === 'live' ? 'live video' : 'recorded video'}`;

const median = (xs: number[]): number => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

const mad = (xs: number[], med: number): number => {
  const dev = xs.map((x) => Math.abs(x - med));
  return 1.4826 * median(dev);
};

export const DEFAULT_K = 3;

/**
 * Build a calibration from a quiet baseline recording.
 *
 * The baseline must be recorded while the infant is settled and unhandled. If it
 * is recorded during a procedure, every subsequent reading is measured against a
 * distressed reference and the model will systematically under-report pain. The
 * UI enforces this by refusing to calibrate from an epoch in which the raw
 * activations are already highly variable.
 */
export const calibrate = (
  localId: string,
  baselineFrames: { activations: Record<NfcsAction, number>; quality: number }[],
  options: {
    k?: number;
    minSeconds?: number;
    elapsedSeconds?: number;
    fps?: number;
    source?: CalibrationSource;
  } = {},
): InfantCalibration | { error: string } => {
  const k = options.k ?? DEFAULT_K;
  const minSeconds = options.minSeconds ?? 20;

  const usable = baselineFrames.filter((f) => f.quality >= 0.45);

  /**
   * Usable duration is measured against the wall clock, not against an assumed
   * frame rate. Deriving it from a fixed fps made the minimum baseline length
   * depend on the hardware: at an assumed 30 fps a laptop running the loop at 60
   * accepted ten real seconds as twenty.
   */
  const elapsed = options.elapsedSeconds;
  const seconds =
    elapsed !== undefined && baselineFrames.length > 0
      ? elapsed * (usable.length / baselineFrames.length)
      : usable.length / (options.fps ?? 15);

  if (baselineFrames.length === 0) {
    return {
      error:
        'No face was detected at any point during the baseline. Check the camera view, the lighting and the angle, then record again.',
    };
  }
  if (usable.length === 0) {
    return {
      error:
        'A face was detected but never at usable quality. Move the camera closer, improve the lighting, or reduce the viewing angle, then record again.',
    };
  }
  if (seconds < minSeconds) {
    return {
      error: `Only ${seconds.toFixed(0)} s of the baseline was usable, and at least ${minSeconds} s is required. ${
        usable.length < baselineFrames.length
          ? `${Math.round((1 - usable.length / baselineFrames.length) * 100)}% of frames were discarded for quality. `
          : ''
      }Record a longer settled epoch.`,
    };
  }

  const actions = Object.keys(usable[0].activations) as NfcsAction[];
  const baselines: Partial<Record<NfcsAction, ActionBaseline>> = {};
  const notes: string[] = [];

  for (const a of actions) {
    if (UNAVAILABLE_ACTIONS.includes(a)) continue;
    const xs = usable.map((f) => f.activations[a]).filter((x) => Number.isFinite(x));
    if (xs.length === 0) continue;
    const med = median(xs);
    const sd = mad(xs, med);
    baselines[a] = { median: med, robustSd: sd, samples: xs.length };

    if (sd > 0.2) {
      notes.push(
        `Baseline variability for ${a.replace(/_/g, ' ')} is high (robust SD ${sd.toFixed(2)}). The infant may not have been settled. Consider re-recording.`,
      );
    }
    if (sd < 0.005) {
      notes.push(
        `Baseline variability for ${a.replace(/_/g, ' ')} is near zero. The presence threshold will be very sensitive; a floor is applied.`,
      );
    }
  }

  const source = options.source ?? 'live';
  notes.push(
    source === 'stills'
      ? `Calibrated on ${usable.length} settled images. An action is coded present at ${k} robust SD above this infant's own baseline.`
      : `Calibrated on ${seconds.toFixed(0)} s of settled baseline. An action is coded present at ${k} robust SD above this infant's own baseline.`,
  );

  return {
    localId,
    createdAt: new Date().toISOString(),
    source,
    baselines,
    k,
    baselineSeconds: seconds,
    baselineSamples: usable.length,
    notes,
  };
};

/** Floor on the threshold so a near-zero-variance baseline does not fire on noise. */
const MIN_THRESHOLD_MARGIN = 0.05;

export const codeFrame = (
  r: FaceLandmarkerResult,
  calibration: InfantCalibration | null,
  quality: number,
  t: number,
): NfcsFrame => {
  const activations = rawActivations(r);
  const actions = {} as Record<NfcsAction, boolean>;

  for (const key of Object.keys(activations) as NfcsAction[]) {
    if (UNAVAILABLE_ACTIONS.includes(key) || !Number.isFinite(activations[key])) {
      actions[key] = false;
      continue;
    }
    const base = calibration?.baselines[key];
    if (!base) {
      actions[key] = false; // no calibration means no coding, not a guess
      continue;
    }
    const threshold = Math.max(
      base.median + (calibration?.k ?? DEFAULT_K) * base.robustSd,
      base.median + MIN_THRESHOLD_MARGIN,
    );
    actions[key] = activations[key] > threshold;
  }

  return { t, actions, activations, faceDetected: true, quality };
};

// ---------------------------------------------------------------------------
// Epoch summary
// ---------------------------------------------------------------------------

const P3: NfcsAction[] = ['brow_bulge', 'eye_squeeze', 'nasolabial_furrow'];

/**
 * Summarise a window of coded frames into NFCS scores.
 *
 * NFCS is coded second by second, not frame by frame. Frames are collapsed into
 * one-second bins and an action counts for that second if it is present in the
 * majority of usable frames within it. Summing raw frames instead would make the
 * score depend on the camera's frame rate, which is not a property of the infant.
 */
export const summariseWindow = (
  frames: NfcsFrame[],
  windowSeconds: number,
): NfcsWindowSummary => {
  const usable = frames.filter((f) => f.faceDetected && f.quality >= 0.45);
  const actions = Object.keys(
    usable[0]?.actions ?? {
      brow_bulge: false,
      eye_squeeze: false,
      nasolabial_furrow: false,
      open_lips: false,
      vertical_mouth_stretch: false,
      horizontal_mouth_stretch: false,
      taut_tongue: false,
    },
  ) as NfcsAction[];

  const bins = new Map<number, NfcsFrame[]>();
  for (const f of usable) {
    const sec = Math.floor(f.t / 1000);
    if (!bins.has(sec)) bins.set(sec, []);
    bins.get(sec)!.push(f);
  }

  const secondsUsable = bins.size;
  const presentSeconds = {} as Record<NfcsAction, number>;
  const proportionPresent = {} as Record<NfcsAction, number>;

  for (const a of actions) {
    let count = 0;
    for (const binFrames of bins.values()) {
      const present = binFrames.filter((f) => f.actions[a]).length;
      if (present > binFrames.length / 2) count += 1;
    }
    presentSeconds[a] = count;
    proportionPresent[a] = secondsUsable > 0 ? count / secondsUsable : 0;
  }

  const codeable = actions.filter((a) => !UNAVAILABLE_ACTIONS.includes(a));
  const nfcs7Sum = codeable.reduce((s, a) => s + (presentSeconds[a] ?? 0), 0);
  const nfcsP3Sum = P3.reduce((s, a) => s + (presentSeconds[a] ?? 0), 0);

  return {
    windowSeconds,
    framesScored: usable.length,
    proportionPresent,
    nfcs7Sum,
    nfcsP3Sum,
    meanQuality: usable.length ? usable.reduce((s, f) => s + f.quality, 0) / usable.length : 0,
    secondsUsable,
  };
};
