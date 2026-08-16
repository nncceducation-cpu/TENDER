import type { FaceLandmarkerService } from './faceLandmarker';
import { assessFrameQuality } from './faceLandmarker';
import { calibrate, rawActivations, summariseWindow } from './nfcsFeatures';
import type { InfantCalibration } from './nfcsFeatures';
import type { NfcsAction, NfcsFrame, NfcsWindowSummary } from '../domain/types';

/**
 * Coding still images, on device.
 *
 * A single frame cannot produce an NFCS epoch score. The instrument is defined as
 * per-second binary coding summed across an observation window, so a photograph
 * has no seconds to sum. What a photograph can support is exactly what NFCS codes
 * at the frame level: whether each facial action is present.
 *
 * The harder constraint is the baseline, and it is the same one the live and clip
 * paths face. An action is present when it exceeds this infant's own resting
 * face, so something has to establish what resting looks like. Stills solve it
 * the same way a clip does: supply settled images of the same infant and
 * calibrate against them.
 *
 * Where a set of stills is a time series, say frames pulled from a recording or a
 * burst, they can also be summarised as a window. The proportion of images in
 * which an action was present is the same quantity PIPP-R bands, so a burst does
 * support the facial items even though one photograph does not.
 */

export interface StillFrame {
  /** Index in the supplied set, used as the ordering. */
  index: number;
  name: string;
  activations: Record<NfcsAction, number>;
  quality: number;
  problems: string[];
  faceFound: boolean;
}

/** Minimum settled images needed before thresholds mean anything. */
export const MIN_BASELINE_STILLS = 5;

const decode = (dataUrl: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('That image could not be decoded.'));
    img.src = dataUrl;
  });

export const analyseStills = async (
  service: FaceLandmarkerService,
  images: { name: string; dataUrl: string }[],
  onProgress?: (fraction: number) => void,
): Promise<StillFrame[]> => {
  const out: StillFrame[] = [];

  for (let i = 0; i < images.length; i++) {
    const img = await decode(images[i].dataUrl);
    const result = service.detectStill(img);
    const q = assessFrameQuality(result, img.naturalWidth, img.naturalHeight);
    const faceFound = Boolean(result && result.faceLandmarks.length > 0);

    out.push({
      index: i,
      name: images[i].name,
      activations: faceFound
        ? rawActivations(result!)
        : ({} as Record<NfcsAction, number>),
      quality: faceFound ? q.quality : 0,
      problems: q.problems,
      faceFound,
    });

    onProgress?.((i + 1) / images.length);
  }

  return out;
};

export const calibrateFromStills = (
  localId: string,
  frames: StillFrame[],
): InfantCalibration | { error: string } => {
  const usable = frames.filter((f) => f.faceFound && f.quality >= 0.45);

  if (usable.length === 0) {
    const anyFace = frames.some((f) => f.faceFound);
    return {
      error: anyFace
        ? 'A face was found in the baseline images but never at usable quality. Use closer, better-lit, more frontal photographs.'
        : 'No face was detected in any of the baseline images.',
    };
  }
  if (usable.length < MIN_BASELINE_STILLS) {
    return {
      error: `Only ${usable.length} baseline image${usable.length === 1 ? '' : 's'} could be used, and at least ${MIN_BASELINE_STILLS} are needed. A threshold set from fewer than that is a guess: the spread of a resting face cannot be estimated from one or two photographs.`,
    };
  }

  /**
   * Each still is treated as one sample. The wall-clock argument the video path
   * uses does not apply, so the frame-count route is used with a nominal rate
   * chosen so the minimum-seconds check passes once enough usable images exist.
   */
  return calibrate(
    localId,
    usable.map((f) => ({ activations: f.activations, quality: f.quality })),
    { fps: 1, minSeconds: MIN_BASELINE_STILLS, source: 'stills' },
  );
};

export interface StillCodingResult {
  /** Per-image action coding. */
  coded: { frame: StillFrame; actions: Record<NfcsAction, boolean> }[];
  /**
   * Set only when the images were declared a time series, in which case the
   * proportion of images showing each action is the quantity PIPP-R bands.
   */
  summary: NfcsWindowSummary | null;
  usableCount: number;
  skipped: { name: string; reason: string }[];
}

export const codeStills = (
  frames: StillFrame[],
  calibration: InfantCalibration,
  asSequence: boolean,
): StillCodingResult => {
  const coded: StillCodingResult['coded'] = [];
  const skipped: StillCodingResult['skipped'] = [];

  for (const frame of frames) {
    if (!frame.faceFound) {
      skipped.push({ name: frame.name, reason: 'No face detected.' });
      continue;
    }
    if (frame.quality < 0.45) {
      skipped.push({
        name: frame.name,
        reason: frame.problems[0] ?? 'Below the quality threshold for coding.',
      });
      continue;
    }

    const actions = {} as Record<NfcsAction, boolean>;
    for (const key of Object.keys(frame.activations) as NfcsAction[]) {
      const base = calibration.baselines[key];
      const value = frame.activations[key];
      if (!base || !Number.isFinite(value)) {
        actions[key] = false;
        continue;
      }
      const threshold = Math.max(base.median + calibration.k * base.robustSd, base.median + 0.05);
      actions[key] = value > threshold;
    }
    coded.push({ frame, actions });
  }

  /**
   * Treating a set of stills as a window is only defensible when they are a
   * sequence sampled from one period. A folder of unrelated photographs has no
   * denominator, so no proportion is produced for it.
   */
  let summary: NfcsWindowSummary | null = null;
  if (asSequence && coded.length > 0) {
    // One image stands in for one second, which is the coding unit NFCS uses.
    const asFrames: NfcsFrame[] = coded.map((c, i) => ({
      t: i * 1000,
      actions: c.actions,
      activations: c.frame.activations,
      faceDetected: true,
      quality: c.frame.quality,
    }));
    summary = summariseWindow(asFrames, coded.length);
  }

  return { coded, summary, usableCount: coded.length, skipped };
};
