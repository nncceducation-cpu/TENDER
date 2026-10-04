import type { StillDescription } from '../../ai/stillAnalysis';
import { Button } from '../ui';

/** Measurements and explicit clinician observations, never geometry-derived pain scores. */
export const StillReport = ({ d, imageUrl, onConfirmRelaxed }: {
  d: StillDescription;
  imageUrl?: string;
  onPropose?: (level: number) => void;
  singleImageScore?: boolean;
  onConfirmRelaxed?: () => void;
}) => (
  <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-3">
    <p className="text-sm font-semibold text-slate-800">{d.frame.name}</p>
    <p className="text-sm text-slate-700">Image review — clinician scoring</p>
    <p className="text-sm text-slate-700">Facial distances do not establish muscle tension or pain. No automatic COMFORT level or pain percentage is calculated.</p>
    {imageUrl && <img src={imageUrl} alt="Image supplied for clinician review" className="max-h-96 rounded-lg object-contain" />}
    {onConfirmRelaxed && imageUrl && (
      <div className="rounded-lg border border-slate-200 p-3 text-sm">
        <p>If you observe fully relaxed facial muscles, confirm the COMFORT facial item as 1/5. This records your observation; the remaining assessment items must be scored separately.</p>
        <Button variant="ghost" onClick={onConfirmRelaxed}>I confirm relaxed facial muscles — offer 1/5</Button>
      </div>
    )}
    <p className="text-xs text-slate-600">Face detection: {d.frame.faceFound ? 'face found' : 'unavailable'}. Technical landmark quality: {d.frame.quality.toFixed(2)}. This is not confidence in a pain assessment.</p>
    {d.frame.geometry && <details className="text-sm">
      <summary>Image measurements (not tension or pain)</summary>
      <p>Eyelid aperture: {d.frame.geometry.eyeAperture.toFixed(3)}; lip separation: {d.frame.geometry.mouthOpening.toFixed(3)}; brow distance: {d.frame.geometry.browToEye.toFixed(3)}. Ratios to interocular distance; no clinical interpretation assigned.</p>
    </details>}
    <ul className="text-xs list-disc list-inside text-slate-600">{d.frame.problems.map(p => <li key={p}>{p}</li>)}</ul>
  </div>
);
