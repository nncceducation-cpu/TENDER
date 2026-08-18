import { useState } from 'react';
import { MILESTONES } from '../../data/physiology/development';
import { Figure } from './Charts';
import { INK, SERIES, STATUS } from './tokens';

/**
 * Developmental timeline of the nociceptive system.
 *
 * A numbered list is a list. The teaching point is a shape, and the shape is only
 * visible when the three systems are drawn on one shared age axis: excitation is
 * established before the cortex is even reachable, and the descending brake
 * arrives a decade of gestational weeks after that. The gap between the top track
 * and the bottom one IS the argument for the gestational-age correction.
 *
 * Colour is redundant here by design. Every track is one hue at three opacities,
 * so the fill says how much of that system is online rather than which system it
 * is; the row label carries the identity. That sidesteps the categorical checks
 * entirely, which is the honest answer when the series are ordered stages of one
 * process rather than distinct entities.
 *
 * The pre-34-week region on the inhibition track is tinted and carries the words
 * "net facilitatory" inside it, because that is a state rather than a magnitude
 * and it is the single most counter-intuitive fact on the chart.
 */

const W_MIN = 6;
const W_MAX = 50;
const x = (w: number) => ((w - W_MIN) / (W_MAX - W_MIN)) * 100;

type Fill = 'emerging' | 'building' | 'established' | 'facilitatory';

const FILL: Record<Fill, { bg: string; label: string }> = {
  emerging: { bg: `${SERIES}26`, label: 'first appearance' },
  building: { bg: `${SERIES}73`, label: 'developing' },
  established: { bg: SERIES, label: 'established' },
  facilitatory: { bg: `${STATUS.warning}30`, label: 'present but net facilitatory' },
};

interface Segment {
  from: number;
  to: number;
  fill: Fill;
  /** Printed inside the segment when it is wide enough to hold the text. */
  inline?: string;
}

interface Track {
  label: string;
  note: string;
  segments: Segment[];
}

const TRACKS: Track[] = [
  {
    label: 'Excitation: skin and cord',
    note: 'Nociceptive fibres, the spinal reflex arc, and the excitatory transmitters that carry the signal.',
    segments: [
      { from: 6, to: 8, fill: 'emerging' },
      { from: 8, to: 20, fill: 'building' },
      { from: 20, to: 50, fill: 'established', inline: 'near-adult fibre density from 19 to 20 weeks' },
    ],
  },
  {
    label: 'Route to the cortex',
    note: 'Thalamic fibres to the subplate, then into cortex, then a response that can tell noxious from touch.',
    segments: [
      { from: 20, to: 23, fill: 'emerging' },
      { from: 23, to: 35, fill: 'building', inline: 'reaches cortex, not yet modality specific' },
      { from: 35, to: 50, fill: 'established', inline: 'nociceptive-specific' },
    ],
  },
  {
    label: 'Descending inhibition',
    note: 'The brake. Anatomically present long before it works, and pushing the wrong way until it does.',
    segments: [
      { from: 6, to: 34, fill: 'facilitatory', inline: 'net facilitatory' },
      { from: 34, to: 48, fill: 'emerging', inline: 'transmitters appear' },
      { from: 48, to: 50, fill: 'building' },
    ],
  },
];

const TICKS = [10, 20, 30, 40, 50];

export const MilestoneTimeline = ({ pma }: { pma: number | null }) => {
  const [active, setActive] = useState<number | null>(null);
  /** Filled as the rail renders; a raised dot never raises its neighbour too. */
  const raisedFlags: boolean[] = [];
  const hasPma = pma !== null && pma >= W_MIN && pma <= 60;
  const pmaClamped = hasPma ? Math.min(W_MAX, Math.max(W_MIN, pma)) : null;

  return (
    <Figure
      title="When each part of the system arrives"
      caption="Gestational age in weeks along the bottom. Each track fills as that system comes online, so the distance between the top track and the bottom one is the window in which an infant conducts pain efficiently and cannot yet damp it."
      table={MILESTONES.map((m) => [m.age, m.event])}
    >
      <div className="space-y-3">
        {/* Legend. Three fills, so identity never rests on colour alone. */}
        <div className="flex flex-wrap gap-3 text-[11px]" style={{ color: INK.secondary }}>
          {(['emerging', 'building', 'established', 'facilitatory'] as Fill[]).map((f) => (
            <span key={f} className="inline-flex items-center gap-1.5">
              <span
                className="inline-block w-6 h-2.5 rounded-sm"
                style={{
                  background: FILL[f].bg,
                  outline: f === 'facilitatory' ? `1px solid ${STATUS.warning}` : 'none',
                }}
              />
              {FILL[f].label}
            </span>
          ))}
        </div>

        <div className="relative">
          {/* Milestone rail. */}
          <div className="relative h-14 ml-0 sm:ml-44">
            {MILESTONES.map((m, i) => {
              /**
               * Alternate a dot up a row when it would sit on its neighbour.
               * "34 to 38 weeks" and "about 35 weeks" are one week apart, which
               * on this axis is two circles in the same pixels.
               */
              const prev = i > 0 ? MILESTONES[i - 1] : null;
              const tight = prev !== null && x(m.weeks) - x(prev.weeks) < 4;
              const raised = tight && !raisedFlags[i - 1];
              raisedFlags[i] = raised;
              return (
              <button
                key={m.age}
                onMouseEnter={() => setActive(i)}
                onMouseLeave={() => setActive(null)}
                onFocus={() => setActive(i)}
                onBlur={() => setActive(null)}
                onClick={() => setActive(active === i ? null : i)}
                className={`absolute grid place-items-center rounded-full transition ${
                  x(m.weeks) < 3
                    ? 'translate-x-0'
                    : x(m.weeks) > 97
                      ? '-translate-x-full'
                      : '-translate-x-1/2'
                }`}
                style={{ left: `${x(m.weeks)}%`, bottom: raised ? 24 : 0, width: 22, height: 22 }}
                aria-label={`${m.age}: ${m.event}`}
                title={`${m.age}: ${m.event}`}
              >
                <span
                  className="grid place-items-center rounded-full text-[9px] font-bold tabular-nums transition-all"
                  style={{
                    width: active === i ? 20 : 15,
                    height: active === i ? 20 : 15,
                    background: active === i ? INK.primary : '#ffffff',
                    color: active === i ? '#ffffff' : INK.secondary,
                    boxShadow: `0 0 0 2px ${active === i ? INK.primary : INK.baseline}`,
                  }}
                >
                  {i + 1}
                </span>
                {raised && (
                  <span
                    className="absolute left-1/2 top-full w-px h-5 -translate-x-1/2"
                    style={{ background: INK.grid }}
                  />
                )}
              </button>
              );
            })}
          </div>

          {/* Tracks. */}
          <div className="space-y-2.5">
            {TRACKS.map((t) => (
              <div key={t.label} className="sm:flex sm:items-center sm:gap-3">
                <p
                  className="text-xs font-semibold sm:w-44 sm:shrink-0 sm:text-right mb-1 sm:mb-0"
                  style={{ color: INK.primary }}
                  title={t.note}
                >
                  {t.label}
                </p>
                <div
                  className="relative h-7 rounded-sm flex-1"
                  style={{ background: INK.track }}
                >
                  {t.segments.map((s) => {
                    const left = x(s.from);
                    const width = x(s.to) - x(s.from);
                    // Only print the inline label where it plausibly fits. Below
                    // roughly a fifth of the axis it is clipped text, which the
                    // marks spec forbids; the tooltip and table still carry it.
                    const room = width > 19;
                    return (
                      <div
                        key={`${s.from}-${s.to}`}
                        className="absolute inset-y-0 flex items-center px-2 overflow-hidden"
                        style={{
                          left: `${left}%`,
                          width: `${width}%`,
                          background: FILL[s.fill].bg,
                          // 2px of surface between touching segments, per the spec.
                          borderLeft: `2px solid ${INK.surface}`,
                        }}
                        title={`${s.from} to ${s.to} weeks: ${FILL[s.fill].label}`}
                      >
                        {s.inline && room && (
                          <span
                            className="text-[10px] leading-tight truncate"
                            style={{
                              color: s.fill === 'established' ? '#ffffff' : INK.secondary,
                            }}
                          >
                            {s.inline}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          {/* Axis. */}
          <div className="sm:ml-44 relative h-6 mt-1">
            <div
              className="absolute inset-x-0 top-0 border-t"
              style={{ borderColor: INK.grid }}
            />
            {TICKS.map((w) => {
              const last = w === TICKS[TICKS.length - 1];
              return (
                <span
                  key={w}
                  className={`absolute top-1 text-[10px] tabular-nums whitespace-nowrap ${
                    last ? '-translate-x-full' : '-translate-x-1/2'
                  }`}
                  style={{ left: `${x(w)}%`, color: INK.muted }}
                >
                  {w === 40 ? 'term 40' : `${w} wk`}
                </span>
              );
            })}
          </div>

          {/* This infant. Drawn last so it sits over every track. */}
          {pmaClamped !== null && (
            <div
              className="absolute pointer-events-none sm:left-44 left-0 right-0"
              style={{ top: 56, bottom: 26 }}
            >
              <div
                className="absolute top-0 bottom-0 -translate-x-1/2"
                style={{ left: `${x(pmaClamped)}%` }}
              >
                <div
                  className="w-0.5 h-full"
                  style={{ background: INK.primary }}
                />
                <span
                  className="absolute -top-5 left-1/2 -translate-x-1/2 whitespace-nowrap text-[10px] font-semibold px-1.5 py-0.5 rounded"
                  style={{ background: INK.primary, color: '#ffffff' }}
                >
                  this infant {pma}w
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Milestone detail, numbered to the rail. */}
        <ol className="grid sm:grid-cols-2 gap-2 mt-4">
          {MILESTONES.map((m, i) => {
            const reached = hasPma && pma! >= m.weeks;
            const on = active === i;
            return (
              <li
                key={m.age}
                onMouseEnter={() => setActive(i)}
                onMouseLeave={() => setActive(null)}
                className="rounded-lg border p-2.5 transition"
                style={{
                  borderColor: on ? INK.primary : INK.grid,
                  background: on ? '#f8fafc' : INK.surface,
                }}
              >
                <div className="flex gap-2.5">
                  <span
                    className="grid place-items-center rounded-full text-[10px] font-bold shrink-0 mt-0.5"
                    style={{
                      width: 18,
                      height: 18,
                      background: reached ? SERIES : INK.track,
                      color: reached ? '#ffffff' : INK.muted,
                    }}
                  >
                    {i + 1}
                  </span>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold" style={{ color: INK.primary }}>
                      {m.age}
                    </p>
                    <p className="text-xs mt-0.5" style={{ color: INK.secondary }}>
                      {m.event}
                    </p>
                    {m.bedside && (
                      <p
                        className="text-[11px] mt-1 pl-2 border-l-2"
                        style={{ color: INK.muted, borderColor: SERIES }}
                      >
                        {m.bedside}
                      </p>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      </div>
    </Figure>
  );
};
