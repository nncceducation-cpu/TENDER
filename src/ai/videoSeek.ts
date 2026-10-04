/** Seek without hanging on a stalled decoder or a cancelled analysis. */
export const seekVideo = (video: HTMLVideoElement, time: number, signal?: AbortSignal): Promise<void> =>
  new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(new Error('Analysis cancelled.')); return; }
    if (video.error) { reject(new Error('The video could not be decoded at that position.')); return; }
    if (!video.seeking && video.readyState >= 2 && Math.abs(video.currentTime - time) < 1e-6) {
      resolve(); return;
    }
    const finish = (error?: Error) => {
      clearTimeout(timer);
      video.removeEventListener('seeked', onSeeked);
      video.removeEventListener('error', onError);
      signal?.removeEventListener('abort', onAbort);
      if (error) reject(error);
      else resolve();
    };
    const onSeeked = () => finish();
    const onError = () => finish(new Error('The video could not be decoded at that position.'));
    const onAbort = () => finish(new Error('Analysis cancelled.'));
    const timer = setTimeout(() => finish(new Error('Video seeking timed out. Try a different recording or format.')), 10000);
    video.addEventListener('seeked', onSeeked);
    video.addEventListener('error', onError);
    signal?.addEventListener('abort', onAbort, { once: true });
    try { video.currentTime = time; } catch (error) {
      finish(error instanceof Error ? error : new Error(String(error)));
    }
  });
