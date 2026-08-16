import type { FaceLandmarkerResult } from '@mediapipe/tasks-vision';

/**
 * Identity-normalised facial geometry, for reading a single image.
 *
 * The on-device coder thresholds blendshape activations against the infant's own
 * resting face, and with one photograph there is no resting face to threshold
 * against. Blendshape scores are model outputs from a head trained overwhelmingly
 * on adults, so an absolute cut-off on them says little about a 27-week infant.
 * That objection stands and is why this module does not use them.
 *
 * Geometry is a different proposition. Distances between landmarks, expressed as
 * a fraction of the interocular distance, are measurements of the image rather
 * than outputs of a classifier. Interocular distance is the standard
 * anthropometric normaliser: it removes camera distance and most of face size,
 * and it is the one measure on a face least changed by expression. What remains
 * varies between individuals, but far less than a raw blendshape score does.
 *
 * The measures are not equally trustworthy and the module says which is which.
 * Eye aperture and mouth opening are near-unambiguous: an aperture close to zero
 * is a closed or squeezed eye whoever the face belongs to. Brow position is the
 * weakest, because resting brow height genuinely differs between infants, so it
 * is reported with lower weight and flagged.
 *
 * Nothing here is validated in neonates. It is a structured reading of one
 * photograph, offered where the alternative is no reading at all.
 */

// Canonical MediaPipe FaceMesh indices.
const L_EYE = { top: 159, bottom: 145, outer: 33, inner: 133, brow: 105 };
const R_EYE = { top: 386, bottom: 374, outer: 263, inner: 362, brow: 334 };
const MOUTH = { top: 13, bottom: 14, left: 61, right: 291 };
const FACE = { top: 10, chin: 152 };

interface Pt {
  x: number;
  y: number;
}

const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);

/** The points the measures were taken between, in image pixels, for drawing. */
export interface GeometryPoints {
  leftEye: { top: Pt; bottom: Pt; outer: Pt; inner: Pt; brow: Pt };
  rightEye: { top: Pt; bottom: Pt; outer: Pt; inner: Pt; brow: Pt };
  mouth: { top: Pt; bottom: Pt; left: Pt; right: Pt };
  face: { top: Pt; chin: Pt };
  /** Bounding box of all landmarks, for framing the overlay. */
  box: { x: number; y: number; w: number; h: number };
}

export interface GeometryMeasures {
  /**
   * Mean vertical eye aperture as a fraction of interocular distance. A relaxed
   * open eye sits near 0.10 to 0.16; a squeezed or closed eye approaches zero.
   */
  eyeAperture: number;
  /** Vertical lip separation over interocular distance. Zero when lips are together. */
  mouthOpening: number;
  /** Mouth corner-to-corner width over interocular distance. */
  mouthWidth: number;
  /**
   * Brow to upper-eyelid distance over interocular distance. Smaller means the
   * brow is lowered toward the eye, which is what brow bulge looks like
   * geometrically. The least reliable of the four between individuals.
   */
  browToEye: number;
  /** Face height over interocular distance, reported so an implausible read can be spotted. */
  faceProportion: number;
  /** Where each measure was taken. Present so an overlay can show its working. */
  points: GeometryPoints;
}

export const measureGeometry = (
  result: FaceLandmarkerResult,
  imageWidth: number,
  imageHeight: number,
): GeometryMeasures | null => {
  const lm = result.faceLandmarks?.[0];
  if (!lm || lm.length < 468) return null;

  // Landmarks are normalised to the image box, so x and y must be scaled back to
  // pixels before any distance is compared with any other distance.
  const p = (i: number): Pt => ({ x: lm[i].x * imageWidth, y: lm[i].y * imageHeight });

  const interocular = dist(p(L_EYE.outer), p(R_EYE.outer));
  if (!Number.isFinite(interocular) || interocular <= 0) return null;
  const n = (v: number) => v / interocular;

  const leftAperture = dist(p(L_EYE.top), p(L_EYE.bottom));
  const rightAperture = dist(p(R_EYE.top), p(R_EYE.bottom));

  const xs = lm.map((q) => q.x * imageWidth);
  const ys = lm.map((q) => q.y * imageHeight);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);

  const points: GeometryPoints = {
    leftEye: {
      top: p(L_EYE.top),
      bottom: p(L_EYE.bottom),
      outer: p(L_EYE.outer),
      inner: p(L_EYE.inner),
      brow: p(L_EYE.brow),
    },
    rightEye: {
      top: p(R_EYE.top),
      bottom: p(R_EYE.bottom),
      outer: p(R_EYE.outer),
      inner: p(R_EYE.inner),
      brow: p(R_EYE.brow),
    },
    mouth: { top: p(MOUTH.top), bottom: p(MOUTH.bottom), left: p(MOUTH.left), right: p(MOUTH.right) },
    face: { top: p(FACE.top), chin: p(FACE.chin) },
    box: { x: minX, y: minY, w: Math.max(...xs) - minX, h: Math.max(...ys) - minY },
  };

  return {
    points,
    eyeAperture: n((leftAperture + rightAperture) / 2),
    mouthOpening: n(dist(p(MOUTH.top), p(MOUTH.bottom))),
    mouthWidth: n(dist(p(MOUTH.left), p(MOUTH.right))),
    browToEye: n(
      (dist(p(L_EYE.brow), p(L_EYE.top)) + dist(p(R_EYE.brow), p(R_EYE.top))) / 2,
    ),
    faceProportion: n(dist(p(FACE.top), p(FACE.chin))),
  };
};

// ---------------------------------------------------------------------------
// Reading one image
// ---------------------------------------------------------------------------

export type Reliability = 'good' | 'moderate' | 'weak';

export interface RegionReading {
  region: string;
  /** 0 to 1. Higher means more tension in that region. */
  tension: number;
  reliability: Reliability;
  /** What was measured, in plain terms, with the number behind it. */
  reading: string;
}

export interface SingleImageAssessment {
  /**
   * COMFORT behaviour facial tension, 1 to 5, the same item and anchors as
   * COMFORTneo's `facial_tension`. Uncalibrated: see `caveats`.
   */
  facialTension: 1 | 2 | 3 | 4 | 5;
  anchor: string;
  regions: RegionReading[];
  /** Mean tension across regions, weighted by reliability. */
  overallTension: number;
  caveats: string[];
  measures: GeometryMeasures;
}

const ANCHORS: Record<number, string> = {
  1: 'Facial muscles totally relaxed',
  2: 'Normal facial tone',
  3: 'Tension evident in some facial muscles',
  4: 'Tension evident throughout the facial muscles',
  5: 'Facial muscles contorted and grimacing',
};

/**
 * Reference bands for a relaxed neonatal face.
 *
 * These are the numbers a clinician should argue with, and they are gathered in
 * one place so that arguing with them is a one-line change rather than a hunt.
 * They were set from the geometry of a relaxed face, not fitted to outcome data,
 * and no neonatal cohort has been used to check them. Section 4 of
 * docs/EVIDENCE.md explains why they are still preferable to thresholding
 * blendshape scores, and Study 2 in the validation plan is where they would be
 * tested.
 */
export const RELAXED_REFERENCE = {
  /** Eye aperture at or above this reads as an open, unsqueezed eye. */
  eyeApertureOpen: 0.1,
  /** At or below this the eye is effectively closed or squeezed shut. */
  eyeApertureClosed: 0.02,
  /** Lip separation below this is lips together. */
  mouthClosed: 0.02,
  /** Lip separation at or above this is a wide, sustained mouth opening. */
  mouthWideOpen: 0.35,
  /** Brow-to-eye at or above this is an unlowered brow. */
  browNeutral: 0.28,
  /** At or below this the brow is markedly lowered toward the eye. */
  browLowered: 0.14,
} as const;

const band = (value: number, high: number, low: number): number => {
  // Returns 0 at the relaxed end and 1 at the tense end, clamped.
  if (high === low) return 0;
  return Math.max(0, Math.min(1, (high - value) / (high - low)));
};

export const readSingleImage = (m: GeometryMeasures): SingleImageAssessment => {
  const R = RELAXED_REFERENCE;

  const eyeTension = band(m.eyeAperture, R.eyeApertureOpen, R.eyeApertureClosed);
  const browTension = band(m.browToEye, R.browNeutral, R.browLowered);
  const mouthTension = Math.max(
    0,
    Math.min(1, (m.mouthOpening - R.mouthClosed) / (R.mouthWideOpen - R.mouthClosed)),
  );

  const regions: RegionReading[] = [
    {
      region: 'Eyes',
      tension: eyeTension,
      reliability: 'good',
      reading: `Aperture ${m.eyeAperture.toFixed(3)} of interocular distance. An open, relaxed eye sits near ${R.eyeApertureOpen}; a squeezed eye approaches zero.`,
    },
    {
      region: 'Mouth',
      tension: mouthTension,
      reliability: 'good',
      reading: `Lip separation ${m.mouthOpening.toFixed(3)} of interocular distance, width ${m.mouthWidth.toFixed(3)}. Lips together is below ${R.mouthClosed}.`,
    },
    {
      region: 'Brow',
      tension: browTension,
      reliability: 'weak',
      reading: `Brow sits ${m.browToEye.toFixed(3)} of interocular distance above the eyelid. Resting brow height differs genuinely between infants, so read this one with the least confidence.`,
    },
  ];

  // Weighted so the weak measure cannot carry the reading on its own.
  const weights: Record<Reliability, number> = { good: 1, moderate: 0.6, weak: 0.35 };
  const totalWeight = regions.reduce((s, r) => s + weights[r.reliability], 0);
  const overallTension =
    regions.reduce((s, r) => s + r.tension * weights[r.reliability], 0) / totalWeight;

  /**
   * Level 1 is never produced. Total relaxation is an absence, and an absence
   * cannot be established from a single frame: an infant caught mid-blink and an
   * infant with a relaxed face are not distinguishable in one photograph.
   */
  const tenseRegions = regions.filter((r) => r.tension >= 0.35).length;
  let level: 1 | 2 | 3 | 4 | 5;
  if (overallTension < 0.15) level = 2;
  else if (overallTension < 0.4 || tenseRegions <= 1) level = 3;
  else if (overallTension < 0.7) level = 4;
  else level = 5;

  const caveats = [
    'Uncalibrated. No settled reference for this infant was supplied, so this reading uses geometry normalised to interocular distance rather than to this infant\'s own resting face.',
    'Not comparable between infants or between sessions. Use it as a structured reading of this photograph, not as a score to trend.',
    'Level 1, total relaxation, is never produced. A single frame cannot distinguish a relaxed face from a blink or a momentary lull.',
    'Never auto-filled into a scale. Accepting it records it as model-derived in the audit trail.',
  ];

  if (m.faceProportion < 1.0 || m.faceProportion > 2.2) {
    caveats.push(
      `Face proportions look unusual for a frontal view (height ${m.faceProportion.toFixed(2)} of interocular distance). The head may be turned or tilted, which distorts every measure above.`,
    );
  }
  if (m.eyeAperture <= RELAXED_REFERENCE.eyeApertureClosed) {
    caveats.push(
      'The eyes read as fully closed. That is what an eye squeeze looks like, and it is also what sleep looks like. The distinction is not in the photograph.',
    );
  }

  return {
    facialTension: level,
    anchor: ANCHORS[level],
    regions,
    overallTension,
    caveats,
    measures: m,
  };
};
