import { describe, it, expect } from 'vitest';
import {
  assessFrameQuality,
  canonicaliseFace,
  mapPointsToOriginal,
  CANONICAL_FACE_PX,
} from '../faceLandmarker';
import { measureGeometry } from '../faceGeometry';
import { makeFace, makeResult, newImage, IMAGE_PX } from './faceFixtures';

describe('assessFrameQuality', () => {
  it('rejects a frame with no face', () => {
    const q = assessFrameQuality(makeResult({ noFace: true }), 1280, 720);
    expect(q.quality).toBe(0);
    expect(q.usable).toBe(false);
    expect(q.problems.join(' ')).toMatch(/No face detected/);
  });

  it('accepts a large frontal face in a good frame', () => {
    const q = assessFrameQuality(makeResult({ face: makeFace({ faceFraction: 0.5 }) }), 1280, 720);
    expect(q.quality).toBe(1);
    expect(q.usable).toBe(true);
    expect(q.problems).toHaveLength(0);
  });

  it.each([
    [0.17, true],
    [0.12, true],
    [0.08, false],
    [0.05, false],
  ])('scales quality with face size: fraction %f usable=%s', (fraction, usable) => {
    const q = assessFrameQuality(makeResult({ face: makeFace({ faceFraction: fraction }) }), 1280, 720);
    expect(q.usable).toBe(usable);
    expect(q.problems.join(' ')).toMatch(/too little of the frame/);
  });

  it('penalises an off-axis head and rejects a strongly turned one', () => {
    const mild = assessFrameQuality(makeResult({ yaw: 22 }), 1280, 720);
    const severe = assessFrameQuality(makeResult({ yaw: 45 }), 1280, 720);
    expect(mild.quality).toBeLessThan(1);
    expect(mild.usable).toBe(true);
    expect(severe.usable).toBe(false);
    expect(severe.problems.join(' ')).toMatch(/Head turned away/);
  });

  it('penalises a low-resolution frame', () => {
    const q = assessFrameQuality(makeResult(), 320, 240);
    expect(q.quality).toBeLessThan(1);
    expect(q.problems.join(' ')).toMatch(/resolution is low/);
  });

  /**
   * The gate used to be documented as rejecting a face "too dark" to measure. It
   * receives the landmark result and the frame dimensions, never the pixels, so
   * no luminance can be computed from its inputs and a well-framed face scores
   * 1.0 at any exposure. The gap is now declared rather than implied; this
   * pins the declaration so the claim and the code cannot drift apart again.
   * See REVIEW_FLAGS['frame-exposure-not-assessed'].
   */
  it('declares that exposure is not among the things it measures', () => {
    const q = assessFrameQuality(makeResult(), 1280, 720);
    expect(q.notAssessed.join(' ')).toMatch(/[Ee]xposure/);
    expect(assessFrameQuality(makeResult({ noFace: true }), 1280, 720).notAssessed.join(' ')).toMatch(
      /[Ee]xposure/,
    );
  });
});

/**
 * These fixtures install and replace globals (`Image`, `document`), and other
 * suites in this directory change the reported image size. Each test therefore
 * sets the size it depends on rather than inheriting whatever ran last: vitest
 * isolates files by worker, but the in-process harness does not, and a test
 * whose expectation depends on execution order is worse than no test.
 */
describe('canonicaliseFace', () => {
  it('returns null when there are no landmarks to crop around', () => {
    const img = newImage(IMAGE_PX, IMAGE_PX);
    expect(canonicaliseFace(img, makeResult({ noFace: true }), CANONICAL_FACE_PX)).toBeNull();
  });

  it('reports the face box in original-image pixels, not crop pixels', () => {
    const img = newImage(IMAGE_PX, IMAGE_PX);
    const crop = canonicaliseFace(img, makeResult({ face: makeFace({ faceFraction: 0.5 }) }), CANONICAL_FACE_PX);
    expect(crop).not.toBeNull();
    // A face spanning half of a 512 px image is a 256 px box whatever the crop
    // is resampled to.
    expect(crop!.faceBoxPx).toBeCloseTo(0.5 * IMAGE_PX, 0);
    expect(crop!.canvas.width).toBe(CANONICAL_FACE_PX);
  });

  it('maps a measured point back onto the original image', () => {
    const img = newImage(IMAGE_PX, IMAGE_PX);
    const crop = canonicaliseFace(img, makeResult({ face: makeFace({ faceFraction: 0.5 }) }), CANONICAL_FACE_PX)!;
    const points = { mouth: { top: { x: 0, y: 0 } } };
    mapPointsToOriginal(points, crop);
    // Crop origin maps to the crop's offset in the original image.
    expect(points.mouth.top.x).toBeCloseTo(crop.offsetX, 6);
    expect(points.mouth.top.y).toBeCloseTo(crop.offsetY, 6);
  });
});

/**
 * The fixture's own contract. Every geometric measure is a ratio to interocular
 * distance, so scaling the landmark set must not move any of them. Without this
 * a fixture bug reads as a finding: an early version of these tests controlled
 * the landmark spread by moving two points, which the fixed eye span silently
 * overrode, and the small-face branch could never be reached.
 */
describe('fixture contract', () => {
  it('measures to the geometry it was built for', () => {
    const g = measureGeometry(
      makeResult({ face: makeFace({ aperture: 0.09, browToEye: 0.26, mouthOpening: 0.3, mouthWidth: 0.5, faceProportion: 1.8 }) }),
      IMAGE_PX,
      IMAGE_PX,
    );
    expect(g).not.toBeNull();
    expect(g!.eyeAperture).toBeCloseTo(0.09, 4);
    expect(g!.browToEye).toBeCloseTo(0.26, 4);
    expect(g!.mouthOpening).toBeCloseTo(0.3, 4);
    expect(g!.mouthWidth).toBeCloseTo(0.5, 4);
    expect(g!.faceProportion).toBeCloseTo(1.8, 4);
  });

  it('keeps the measures scale-free when the landmark spread changes', () => {
    const at = (faceFraction: number) =>
      measureGeometry(makeResult({ face: makeFace({ aperture: 0.09, faceFraction }) }), IMAGE_PX, IMAGE_PX)!;
    expect(at(0.5).eyeAperture).toBeCloseTo(at(0.1).eyeAperture, 6);
    expect(at(0.5).browToEye).toBeCloseTo(at(0.1).browToEye, 6);
  });

  it('controls the landmark spread the quality gate reads', () => {
    for (const fraction of [0.5, 0.25, 0.1]) {
      const pts = makeFace({ faceFraction: fraction });
      const spread = Math.max(
        Math.max(...pts.map((p) => p.x)) - Math.min(...pts.map((p) => p.x)),
        Math.max(...pts.map((p) => p.y)) - Math.min(...pts.map((p) => p.y)),
      );
      expect(spread).toBeCloseTo(fraction, 6);
    }
  });
});
