import { describe, expect, it, vi } from 'vitest';
import { seekVideo } from '../videoSeek';

class Video extends EventTarget {
  currentTime = 0;
  readyState = 2;
  seeking = false;
  error = null;
}
const asVideo = (v: Video) => v as unknown as HTMLVideoElement;

describe('offline video seeking', () => {
  it('uses an already decoded frame without waiting for an event that may never fire', async () => {
    await expect(seekVideo(asVideo(new Video()), 0)).resolves.toBeUndefined();
  });
  it('waits for the requested new frame', async () => {
    const v = new Video(); const pending = seekVideo(asVideo(v), 1);
    expect(v.currentTime).toBe(1); v.dispatchEvent(new Event('seeked'));
    await expect(pending).resolves.toBeUndefined();
  });
  it('cancels while a decoder is stalled, rather than only between frames', async () => {
    const controller = new AbortController();
    const pending = seekVideo(asVideo(new Video()), 1, controller.signal);
    controller.abort(); await expect(pending).rejects.toThrow('cancelled');
  });
  it('rejects an already cancelled operation', async () => {
    const controller = new AbortController(); controller.abort();
    await expect(seekVideo(asVideo(new Video()), 1, controller.signal)).rejects.toThrow('cancelled');
  });
  it('stops on a decode error', async () => {
    const v = new Video(); const pending = seekVideo(asVideo(v), 1);
    v.dispatchEvent(new Event('error')); await expect(pending).rejects.toThrow('decoded');
  });
  it('times out and removes pending event handlers', async () => {
    vi.useFakeTimers();
    try {
      const v = new Video(); const remove = vi.spyOn(v, 'removeEventListener');
      const pending = seekVideo(asVideo(v), 1); const assertion = expect(pending).rejects.toThrow('timed out');
      await vi.advanceTimersByTimeAsync(10000); await assertion;
      expect(remove).toHaveBeenCalledWith('seeked', expect.any(Function));
      expect(vi.getTimerCount()).toBe(0);
    } finally { vi.useRealTimers(); }
  });
});
