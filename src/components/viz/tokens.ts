/**
 * Chart tokens.
 *
 * Every value here was run through the palette validator against this
 * application's actual surface, which is white rather than the reference
 * off-white, because contrast results only mean anything against the surface a
 * chart really renders on.
 *
 * The ordinal ramp passes all four ordinal checks in both modes: monotone
 * lightness, adjacent gaps at or above 0.06, light end clear of the surface, and
 * a single hue. Two intermediate blue steps were dropped from the reference ramp
 * to get there, because adjacent steps 0.048 apart do not read as different.
 *
 * Status colours never fill a mark. They appear on chips beside an icon and a
 * word, which is the documented mitigation for warning and serious sitting below
 * 3:1 on a light surface and only 13.6 apart from each other. Severity is a
 * state; magnitude is a magnitude; they get different channels.
 */

/** Single hue for magnitude. Bars, fills, anything continuous. */
export const SERIES = '#2a78d6';

/**
 * Ordinal steps, light to dark, for binned magnitude such as a presence ribbon.
 * Validated at 4 steps; do not insert more without re-running the validator.
 */
export const ORDINAL = ['#86b6ef', '#3987e5', '#256abf', '#104281'] as const;

/** Chart chrome. Recessive by design: the data is the only thing with weight. */
export const INK = {
  primary: '#0b0b0b',
  secondary: '#52514e',
  muted: '#898781',
  grid: '#e1e0d9',
  baseline: '#c3c2b7',
  surface: '#ffffff',
  track: '#f1f0ec',
} as const;

/** Reserved for state, always with an icon and a word alongside. */
export const STATUS = {
  good: '#0ca30c',
  warning: '#fab219',
  serious: '#ec835a',
  critical: '#d03b3b',
} as const;

export type Severity =
  | 'none'
  | 'mild'
  | 'moderate'
  | 'severe'
  | 'oversedated'
  | 'undersedated';

export const severityStatus = (s: Severity | undefined): keyof typeof STATUS => {
  switch (s) {
    case 'severe':
    case 'oversedated':
      return 'critical';
    case 'moderate':
      return 'serious';
    case 'mild':
    case 'undersedated':
      return 'warning';
    default:
      return 'good';
  }
};

/** Bin a 0-1 value onto the ordinal ramp. */
export const ordinalStep = (value: number): string => {
  const v = Math.max(0, Math.min(1, value));
  if (v < 0.25) return ORDINAL[0];
  if (v < 0.5) return ORDINAL[1];
  if (v < 0.75) return ORDINAL[2];
  return ORDINAL[3];
};
