import { Download, FileWarning, LineChart, ShieldCheck } from 'lucide-react';
import { useStore } from '../state/store';
import { Button, Callout, Card, Stat } from './ui';
import { PROTOCOL_VERSION, REVIEW_FLAGS } from '../data/protocol/ach';
import { PAIN_SCALES, WAT_1 } from '../data/scales';

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

  const max = Math.max(1, ...assessments.map((a) => a.total));

  return (
    <div className="space-y-5">
      <Card title="Scores this session" icon={<LineChart className="w-5 h-5 text-sky-700" />}>
        {assessments.length === 0 ? (
          <p className="text-sm text-slate-600">No assessments recorded yet.</p>
        ) : (
          <div className="space-y-4">
            <div className="flex items-end gap-1 h-32 border-b border-l border-slate-200 p-1">
              {assessments.map((a) => (
                <div
                  key={a.id}
                  title={`${a.scaleId} ${a.total} at ${new Date(a.timestamp).toLocaleTimeString()}`}
                  className={`flex-1 min-w-2 rounded-t ${
                    a.band?.severity === 'severe'
                      ? 'bg-red-500'
                      : a.band?.severity === 'moderate'
                        ? 'bg-amber-500'
                        : 'bg-emerald-500'
                  }`}
                  style={{ height: `${(a.total / max) * 100}%` }}
                />
              ))}
            </div>

            <table className="w-full text-sm">
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
        <div className="mt-4">
          <Button onClick={download} variant="ghost">
            <Download className="w-4 h-4" /> Export session
          </Button>
        </div>
      </Card>
    </div>
  );
};
