import { INK, ORDINAL, STATUS, severityStatus, type Severity } from './tokens';

/**
 * Radial gauge.
 *
 * Carried over from the original app's clinical report, where it showed a "92%
 * score" that no instrument produced. The dial is a good piece of interface; the
 * number behind it was the problem. Here it shows weighted facial tension, which
 * is a quantity the geometry actually computes: the mean of the three regional
 * tensions, weighted by how far each measure can be trusted.
 *
 * The arc is drawn in the validated ordinal blue, not in a status colour. A dial
 * that turns red is making a judgement, and the judgement here belongs to the
 * level and its anchor text, which sit beside it with a word and an icon. The
 * value is printed in the middle, so the arc is never the only way to read it.
 */
export const Gauge = ({
  value,
  label,
  caption,
  size = 132,
  severity,
}: {
  /** 0 to 1. */
  value: number;
  /** Printed large in the centre. */
  label: string;
  caption?: string;
  size?: number;
  /** Only used to pick a step on the blue ramp, never to colour it red. */
  severity?: Severity;
}) => {
  const v = Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
  const stroke = 12;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const step =
    severity === 'severe' || severity === 'oversedated'
      ? ORDINAL[3]
      : severity === 'moderate'
        ? ORDINAL[2]
        : severity === 'mild' || severity === 'undersedated'
          ? ORDINAL[1]
          : ORDINAL[0];

  return (
    <div className="flex flex-col items-center">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} role="img" aria-label={`${label}. ${caption ?? ''}`}>
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={INK.track}
            strokeWidth={stroke}
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={step}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={`${c * v} ${c}`}
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
          />
        </svg>
        <div className="absolute inset-0 grid place-items-center">
          <span className="text-2xl font-bold tabular-nums" style={{ color: INK.primary }}>
            {label}
          </span>
        </div>
      </div>
      {caption && (
        <p className="text-xs mt-1.5 text-center" style={{ color: INK.muted }}>
          {caption}
        </p>
      )}
    </div>
  );
};

/**
 * A labelled tile, the shape the original used for severity and confidence.
 *
 * `tone` tints the tile. It is applied only where the tile carries a word that
 * says the same thing, never as the sole signal.
 */
export const ReportTile = ({
  label,
  value,
  detail,
  tone,
}: {
  label: string;
  value: string;
  detail?: string;
  tone?: keyof typeof STATUS;
}) => (
  <div
    className="rounded-xl border p-3.5 flex-1 min-w-0"
    style={{
      borderColor: tone ? `${STATUS[tone]}55` : INK.grid,
      background: tone ? `${STATUS[tone]}12` : INK.surface,
    }}
  >
    <p
      className="text-[10px] font-semibold uppercase tracking-wider"
      style={{ color: INK.muted }}
    >
      {label}
    </p>
    <p
      className="text-xl font-bold leading-tight mt-1"
      style={{ color: tone ? STATUS[tone] : INK.primary }}
    >
      {value}
    </p>
    {detail && (
      <p className="text-xs mt-1 leading-snug" style={{ color: INK.secondary }}>
        {detail}
      </p>
    )}
  </div>
);

export const severityTone = (s: Severity | undefined) => severityStatus(s);

/**
 * A finding chip.
 *
 * The original listed detected NFCS features as flat pills, which reads as a
 * list of facts. Each chip here carries its own state: a coded action that
 * cleared this infant's baseline is not the same claim as a geometric region
 * that looked tense, and `present` distinguishes them.
 */
export const FindingChip = ({
  text,
  present,
  detail,
}: {
  text: string;
  present: boolean;
  detail?: string;
}) => (
  <span
    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs"
    style={{
      borderColor: present ? `${STATUS.serious}66` : INK.grid,
      background: present ? `${STATUS.serious}12` : INK.surface,
      color: INK.primary,
    }}
    title={detail}
  >
    <span
      className="w-1.5 h-1.5 rounded-full shrink-0"
      style={{ background: present ? STATUS.serious : INK.baseline }}
    />
    {text}
  </span>
);
