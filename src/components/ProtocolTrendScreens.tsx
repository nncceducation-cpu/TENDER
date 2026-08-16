import { Database, Download, FileText, FileWarning, LineChart, ShieldCheck } from 'lucide-react';
import { useStore } from '../state/store';
import { Button, Callout, Card, Stat } from './ui';
import { PROTOCOL_VERSION, REVIEW_FLAGS } from '../data/protocol/ach';
import { PAIN_SCALES, WAT_1 } from '../data/scales';
import { buildSessionReport } from '../state/report';
import { assessmentsToCsv, downloadText, framesToCsv } from '../state/rawExport';
import { TrendSmallMultiples, type TrendSeries } from './viz/Charts';
import { SCALES } from '../data/scales';

export const ProtocolScreen = () => (
  <div className="space-y-5">
    <Card title="Protocol version" icon={<ShieldCheck className="w-5 h-5 text-sky-700" />}>
      <div className="grid sm:grid-cols-3 gap-3">
        <Stat label="Identifier" value={PROTOCOL_VERSION.id} />
        <Stat label="Version" value={PROTOCOL_VERSION.version} />
        <Stat label="Effective" value={PROTOCOL_VERSION.effectiveDate} />
      </div>
      <p className="mt-3 text-sm text-slate-600">Owner: {PROTOCOL_VERSION.owner}</p>
      <ul className="mt-3 text-sm text-slate-600 space-y-1">
        {PROTOCOL_VERSION.changelog.map((c) => (
          <li key={c.version}>
            <span className="font-medium">
              {c.version} ({c.date})
            </span>{' '}
            {c.note}
          </li>
        ))}
      </ul>
    </Card>

    <Card
      title="Open questions for the protocol owner"
      icon={<FileWarning className="w-5 h-5 text-amber-600" />}
    >
      <p className="text-sm text-slate-600 mb-4">
        Each item below was found while porting the previous version. None has been silently changed
        in code; they are decisions for the protocol owner.
      </p>
      <div className="space-y-3">
        {REVIEW_FLAGS.map((f) => (
          <div
            key={f.id}
            className={`rounded-lg border p-3 ${
              f.severity === 'high' ? 'border-red-200 bg-red-50' : 'border-amber-200 bg-amber-50'
            }`}
          >
            <p className="text-sm font-semibold text-slate-800">
              {f.where}
              <span
                className={`ml-2 text-[10px] uppercase px-1.5 py-0.5 rounded ${
                  f.severity === 'high' ? 'bg-red-200 text-red-900' : 'bg-amber-200 text-amber-900'
                }`}
              >
                {f.severity}
              </span>
            </p>
            <p className="mt-1 text-sm text-slate-700">{f.finding}</p>
            <p className="mt-2 text-sm font-medium text-slate-800">{f.question}</p>
          </div>
        ))}
      </div>
    </Card>

    <Card title="Instrument library">
      <div className="space-y-4">
        {[...PAIN_SCALES, WAT_1].map((s) => (
          <div key={s.id} className="border-b border-slate-100 pb-4 last:border-0">
            <p className="font-semibold text-slate-800">
              {s.name} <span className="font-normal text-slate-500">— {s.fullName}</span>
            </p>
            <p className="text-sm text-slate-600 mt-1">
              Range {s.range.min} to {s.range.max}. {s.validatedIn}
            </p>
            <ul className="mt-2 text-xs text-slate-600 list-disc list-inside space-y-0.5">
              {s.caveats.map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
            <ul className="mt-2 text-xs text-slate-500 space-y-0.5">
              {s.references.map((r) => (
                <li key={r.citation}>{r.citation}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </Card>
  </div>
);

export const TrendScreen = () => {
  const s = useStore();
  const assessments = s.assessments;

  const download = () => {
    const blob = new Blob([s.exportSession()], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `tender-session-${s.ctx.localId || 'unidentified'}-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const downloadPdf = async () => {
    const doc = await buildSessionReport({
      ctx: s.ctx,
      clinician: s.clinician,
      assessments,
      audit: s.audit.all(),
    });
    doc.save(`tender-report-${s.ctx.localId || 'unidentified'}-${Date.now()}.pdf`);
  };

  const stamp = () => `${s.ctx.localId || 'unidentified'}-${Date.now()}`;

  const exportFrames = () =>
    downloadText(`tender-frames-${stamp()}.csv`, framesToCsv(s.rawFrames));

  const exportItems = () =>
    downloadText(
      `tender-items-${stamp()}.csv`,
      assessmentsToCsv(assessments, {
        localId: s.ctx.localId,
        gaWeeks: s.ctx.gestationalAgeAtBirth.weeks,
        gaDays: s.ctx.gestationalAgeAtBirth.days,
      }),
    );

  /**
   * One small multiple per instrument. N-PASS runs 0 to 13 and COMFORTneo 6 to
   * 30; sharing an axis would either need two scales or imply that the same
   * number means the same thing on both.
   */
  const series: TrendSeries[] = [...new Set(assessments.map((a) => a.scaleId))].map((id) => {
    const scale = SCALES[id];
    const points = assessments
      .filter((a) => a.scaleId === id)
      .map((a) => ({
        t: new Date(a.timestamp).toLocaleTimeString(),
        value: a.total,
        severity: a.band?.severity,
        label: a.band?.label,
      }));
    const thresholds = scale.bands
      .filter((b) => b.severity === 'moderate' || b.severity === 'severe')
      .map((b) => ({ at: b.min, label: b.label }));
    return { instrument: `${scale.name} — ${scale.fullName}`, min: scale.range.min, max: scale.range.max, points, thresholds };
  });

  return (
    <div className="space-y-5">
      <Card title="Scores this session" icon={<LineChart className="w-5 h-5 text-sky-700" />}>
        {assessments.length === 0 ? (
          <p className="text-sm text-slate-600">No assessments recorded yet.</p>
        ) : (
          <div className="space-y-4">
            <TrendSmallMultiples series={series} />

            <table className="w-full text-sm [&_th]:px-3 [&_td]:px-3 [&_th:first-child]:pl-0 [&_td:first-child]:pl-0 [&_th:last-child]:pr-0 [&_td:last-child]:pr-0">
              <thead>
                <tr className="text-left text-xs uppercase text-slate-500 border-b border-slate-200">
                  <th className="py-2">Time</th>
                  <th className="py-2">Instrument</th>
                  <th className="py-2 text-right">Score</th>
                  <th className="py-2">Interpretation</th>
                  <th className="py-2 text-right">Model-derived items</th>
                  <th className="py-2">By</th>
                </tr>
              </thead>
              <tbody>
                {assessments.map((a) => (
                  <tr key={a.id} className="border-b border-slate-100">
                    <td className="py-2 text-slate-600">
                      {new Date(a.timestamp).toLocaleTimeString()}
                    </td>
                    <td className="py-2 text-slate-800 font-medium">{a.scaleId}</td>
                    <td className="py-2 text-right tabular-nums">{a.total}</td>
                    <td className="py-2 text-slate-600">{a.band?.label ?? '-'}</td>
                    <td className="py-2 text-right tabular-nums text-slate-600">
                      {a.items.filter((i) => i.source === 'ai_accepted').length}/{a.items.length}
                    </td>
                    <td className="py-2 text-slate-600">{a.scoredBy}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card title="Audit trail">
        <Callout tone="info" title="Hash-chained and disposable">
          Each entry hashes the one before it, so an edited export is detectable. The session itself
          is held in memory only and is lost when this tab closes. Export what belongs in the chart.
        </Callout>
        <div className="mt-4 space-y-1 max-h-64 overflow-auto font-mono text-xs">
          {s.audit.all().map((e) => (
            <div key={e.hash} className="text-slate-600 border-b border-slate-100 py-1">
              <span className="text-slate-400">{new Date(e.at).toLocaleTimeString()}</span>{' '}
              <span className="text-slate-800">{e.action}</span> {e.detail}{' '}
              <span className="text-slate-400">[{e.hash.slice(0, 8)}]</span>
            </div>
          ))}
          {s.audit.all().length === 0 && <p className="text-slate-500">Nothing recorded yet.</p>}
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button onClick={() => void downloadPdf()}>
            <FileText className="w-4 h-4" /> Session report (PDF)
          </Button>
          <Button onClick={download} variant="ghost">
            <Download className="w-4 h-4" /> Session JSON
          </Button>
        </div>
      </Card>

      <Card title="Raw data" icon={<Database className="w-5 h-5 text-sky-700" />}>
        <Callout tone="info" title="For analysis, not for the chart">
          One row per sample, with nothing summarised away. This is what a
          validation study needs to compare the tool's coding against a human
          coder's, and what lets anyone recompute a figure rather than take it on
          trust. CSV with a byte-order mark, so Excel opens it as UTF-8.
        </Callout>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button onClick={exportFrames} variant="ghost" disabled={s.rawFrames.length === 0}>
            <Database className="w-4 h-4" /> Per-frame coding ({s.rawFrames.length} rows)
          </Button>
          <Button onClick={exportItems} variant="ghost" disabled={assessments.length === 0}>
            <Database className="w-4 h-4" /> Per-item scores (
            {assessments.reduce((n, a) => n + a.items.length, 0)} rows)
          </Button>
        </div>
        <p className="mt-3 text-xs text-slate-500">
          Per-frame carries the raw activations, the coded actions, the geometric
          measures and the quality of every sample from the last coding run.
          Per-item carries one row for each scale item scored this session, with
          whether it came from a clinician or a model, so a total can be
          recomputed under a different rule.
        </p>
      </Card>
    </div>
  );
};
