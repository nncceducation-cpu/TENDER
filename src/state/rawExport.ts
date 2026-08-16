import type { Assessment, NfcsAction } from '../domain/types';
import type { GeometryMeasures } from '../ai/faceGeometry';
import { PROTOCOL_VERSION } from '../data/protocol/ach';
import { SCALES } from '../data/scales';

/**
 * Raw data export.
 *
 * The session report is for the chart. This is for the analysis: one row per
 * sample, every number the tool used, with nothing summarised away. It exists
 * because Study 1 in the validation plan needs the per-frame coding to compare
 * against a human coder, and because a figure nobody can recompute is a figure
 * nobody should trust.
 *
 * CSV rather than JSON, deliberately. The people who will do something useful
 * with this open it in R, in Stata or in a spreadsheet, and a flat table is what
 * those want. The JSON session export remains for anything that needs structure.
 */

export interface RawFrameRow {
  /** Where this sample came from: a clip time, a still filename, a live window. */
  source: string;
  sampleId: string;
  /** Milliseconds from the start of the window, or null for unordered stills. */
  tMs: number | null;
  faceFound: boolean;
  quality: number;
  /** Raw, pre-threshold activations. */
  activations: Partial<Record<NfcsAction, number>>;
  /** Post-threshold coding, absent where no reference existed. */
  coded?: Partial<Record<NfcsAction, boolean>>;
  geometry?: GeometryMeasures | null;
  /** Uncalibrated COMFORT facial tension, where one was derived. */
  facialTension?: number | null;
}

const ACTIONS: NfcsAction[] = [
  'brow_bulge',
  'eye_squeeze',
  'nasolabial_furrow',
  'open_lips',
  'vertical_mouth_stretch',
  'horizontal_mouth_stretch',
  'taut_tongue',
];

/** RFC 4180: quote anything containing a comma, a quote or a newline. */
const cell = (v: unknown): string => {
  if (v === null || v === undefined) return '';
  const s = typeof v === 'number' ? (Number.isFinite(v) ? String(v) : '') : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

const toCsv = (headers: string[], rows: unknown[][]): string =>
  [headers, ...rows].map((r) => r.map(cell).join(',')).join('\n');

// ---------------------------------------------------------------------------
// Per-frame coding
// ---------------------------------------------------------------------------

export const framesToCsv = (rows: RawFrameRow[]): string => {
  const headers = [
    'source',
    'sample_id',
    't_ms',
    'face_found',
    'quality',
    ...ACTIONS.map((a) => `activation_${a}`),
    ...ACTIONS.map((a) => `coded_${a}`),
    'geom_eye_aperture',
    'geom_mouth_opening',
    'geom_mouth_width',
    'geom_brow_to_eye',
    'geom_face_proportion',
    'comfort_facial_tension',
  ];

  const body = rows.map((r) => [
    r.source,
    r.sampleId,
    r.tMs,
    r.faceFound ? 1 : 0,
    r.quality,
    ...ACTIONS.map((a) => r.activations[a] ?? ''),
    ...ACTIONS.map((a) => (r.coded ? (r.coded[a] ? 1 : 0) : '')),
    r.geometry?.eyeAperture ?? '',
    r.geometry?.mouthOpening ?? '',
    r.geometry?.mouthWidth ?? '',
    r.geometry?.browToEye ?? '',
    r.geometry?.faceProportion ?? '',
    r.facialTension ?? '',
  ]);

  return toCsv(headers, body);
};

// ---------------------------------------------------------------------------
// Per-item scoring
// ---------------------------------------------------------------------------

/**
 * One row per scored item rather than one per assessment.
 *
 * A total is a derived quantity. Exporting only totals means a reviewer cannot
 * check the arithmetic, cannot see which items a model proposed, and cannot
 * recompute a score under a different rule. Items are the unit of analysis.
 */
export const assessmentsToCsv = (
  assessments: Assessment[],
  context: { localId: string; gaWeeks: number; gaDays: number },
): string => {
  const headers = [
    'local_id',
    'ga_weeks',
    'ga_days',
    'protocol_version',
    'assessment_id',
    'timestamp',
    'instrument',
    'construct',
    'item_id',
    'item_label',
    'item_value',
    'item_option',
    'item_source',
    'item_model_confidence',
    'assessment_total',
    'assessment_band',
    'assessment_severity',
    'secondary_label',
    'secondary_value',
    'scored_by',
  ];

  const body = assessments.flatMap((a) => {
    const scale = SCALES[a.scaleId];
    return a.items.map((item) => {
      const def = scale.items.find((i) => i.id === item.itemId);
      const option = def?.options.find((o) => o.value === item.value);
      return [
        context.localId,
        context.gaWeeks,
        context.gaDays,
        PROTOCOL_VERSION.version,
        a.id,
        a.timestamp,
        a.scaleId,
        a.construct,
        item.itemId,
        def?.label ?? '',
        item.value,
        option?.label ?? '',
        item.source,
        item.confidence ?? '',
        a.total,
        a.band?.label ?? '',
        a.band?.severity ?? '',
        a.secondary?.label ?? '',
        a.secondary?.value ?? '',
        a.scoredBy,
      ];
    });
  });

  return toCsv(headers, body);
};

// ---------------------------------------------------------------------------
// Delivery
// ---------------------------------------------------------------------------

export const downloadText = (filename: string, text: string, mime = 'text/csv') => {
  // A BOM so Excel opens UTF-8 correctly, which it otherwise does not.
  const blob = new Blob([mime.startsWith('text/csv') ? '﻿' : '', text], {
    type: `${mime};charset=utf-8`,
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
};
