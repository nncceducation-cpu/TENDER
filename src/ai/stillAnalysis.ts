import type { FaceLandmarkerService } from './faceLandmarker';
import {
  assessFrameQuality,
  canonicaliseFace,
  mapPointsToOriginal,
  mirrorFaceCrop,
  CANONICAL_FACE_PX,
  STABILITY_FACE_PX,
} from './faceLandmarker';
import { calibrate, codeAction, rawActivations, selfReference, summariseWindow } from './nfcsFeatures';
import type { InfantCalibration } from './nfcsFeatures';
import { measureGeometry, readSingleImage, type SingleImageAssessment } from './faceGeometry';
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
  /**
   * Geometric reading of this frame, available whether or not a reference exists.
   * Null when the landmarks were insufficient to measure.
   */
  assessment: SingleImageAssessment | null;
  /** Face box size in the original image, in pixels. Null when no face. */
  faceBoxPx: number | null;
  /**
   * False when re-measuring the same face at a different resampling scale lands
   * on a different COMFORT level, which means the reading sits on a boundary and
   * should be read as "between these two" rather than as a number.
   */
  levelStable: boolean;
  /** The level the second scale produced, when it disagreed. */
  alternateLevel: number | null;
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
    let img: HTMLImageElement;
    try {
      img = await decode(images[i].dataUrl);
    } catch {
      out.push({ index: i, name: images[i].name, activations: {} as Record<NfcsAction, number>,
        quality: 0, problems: ['That image could not be decoded. Other images were still analysed.'],
        faceFound: false, assessment: null, faceBoxPx: null, levelStable: false, alternateLevel: null });
      onProgress?.((i + 1) / images.length);
      continue;
    }

    // First pass locates the face in the image as supplied. Quality is judged
    // here, on the real thing, because after cropping every face fills its frame
    // and a genuinely small or oblique face would look perfect.
    const located = service.detectStill(img);
    const q = assessFrameQuality(located, img.naturalWidth, img.naturalHeight);
    const faceFound = Boolean(located && located.faceLandmarks.length > 0);

    if (!faceFound || !located) {
      out.push({
        index: i,
        name: images[i].name,
        activations: {} as Record<NfcsAction, number>,
        quality: 0,
        problems: q.problems,
        faceFound: false,
        assessment: null,
        faceBoxPx: null,
        levelStable: true,
        alternateLevel: null,
      });
      onProgress?.((i + 1) / images.length);
      continue;
    }

    // Second pass measures a fixed-size crop, so the same face is always
    // presented to the detector at the same pixel scale.
    const crop = canonicaliseFace(img, located, CANONICAL_FACE_PX);
    const measured = crop ? service.detectStill(crop.canvas) : null;
    const useResult = measured && measured.faceLandmarks.length > 0 ? measured : located;
    const useW = useResult === measured ? CANONICAL_FACE_PX : img.naturalWidth;
    const useH = useResult === measured ? CANONICAL_FACE_PX : img.naturalHeight;

    /**
     * The quality gate existed and was never applied here.
     *
     * `assessFrameQuality` computes `usable` at 0.45 and the calibration path
     * honours it, but the geometric single-image route did not, so a photograph
     * scoring 0.30 with a 110-pixel face box still produced a confident COMFORT
     * level. A reading taken from a face too small or too oblique to measure is
     * worse than no reading, because it looks the same as a good one. (Exposure
     * is not among the things measured; see `assessFrameQuality`.)
     *
     * That fix was incomplete, and the gap was reintroduced by the small-face
     * penalty below. The penalty used to be applied AFTER the gate, so the gate
     * tested `q.quality` while the frame was stored with a lower number. A
     * 400x300 photograph of a 160-pixel face passed the gate at 0.600, produced
     * an assessment, and was then stored at 0.436. `codeStills` skipped it, but
     * `describeStills` has no quality filter and surfaced its COMFORT level
     * anyway. Measured, the same face at 320x240 stored 0.349 and at 260x200
     * stored 0.284, all three still carrying a level.
     *
     * The penalty is therefore applied first and the gate tests the number the
     * frame is actually stored with, so no consumer can reach a level the module
     * judged unmeasurable. Filtering `describeStills` would have fixed one
     * caller; this fixes every caller.
     */
    const faceBoxPx = crop?.faceBoxPx ?? null;
    const problems = [...q.problems, ...q.notAssessed];
    let quality = q.quality;

    // Upsampling a small face box to 512 does not create detail it never had.
    if (faceBoxPx !== null && faceBoxPx < 220) {
      quality *= Math.max(0.4, faceBoxPx / 220);
      problems.push(
        `The face occupies only ${Math.round(faceBoxPx)} pixels in this image. Measurements on a face this small are imprecise however the file is scaled.`,
      );
    }

    const qualityUsable = quality >= 0.45;

    const geometry = qualityUsable ? measureGeometry(useResult, useW, useH) : null;

    /**
     * The ratios are scale-free and correct as measured. The points are not: they
     * are in crop space, and the overlay draws them on the original photograph.
     * Map them back before anyone tries to draw them.
     */
    if (geometry && crop && useResult === measured) {
      mapPointsToOriginal(geometry.points as unknown as Record<string, Record<string, { x: number; y: number }>>, crop);
    }

    const read = geometry ? readSingleImage(geometry) : null;
    let assessment = read?.scoreAvailable ? read : null;
    if (read && !read.scoreAvailable) {
      problems.push('Closed or narrowed eyelids alone cannot distinguish sleep or blinking from eye squeeze. No facial tension level is offered. Assess the infant directly; a settled baseline or sequence may help.');
    }

    // Third pass at a different scale, to find out whether the level is a fact
    // about the face or an artefact of the resampling.
    let levelStable = assessment !== null;
    let alternateLevel: number | null = null;
    if (assessment && crop) {
      const alt = canonicaliseFace(img, located, STABILITY_FACE_PX);
      const altResult = alt ? service.detectStill(alt.canvas) : null;
      if (altResult && assessFrameQuality(altResult, STABILITY_FACE_PX, STABILITY_FACE_PX).usable) {
        const altGeom = measureGeometry(altResult, STABILITY_FACE_PX, STABILITY_FACE_PX);
        const altRead = altGeom ? readSingleImage(altGeom) : null;
        if (altRead && altRead.facialTension !== assessment.facialTension) {
          levelStable = false;
          alternateLevel = altRead.facialTension;
        }
        if (!altRead?.scoreAvailable) {
          levelStable = false;
          assessment = null;
          problems.push('The second-scale measurement failed. No facial tension level is offered.');
        }
      } else {
        levelStable = false;
        assessment = null;
        problems.push('The second-scale face could not be measured reliably. No facial tension level is offered.');
      }
    }

    // A reflection preserves expression. If the detector cannot reproduce the
    // level after reflection, the geometry cannot support a single-level proposal.
    if (assessment && crop) {
      const mirror = mirrorFaceCrop(crop.canvas);
      const mirroredResult = mirror ? service.detectStill(mirror) : null;
      const mirroredGeometry = mirroredResult &&
        assessFrameQuality(mirroredResult, CANONICAL_FACE_PX, CANONICAL_FACE_PX).usable
        ? measureGeometry(mirroredResult, CANONICAL_FACE_PX, CANONICAL_FACE_PX) : null;
      const mirroredReading = mirroredGeometry ? readSingleImage(mirroredGeometry) : null;
      if (!mirroredReading?.scoreAvailable || mirroredReading.facialTension !== assessment.facialTension) {
        problems.push(mirroredReading && !mirroredReading.scoreAvailable
          ? 'The reflected measurement has eyelid-closure ambiguity. No facial tension level is offered.'
          : mirroredReading
          ? `Reflection changed the facial tension reading from ${assessment.facialTension} to ${mirroredReading.facialTension}. No level is offered because the measurement is not reproducible.`
          : 'The reflected face could not be measured reliably. No facial tension level is offered.');
        levelStable = false;
        alternateLevel = mirroredReading?.scoreAvailable ? mirroredReading.facialTension : null;
        assessment = null;
      }
    }

    if (!qualityUsable) {
      problems.push(
        `Frame quality ${quality.toFixed(2)} is below the 0.45 needed to measure this face. No level is offered, which is the correct output rather than a missing one.`,
      );
    }
    if (!levelStable && assessment && alternateLevel !== null) {
      problems.push(
        `Re-measured at a different scale this face read as level ${alternateLevel} rather than ${assessment?.facialTension}. The reading sits on a boundary.`,
      );
    }

    out.push({
      index: i,
      name: images[i].name,
      activations: rawActivations(useResult),
      quality,
      problems,
      faceFound: true,
      assessment,
      faceBoxPx,
      levelStable,
      alternateLevel,
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

/**
 * Reference a set of images against their own median, for when no calm
 * photographs of the infant exist. Requires enough images that a median means
 * something; a single photograph cannot reference itself.
 */
export const selfReferenceFromStills = (
  localId: string,
  frames: StillFrame[],
): InfantCalibration | { error: string } =>
  selfReference(
    localId,
    frames
      .filter((f) => f.faceFound)
      .map((f) => ({ activations: f.activations, quality: f.quality })),
    { minSamples: MIN_BASELINE_STILLS },
  );

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

export interface StillDescription {
  frame: StillFrame;
  /** Actions ordered by raw activation, strongest first. Not a coding. */
  ranked: { action: NfcsAction; activation: number }[];
  /** Geometric reading on the COMFORT facial tension scale. Uncalibrated. */
  assessment: SingleImageAssessment | null;
}

/**
 * Describe images with no reference of any kind.
 *
 * This is the one image, no calm photograph case. Nothing here is a score. The
 * raw activations behind the coding are reported, ordered within each face, so a
 * clinician can see which actions the extractor is responding to and judge for
 * themselves whether that matches what they see.
 *
 * It now produces a level on the COMFORT facial tension scale as well as the raw
 * numbers, and the distinction that makes that defensible is what gets
 * thresholded. Blendshape activations are outputs of a head trained
 * overwhelmingly on adult faces, so an absolute cut-off on them says little about
 * a 27-week infant; they are reported, never thresholded, without a per-infant
 * baseline. The level comes instead from geometry normalised to interocular
 * distance, which measures the photograph rather than classifying it. See
 * faceGeometry.ts.
 *
 * The level is uncalibrated, is not comparable between infants, never reaches 1,
 * and is never filled into a scale on its own.
 */
export const describeStills = (frames: StillFrame[]): StillDescription[] =>
  frames
    .map((frame) => ({
      frame,
      assessment: frame.assessment,
      ranked: (Object.keys(frame.activations) as NfcsAction[])
        .filter((a) => Number.isFinite(frame.activations[a]))
        .map((action) => ({ action, activation: frame.activations[action] }))
        .sort((a, b) => b.activation - a.activation),
    }));

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

    // Shared with codeFrame and applyCalibration: the presence threshold and the
    // unavailable-action check live in nfcsFeatures, not in three copies here.
    const actions = {} as Record<NfcsAction, boolean>;
    for (const key of Object.keys(frame.activations) as NfcsAction[]) {
      actions[key] = codeAction(key, frame.activations[key], calibration) === true;
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
      // Only frames with a face reach `coded`, so this is a fact here rather
      // than the hardcoded literal codeFrame used to carry.
      faceDetected: c.frame.faceFound,
      quality: c.frame.quality,
    }));
    summary = summariseWindow(asFrames, coded.length);
  }

  return { coded, summary, usableCount: coded.length, skipped };
};
