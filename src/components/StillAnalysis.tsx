import { useRef, useState } from 'react';
import { Images, Loader2, ScanLine, Upload } from 'lucide-react';
import { FaceLandmarkerService } from '../ai/faceLandmarker';
import {
  analyseStills,
  calibrateFromStills,
  codeStills,
  describeStills,
  selfReferenceFromStills,
  MIN_BASELINE_STILLS,
  type StillCodingResult,
  type StillDescription,
} from '../ai/stillAnalysis';
import { describeCalibration, isSelfReferenced, SELF_REFERENCE_CAVEAT } from '../ai/nfcsFeatures';
import { buildSuggestions } from '../ai/suggestions';
import { useStore } from '../state/store';
import { Button, Callout, Card } from './ui';
import { BarChart, HeroScore, PresenceRibbon } from './viz/Charts';
import { FaceOverlay } from './viz/FaceOverlay';
import type { RawFrameRow } from '../state/rawExport';
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
export const StillAnalysis = ({
  onProposeTension,
}: {
  onProposeTension?: (level: number) => void;
}) => {
  const serviceRef = useRef<FaceLandmarkerService | null>(null);

  const [baselineImages, setBaselineImages] = useState<Picked[]>([]);
  const [scoreImages, setScoreImages] = useState<Picked[]>([]);
  const [asSequence, setAsSequence] = useState(false);
  /**
   * How the resting face is established. Settled images are the strongest and the
   * default; the others exist because in practice a calm photograph often does
   * not exist, and refusing to look at the image at all is not the only honest
   * response to that.
   */
  const [mode, setMode] = useState<'settled' | 'reuse' | 'self' | 'describe'>('settled');
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
  const setRawFrames = useStore((s) => s.setRawFrames);
  const addFacialReadings = useStore((s) => s.addFacialReadings);

  const [description, setDescription] = useState<StillDescription[] | null>(null);
  const urlByName = new Map(scoreImages.map((i) => [i.name, i.dataUrl]));
  const usingExisting = mode === 'reuse' && existing !== null;

  const run = async () => {
    setBusy(true);
    setError(null);
    setResult(null);
    setDescription(null);
    setProgress(0);

    try {
      serviceRef.current ??= new FaceLandmarkerService();
      await serviceRef.current.loadStill();

      const scoredFirst = mode === 'self' || mode === 'describe' || usingExisting;

      // Describe-only never establishes a reference and never codes anything.
      if (mode === 'describe') {
        const frames = await analyseStills(serviceRef.current, scoreImages, setProgress);
        const described = describeStills(frames);
        if (described.length === 0) {
          setError('No face was detected in any of the supplied images.');
          return;
        }
        setDescription(described);
        setRawFrames(
          described.map<RawFrameRow>((d) => ({
            source: 'still',
            sampleId: d.frame.name,
            tMs: null,
            faceFound: d.frame.faceFound,
            quality: d.frame.quality,
            activations: d.frame.activations,
            geometry: d.assessment?.measures ?? null,
            facialTension: d.assessment?.facialTension ?? null,
            faceBoxPx: d.frame.faceBoxPx,
            levelStable: d.frame.levelStable,
            alternateLevel: d.frame.alternateLevel,
          })),
        );
        // The level is a session record, not panel text. Without this it never
        // reached the trend, the report or the export, which is what was asked
        // for and what was missing.
        addFacialReadings(
          described
            .filter((d) => d.assessment)
            .map((d) => ({
              label: d.frame.name,
              origin: 'still' as const,
              facialTension: d.assessment!.facialTension,
              anchor: d.assessment!.anchor,
              overallTension: d.assessment!.overallTension,
              quality: d.frame.quality,
              calibrated: false,
              levelStable: d.frame.levelStable,
              alternateLevel: d.frame.alternateLevel,
              faceBoxPx: d.frame.faceBoxPx,
            })),
        );
        void audit.append(
          clinician || 'unattributed',
          'stills.described',
          `${described.length} still image(s) described without a reference. No coding was produced.`,
        );
        return;
      }

      let calibration = usingExisting ? existing : null;

      if (!calibration && !scoredFirst) {
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
        setProgress((scoredFirst ? 0 : 0.5) + f * (scoredFirst ? 1 : 0.5)),
      );

      if (!calibration) {
        // Self-referenced: the images to score are also the reference.
        const c = selfReferenceFromStills(ctx.localId || 'unidentified', scored);
        if ('error' in c) {
          setError(c.error);
          return;
        }
        calibration = c;
        setCalibration(c);
      }

      const coding = codeStills(scored, calibration, asSequence);
      setResult(coding);
      setRawFrames(
        coding.coded.map<RawFrameRow>(({ frame, actions }) => ({
          source: 'still',
          sampleId: frame.name,
          tMs: null,
          faceFound: frame.faceFound,
          quality: frame.quality,
          activations: frame.activations,
          coded: actions,
          geometry: frame.assessment?.measures ?? null,
          facialTension: frame.assessment?.facialTension ?? null,
          faceBoxPx: frame.faceBoxPx,
          levelStable: frame.levelStable,
          alternateLevel: frame.alternateLevel,
        })),
      );

      addFacialReadings(
        coding.coded
          .filter(({ frame }) => frame.assessment)
          .map(({ frame }) => ({
            label: frame.name,
            origin: 'still' as const,
            facialTension: frame.assessment!.facialTension,
            anchor: frame.assessment!.anchor,
            overallTension: frame.assessment!.overallTension,
            quality: frame.quality,
            levelStable: frame.levelStable,
            alternateLevel: frame.alternateLevel,
            faceBoxPx: frame.faceBoxPx,
            // A per-infant reference existed for the NFCS coding. The geometric
            // tension level is still normalised to interocular distance rather
            // than to this infant, so it is marked calibrated only when the
            // reference was a settled baseline rather than the images themselves.
            calibrated: !isSelfReferenced(calibration),
          })),
      );

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
            ...(isSelfReferenced(calibration) ? [SELF_REFERENCE_CAVEAT] : []),
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
    (mode === 'describe' ||
      usingExisting ||
      (mode === 'self' && scoreImages.length >= MIN_BASELINE_STILLS) ||
      (mode === 'settled' && baselineImages.length >= MIN_BASELINE_STILLS));

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

        <div>
          <p className="text-sm font-medium text-slate-700 mb-2">
            What establishes this infant's resting face?
          </p>
          <div className="grid sm:grid-cols-2 gap-2">
            {(
              [
                {
                  id: 'settled',
                  label: 'Settled baseline images',
                  blurb: `At least ${MIN_BASELINE_STILLS} calm, unhandled photographs of the same infant. The strongest option.`,
                  available: true,
                },
                {
                  id: 'reuse',
                  label: 'Reuse the existing baseline',
                  blurb: existing
                    ? `From ${describeCalibration(existing)} for ${existing.localId}. Only valid if these images are the same infant.`
                    : 'No baseline has been recorded in this session yet.',
                  available: existing !== null,
                },
                {
                  id: 'self',
                  label: 'Reference these images against themselves',
                  blurb: `No calm photographs needed. Uses the median across the images you are scoring, so it needs at least ${MIN_BASELINE_STILLS} of them. Under-reports if the infant was distressed in all of them.`,
                  available: true,
                },
                {
                  id: 'describe',
                  label: 'No reference: describe only',
                  blurb:
                    'Works on a single photograph. Reports the raw activations behind the coding, ordered within each face, and calls nothing present or absent.',
                  available: true,
                },
              ] as const
            ).map((m) => (
              <button
                key={m.id}
                disabled={!m.available}
                onClick={() => setMode(m.id)}
                className={`text-left p-3 rounded-lg border transition ${
                  mode === m.id
                    ? 'border-sky-500 bg-sky-50 ring-1 ring-sky-300'
                    : m.available
                      ? 'border-slate-200 hover:bg-slate-50'
                      : 'border-slate-200 bg-slate-50 opacity-50 cursor-not-allowed'
                }`}
              >
                <span className="font-medium text-slate-800 text-sm">{m.label}</span>
                <span className="block text-xs text-slate-600 mt-0.5">{m.blurb}</span>
              </button>
            ))}
          </div>
        </div>

        {mode === 'self' && (
          <Callout tone="warn" title="Referencing against itself">
            {SELF_REFERENCE_CAVEAT}
          </Callout>
        )}

        {mode === 'describe' && (
          <Callout tone="warn" title="Uncalibrated reading">
            You will get a level on the COMFORT facial tension scale, 2 to 5, derived
            from facial geometry normalised to interocular distance rather than to this
            infant's own resting face. That measures the photograph rather than
            classifying it, which is why it is offered where thresholding a blendshape
            score is not. It is uncalibrated, not comparable between infants or
            sessions, never reaches level 1, and is never filled into a scale on its
            own. The raw activations are shown alongside it.
          </Callout>
        )}

        <div className={`grid gap-4 ${mode === 'settled' ? 'sm:grid-cols-2' : ''}`}>
          {mode === 'settled' && (
          <DropZone
            label="Settled baseline images"
            hint={`At least ${MIN_BASELINE_STILLS}, infant calm and unhandled`}
            count={baselineImages.length}
            onPick={async (files) => {
              try {
                setBaselineImages(await readFiles(files));
                setError(null);
              } catch (e) {
                setError(e instanceof Error ? e.message : String(e));
              }
            }}
          />
          )}
          <DropZone
            label={mode === 'describe' ? 'Images to describe' : 'Images to score'}
            hint={
              mode === 'self'
                ? `At least ${MIN_BASELINE_STILLS}, since these are also the reference`
                : 'One or many'
            }
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
          {!ready && scoreImages.length > 0 && mode === 'settled' && (
            <span className="text-xs text-slate-500">
              {MIN_BASELINE_STILLS - baselineImages.length} more baseline image
              {MIN_BASELINE_STILLS - baselineImages.length === 1 ? '' : 's'} needed.
            </span>
          )}
          {!ready && mode === 'self' && scoreImages.length > 0 && (
            <span className="text-xs text-slate-500">
              {MIN_BASELINE_STILLS - scoreImages.length} more image
              {MIN_BASELINE_STILLS - scoreImages.length === 1 ? '' : 's'} needed, because
              these are also the reference.
            </span>
          )}
        </div>

        {error && (
          <Callout tone="danger" title="Not coded">
            {error}
          </Callout>
        )}

        {description && (
          <div className="space-y-3 pt-2 border-t border-slate-200">
            <Callout tone="warn" title="Uncalibrated: read it, do not trend it">
              No settled reference for this infant was supplied, so each level below
              comes from facial geometry rather than from this infant's own resting
              face. Individual NFCS actions are still not called present or absent,
              because that does require a per-infant baseline.
            </Callout>
            {description.map((d) => (
              <div key={d.frame.name + d.frame.index} className="border-t border-slate-100 pt-3">
                <p className="text-sm font-medium text-slate-800">
                  {d.frame.name}
                  <span className="ml-2 text-xs font-normal text-slate-500">
                    quality {d.frame.quality.toFixed(2)}
                    {d.frame.faceBoxPx !== null &&
                      `, face ${Math.round(d.frame.faceBoxPx)} px`}
                  </span>
                </p>

                {/*
                  These were computed and then never shown. A face too small to
                  measure, a head turned past 30 degrees, or a level that moves
                  when the image is resampled are the three things most likely to
                  make the number below wrong, and all three were being kept from
                  the person reading it.
                */}
                {d.frame.problems.length > 0 && (
                  <ul className="mt-1 text-xs text-amber-800 list-disc list-inside space-y-0.5">
                    {d.frame.problems.map((pr) => (
                      <li key={pr}>{pr}</li>
                    ))}
                  </ul>
                )}

                {d.assessment ? (
                  <div className="mt-2 space-y-3">
                    {urlByName.get(d.frame.name) && (
                      <FaceOverlay
                        imageUrl={urlByName.get(d.frame.name)!}
                        assessment={d.assessment}
                        name={d.frame.name}
                      />
                    )}

                    <HeroScore
                      label="COMFORT facial tension"
                      value={d.assessment.facialTension}
                      scale="5"
                      severity={
                        d.assessment.facialTension >= 5
                          ? 'severe'
                          : d.assessment.facialTension >= 4
                            ? 'moderate'
                            : d.assessment.facialTension >= 3
                              ? 'mild'
                              : 'none'
                      }
                      severityLabel={d.assessment.anchor}
                    />

                    <BarChart
                      title="Where the tension is"
                      maxLabel="fully tense for that region"
                      caption="Weighted by how much each measure can be trusted, so the brow cannot carry the reading on its own."
                      data={d.assessment.regions.map((r) => ({
                        label: r.region,
                        value: r.tension,
                        display: `${(r.tension * 100).toFixed(0)}%`,
                        note: r.reading,
                        chip: {
                          text: r.reliability,
                          status:
                            r.reliability === 'good'
                              ? ('good' as const)
                              : r.reliability === 'moderate'
                                ? ('warning' as const)
                                : ('serious' as const),
                        },
                      }))}
                    />

                    <ul className="text-xs text-slate-600 list-disc list-inside space-y-0.5">
                      {d.assessment.caveats.map((c) => (
                        <li key={c}>{c}</li>
                      ))}
                    </ul>

                    {onProposeTension && (
                      <Button
                        variant="ghost"
                        onClick={() => onProposeTension(d.assessment!.facialTension)}
                      >
                        Propose level {d.assessment.facialTension} for COMFORTneo facial tension
                      </Button>
                    )}
                  </div>
                ) : (
                  <p className="mt-1 text-sm text-slate-500">
                    Landmarks were insufficient to measure this face geometrically.
                  </p>
                )}

                <details className="mt-2 text-sm">
                  <summary className="cursor-pointer text-slate-600 text-xs">
                    Raw activations behind the coding
                  </summary>
                <table className="w-full text-sm mt-1">
                  <tbody>
                    {d.ranked.map(({ action, activation }) => (
                      <tr key={action}>
                        <td className="py-0.5 capitalize text-slate-700 w-56">
                          {action.replace(/_/g, ' ')}
                        </td>
                        <td className="py-0.5">
                          <span className="inline-block h-1.5 rounded bg-sky-500 align-middle"
                            style={{ width: `${Math.min(100, activation * 100)}%` }} />
                        </td>
                        <td className="py-0.5 text-right tabular-nums text-slate-500 w-16">
                          {activation.toFixed(3)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                </details>
              </div>
            ))}
          </div>
        )}

        {result && (
          <div className="space-y-3 pt-2 border-t border-slate-200">
            {result.summary && (
              <>
                <HeroScore
                  label="NFCS-P-3 facial activity"
                  value={result.summary.nfcsP3Sum}
                  scale={String(result.usableCount * 3)}
                  severityLabel={`${result.usableCount} images coded`}
                  severity={
                    result.summary.nfcsP3Sum / Math.max(1, result.usableCount * 3) > 0.3
                      ? 'moderate'
                      : 'none'
                  }
                />

                <BarChart
                  title="Proportion of images showing each action"
                  maxLabel="present in every coded image"
                  caption="These proportions are the quantity PIPP-R bands, which is why declaring the set a sequence is what unlocks the facial items."
                  data={Object.entries(result.summary.proportionPresent)
                    .filter(([, v]) => Number.isFinite(v))
                    .map(([action, v]) => ({
                      label: action.replace(/_/g, ' '),
                      value: v,
                      display: `${(v * 100).toFixed(0)}%`,
                    }))}
                />

                <PresenceRibbon
                  title="Image by image"
                  unitLabel="image"
                  caption="Each cell is one coded image, in the order supplied."
                  rows={(['brow_bulge', 'eye_squeeze', 'nasolabial_furrow'] as const).map((a) => ({
                    label: a.replace(/_/g, ' '),
                    cells: result.coded.map((c) => Boolean(c.actions[a])),
                    quality: result.coded.map((c) => c.frame.quality),
                  }))}
                />
              </>
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
