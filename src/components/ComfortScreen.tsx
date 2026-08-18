import { useState } from 'react';
import { CheckCircle2, HandHeart, Info } from 'lucide-react';
import { useStore } from '../state/store';
import { Button, Callout, Card } from './ui';
import { INK, STATUS } from './viz/tokens';
import {
  BLUNTING_CAVEAT,
  BLUNTING_DOES_NOT_FOLLOW,
  BLUNTING_FOLLOWS,
  CERTAINTY_LABEL,
  CHECKLIST_RATIONALE,
  COMFORT_MEASURES,
  PREEMPTIVE_ANALGESIA,
  type Certainty,
} from '../data/physiology/comfort';

/**
 * The multisensorial comfort checklist.
 *
 * The ACH pathway instructs "COMPLETE multisensorial checklist" in both elevated
 * escalation bands and never enumerates it. The application repeated that
 * instruction and also never enumerated it, which turned the most evidence-backed
 * step in the whole pathway into a prompt to do something unspecified.
 *
 * Completing it is recorded, because the pathway's middle band is "comfort
 * measures first, then rescore" and a chart that cannot show the first half
 * cannot support the second.
 */

const CERTAINTY_TONE: Record<Certainty, keyof typeof STATUS | null> = {
  high: 'good',
  moderate: 'good',
  low: 'warning',
  very_low: 'warning',
  not_stated: null,
};

export const ComfortScreen = () => {
  const s = useStore();
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [note, setNote] = useState('');
  const [justSaved, setJustSaved] = useState(false);

  const toggle = (id: string) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const chosen = COMFORT_MEASURES.filter((m) => picked.has(m.id));
  const blunts = chosen.some((m) => m.blunts);

  const save = () => {
    s.recordComfort(
      chosen.map((m) => m.label),
      blunts,
      note.trim(),
    );
    setPicked(new Set());
    setNote('');
    setJustSaved(true);
    window.setTimeout(() => setJustSaved(false), 4000);
  };

  return (
    <div className="space-y-5">
      <Callout tone="info" title="Why this is first line, not a courtesy">
        {CHECKLIST_RATIONALE}
      </Callout>

      <div className="grid lg:grid-cols-2 gap-5 items-start">
        <Card
          title="Multisensorial comfort checklist"
          icon={<HandHeart className="w-5 h-5 text-sky-700" />}
        >
          <div className="space-y-2">
            {COMFORT_MEASURES.map((m) => {
              const on = picked.has(m.id);
              const tone = CERTAINTY_TONE[m.certainty];
              return (
                <button
                  key={m.id}
                  onClick={() => toggle(m.id)}
                  aria-pressed={on}
                  className={`w-full text-left p-3 rounded-lg border transition flex gap-3 ${
                    on ? 'border-sky-500 bg-sky-50 ring-1 ring-sky-300' : 'border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  <span
                    className="mt-0.5 w-4 h-4 rounded border grid place-items-center shrink-0"
                    style={{
                      borderColor: on ? '#0f766e' : INK.baseline,
                      background: on ? '#0f766e' : 'transparent',
                    }}
                  >
                    {on && <CheckCircle2 className="w-3 h-3 text-white" />}
                  </span>
                  <span className="min-w-0">
                    <span className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-slate-800 text-sm">{m.label}</span>
                      <span
                        className="text-[10px] px-1.5 py-0.5 rounded border"
                        style={{
                          borderColor: tone ? `${STATUS[tone]}66` : INK.grid,
                          color: INK.secondary,
                        }}
                      >
                        {CERTAINTY_LABEL[m.certainty]}
                      </span>
                      {m.blunts && (
                        <span
                          className="text-[10px] px-1.5 py-0.5 rounded border"
                          style={{ borderColor: `${STATUS.warning}88`, color: '#92400e' }}
                        >
                          blunts behaviour
                        </span>
                      )}
                    </span>
                    <span className="block text-xs text-slate-600 mt-0.5">{m.how}</span>
                    <span className="block text-xs mt-1" style={{ color: INK.muted }}>
                      {m.effect}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>

          <div className="mt-4">
            <label className="block text-sm font-medium text-slate-700 mb-1" htmlFor="comfort-note">
              Note, optional
            </label>
            <input
              id="comfort-note"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-sky-500"
              placeholder="Parent present, second attempt, anything the next shift needs"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>

          <div className="mt-4 flex items-center gap-3 flex-wrap">
            <Button onClick={save} disabled={chosen.length === 0}>
              Record checklist ({chosen.length} measure{chosen.length === 1 ? '' : 's'})
            </Button>
            {justSaved && (
              <span className="text-sm" style={{ color: STATUS.good }}>
                Recorded to the session and the audit trail.
              </span>
            )}
          </div>
        </Card>

        <div className="space-y-5">
          {blunts && (
            <Callout tone="warn" title="One of these blunts behaviour without blunting nociception">
              <p>{BLUNTING_CAVEAT}</p>
              <p className="mt-2">
                <span className="font-semibold">What follows: </span>
                {BLUNTING_FOLLOWS}
              </p>
              <p className="mt-2">
                <span className="font-semibold">What does not follow: </span>
                {BLUNTING_DOES_NOT_FOLLOW}
              </p>
            </Callout>
          )}

          <Callout tone="info" title="Before, not after">
            {PREEMPTIVE_ANALGESIA}
          </Callout>

          <Card title="Recorded this session">
            {s.comfortEvents.length === 0 ? (
              <p className="text-sm text-slate-600">
                No checklist recorded yet. The pathway asks for one before any
                pharmacological step in the 4 to 6 band, and alongside the dose in the 7
                to 10 band.
              </p>
            ) : (
              <ul className="space-y-3">
                {s.comfortEvents
                  .slice()
                  .reverse()
                  .map((e, i) => (
                    <li key={e.at + i} className="text-sm border-b border-slate-100 pb-2 last:border-0">
                      <p className="font-medium text-slate-800">
                        {new Date(e.at).toLocaleTimeString()}
                        {e.bluntsBehaviour && (
                          <span className="ml-2 text-xs font-normal" style={{ color: '#92400e' }}>
                            includes a behaviour-blunting measure
                          </span>
                        )}
                      </p>
                      <p className="text-slate-600">{e.measures.join(', ')}</p>
                      {e.note && <p className="text-xs text-slate-500 mt-0.5">{e.note}</p>}
                      <p className="text-xs text-slate-500">by {e.recordedBy}</p>
                    </li>
                  ))}
              </ul>
            )}
          </Card>

          <Card title="What the drugs do not do" icon={<Info className="w-5 h-5 text-sky-700" />}>
            <p className="text-sm text-slate-600">
              Acetaminophen has no procedural benefit and is inferior to sucrose for
              procedures. Topical lidocaine-prilocaine works for venepuncture, lumbar
              puncture and circumcision but not for heel lance. Opioids reduce PIPP and
              NIPS modestly, with no benefit beyond the procedure itself. The full table,
              with risks, is on the Physiology screen.
            </p>
          </Card>
        </div>
      </div>
    </div>
  );
};
