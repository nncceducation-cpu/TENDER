import type { NfcsWindowSummary } from '../domain/types';

export const validDimensions = (width: number, height: number): boolean =>
  Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0;

export const validLandmarks = (points: { x: number; y: number; z: number }[] | undefined): boolean =>
  !!points && points.length >= 468 && points.every(p =>
    Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z));

/** Reject malformed or impossible summaries before they can become scale suggestions. */
export const usableFacialSummary = (f: NfcsWindowSummary | undefined): boolean => {
  if (!f) return false;
  const counts = [f.windowSeconds, f.secondsUsable, f.nfcsP3Sum, f.nfcsP3AchievableMax, f.nfcs7Sum, f.nfcs7AchievableMax];
  return counts.every(x => Number.isFinite(x) && x >= 0) &&
    f.windowSeconds > 0 && f.secondsUsable > 0 && Number.isInteger(f.secondsUsable) &&
    f.secondsUsable <= Math.ceil(f.windowSeconds) &&
    Number.isFinite(f.meanQuality) && f.meanQuality >= 0 && f.meanQuality <= 1 &&
    f.nfcsP3AchievableMax === 3 * f.secondsUsable && f.nfcsP3Sum <= f.nfcsP3AchievableMax &&
    f.nfcs7Sum <= f.nfcs7AchievableMax &&
    ['brow_bulge', 'eye_squeeze', 'nasolabial_furrow'].every(a => {
      const value = f.proportionPresent[a as keyof typeof f.proportionPresent];
      return Number.isFinite(value) && value >= 0 && value <= 1;
    });
};
