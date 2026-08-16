import { useRef, useState } from 'react';
import { Images, Loader2, ScanLine, Upload } from 'lucide-react';
import { FaceLandmarkerService } from '../ai/faceLandmarker';
import {
  analyseStills,
  calibrateFromStills,
  codeStills,
  MIN_BASELINE_STILLS,
  type StillCodingResult,
} from '../ai/stillAnalysis';
import { describeCalibration } from '../ai/nfcsFeatures';
import { buildSuggestions } from '../ai/suggestions';
import { useStore } from '../state/store';
import { Button, Callout, Card, Stat } from './ui';
import type { AiEvidence } from '../domain/types';

interface Picked {
  name: string;
  dataUrl: string;
}

const readFiles = async (files: FileList): Promise<Picked[]> =>
  Promise.all(
    Array.from(files).map(
      (file) =>
        new Promise<Picked>((resolve, reject) => {
          const r = new FileReader();
          r.onloadend = () => resolve({ name: file.name, dataUrl: r.result as string });
          r.onerror = () => reject(new Error(`${file.name} could not be read.`));
          r.readAsDataURL(file);
        }),
    ),
  );

const DropZone = ({
  label, hint, count, onPick, disabled,
}: {
  label: string;
  hint: string;
  count: number;
  onPick: (files: FileList) => void;
  disabled?: boolean;
}) => {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div>
      <div
        onClick={() => !disabled && ref.current?.click()}
        className={`h-32 rounded-lg border-2 border-dashed grid place-items-center text-center px-3 ${
          disabled
            ? 'border-slate-200 bg-slate-50 cursor-not-allowed'
            : 'border-slate-300 cursor-pointer hover:border-sky-500 hover:bg-sky-50/40'
        }`}
      >
        <span className="text-sm text-slate-600 flex flex-col items-center gap-1">
          <Upload className="w-5 h-5 text-slate-400" />
          <span className="font-medium">{label}</span>
          <span className="text-xs text-slate-500">{count > 0 ? `${count} selected` : hint}</span>
        </span>
      </div>
      <input
        ref={ref}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => e.target.files && onPick(e.target.files)}
      />
    </div>
  );
};

/**
 * Score still images on device.
 *
 * One photograph cannot produce an NFCS epoch score, because the instrument sums
 * per-second coding across a window and a photograph has no seconds. It can
 * support what NFCS codes at frame level, which is whether each action is
 * present, and a set of images sampled from one period can support the
 * proportion-of-time bands that PIPP-R defines.
 *
 * The baseline requirement does not soften for stills. Settled images of the same
 * infant establish the resting face, or an existing calibration from a clip or a
 * live session is reused.
 */
export const StillAnalysis = () => {
  const serviceRef = useRef<FaceLandmarkerService | null>(null);

  const [baselineImages, setBaselineImages] = useState<Picked[]>([]);
  const [scoreImages, setScoreImages] = useState<Picked[]>([]);
  const [asSequence, setAsSequence] = useState(false);
  const [reuseCalibration, setReuseCalibration] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<StillCodingResult | null>(null);

  const ctx = useStore((s) => s.ctx);
  const clinician = useStore((s) => s.clinician);
  const audit = useStore((s) => s.audit);
  const existing = useStore((s) => s.calibration);
  const selectedScale = useStore((s) => s.selectedScale);
  const setAiEvidence = useStore((s) => s.setAiEvidence);
  const setCalibration = useStore((s) => s.setCalibration);

  const usingExisting = reuseCalibration && existing !== null;

  const run = async () => {
    setBusy(true);
    setError(null);
    setResult(null);
    setProgress(0);

    try {
      serviceRef.current ??= new FaceLandmarkerService();
      await serviceRef.current.loadStill();

      let calibration = usingExisting ? existing : null;

      if (!calibration) {
        const baselineFrames = await analyseStills(
          serviceRef.current,
          baselineImages,
          (f) => setProgress(f * 0.5),
        );
        const c = calibrateFromStills(ctx.localId || 'unidentified', baselineFrames);
        if ('error' in c) {
          setError(c.error);
          return;
        }
        calibration = c;
        setCalibration(c);
      }

      const scored = await analyseStills(serviceRef.current, scoreImages, (f) =>
        setProgress((usingExisting ? 0 : 0.5) + f * (usingExisting ? 1 : 0.5)),
      );

      const coding = codeStills(scored, calibration, asSequence);
      setResult(coding);

      if (coding.summary) {
        const { suggestions, abstentions } = buildSuggestions(
          selectedScale,
          coding.summary,
          undefined,
          undefined,
        );
        const evidence: AiEvidence = {
          modelVersion: 'tender-facial-1.0.0 / stills',
          capturedAt: new Date().toISOString(),
          facial: coding.summary,
          suggestions,
          index: null,
          abstentions: [
            ...abstentions,
            `Coded from ${coding.usableCount} still images treated as one sequence. Each image stands in for one coding unit, so proportions are per image rather than per second.`,
          ],
        };
        setAiEvidence(evidence);
      }

      void audit.append(
        clinician || 'unattributed',
        'stills.coded',
        `${coding.usableCount} of ${scoreImages.length} still images coded on device${
          coding.summary ? `, NFCS-P-3 ${coding.summary.nfcsP3Sum}/${coding.usableCount * 3}` : ''
        }.`,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
      setProgress(0);
    }
  };

  const ready =
    scoreImages.length > 0 &&
    (usingExisting || baselineImages.length >= MIN_BASELINE_STILLS);

  return (
    <Card title="Score still images" icon={<Images className="w-5 h-5 text-sky-700" />}>
      <div className="space-y-4">
        <Callout tone="ok" title="On device, no key, nothing transmitted">
          Images are decoded and coded in this browser. They are never uploaded. This
          works on the public site and works offline.
        </Callout>

        <Callout tone="info" title="What a photograph can and cannot give you">
          NFCS sums per-second coding across an observation window, so a single image
          cannot produce an epoch score. It can tell you which facial actions are
          present, which is what NFCS codes frame by frame. Supply several images
          sampled from one period and the proportion showing each action becomes the
          quantity PIPP-R bands, so a burst does support the facial items.
        </Callout>

        {existing && (
          <label className="flex items-start gap-3 p-3 rounded-lg border border-slate-200 cursor-pointer hover:bg-slate-50">
            <input
              type="checkbox"
              className="mt-1"
              checked={reuseCalibration}
              onChange={(e) => setReuseCalibration(e.target.checked)}
            />
            <span className="text-sm">
              <span className="font-medium text-slate-800">
                Reuse the existing baseline for {existing.localId}
              </span>
              <span className="block text-xs text-slate-600">
                Recorded {new Date(existing.createdAt).toLocaleTimeString()} from{' '}
                {describeCalibration(existing)}. Only valid if these images are the same
                infant.
              </span>
            </span>
          </label>
        )}

        <div className="grid sm:grid-cols-2 gap-4">
          <DropZone
            label="Settled baseline images"
            hint={`At least ${MIN_BASELINE_STILLS}, infant calm and unhandled`}
            count={baselineImages.length}
            disabled={usingExisting}
            onPick={async (files) => {
              try {
                setBaselineImages(await readFiles(files));
                setError(null);
              } catch (e) {
                setError(e instanceof Error ? e.message : String(e));
              }
            }}
          />
          <DropZone
            label="Images to score"
            hint="One or many"
            count={scoreImages.length}
            onPick={async (files) => {
              try {
                setScoreImages(await readFiles(files));
                setError(null);
              } catch (e) {
                setError(e instanceof Error ? e.message : String(e));
              }
            }}
          />
        </div>

        {scoreImages.length > 1 && (
          <label className="flex items-start gap-3 text-sm text-slate-700">
            <input
              type="checkbox"
              className="mt-1"
              checked={asSequence}
              onChange={(e) => setAsSequence(e.target.checked)}
            />
            <span>
              These images are a sequence sampled from one period.
              <span className="block text-xs text-slate-500">
                Only tick this if they are, say, frames pulled from one recording or a
                burst. A folder of unrelated photographs has no denominator, so no
                proportion is produced for it and no scale items are suggested.
              </span>
            </span>
          </label>
        )}

        <div className="flex flex-wrap gap-2 items-center">
          <Button onClick={() => void run()} disabled={!ready || busy}>
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <ScanLine className="w-4 h-4" />}
            {busy ? `Coding... ${(progress * 100).toFixed(0)}%` : 'Code these images'}
          </Button>
          {(baselineImages.length > 0 || scoreImages.length > 0) && (
            <Button
              variant="ghost"
              disabled={busy}
              onClick={() => {
                setBaselineImages([]);
                setScoreImages([]);
                setResult(null);
                setError(null);
              }}
            >
              Clear
            </Button>
          )}
          {!ready && scoreImages.length > 0 && !usingExisting && (
            <span className="text-xs text-slate-500">
              {MIN_BASELINE_STILLS - baselineImages.length} more baseline image
              {MIN_BASELINE_STILLS - baselineImages.length === 1 ? '' : 's'} needed.
            </span>
          )}
        </div>

        {error && (
          <Callout tone="danger" title="Not coded">
            {error}
          </Callout>
        )}

        {result && (
          <div className="space-y-3 pt-2 border-t border-slate-200">
            {result.summary && (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                <Stat label="Images coded" value={result.usableCount} />
                <Stat
                  label="NFCS-P-3 actions"
                  value={`${result.summary.nfcsP3Sum}/${result.usableCount * 3}`}
                />
                <Stat label="Mean quality" value={result.summary.meanQuality.toFixed(2)} />
              </div>
            )}

            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase text-slate-500 border-b border-slate-200">
                  <th className="py-1">Image</th>
                  <th className="py-1">Actions present</th>
                  <th className="py-1 text-right">Quality</th>
                </tr>
              </thead>
              <tbody>
                {result.coded.map(({ frame, actions }) => {
                  const present = Object.entries(actions)
                    .filter(([, v]) => v)
                    .map(([k]) => k.replace(/_/g, ' '));
                  return (
                    <tr key={frame.name + frame.index} className="border-b border-slate-100 align-top">
                      <td className="py-2 text-slate-700 pr-2">{frame.name}</td>
                      <td className="py-2">
                        {present.length === 0 ? (
                          <span className="text-slate-400">none above this infant's baseline</span>
                        ) : (
                          <span className="flex flex-wrap gap-1">
                            {present.map((a) => (
                              <span
                                key={a}
                                className="px-2 py-0.5 rounded-full text-xs bg-amber-50 border border-amber-200 text-amber-900"
                              >
                                {a}
                              </span>
                            ))}
                          </span>
                        )}
                      </td>
                      <td className="py-2 text-right tabular-nums text-slate-600">
                        {frame.quality.toFixed(2)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {result.skipped.length > 0 && (
              <Callout tone="warn" title={`${result.skipped.length} image(s) not coded`}>
                <ul className="list-disc list-inside space-y-0.5">
                  {result.skipped.map((s) => (
                    <li key={s.name}>
                      {s.name}: {s.reason}
                    </li>
                  ))}
                </ul>
              </Callout>
            )}

            {result.summary ? (
              <p className="text-sm text-slate-600">
                Suggestions from this sequence are now available on the scoring form
                below.
              </p>
            ) : (
              <Callout tone="info">
                These images were not marked as a sequence, so no proportion was
                computed and nothing was suggested for the scale. The per-image coding
                above is the whole of what a set of unrelated stills supports.
              </Callout>
            )}
          </div>
        )}
      </div>
    </Card>
  );
};
