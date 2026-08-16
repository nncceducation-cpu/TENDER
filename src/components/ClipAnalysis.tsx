import { useCallback, useRef, useState } from 'react';
import { FileVideo, Loader2, ScanLine, Upload } from 'lucide-react';
import { FaceLandmarkerService } from '../ai/faceLandmarker';
import { analyseClip, estimateFrames, type ClipResult } from '../ai/clipAnalysis';
import { isSelfReferenced, SELF_REFERENCE_CAVEAT } from '../ai/nfcsFeatures';
import { buildSuggestions } from '../ai/suggestions';
import { TransparentIndex } from '../ai/painModel';
import { useStore } from '../state/store';
import { Button, Callout, Card, Field, inputClass } from './ui';
import { BarChart, HeroScore, PresenceRibbon } from './viz/Charts';
import type { RawFrameRow } from '../state/rawExport';
import type { AiEvidence } from '../domain/types';

/**
 * Score a recorded clip without a camera and without sending anything anywhere.
 *
 * This is the same coder the live path uses. The difference is that the settled
 * baseline is chosen after the fact from the recording itself, which is both
 * easier than asking someone at the bedside to wait and reproducible, because the
 * same file scored twice gives the same answer.
 */
export const ClipAnalysis = () => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const serviceRef = useRef<FaceLandmarkerService | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const [url, setUrl] = useState<string | null>(null);
  const [duration, setDuration] = useState(0);
  const [baseline, setBaseline] = useState<[number, number]>([0, 10]);
  const [scoring, setScoring] = useState<[number, number]>([10, 30]);
  /** True when the clip has no settled stretch and must reference itself. */
  const [selfReferenced, setSelfReferenced] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ClipResult | null>(null);

  const ctx = useStore((s) => s.ctx);
  const clinician = useStore((s) => s.clinician);
  const audit = useStore((s) => s.audit);
  const selectedScale = useStore((s) => s.selectedScale);
  const setAiEvidence = useStore((s) => s.setAiEvidence);
  const setCalibration = useStore((s) => s.setCalibration);
  const setRawFrames = useStore((s) => s.setRawFrames);

  const pick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (url) URL.revokeObjectURL(url);
    setUrl(URL.createObjectURL(file));
    setResult(null);
    setError(null);
  };

  /**
   * A browser that cannot decode the file leaves the element at readyState 0 with
   * a NaN duration and fires no metadata event, which previously left the panel
   * showing a video frame and no controls, with nothing to explain why. Chromium
   * builds without the proprietary codecs cannot open H.264, which covers most
   * phone recordings, so this needs saying rather than failing silently.
   */
  const onVideoError = useCallback(() => {
    setError(
      'This browser could not decode that file. Chrome and Edge handle MP4 and MOV; a Chromium build without proprietary codecs may not. Try a WebM, or re-encode the clip.',
    );
    setDuration(0);
  }, []);

  const onLoaded = useCallback(() => {
    const v = videoRef.current;
    if (!v || !Number.isFinite(v.duration) || v.duration <= 0) {
      setError('That file reported no usable duration, so it cannot be stepped through frame by frame.');
      return;
    }
    setError(null);
    setDuration(v.duration);
    // Sensible defaults: a settled opening, then the rest.
    const b: [number, number] = [0, Math.min(15, v.duration * 0.4)];
    setBaseline(b);
    setScoring([b[1], v.duration]);
  }, []);

  const run = async () => {
    const video = videoRef.current;
    if (!video) return;
    setBusy(true);
    setError(null);
    setResult(null);
    setProgress(0);
    abortRef.current = new AbortController();

    try {
      serviceRef.current ??= new FaceLandmarkerService();
      await serviceRef.current.load();

      const r = await analyseClip(
        serviceRef.current,
        video,
        {
          localId: ctx.localId || 'unidentified',
          baseline: selfReferenced ? null : baseline,
          scoring,
        },
        { fps: 15, onProgress: setProgress, signal: abortRef.current.signal },
      );

      if ('error' in r) {
        setError(r.error);
        return;
      }

      setResult(r);
      setCalibration(r.calibration);

      const rows: RawFrameRow[] = r.coded.map((f, i) => ({
        source: 'clip',
        sampleId: `frame-${i}`,
        tMs: Math.round(f.t),
        faceFound: f.faceDetected,
        quality: f.quality,
        activations: f.activations,
        coded: f.actions,
      }));
      setRawFrames(rows);

      const index = await new TransparentIndex().infer({ facial: r.summary });
      const { suggestions, abstentions } = buildSuggestions(
        selectedScale,
        r.summary,
        undefined,
        undefined,
      );

      const evidence: AiEvidence = {
        modelVersion: 'tender-facial-1.0.0 / clip',
        capturedAt: new Date().toISOString(),
        facial: r.summary,
        suggestions,
        index: { value: index.value, confidence: index.confidence, calibrated: false },
        abstentions: [
          ...abstentions,
          ...index.abstentions,
          isSelfReferenced(r.calibration)
            ? `Coded from a recorded clip with no settled baseline: ${r.scoringSeconds.toFixed(0)} s scored, referenced against itself.`
            : `Coded from a recorded clip: ${r.baselineSeconds.toFixed(0)} s baseline, ${r.scoringSeconds.toFixed(0)} s scored.`,
          ...(isSelfReferenced(r.calibration) ? [SELF_REFERENCE_CAVEAT] : []),
        ],
      };
      setAiEvidence(evidence);

      void audit.append(
        clinician || 'unattributed',
        'clip.coded',
        `Recorded clip coded on device. NFCS-P-3 ${r.summary.nfcsP3Sum}/30 over ${r.summary.secondsUsable} usable seconds.`,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
      setProgress(0);
    }
  };

  const clamp = (v: number) => Math.max(0, Math.min(duration, v));

  /**
   * Every sampled frame costs a seek and an inference, so the interface says how
   * many are coming rather than leaving someone watching a progress bar wondering.
   */
  const plannedFrames =
    (selfReferenced ? 0 : estimateFrames(15, Math.max(0, baseline[1] - baseline[0]))) +
    estimateFrames(15, Math.max(0, scoring[1] - scoring[0]));
  const longJob = plannedFrames > 900;

  return (
    <Card title="Score a recorded clip" icon={<FileVideo className="w-5 h-5 text-sky-700" />}>
      <div className="space-y-4">
        <Callout tone="ok" title="On device, no key, nothing transmitted">
          The clip is decoded and coded in this browser using the same landmarker the
          live capture uses. It is never uploaded. This works on the public site and
          works offline.
        </Callout>

        {!url ? (
          <div
            onClick={() => fileRef.current?.click()}
            className="h-48 rounded-lg border-2 border-dashed border-slate-300 grid place-items-center cursor-pointer hover:border-sky-500 hover:bg-sky-50/40"
          >
            <span className="text-sm text-slate-500 flex flex-col items-center gap-2">
              <Upload className="w-6 h-6" />
              Choose a video clip
              <span className="text-xs text-slate-400">MP4, WebM or MOV</span>
            </span>
          </div>
        ) : (
          <video
            ref={videoRef}
            src={url}
            controls
            muted
            playsInline
            preload="auto"
            onLoadedMetadata={onLoaded}
            onError={onVideoError}
            className="w-full rounded-lg bg-slate-900 max-h-72"
          />
        )}
        <input ref={fileRef} type="file" accept="video/*" onChange={pick} className="hidden" />

        {url && duration === 0 && !error && (
          <p className="text-sm text-slate-500">Reading the clip...</p>
        )}

        {url && duration > 0 && (
          <>
            <label
              className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition ${
                selfReferenced ? 'border-amber-300 bg-amber-50' : 'border-slate-200 hover:bg-slate-50'
              }`}
            >
              <input
                type="checkbox"
                className="mt-1"
                checked={selfReferenced}
                onChange={(e) => setSelfReferenced(e.target.checked)}
              />
              <span className="text-sm">
                <span className="font-medium text-slate-800">
                  This clip has no settled stretch. Reference it against itself.
                </span>
                <span className="block text-xs text-slate-600 mt-0.5">
                  The infant's own median across the scored range stands in for the
                  resting face. Use this for a procedure clip that starts mid-handling.
                  If the infant was distressed throughout, the reference is a distressed
                  face and actions will be under-reported.
                </span>
              </span>
            </label>

            <div className={`grid sm:grid-cols-2 gap-4 ${selfReferenced ? 'opacity-50' : ''}`}>
              <Field
                label={`Settled baseline: ${baseline[0].toFixed(1)} to ${baseline[1].toFixed(1)} s`}
                hint="Pick seconds where the infant is calm and unhandled. At least 10 s."
              >
                <div className="flex gap-2">
                  <input
                    type="number"
                    step="0.5"
                    min={0}
                    max={duration}
                    className={inputClass}
                    disabled={selfReferenced}
                    value={baseline[0]}
                    onChange={(e) => setBaseline([clamp(Number(e.target.value)), baseline[1]])}
                  />
                  <input
                    type="number"
                    step="0.5"
                    min={0}
                    max={duration}
                    className={inputClass}
                    disabled={selfReferenced}
                    value={baseline[1]}
                    onChange={(e) => setBaseline([baseline[0], clamp(Number(e.target.value))])}
                  />
                </div>
              </Field>
              <Field
                label={`Range to score: ${scoring[0].toFixed(1)} to ${scoring[1].toFixed(1)} s`}
                hint="The procedure or the period you want coded."
              >
                <div className="flex gap-2">
                  <input
                    type="number"
                    step="0.5"
                    min={0}
                    max={duration}
                    className={inputClass}
                    value={scoring[0]}
                    onChange={(e) => setScoring([clamp(Number(e.target.value)), scoring[1]])}
                  />
                  <input
                    type="number"
                    step="0.5"
                    min={0}
                    max={duration}
                    className={inputClass}
                    value={scoring[1]}
                    onChange={(e) => setScoring([scoring[0], clamp(Number(e.target.value))])}
                  />
                </div>
              </Field>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button onClick={() => void run()} disabled={busy}>
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <ScanLine className="w-4 h-4" />}
                {busy ? `Coding... ${(progress * 100).toFixed(0)}%` : 'Code this clip'}
              </Button>
              {busy && (
                <Button variant="ghost" onClick={() => abortRef.current?.abort()}>
                  Cancel
                </Button>
              )}
              <Button
                variant="ghost"
                onClick={() => {
                  if (url) URL.revokeObjectURL(url);
                  setUrl(null);
                  setResult(null);
                  setError(null);
                }}
                disabled={busy}
              >
                Choose another clip
              </Button>
            </div>

            <p className="text-xs text-slate-500">
              {plannedFrames} frames will be sampled across the two ranges.
              {longJob
                ? ' That will take a few minutes. Narrowing the range to score is usually better than coding a long stretch.'
                : ''}
            </p>

            {busy && (
              <div className="h-1.5 bg-slate-200 rounded overflow-hidden">
                <div
                  className="h-full bg-sky-600 transition-all"
                  style={{ width: `${progress * 100}%` }}
                />
              </div>
            )}
          </>
        )}

        {error && (
          <Callout tone="danger" title="Not coded">
            {error}
          </Callout>
        )}

        {result && (
          <div className="space-y-3 pt-2 border-t border-slate-200">
            <HeroScore
              label="NFCS-P-3 facial activity"
              value={result.summary.nfcsP3Sum}
              scale={String(result.summary.secondsUsable * 3)}
              severity={result.summary.nfcsP3Sum / Math.max(1, result.summary.secondsUsable * 3) > 0.3 ? 'moderate' : 'none'}
              severityLabel={`${result.summary.secondsUsable} usable seconds`}
            />

            <BarChart
              title="Proportion of the window each action was present"
              maxLabel="present in every usable second"
              caption={`Measured across ${result.summary.secondsUsable} usable seconds at a mean quality of ${result.summary.meanQuality.toFixed(2)}. A face was found in ${Math.round(result.faceFoundFraction * 100)}% of sampled frames.`}
              data={Object.entries(result.summary.proportionPresent)
                .filter(([, v]) => Number.isFinite(v))
                .map(([action, v]) => ({
                  label: action.replace(/_/g, ' '),
                  value: v,
                  display: `${(v * 100).toFixed(0)}%`,
                }))}
            />

            <PresenceRibbon
              title="Second by second"
              unitLabel="second"
              caption="Each cell is one second of the scored range. This is the coding the proportions above are computed from."
              rows={(['brow_bulge', 'eye_squeeze', 'nasolabial_furrow'] as const).map((a) => {
                const bySecond = new Map<number, { present: number; total: number; q: number }>();
                for (const f of result.coded) {
                  const sec = Math.floor(f.t / 1000);
                  const e = bySecond.get(sec) ?? { present: 0, total: 0, q: 0 };
                  e.total += 1;
                  e.q += f.quality;
                  if (f.actions[a]) e.present += 1;
                  bySecond.set(sec, e);
                }
                const secs = [...bySecond.keys()].sort((x, y) => x - y);
                return {
                  label: a.replace(/_/g, ' '),
                  cells: secs.map((k) => bySecond.get(k)!.present > bySecond.get(k)!.total / 2),
                  quality: secs.map((k) => bySecond.get(k)!.q / bySecond.get(k)!.total),
                };
              })}
            />

            <p className="text-sm text-slate-600">
              Suggestions from this clip are now available on the scoring form below.
            </p>

            {result.problems.length > 0 && (
              <Callout tone="warn" title="Capture quality across the scored range">
                <ul className="list-disc list-inside space-y-0.5">
                  {result.problems.map((x) => (
                    <li key={x}>{x}</li>
                  ))}
                </ul>
              </Callout>
            )}

            {result.calibration.notes.length > 0 && (
              <ul className="text-xs text-slate-600 list-disc list-inside space-y-0.5">
                {result.calibration.notes.map((n) => (
                  <li key={n}>{n}</li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </Card>
  );
};
