import { useState, type ReactNode } from 'react';
import { AlertTriangle, CheckCircle2, CircleAlert, ShieldAlert, Table2 } from 'lucide-react';
import { INK, SERIES, STATUS, ordinalStep, severityStatus, type Severity } from './tokens';

/**
 * Chart pieces, built in plain HTML and SVG.
 *
 * Three rules hold across all of them. Marks are thin and the chrome is
 * recessive, so the data is the only thing with weight. Every chart has a table
 * view behind a toggle, because colour and length must never be the only way to
 * read a number in a clinical tool. And numbers are labelled selectively rather
 * than on every mark, since a label on everything is a label on nothing.
 */

// ---------------------------------------------------------------------------
// Shared frame
// ---------------------------------------------------------------------------

export const Figure = ({
  title,
  caption,
  table,
  children,
}: {
  title: string;
  caption?: string;
  /** Rows for the accessible table view: [label, value]. */
  table?: [string, string][];
  children: ReactNode;
}) => {
  const [showTable, setShowTable] = useState(false);
  return (
    <figure className="m-0">
      <figcaption className="flex items-baseline justify-between gap-3 mb-2">
        <span className="text-sm font-semibold" style={{ color: INK.primary }}>
          {title}
        </span>
        {table && (
          <button
            onClick={() => setShowTable((v) => !v)}
            className="text-xs flex items-center gap-1 hover:underline"
            style={{ color: INK.secondary }}
          >
            <Table2 className="w-3 h-3" />
            {showTable ? 'Chart' : 'Table'}
          </button>
        )}
      </figcaption>

      {showTable && table ? (
        <table className="w-full text-sm">
          <tbody>
            {table.map(([k, v]) => (
              <tr key={k} className="border-b" style={{ borderColor: INK.grid }}>
                <td className="py-1" style={{ color: INK.secondary }}>
                  {k}
                </td>
                <td className="py-1 text-right tabular-nums" style={{ color: INK.primary }}>
                  {v}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        children
      )}

      {caption && (
        <p className="mt-2 text-xs" style={{ color: INK.muted }}>
          {caption}
        </p>
      )}
    </figure>
  );
};

// ---------------------------------------------------------------------------
// Horizontal bars: magnitude across a few named things
// ---------------------------------------------------------------------------

export interface BarDatum {
  label: string;
  /** 0 to 1. */
  value: number;
  /** Printed at the end of the bar. Falls back to a percentage. */
  display?: string;
  /** Shown under the label, for a caveat such as measurement reliability. */
  note?: string;
  /** Rendered as a chip beside the label. Carries an icon and a word. */
  chip?: { text: string; status: keyof typeof STATUS };
}

export const BarChart = ({
  data,
  title,
  caption,
  maxLabel,
}: {
  data: BarDatum[];
  title: string;
  caption?: string;
  /** What a full bar means, printed once above the bars. */
  maxLabel?: string;
}) => (
  <Figure
    title={title}
    caption={caption}
    table={data.map((d) => [d.label, d.display ?? `${(d.value * 100).toFixed(0)}%`])}
  >
    {maxLabel && (
      <p className="text-xs mb-2" style={{ color: INK.muted }}>
        Full bar = {maxLabel}
      </p>
    )}
    <div className="space-y-3">
      {data.map((d) => {
        const pct = Math.max(0, Math.min(1, d.value)) * 100;
        return (
          <div key={d.label}>
            <div className="grid grid-cols-[9rem_1fr_auto] gap-3 items-center">
              <span className="text-sm truncate" style={{ color: INK.primary }}>
                {d.label}
              </span>

              <div
                className="h-2 rounded-sm relative"
                style={{ background: INK.track }}
                title={`${d.label}: ${d.display ?? `${pct.toFixed(0)}%`}`}
              >
                <div
                  className="h-2 absolute left-0 top-0"
                  style={{
                    width: `${pct}%`,
                    background: SERIES,
                    // Rounded only at the data end, anchored square to the baseline.
                    borderTopRightRadius: 4,
                    borderBottomRightRadius: 4,
                    minWidth: pct > 0 ? 3 : 0,
                  }}
                />
              </div>

              <div className="flex items-center gap-2">
                {d.chip && <StatusChip status={d.chip.status} text={d.chip.text} />}
                <span
                  className="text-sm tabular-nums w-12 text-right"
                  style={{ color: INK.secondary }}
                >
                  {d.display ?? `${pct.toFixed(0)}%`}
                </span>
              </div>
            </div>

            {/*
              The note runs the full width under the row rather than inside the
              label column. Squeezed into 9rem it wrapped to five lines and made
              the bar it belonged to hard to find.
            */}
            {d.note && (
              <p className="text-[11px] mt-1 pl-0 sm:pl-[10.5rem]" style={{ color: INK.muted }}>
                {d.note}
              </p>
            )}
          </div>
        );
      })}
    </div>
  </Figure>
);

// ---------------------------------------------------------------------------
// Presence ribbon: one row per action, one cell per coding unit
// ---------------------------------------------------------------------------

export interface RibbonRow {
  label: string;
  /** One entry per coding unit. True where the action was coded present. */
  cells: boolean[];
  /** Optional per-cell quality, 0-1, used to step the fill. */
  quality?: number[];
}

export const PresenceRibbon = ({
  rows,
  unitLabel,
  title,
  caption,
}: {
  rows: RibbonRow[];
  /** What one cell represents, for the tooltip and the caption. */
  unitLabel: string;
  title: string;
  caption?: string;
}) => {
  const units = rows[0]?.cells.length ?? 0;
  return (
    <Figure
      title={title}
      caption={caption}
      table={rows.map((r) => [
        r.label,
        `${r.cells.filter(Boolean).length} of ${r.cells.length} ${unitLabel}s`,
      ])}
    >
      <div className="space-y-1.5">
        {rows.map((r) => (
          <div key={r.label} className="grid grid-cols-[9rem_1fr_auto] gap-3 items-center">
            <span className="text-sm truncate" style={{ color: INK.primary }}>
              {r.label}
            </span>
            <div className="flex gap-[2px] h-4">
              {r.cells.map((present, i) => (
                <div
                  key={i}
                  className="flex-1 rounded-[2px] min-w-[2px]"
                  title={`${r.label}, ${unitLabel} ${i + 1}: ${present ? 'present' : 'absent'}`}
                  style={{
                    background: present
                      ? ordinalStep(r.quality?.[i] ?? 1)
                      : INK.track,
                  }}
                />
              ))}
            </div>
            <span className="text-sm tabular-nums w-14 text-right" style={{ color: INK.secondary }}>
              {r.cells.filter(Boolean).length}/{r.cells.length}
            </span>
          </div>
        ))}
      </div>
      <p className="mt-2 text-xs" style={{ color: INK.muted }}>
        {units} {unitLabel}s across the window. Darker cells were coded from
        higher-quality frames.
      </p>
    </Figure>
  );
};

// ---------------------------------------------------------------------------
// Trend: one small multiple per instrument
// ---------------------------------------------------------------------------

export interface TrendPoint {
  t: string;
  value: number;
  severity?: Severity;
  label?: string;
}

export interface TrendSeries {
  instrument: string;
  min: number;
  max: number;
  points: TrendPoint[];
  /** Threshold lines worth drawing, such as an escalation cut-off. */
  thresholds?: { at: number; label: string }[];
  /**
   * What one point is. Defaults to "assessment", which is wrong for a series of
   * readings taken off photographs, and calling those assessments in the caption
   * is exactly the conflation the rest of the interface works to prevent.
   */
  unitNoun?: string;
}

/**
 * Instruments are faceted rather than plotted together, deliberately.
 *
 * N-PASS runs 0 to 13 and COMFORTneo 6 to 30. Putting both on one axis would
 * either need two scales, which is the single worst thing a chart can do, or
 * silently imply that a 14 means the same on each. One small multiple per
 * instrument, each on its own axis, says what is actually true.
 */
export const TrendSmallMultiples = ({ series }: { series: TrendSeries[] }) => (
  <div className="space-y-8">
    {series.map((s) => {
      const span = Math.max(1, s.max - s.min);
      /** Position as a percentage of the plot box, so text can stay in HTML. */
      /**
       * Markers are inset from both edges. Flush to the edge, the first and last
       * points and their value labels overlapped whatever else sat there.
       */
      const inset = 4;
      const left = (i: number) =>
        s.points.length === 1
          ? 50
          : inset + (i / (s.points.length - 1)) * (100 - inset * 2);
      const top = (v: number) => (1 - (v - s.min) / span) * 100;

      return (
        <Figure
          key={s.instrument}
          title={s.instrument}
          caption={`Plotted across the full range, ${s.min} to ${s.max}, so a value is shown against what the measure can express rather than against the other values. ${s.points.length} ${s.unitNoun ?? 'assessment'}${s.points.length === 1 ? '' : 's'} this session.`}
          table={s.points.map((p) => [
            `${p.t}${p.label ? ` — ${p.label}` : ''}`,
            String(p.value),
          ])}
        >
          <div className="flex gap-2">
            {/* Axis ticks in HTML, so they never scale with the plot. */}
            <div
              className="flex flex-col justify-between text-[10px] tabular-nums py-1 w-8 text-right shrink-0"
              style={{ color: INK.muted }}
            >
              <span>{s.max}</span>
              <span>{s.min}</span>
            </div>

            <div className="relative flex-1 h-32 py-4">
              <div className="absolute inset-y-4 inset-x-0">
                {/*
                  Only the connecting line lives in SVG, where stretching is
                  harmless. Markers and every piece of text are HTML, because a
                  stretched viewBox turns circles into ellipses and magnifies
                  type by whatever the container width happens to be.
                */}
                <svg
                  viewBox="0 0 100 100"
                  preserveAspectRatio="none"
                  className="absolute inset-0 w-full h-full overflow-visible"
                  role="img"
                  aria-label={`${s.instrument} over this session`}
                >
                  {s.thresholds?.map((t) => (
                    <line
                      key={t.label}
                      x1={0}
                      x2={100}
                      y1={top(t.at)}
                      y2={top(t.at)}
                      stroke={INK.baseline}
                      strokeWidth={1}
                      strokeDasharray="4 3"
                      vectorEffect="non-scaling-stroke"
                    />
                  ))}
                  {s.points.length > 1 && (
                    <polyline
                      fill="none"
                      stroke={SERIES}
                      strokeWidth={2}
                      strokeLinejoin="round"
                      strokeLinecap="round"
                      vectorEffect="non-scaling-stroke"
                      points={s.points.map((p, i) => `${left(i)},${top(p.value)}`).join(' ')}
                    />
                  )}
                </svg>

                {s.points.map((p, i) => (
                  <div
                    key={i}
                    className="absolute -translate-x-1/2 -translate-y-1/2"
                    style={{ left: `${left(i)}%`, top: `${top(p.value)}%` }}
                    title={`${p.t}: ${p.value}${p.label ? ` (${p.label})` : ''}`}
                  >
                    <span
                      className="block w-[9px] h-[9px] rounded-full"
                      style={{
                        background: STATUS[severityStatus(p.severity)],
                        boxShadow: `0 0 0 2px ${INK.surface}`,
                      }}
                    />
                    {/* First and last only. A number on every point is noise. */}
                    {(i === 0 || i === s.points.length - 1) && (
                      <span
                        className="absolute left-1/2 -translate-x-1/2 bottom-full mb-1.5 text-xs font-semibold tabular-nums"
                        style={{ color: INK.primary }}
                      >
                        {p.value}
                      </span>
                    )}
                  </div>
                ))}
              </div>

              <div
                className="absolute inset-x-0 bottom-0 border-t"
                style={{ borderColor: INK.grid }}
              />
            </div>
          </div>

          <div className="flex justify-between text-[11px] mt-1 pl-10" style={{ color: INK.muted }}>
            <span>{s.points[0]?.t}</span>
            <span>{s.points.at(-1)?.t}</span>
          </div>

          {/*
            The marker colour carries the band, so the band has to be readable
            without seeing colour. Every status present in this series is named
            here as a chip with an icon and a word, and the table view carries the
            interpretation text for each point.
          */}
          {(() => {
            const present: { status: keyof typeof STATUS; text: string }[] = [];
            for (const p of s.points) {
              const status = severityStatus(p.severity);
              const text = p.label ?? status;
              if (!present.some((x) => x.status === status)) present.push({ status, text });
            }
            return present.length > 1 ? (
              <div className="flex flex-wrap items-center gap-2 mt-2 pl-10">
                <span className="text-[11px]" style={{ color: INK.muted }}>
                  markers:
                </span>
                {present.map((x) => (
                  <StatusChip key={x.status} status={x.status} text={x.text} />
                ))}
              </div>
            ) : null;
          })()}

          {/*
            Thresholds are named below the plot rather than beside their lines.
            In the plot they sat exactly where a score of that value sits, so a
            label and the data point it described occupied the same pixels.
          */}
          {s.thresholds && s.thresholds.length > 0 && (
            <p className="text-[11px] mt-2 pl-10 flex flex-wrap gap-x-4" style={{ color: INK.muted }}>
              <span className="inline-flex items-center gap-1.5">
                <span
                  className="inline-block w-5 border-t border-dashed align-middle"
                  style={{ borderColor: INK.baseline }}
                />
                dashed lines:
              </span>
              {s.thresholds.map((t) => (
                <span key={t.label}>
                  {t.at} = {t.label.toLowerCase()}
                </span>
              ))}
            </p>
          )}
        </Figure>
      );
    })}
  </div>
);

// ---------------------------------------------------------------------------
// Status chip: colour never carries meaning alone
// ---------------------------------------------------------------------------

const STATUS_ICON = {
  good: CheckCircle2,
  warning: CircleAlert,
  serious: AlertTriangle,
  critical: ShieldAlert,
} as const;

export const StatusChip = ({
  status,
  text,
}: {
  status: keyof typeof STATUS;
  text: string;
}) => {
  const Icon = STATUS_ICON[status];
  return (
    <span
      className="inline-flex items-center gap-1 text-[11px] font-medium px-1.5 py-0.5 rounded-full border whitespace-nowrap"
      style={{ borderColor: STATUS[status], color: INK.secondary }}
    >
      <Icon className="w-3 h-3" style={{ color: STATUS[status] }} />
      {text}
    </span>
  );
};

// ---------------------------------------------------------------------------
// Hero figure: one number that is the headline
// ---------------------------------------------------------------------------

export const HeroScore = ({
  value,
  scale,
  label,
  severity,
  severityLabel,
}: {
  value: number | string;
  scale?: string;
  label: string;
  severity?: Severity;
  severityLabel?: string;
}) => (
  <div className="flex items-baseline gap-3 flex-wrap">
    <div>
      <p className="text-[11px] uppercase tracking-wide font-semibold" style={{ color: INK.muted }}>
        {label}
      </p>
      <p className="leading-none mt-1">
        <span className="text-4xl font-bold" style={{ color: INK.primary }}>
          {value}
        </span>
        {scale && (
          <span className="text-lg ml-1" style={{ color: INK.muted }}>
            /{scale}
          </span>
        )}
      </p>
    </div>
    {severityLabel && <StatusChip status={severityStatus(severity)} text={severityLabel} />}
  </div>
);
