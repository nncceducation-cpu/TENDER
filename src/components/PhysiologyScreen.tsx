import { Activity, Brain, Pill, TrendingUp } from 'lucide-react';
import { useStore } from '../state/store';
import { Card } from './ui';
import { INK, STATUS } from './viz/tokens';
import {
  ADULT_VS_NEWBORN,
  CLOSING_LINES,
  CORE_CLAIM,
  DRUG_CAUTIONS,
  MECHANISM_TO_BEDSIDE,
  MILESTONES,
  OUTCOME_EVIDENCE,
  SOURCE_NOTE,
} from '../data/physiology/development';

/**
 * The reasoning behind the tool, at the cot side.
 *
 * This is not a lecture bolted on. Two behaviours in this application are
 * unusual enough that a clinician is right to ask why: the gestational-age
 * correction that can move an N-PASS by three points, and the refusal to read a
 * low behavioural score as comfort. Both follow from developmental
 * neurophysiology, and until now the reasoning lived only in a docs file nobody
 * at a bedside will open.
 *
 * The postmenstrual age from the context screen marks the milestone table, so the
 * question is not "what happens at 28 weeks" but "where is this infant".
 */

export const PhysiologyScreen = () => {
  const pma = useStore((s) => s.postmenstrualAgeWeeks);
  const hasPma = Number.isFinite(pma) && pma >= 20 && pma <= 60;

  return (
    <div className="space-y-5">
      <div
        className="rounded-xl p-5 text-white"
        style={{ background: 'linear-gradient(135deg, #0f766e 0%, #0f1c2e 100%)' }}
      >
        <p className="text-base sm:text-lg font-semibold leading-snug">{CORE_CLAIM}</p>
      </div>

      <Card
        title="Maturation of the nociceptive system"
        icon={<TrendingUp className="w-5 h-5 text-sky-700" />}
      >
        <p className="text-sm text-slate-600 mb-4">
          Excitation is in place by the second trimester. The cortex is reachable in the
          mid twenties. Descending inhibition arrives last, and is net facilitatory
          before it matures. That gap is why a preterm infant is not a small adult here,
          and why this tool applies a gestational-age correction rather than reading the
          raw score.
          {hasPma && (
            <>
              {' '}
              This infant is at <span className="font-semibold text-slate-800">{pma} weeks</span>{' '}
              postmenstrual age; the row at or below that point is where they sit.
            </>
          )}
        </p>

        <ol className="relative border-l-2 ml-2" style={{ borderColor: INK.grid }}>
          {MILESTONES.map((m) => {
            const reached = hasPma && pma >= m.weeks;
            const current = hasPma && pma >= m.weeks && pma < m.weeks + 4;
            return (
              <li key={m.age} className="ml-5 pb-4 last:pb-0">
                <span
                  className="absolute -left-[7px] w-3 h-3 rounded-full border-2 border-white"
                  style={{ background: reached ? '#0f766e' : INK.baseline }}
                />
                <p className="text-sm font-semibold" style={{ color: INK.primary }}>
                  {m.age}
                  {current && (
                    <span
                      className="ml-2 text-[10px] px-1.5 py-0.5 rounded font-semibold"
                      style={{ background: '#0f766e', color: '#fff' }}
                    >
                      this infant
                    </span>
                  )}
                </p>
                <p className="text-sm" style={{ color: INK.secondary }}>
                  {m.event}
                </p>
                {m.bedside && (
                  <p className="text-xs mt-1" style={{ color: INK.muted }}>
                    {m.bedside}
                  </p>
                )}
              </li>
            );
          })}
        </ol>
      </Card>

      <Card
        title="Adult and newborn side by side"
        icon={<Brain className="w-5 h-5 text-sky-700" />}
      >
        <p className="text-sm text-slate-600 mb-3">
          Seven differences that change how the infant in front of you is interpreted.
        </p>
        <div className="overflow-x-auto -mx-1 px-1">
          <table className="w-full text-sm min-w-[44rem] [&_th]:px-3 [&_td]:px-3 [&_th:first-child]:pl-0 [&_td:first-child]:pl-0">
            <thead>
              <tr className="text-left text-xs uppercase text-slate-500 border-b border-slate-200">
                <th className="py-2">Feature</th>
                <th className="py-2">Adult</th>
                <th className="py-2">Newborn, especially preterm</th>
                <th className="py-2">What it changes</th>
              </tr>
            </thead>
            <tbody>
              {ADULT_VS_NEWBORN.map((r) => (
                <tr key={r.feature} className="border-b border-slate-100 align-top">
                  <td className="py-2 font-medium text-slate-800">{r.feature}</td>
                  <td className="py-2 text-slate-600">{r.adult}</td>
                  <td className="py-2 text-slate-600">{r.newborn}</td>
                  <td className="py-2" style={{ color: INK.primary }}>
                    {r.consequence}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card
        title="Mechanism to bedside"
        icon={<Activity className="w-5 h-5 text-sky-700" />}
      >
        <p className="text-sm text-slate-600 mb-3">
          Each stage of the pathway maps onto something done, or not done, at the cot
          side. Blocking one stage does not silence the others.
        </p>
        <div className="space-y-3">
          {MECHANISM_TO_BEDSIDE.map((m, i) => (
            <div key={m.stage} className="flex gap-3">
              <span
                className="w-7 h-7 rounded-full grid place-items-center text-xs font-bold shrink-0"
                style={{ background: '#0f766e14', color: '#0f766e' }}
              >
                {i + 1}
              </span>
              <div className="min-w-0">
                <p className="text-sm font-semibold" style={{ color: INK.primary }}>
                  {m.stage}
                </p>
                <p className="text-xs" style={{ color: INK.muted }}>
                  {m.mechanism}
                </p>
                <p className="text-sm mt-0.5" style={{ color: INK.secondary }}>
                  {m.acts}
                </p>
              </div>
            </div>
          ))}
        </div>
      </Card>

      <Card title="Drugs, and what they do not do" icon={<Pill className="w-5 h-5 text-sky-700" />}>
        <div className="overflow-x-auto -mx-1 px-1">
          <table className="w-full text-sm min-w-[44rem] [&_th]:px-3 [&_td]:px-3 [&_th:first-child]:pl-0 [&_td:first-child]:pl-0">
            <thead>
              <tr className="text-left text-xs uppercase text-slate-500 border-b border-slate-200">
                <th className="py-2">Agent</th>
                <th className="py-2">Best evidence</th>
                <th className="py-2">When to add</th>
                <th className="py-2">Main risk</th>
              </tr>
            </thead>
            <tbody>
              {DRUG_CAUTIONS.map((d) => (
                <tr key={d.agent} className="border-b border-slate-100 align-top">
                  <td className="py-2 font-medium text-slate-800">{d.agent}</td>
                  <td className="py-2 text-slate-600">{d.finding}</td>
                  <td className="py-2 text-slate-600">{d.when}</td>
                  <td className="py-2" style={{ color: STATUS.serious }}>
                    {d.risk}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card title="Reading the outcome evidence honestly">
        <p className="text-sm text-slate-600 mb-3">
          Untreated pain carries risk. So does the treatment. Short courses cluster near
          the null; long or high cumulative exposure does not.
        </p>
        <div className="space-y-3">
          {OUTCOME_EVIDENCE.map((o) => (
            <div key={o.exposure} className="border-b border-slate-100 pb-3 last:border-0">
              <p className="text-sm font-medium text-slate-800">{o.exposure}</p>
              <p className="text-sm" style={{ color: INK.secondary }}>
                {o.signal}
              </p>
              <p className="text-xs mt-0.5" style={{ color: INK.muted }}>
                {o.caveat}
              </p>
            </div>
          ))}
        </div>
      </Card>

      <Card title="Three lines to close on">
        <ol className="space-y-2 text-sm list-decimal list-inside" style={{ color: INK.primary }}>
          {CLOSING_LINES.map((l) => (
            <li key={l}>{l}</li>
          ))}
        </ol>
        <p className="text-xs mt-4" style={{ color: INK.muted }}>
          {SOURCE_NOTE}
        </p>
      </Card>
    </div>
  );
};
