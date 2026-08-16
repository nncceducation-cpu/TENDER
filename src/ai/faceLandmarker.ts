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

export const DEFAULT_LANDMARKER_CONFIG: LandmarkerConfig = {
  wasmPath: '/models/mediapipe/wasm',
  modelAssetPath: '/models/mediapipe/face_landmarker.task',
  delegate: 'GPU',
};

export class FaceLandmarkerService {
  private landmarker: FaceLandmarker | null = null;
  private loading: Promise<FaceLandmarker> | null = null;

  private config: LandmarkerConfig;

  constructor(config: LandmarkerConfig = DEFAULT_LANDMARKER_CONFIG) {
    this.config = config;
  }

  async load(): Promise<FaceLandmarker> {
    if (this.landmarker) return this.landmarker;
    if (this.loading) return this.loading;

    this.loading = (async () => {
      const fileset = await FilesetResolver.forVisionTasks(this.config.wasmPath);
      const create = (delegate: 'GPU' | 'CPU') =>
        FaceLandmarker.createFromOptions(fileset, {
          baseOptions: { modelAssetPath: this.config.modelAssetPath, delegate },
          runningMode: 'VIDEO',
          numFaces: 1,
          outputFaceBlendshapes: true,
          outputFacialTransformationMatrixes: true,
          minFaceDetectionConfidence: 0.4,
          minFacePresenceConfidence: 0.4,
          minTrackingConfidence: 0.4,
        });

      try {
        this.landmarker = await create(this.config.delegate ?? 'GPU');
      } catch {
        // Hospital workstations frequently have no usable WebGL context.
        this.landmarker = await create('CPU');
      }
      return this.landmarker;
    })();

    return this.loading;
  }

  detect(video: HTMLVideoElement, timestampMs: number): FaceLandmarkerResult | null {
    if (!this.landmarker) return null;
    return this.landmarker.detectForVideo(video, timestampMs);
  }

  close(): void {
    this.landmarker?.close();
    this.landmarker = null;
    this.loading = null;
  }
}

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
