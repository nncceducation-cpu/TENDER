import {
  FilesetResolver,
  FaceLandmarker,
  type FaceLandmarkerResult,
} from '@mediapipe/tasks-vision';

/**
 * On-device face landmarking.
 *
 * Everything in this module runs in the browser. No frame, no landmark and no
 * audio sample is transmitted anywhere. That is a design constraint, not a
 * preference: continuous video of an identifiable infant in an Alberta NICU is
 * health information under the Health Information Act, and the cheapest way to
 * satisfy that is for the pixels never to leave the device.
 *
 * The WASM bundle and the model file are served from the application's own
 * `public/` directory rather than a CDN so the tool works on a segregated
 * hospital network and so the model in use is a pinned, auditable artifact.
 */

export interface LandmarkerConfig {
  /** Directory containing the MediaPipe vision WASM assets. */
  wasmPath: string;
  /** Path to the pinned face_landmarker task file. */
  modelAssetPath: string;
  /** Prefer GPU, fall back to CPU automatically. */
  delegate?: 'GPU' | 'CPU';
}

/**
 * Paths are resolved against the deployment base rather than the site root, so
 * the application works both at localhost:5173/ and at a project sub-path such
 * as /TENDER/ on GitHub Pages.
 */
const base = import.meta.env.BASE_URL.replace(/\/$/, '');

export const DEFAULT_LANDMARKER_CONFIG: LandmarkerConfig = {
  wasmPath: `${base}/models/mediapipe/wasm`,
  modelAssetPath: `${base}/models/mediapipe/face_landmarker.task`,
  delegate: 'GPU',
};

export class FaceLandmarkerService {
  private landmarker: FaceLandmarker | null = null;
  private loading: Promise<FaceLandmarker> | null = null;

  /**
   * Still images need a landmarker in IMAGE mode. Switching an existing instance
   * back and forth with setOptions rebuilds the graph each time, so a second
   * instance is cheaper than thrashing one, and it keeps video tracking state
   * from leaking into a still that has nothing to do with it.
   */
  private stillLandmarker: FaceLandmarker | null = null;
  private stillLoading: Promise<FaceLandmarker> | null = null;

  private config: LandmarkerConfig;

  constructor(config: LandmarkerConfig = DEFAULT_LANDMARKER_CONFIG) {
    this.config = config;
  }

  private async create(runningMode: 'VIDEO' | 'IMAGE'): Promise<FaceLandmarker> {
    const fileset = await FilesetResolver.forVisionTasks(this.config.wasmPath);
    const build = (delegate: 'GPU' | 'CPU') =>
      FaceLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: this.config.modelAssetPath, delegate },
        runningMode,
        numFaces: 1,
        outputFaceBlendshapes: true,
        outputFacialTransformationMatrixes: true,
        minFaceDetectionConfidence: 0.4,
        minFacePresenceConfidence: 0.4,
        minTrackingConfidence: 0.4,
      });

    try {
      return await build(this.config.delegate ?? 'GPU');
    } catch {
      // Hospital workstations frequently have no usable WebGL context.
      return await build('CPU');
    }
  }

  async load(): Promise<FaceLandmarker> {
    if (this.landmarker) return this.landmarker;
    if (this.loading) return this.loading;
    this.loading = this.create('VIDEO').then((l) => (this.landmarker = l));
    return this.loading;
  }

  async loadStill(): Promise<FaceLandmarker> {
    if (this.stillLandmarker) return this.stillLandmarker;
    if (this.stillLoading) return this.stillLoading;
    this.stillLoading = this.create('IMAGE').then((l) => (this.stillLandmarker = l));
    return this.stillLoading;
  }

  detect(video: HTMLVideoElement, timestampMs: number): FaceLandmarkerResult | null {
    if (!this.landmarker) return null;
    return this.landmarker.detectForVideo(video, timestampMs);
  }

  detectStill(image: HTMLImageElement | HTMLCanvasElement): FaceLandmarkerResult | null {
    if (!this.stillLandmarker) return null;
    return this.stillLandmarker.detect(image);
  }

  close(): void {
    this.landmarker?.close();
    this.stillLandmarker?.close();
    this.landmarker = null;
    this.stillLandmarker = null;
    this.loading = null;
    this.stillLoading = null;
  }
}

// ---------------------------------------------------------------------------
// Canonical face crop
// ---------------------------------------------------------------------------

/** Every still is measured at this face-box resolution, whatever it arrived as. */
export const CANONICAL_FACE_PX = 512;
/** A second, deliberately different scale, used only to test whether a reading holds. */
export const STABILITY_FACE_PX = 384;

export interface FaceCrop {
  canvas: HTMLCanvasElement;
  /** Size of the face box in the ORIGINAL image, in pixels. */
  faceBoxPx: number;
}

/**
 * Re-present the face to the detector at a fixed pixel size.
 *
 * Normalising the measures to interocular distance removes scale from the
 * arithmetic, but it does not remove it from the landmarks. Landmark error is
 * roughly a fixed number of pixels, so it is proportionally largest on the
 * smallest distance being measured, which is lip separation. Measured on the same
 * photograph resampled between 300 and 1800 pixels, mouth opening moved by 45%
 * and brow-to-eye straddled its own reference threshold. That is enough to move
 * the COMFORT level, which means the tool answered differently on one image
 * depending on how the file had been saved.
 *
 * Cropping to the face box and resampling to a constant size makes the detector
 * see the same number of pixels across the same anatomy every time. It cannot
 * invent detail that a small photograph never had, which is what `faceBoxPx` is
 * reported for.
 */
export const canonicaliseFace = (
  source: HTMLImageElement | HTMLCanvasElement,
  result: FaceLandmarkerResult,
  targetPx: number = CANONICAL_FACE_PX,
): FaceCrop | null => {
  const lm = result.faceLandmarks[0];
  if (!lm || lm.length === 0) return null;

  const w = source instanceof HTMLImageElement ? source.naturalWidth : source.width;
  const h = source instanceof HTMLImageElement ? source.naturalHeight : source.height;
  if (!w || !h) return null;

  const xs = lm.map((p) => p.x * w);
  const ys = lm.map((p) => p.y * h);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);

  const faceBoxPx = Math.max(maxX - minX, maxY - minY);
  if (faceBoxPx <= 0) return null;

  // Square, centred, with margin. The margin matters: a crop tight to the jaw
  // starves the blendshape head of the context it was trained with.
  const side = faceBoxPx * 1.6;
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;

  const canvas = document.createElement('canvas');
  canvas.width = targetPx;
  canvas.height = targetPx;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  // A neutral field behind the crop, for the case where the face sits near an
  // edge and the square runs off the image.
  ctx.fillStyle = '#7f7f7f';
  ctx.fillRect(0, 0, targetPx, targetPx);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(source, cx - side / 2, cy - side / 2, side, side, 0, 0, targetPx, targetPx);

  return { canvas, faceBoxPx };
};

/**
 * Frame quality gate.
 *
 * A face that is too small, too oblique or too dark produces landmark noise that
 * looks exactly like facial action. The model abstains rather than guessing,
 * because a confident wrong "no pain" is worse than no reading at all.
 */
export interface QualityAssessment {
  quality: number; // 0-1
  usable: boolean;
  problems: string[];
}

export const assessFrameQuality = (
  result: FaceLandmarkerResult | null,
  frameWidth: number,
  frameHeight: number,
): QualityAssessment => {
  const problems: string[] = [];
  if (!result || result.faceLandmarks.length === 0) {
    return { quality: 0, usable: false, problems: ['No face detected in frame.'] };
  }

  const lm = result.faceLandmarks[0];
  const xs = lm.map((p) => p.x);
  const ys = lm.map((p) => p.y);
  const w = Math.max(...xs) - Math.min(...xs);
  const h = Math.max(...ys) - Math.min(...ys);
  const faceFraction = Math.max(w, h);

  let quality = 1;

  if (faceFraction < 0.18) {
    quality *= faceFraction / 0.18;
    problems.push('Face occupies too little of the frame. Move the camera closer.');
  }

  // Head pose from the facial transformation matrix; large yaw or pitch makes
  // the unilateral action units unreliable.
  const matrix = result.facialTransformationMatrixes?.[0]?.data;
  if (matrix) {
    const yaw = Math.abs(Math.atan2(-matrix[8], matrix[10]) * (180 / Math.PI));
    const pitch = Math.abs(Math.asin(Math.min(1, Math.max(-1, matrix[9]))) * (180 / Math.PI));
    if (yaw > 30 || pitch > 30) {
      quality *= 0.35;
      problems.push(`Head turned away (yaw ${yaw.toFixed(0)}°, pitch ${pitch.toFixed(0)}°). Facial coding is unreliable beyond about 30°.`);
    } else if (yaw > 18 || pitch > 18) {
      quality *= 0.7;
      problems.push('Head is moderately off-axis. Coding confidence reduced.');
    }
  }

  if (frameWidth < 480 || frameHeight < 360) {
    quality *= 0.6;
    problems.push('Camera resolution is low for facial action coding.');
  }

  return { quality: Math.max(0, Math.min(1, quality)), usable: quality >= 0.45, problems };
};
