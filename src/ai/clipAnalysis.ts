import type { FaceLandmarkerService } from './faceLandmarker';
import { assessFrameQuality } from './faceLandmarker';
import { calibrate, rawActivations, selfReference, summariseWindow } from './nfcsFeatures';
import type { InfantCalibration } from './nfcsFeatures';
import type { NfcsAction, NfcsFrame, NfcsWindowSummary } from '../domain/types';

/**
 * Offline coding of a recorded clip, entirely on device.
 *
 * The live capture path was the only way to reach the on-device coder, which was
 * an accident of how it was built rather than a property of the method. Nothing
 * about NFCS requires a camera to be running. A clip already recorded on a phone
 * or pulled from a bedside recording can be coded exactly the same way, and the
 * offline route is better in two respects.
 *
 * The baseline problem gets easier. Calibration needs a settled epoch from the
 * same infant, and at the bedside that means asking someone to hold still and
 * wait. In a clip the settled seconds are already there and can be selected after
 * the fact.
 *
 * And it is reproducible. The same file coded twice gives the same numbers, which
 * is what a validation study needs and what a live feed cannot offer.
 *
 * Frames are taken by seeking rather than by playing, so coding does not run in
 * real time and a thirty-second clip does not take thirty seconds to score.
 */

export interface SampledFrame {
  t: number;
  activations: Record<NfcsAction, number>;
  quality: number;
  problems: string[];
}

export interface SampleOptions {
  /** Frames per second to sample. NFCS is coded per second, so 15 is ample. */
  fps?: number;
  onProgress?: (fraction: number) => void;
  signal?: AbortSignal;
}

/**
 * Sampling budget for a pass.
 *
 * Each sample costs a seek plus an inference, so a long range at 15 fps runs for
 * minutes. Beyond the soft target the rate is reduced, which costs little that
 * matters: NFCS is summed per second and each second is decided by a majority of
 * its frames, so five samples decide a second about as reliably as fifteen.
 *
 * The floor is not negotiable, though. Below four samples a second, a majority
 * rests on two frames and the coding stops being a measurement. Where the target
 * and the floor conflict, the floor wins and the range simply takes longer, which
 * is why `estimateFrames` exists for the interface to warn with.
 */
const TARGET_FRAMES_PER_PASS = 600;
const MIN_FPS = 4;

export const effectiveFps = (requestedFps: number, spanSeconds: number): number => {
  if (spanSeconds <= 0) return requestedFps;
  if (requestedFps * spanSeconds <= TARGET_FRAMES_PER_PASS) return requestedFps;
  return Math.max(MIN_FPS, TARGET_FRAMES_PER_PASS / spanSeconds);
};

/** Frames a pass will actually sample, for a progress or duration warning. */
export const estimateFrames = (requestedFps: number, spanSeconds: number): number =>
  Math.max(1, Math.round(spanSeconds * effectiveFps(requestedFps, spanSeconds)));

const seekTo = (video: HTMLVideoElement, time: number): Promise<void> =>
  new Promise((resolve, reject) => {
    const onSeeked = () => {
      video.removeEventListener('seeked', onSeeked);
      video.removeEventListener('error', onError);
      resolve();
    };
    const onError = () => {
      video.removeEventListener('seeked', onSeeked);
      video.removeEventListener('error', onError);
      reject(new Error('The video could not be decoded at that position.'));
    };
    video.addEventListener('seeked', onSeeked);
    video.addEventListener('error', onError);
    video.currentTime = time;
  });

/**
 * Walk a time range of a video and extract per-frame activations.
 *
 * MediaPipe requires strictly increasing timestamps in VIDEO mode, so a
 * monotonic counter is used rather than the clip's own time, which repeats
 * whenever a second range is sampled from the same element.
 */
export const sampleRange = async (
  service: FaceLandmarkerService,
  video: HTMLVideoElement,
  startSeconds: number,
  endSeconds: number,
  timestampBase: number,
  options: SampleOptions = {},
): Promise<SampledFrame[]> => {
  const span = Math.max(0, endSeconds - startSeconds);
  const fps = effectiveFps(options.fps ?? 15, span);
  const step = 1 / fps;
  const frames: SampledFrame[] = [];
  let n = 0;

  for (let t = startSeconds; t <= endSeconds + 1e-6; t += step) {
    if (options.signal?.aborted) throw new Error('Analysis cancelled.');
    await seekTo(video, Math.min(t, video.duration - 1e-3));

    const result = service.detect(video, timestampBase + n * (1000 / fps) + 1);
    const q = assessFrameQuality(result, video.videoWidth, video.videoHeight);

    if (result && result.faceLandmarks.length > 0) {
      frames.push({
        t: (t - startSeconds) * 1000,
        activations: rawActivations(result),
        quality: q.quality,
        problems: q.problems,
      });
    }

    n += 1;
    if (span > 0) options.onProgress?.(Math.min(1, (t - startSeconds) / span));
  }

  return frames;
};

export interface ClipResult {
  calibration: InfantCalibration;
  summary: NfcsWindowSummary;
  scoringSeconds: number;
  baselineSeconds: number;
  /** Problems seen during the scoring pass, deduplicated. */
  problems: string[];
  /** Proportion of sampled scoring frames in which a face was found at all. */
  faceFoundFraction: number;
}

export interface ClipFailure {
  error: string;
}

/**
 * Code a clip in two passes: a settled range to calibrate against, then the range
 * to be scored.
 *
 * Refusing to score without a baseline is the same rule the live path follows and
 * for the same reason. An action is present when it exceeds this infant's own
 * resting face, not a population threshold derived from adults.
 */
export const analyseClip = async (
  service: FaceLandmarkerService,
  video: HTMLVideoElement,
  ranges: {
    localId: string;
    /** Omit when the clip contains no settled stretch to reference against. */
    baseline: [number, number] | null;
    scoring: [number, number];
  },
  options: SampleOptions = {},
): Promise<ClipResult | ClipFailure> => {
  const [sStart, sEnd] = ranges.scoring;
  if (sEnd <= sStart) return { error: 'The scoring range is empty.' };

  const selfReferenced = ranges.baseline === null;
  const [bStart, bEnd] = ranges.baseline ?? [0, 0];
  if (!selfReferenced && bEnd <= bStart) {
    return { error: 'The baseline range is empty. Set it to cover a settled part of the clip, or switch to referencing the clip against itself.' };
  }

  const baselineSeconds = selfReferenced ? 0 : bEnd - bStart;
  const scoringSeconds = sEnd - sStart;

  const requested = options.fps ?? 15;
  const expectedBaselineFrames = Math.max(
    1,
    Math.round(baselineSeconds * effectiveFps(requested, baselineSeconds)),
  );

  // Pass one: the settled range, when there is one.
  let calibration: InfantCalibration | null = null;
  const expectedScoringFrames = Math.max(
    1,
    Math.round(scoringSeconds * effectiveFps(requested, scoringSeconds)),
  );

  if (!selfReferenced) {
    const baselineFrames = await sampleRange(service, video, bStart, bEnd, 0, {
      ...options,
      onProgress: (f) => options.onProgress?.(f * 0.5),
    });

    const c = calibrate(
      ranges.localId,
      baselineFrames.map((f) => ({ activations: f.activations, quality: f.quality })),
      { elapsedSeconds: baselineSeconds, minSeconds: 10, source: 'clip' },
    );
    if ('error' in c) {
      const found = baselineFrames.length / expectedBaselineFrames;
      return {
        error:
          found < 0.5
            ? `${c.error} A face was found in only ${Math.round(found * 100)}% of the sampled baseline frames.`
            : c.error,
      };
    }
    calibration = c;
  }

  // Pass two: the range to be scored.
  const scoringFrames = await sampleRange(service, video, sStart, sEnd, 1_000_000, {
    ...options,
    onProgress: (f) => options.onProgress?.((selfReferenced ? 0 : 0.5) + f * (selfReferenced ? 1 : 0.5)),
  });

  if (selfReferenced) {
    const c = selfReference(
      ranges.localId,
      scoringFrames.map((f) => ({ activations: f.activations, quality: f.quality })),
    );
    if ('error' in c) return { error: c.error };
    calibration = c;
  }

  if (!calibration) return { error: 'No reference could be established for this clip.' };

  // Activations are already computed, so the frames are thresholded directly
  // rather than pushed back through the landmarker a second time.
  const coded: NfcsFrame[] = scoringFrames.map((f) => applyCalibration(f, calibration));

  return {
    calibration,
    summary: summariseWindow(coded, scoringSeconds),
    scoringSeconds,
    baselineSeconds,
    problems: [...new Set(scoringFrames.flatMap((f) => f.problems))],
    faceFoundFraction: scoringFrames.length / expectedScoringFrames,
  };
};

/** Threshold a sampled frame against a calibration, mirroring `codeFrame`. */
const applyCalibration = (frame: SampledFrame, calibration: InfantCalibration): NfcsFrame => {
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
  return {
    t: frame.t,
    actions,
    activations: frame.activations,
    faceDetected: true,
    quality: frame.quality,
  };
};
