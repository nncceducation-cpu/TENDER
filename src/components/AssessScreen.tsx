import { useMemo, useState } from 'react';
import { Activity, BookOpen, Sparkles, Stethoscope } from 'lucide-react';
import { useStore } from '../state/store';
import { Button, Callout, Card, Field, Stat, inputClass } from './ui';
import { SCALES } from '../data/scales';
import { recommendScales } from '../engine/scaleSelector';
import { applicableItems, scoreAssessment, IncompleteAssessmentError } from '../engine/scoring';
import { decideEscalation } from '../engine/protocolEngine';
import { FacialCapture } from './FacialCapture';
import { VisionAssist } from './VisionAssist';
import { ClipAnalysis } from './ClipAnalysis';
import { StillAnalysis } from './StillAnalysis';
import type { PainConstruct, ScaleId, ScoredItem } from '../domain/types';

/** How long a capture window stays a fair description of the infant. */
const STALE_MINUTES = 10;

const CONSTRUCTS: { id: PainConstruct; label: string; blurb: string }[] = [
  {
    id: 'acute_procedural',
    label: 'Acute procedural',
    blurb: 'A discrete noxious event: heel lance, venipuncture, line insertion.',
  },
  { id: 'postoperative', label: 'Postoperative', blurb: 'Pain in the hours to days after surgery.' },
  {
    id: 'prolonged_ongoing',
    label: 'Prolonged or ongoing',
    blurb: 'Pain persisting across a shift rather than tied to one event.',
  },
  {
    id: 'sedation_adequacy',
    label: 'Sedation adequacy',
    blurb: 'Is this infant under-sedated or over-sedated on the current regimen?',
  },
];

export const AssessScreen = () => {
  const s = useStore();
  const [values, setValues] = useState<Record<string, { value: number; fromAi: boolean }>>({});
  const [error, setError] = useState<string | null>(null);

  const recommendations = useMemo(
    () => recommendScales(s.construct, s.ctx),
    [s.construct, s.ctx],
  );
  const scale = SCALES[s.selectedScale];
  const items = applicableItems(scale, s.ctx);
  const evidence = s.latestAiEvidence;

  const chosen = recommendations.find((r) => r.scale.id === s.selectedScale);

  /**
   * A capture window describes the infant during those seconds and no longer. The
   * suggestion panel says how old the window is, and marks it once it is old
   * enough that the state it measured may no longer hold.
   */
  const evidenceStale =
    evidence !== null &&
    Date.now() - new Date(evidence.capturedAt).getTime() > STALE_MINUTES * 60_000;

  const acceptSuggestions = () => {
    if (!evidence) return;
    const next = { ...values };
    for (const [itemId, sug] of Object.entries(evidence.suggestions)) {
      if (items.some((i) => i.id === itemId)) next[itemId] = { value: sug.value, fromAi: true };
    }
    setValues(next);
  };

  const record = () => {
    setError(null);
    const scored: ScoredItem[] = items
      .filter((i) => values[i.id] !== undefined)
      .map((i) => ({
        itemId: i.id,
        value: values[i.id].value,
        source: values[i.id].fromAi ? ('ai_accepted' as const) : ('clinician' as const),
        confidence: values[i.id].fromAi ? evidence?.suggestions[i.id]?.confidence : undefined,
      }));

    try {
      const assessment = scoreAssessment({
        scale,
        ctx: s.ctx,
        items: scored,
        scoredBy: s.clinician || 'unattributed',
        aiEvidence: evidence ?? undefined,
      });
      s.addAssessment(assessment);
      setValues({});
      // The capture window belonged to this assessment. Leaving it in place would
      // let a window recorded twenty minutes ago pre-fill the next one.
      s.setAiEvidence(null);
    } catch (e) {
      setError(
        e instanceof IncompleteAssessmentError
          ? `Every item must be scored before a total is produced. Still unscored: ${e.missing.join(', ')}.`
          : e instanceof Error
            ? e.message
            : String(e),
      );
    }
  };

  const latest = s.assessments.at(-1);
  const latestNpass = [...s.assessments].reverse().find((a) => a.scaleId === 'N_PASS');
  const latestWat = [...s.assessments].reverse().find((a) => a.scaleId === 'WAT_1');
  const escalation = decideEscalation({
    correctedNpass: latestNpass?.total ?? null,
    wat1: latestWat?.total ?? null,
    opioidExposureDays: s.opioidExposureDays,
    recentUptitration: s.recentUptitration,
  });

  return (
    <div className="space-y-5">
      <Card title="What are you measuring?" icon={<Stethoscope className="w-5 h-5 text-sky-700" />}>
        <div className="grid sm:grid-cols-2 gap-2">
          {CONSTRUCTS.map((c) => (
            <button
              key={c.id}
              onClick={() => s.setField('construct', c.id)}
              className={`text-left p-3 rounded-lg border transition ${
                s.construct === c.id
                  ? 'border-sky-500 bg-sky-50 ring-1 ring-sky-300'
                  : 'border-slate-200 hover:bg-slate-50'
              }`}
            >
              <span className="font-medium text-slate-800 text-sm">{c.label}</span>
              <span className="block text-xs text-slate-600 mt-0.5">{c.blurb}</span>
            </button>
          ))}
        </div>

        <p className="mt-4 mb-2 text-sm font-medium text-slate-700">Instrument</p>
        <div className="space-y-2">
          {recommendations.map((r) => (
            <button
              key={r.scale.id}
              onClick={() => {
                s.setField('selectedScale', r.scale.id as ScaleId);
                setValues({});
              }}
              className={`w-full text-left p-3 rounded-lg border transition ${
                s.selectedScale === r.scale.id
                  ? 'border-sky-500 bg-sky-50'
                  : 'border-slate-200 hover:bg-slate-50'
              }`}
            >
              <span className="flex items-center gap-2 flex-wrap">
                <span className="font-semibold text-slate-800">{r.scale.name}</span>
                <span
                  className={`text-[10px] uppercase font-bold px-1.5 py-0.5 rounded ${
                    r.fit === 'preferred'
                      ? 'bg-emerald-100 text-emerald-800'
                      : r.fit === 'acceptable'
                        ? 'bg-slate-100 text-slate-600'
                        : 'bg-red-100 text-red-800'
                  }`}
                >
                  {r.fit.replace('_', ' ')}
                </span>
                <span className="text-xs text-slate-500">{r.scale.fullName}</span>
              </span>
              <ul className="mt-1 text-xs text-slate-600 space-y-0.5">
                {r.reasons.map((x) => (
                  <li key={x}>{x}</li>
                ))}
                {r.blockers.map((x) => (
                  <li key={x} className="text-red-700 font-medium">
                    {x}
                  </li>
                ))}
              </ul>
            </button>
          ))}
        </div>
      </Card>

      {chosen?.blockers.length ? (
        <Callout tone="danger" title="This instrument cannot measure this infant">
          {chosen.blockers.join(' ')}
        </Callout>
      ) : null}

      {(scale.items.some((i) => i.channel === 'facial') || scale.id === 'NFCS_P3') && (
        <>
          <FacialCapture />
          <ClipAnalysis />
          <StillAnalysis
            onProposeTension={
              items.some((i) => i.id === 'facial_tension')
                ? (level) =>
                    setValues((v) => ({ ...v, facial_tension: { value: level, fromAi: true } }))
                : undefined
            }
          />
          <VisionAssist
            onFacialTension={
              items.some((i) => i.id === 'facial_tension')
                ? (level) =>
                    setValues((v) => ({ ...v, facial_tension: { value: level, fromAi: true } }))
                : undefined
            }
          />
        </>
      )}

      <Card title={`${scale.name} scoring`} icon={<Activity className="w-5 h-5 text-sky-700" />}>
        <div className="space-y-4">
          {evidence && Object.keys(evidence.suggestions).length > 0 && (
            <Callout tone={evidenceStale ? 'warn' : 'info'} title="Model suggestions available">
              <p>
                {Object.keys(evidence.suggestions).length} of the {items.length} items on this scale
                have a suggested value derived from the capture window closed at{' '}
                {new Date(evidence.capturedAt).toLocaleTimeString()}. Accepting them records them as
                model-derived in the audit trail; you can override any of them afterwards.
              </p>
              {evidenceStale && (
                <p className="mt-1 font-semibold">
                  That window is more than {STALE_MINUTES} minutes old. An infant's state changes
                  faster than that. Record a new window rather than accepting these.
                </p>
              )}
              <div className="mt-2">
                <Button variant="ghost" onClick={acceptSuggestions}>
                  <Sparkles className="w-4 h-4" />
                  {evidenceStale ? 'Accept anyway' : 'Accept suggestions'}
                </Button>
              </div>
            </Callout>
          )}

          {items.map((item) => {
            const suggestion = evidence?.suggestions[item.id];
            const current = values[item.id];
            return (
              <div key={item.id} className="border-b border-slate-100 pb-4 last:border-0">
                <Field label={item.label} hint={item.help}>
                  <select
                    className={inputClass}
                    value={current?.value ?? ''}
                    onChange={(e) =>
                      setValues({
                        ...values,
                        [item.id]: { value: Number(e.target.value), fromAi: false },
                      })
                    }
                  >
                    <option value="">Not scored</option>
                    {item.options.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                        {o.anchor ? ` — ${o.anchor}` : ''}
                      </option>
                    ))}
                  </select>
                </Field>
                {suggestion && (
                  <p className="mt-1 text-xs text-sky-800 bg-sky-50 border border-sky-100 rounded p-2">
                    <span className="font-semibold">
                      Model suggests {suggestion.value} (confidence{' '}
                      {(suggestion.confidence * 100).toFixed(0)}%).
                    </span>{' '}
                    {suggestion.rationale}
                    {current?.fromAi && (
                      <span className="ml-1 font-semibold text-sky-900">Accepted.</span>
                    )}
                  </p>
                )}
              </div>
            );
          })}

          {error && (
            <Callout tone="danger" title="Not recorded">
              {error}
            </Callout>
          )}

          <div className="flex justify-end">
            <Button onClick={record}>Record assessment</Button>
          </div>
        </div>
      </Card>

      {latest && (
        <Card title="Latest score" icon={<BookOpen className="w-5 h-5 text-sky-700" />}>
          <div className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <Stat label={latest.scaleId} value={latest.total} />
              {latest.secondary && (
                <Stat label={latest.secondary.label} value={latest.secondary.value} />
              )}
              <Stat
                label="Interpretation"
                value={latest.band?.label ?? 'out of range'}
                tone={
                  latest.band?.severity === 'severe' || latest.band?.severity === 'oversedated'
                    ? 'alert'
                    : 'default'
                }
              />
            </div>

            {latest.band && <Callout tone="info">{latest.band.action}</Callout>}

            <details className="text-sm">
              <summary className="cursor-pointer font-medium text-slate-700">
                How this total was produced
              </summary>
              <ul className="mt-2 space-y-1 text-slate-600 list-disc list-inside">
                {latest.workings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            </details>

            <details className="text-sm">
              <summary className="cursor-pointer font-medium text-slate-700">
                Instrument limits and references
              </summary>
              <div className="mt-2 space-y-2 text-slate-600">
                <p>
                  <span className="font-medium">Validated in:</span> {scale.validatedIn}
                </p>
                <ul className="list-disc list-inside space-y-1">
                  {scale.caveats.map((c) => (
                    <li key={c}>{c}</li>
                  ))}
                </ul>
                <ul className="space-y-1 text-xs">
                  {scale.references.map((r) => (
                    <li key={r.citation}>{r.citation}</li>
                  ))}
                </ul>
              </div>
            </details>
          </div>
        </Card>
      )}

      <Card title="Protocol decision" icon={<Activity className="w-5 h-5 text-sky-700" />}>
        <div className="space-y-3">
          <Callout
            tone={
              escalation.urgency === 'high'
                ? 'danger'
                : escalation.urgency === 'medium'
                  ? 'warn'
                  : 'ok'
            }
            title={escalation.headline}
          >
            <ul className="list-disc list-inside space-y-1">
              {escalation.actions.map((a) => (
                <li key={a}>{a}</li>
              ))}
            </ul>
          </Callout>
          {escalation.drivers.length > 0 && (
            <ul className="text-xs text-slate-600 list-disc list-inside space-y-0.5">
              {escalation.drivers.map((d) => (
                <li key={d}>{d}</li>
              ))}
            </ul>
          )}
        </div>
      </Card>
    </div>
  );
};
