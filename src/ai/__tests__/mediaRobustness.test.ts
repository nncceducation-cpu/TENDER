import { describe, expect, it, vi } from 'vitest';
import { FaceLandmarkerService, assessFrameQuality, canonicaliseFace } from '../faceLandmarker';
import { analyseStills } from '../stillAnalysis';
import { estimateFrames, sampleRange } from '../clipAnalysis';
import { codeFrame, rawActivations } from '../nfcsFeatures';
import { measureGeometry } from '../faceGeometry';
import { FakeLandmarker, makeFace, makeResult, newImage, setImageSize } from './faceFixtures';

const service = (results: ReturnType<typeof makeResult>[]) => new FakeLandmarker(results) as unknown as FaceLandmarkerService;
const input = [{ name: 'test.jpg', dataUrl: 'data:test' }];

describe('ambiguous and incomplete media measurements', () => {
  it('does not select the first person in a multiple-face frame', async () => {
    setImageSize(1280, 720);
    const r = makeResult(); r.faceLandmarks.push(r.faceLandmarks[0]);
    expect(assessFrameQuality(r, 1280, 720).usable).toBe(false);
    expect(canonicaliseFace(newImage(), r)).toBeNull();
    expect(measureGeometry(r, 1280, 720)).toBeNull();
    expect(codeFrame(r, null, 1, 0).faceDetected).toBe(false);
    expect(Object.values(rawActivations(r)).every(Number.isNaN)).toBe(true);
    const [frame] = await analyseStills(service([r]), input);
    expect(frame.assessment).toBeNull(); expect(frame.quality).toBe(0);
    expect(frame.problems.join(' ')).toMatch(/Multiple faces/);
  });
  it('withholds a level when its second-scale measurement fails', async () => {
    setImageSize(1280, 720);
    const [frame] = await analyseStills(service([makeResult(), makeResult(), makeResult({ noFace: true })]), input);
    expect(frame.assessment).toBeNull(); expect(frame.levelStable).toBe(false);
    expect(frame.problems.join(' ')).toMatch(/second-scale/);
  });
  it('withholds a level when reflection changes the measured expression', async () => {
    setImageSize(1280, 720);
    const calm = makeResult({ face: makeFace({ aperture: .15, mouthOpening: 0, browToEye: .25 }) });
    const tense = makeResult({ face: makeFace({ aperture: .01, mouthOpening: .45, browToEye: .10 }) });
    const [frame] = await analyseStills(service([calm, calm, calm, tense]), input);
    expect(frame.assessment).toBeNull(); expect(frame.levelStable).toBe(false);
    expect(frame.problems.join(' ')).toMatch(/Reflection changed/);
  });
  it('preserves good images and original ordering around a corrupt image', async () => {
    setImageSize(1280, 720);
    const Original = globalThis.Image;
    class DecodableImage extends Original {
      override set src(value: string) { queueMicrotask(() => value === 'bad' ? this.onerror?.(new Event('error')) : this.onload?.(new Event('load'))); }
    }
    vi.stubGlobal('Image', DecodableImage);
    try {
      const progress: number[] = [];
      const frames = await analyseStills(service([makeResult()]), [
        { name: 'same.jpg', dataUrl: 'good' }, { name: 'broken.jpg', dataUrl: 'bad' }, { name: 'same.jpg', dataUrl: 'good' },
      ], f => progress.push(f));
      expect(frames.map(f => f.index)).toEqual([0, 1, 2]);
      expect(frames[0].faceFound).toBe(true); expect(frames[2].faceFound).toBe(true);
      expect(frames[1].assessment).toBeNull(); expect(frames[1].problems.join(' ')).toMatch(/decoded/);
      expect(progress).toEqual([1 / 3, 2 / 3, 1]);
    } finally { vi.stubGlobal('Image', Original); }
  });
  it('keeps detector timestamps increasing across repeated and different clip passes', () => {
    const landmarker = new FaceLandmarkerService(); const detectForVideo = vi.fn(() => makeResult());
    Object.assign(landmarker, { landmarker: { detectForVideo } });
    const video = { videoWidth: 720, videoHeight: 480 } as HTMLVideoElement;
    for (const timestamp of [0, 250, 500, 0, 66, 132, 1_000_000, 0]) landmarker.detect(video, timestamp);
    const observed = detectForVideo.mock.calls.map(call => (call as unknown as [unknown, number])[1]);
    expect(observed).toHaveLength(8);
    for (let i = 1; i < observed.length; i++) expect(observed[i]).toBeGreaterThan(observed[i - 1]);
    expect(() => landmarker.detect(video, Number.NaN)).toThrow('Invalid');
  });
  it('rejects audio-only or unsupported video before it can corrupt the detector', async () => {
    const fake = service([makeResult()]); const detect = vi.spyOn(fake, 'detect');
    await expect(sampleRange(fake, { duration: 10, videoWidth: 0, videoHeight: 0 } as HTMLVideoElement,
      0, 10, 0)).rejects.toThrow(/decode video frames/);
    expect(detect).not.toHaveBeenCalled();
  });
  it('starts offline passes with a fresh tracker and resets its timestamp lifetime', async () => {
    const landmarker = new FaceLandmarkerService();
    const old = { close: vi.fn(), detectForVideo: vi.fn(() => makeResult()) };
    const fresh = { close: vi.fn(), detectForVideo: vi.fn(() => makeResult()) };
    const video = { videoWidth: 720, videoHeight: 480 } as HTMLVideoElement;
    Object.assign(landmarker, { landmarker: old });
    landmarker.detect(video, 1000);
    vi.spyOn(landmarker, 'load').mockImplementation(async () => {
      Object.assign(landmarker, { landmarker: fresh });
      return fresh as unknown as Awaited<ReturnType<FaceLandmarkerService['load']>>;
    });
    await landmarker.beginVideoPass(); landmarker.detect(video, 0);
    expect(old.close).toHaveBeenCalledOnce();
    expect(fresh.detectForVideo).toHaveBeenCalledWith(video, 0);
    expect(landmarker.detect({ videoWidth: 0, videoHeight: 0 } as HTMLVideoElement, 1)).toBeNull();
    expect(fresh.detectForVideo).toHaveBeenCalledOnce();
  });
  it('counts partial final sampling intervals without underestimating coverage', async () => {
    class Video extends EventTarget {
      duration = 2; videoWidth = 1280; videoHeight = 720; readyState = 2; seeking = false; error = null;
      private time = 0;
      get currentTime() { return this.time; }
      set currentTime(t: number) { this.time = t; queueMicrotask(() => this.dispatchEvent(new Event('seeked'))); }
    }
    for (const duration of [.1, .25, .6, 1, 1.1]) for (const fps of [4, 15, 30]) {
      const frames = await sampleRange(service([makeResult()]), new Video() as unknown as HTMLVideoElement,
        0, duration, 0, { fps });
      expect(frames.length).toBe(estimateFrames(fps, duration));
    }
    expect(estimateFrames(4, .6)).toBe(3);
  });
});
