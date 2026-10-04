export const REVIEW_PROMPT_VERSION = 'visual-review-1';
export const PHOTO_LIMITATION = 'A single photograph cannot confirm that a baby is pain-free or medically well. Breathing, movement, crying, responsiveness, consolability and clinical context require separate assessment.';

export interface VisualFinding {
  assessable: boolean;
  summary: string;
  eyes: 'relaxed' | 'tense' | 'unclear';
  brow: 'relaxed' | 'tense' | 'unclear';
  mouth: 'relaxed' | 'tense' | 'unclear';
  observations: string[];
  facialTension: 1 | 2 | 3 | 4 | 5 | null;
  scoreRationale: string;
  reason: string;
}

export interface VisualResearchRecord {
  id: string;
  sampleId: string;
  imageSha256: string;
  imageBytes: number;
  capturedAt: string;
  status: 'ok' | 'abstained' | 'error';
  modelVersion: string;
  promptVersion: string;
  finding: VisualFinding | null;
  rawResponse: string | null;
  reviewerScore: number | null;
  reviewer: string;
  reviewedAt: string | null;
  error: string | null;
  latencyMs: number;
}

/** Model observations are data, not trusted instructions or a validated diagnosis. */
export function validateVisualFinding(input: unknown): VisualFinding {
  if (!input || typeof input !== 'object') throw new Error('Invalid visual response.');
  const d = input as Record<string, unknown>;
  const text = (key: string) => {
    const value = d[key];
    if (typeof value !== 'string' || value.length > 4000) throw new Error(`Invalid ${key}.`);
    return value;
  };
  if (typeof d.assessable !== 'boolean') throw new Error('Invalid assessability.');
  for (const key of ['eyes', 'brow', 'mouth']) {
    if (!['relaxed', 'tense', 'unclear'].includes(String(d[key]))) throw new Error(`Invalid ${key}.`);
  }
  if (!Array.isArray(d.observations) || d.observations.length > 12 || d.observations.some(v => typeof v !== 'string' || v.length > 2000)) throw new Error('Invalid observations.');
  const score = d.facialTension;
  if (score !== null && (!Number.isInteger(score) || Number(score) < 1 || Number(score) > 5)) throw new Error('Invalid facial item score.');
  if (!d.assessable && score !== null) throw new Error('An unassessable image cannot receive a score.');
  if (score === 1 && ['eyes', 'brow', 'mouth'].some(k => d[k] !== 'relaxed')) throw new Error('A fully relaxed item requires visible relaxation in all facial regions.');
  if (Number(score) >= 3 && ['eyes', 'brow', 'mouth'].every(k => d[k] === 'relaxed')) throw new Error('A tension score contradicts the relaxed observations.');
  if (score !== null && ['eyes', 'brow', 'mouth'].some(k => d[k] === 'unclear')) throw new Error('An unclear facial region requires abstention from a facial score.');
  const result = { ...d, summary: text('summary'), scoreRationale: text('scoreRationale'), reason: text('reason') } as unknown as VisualFinding;
  if (d.assessable && (!result.summary.trim() || (score !== null && !result.scoreRationale.trim()))) throw new Error('Missing visual explanation.');
  if ((!d.assessable || score === null) && !result.reason.trim()) throw new Error('A withheld score requires an explanation.');
  return result;
}

export function visualRecordsToCsv(records: VisualResearchRecord[]): string {
  const cell = (v: unknown) => {
    let s = v === null || v === undefined ? '' : String(v);
    // Prevent spreadsheet formula execution in filenames/model prose/reviewer names.
    if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
    return `"${s.replace(/"/g, '""')}"`;
  };
  const headers = ['record_id', 'sample_id', 'image_sha256', 'image_bytes', 'captured_at', 'status', 'model_version', 'prompt_version', 'model_facial_item', 'eyes', 'brow', 'mouth', 'summary', 'observations_json', 'score_rationale', 'reviewer_facial_item', 'reviewer', 'reviewed_at', 'raw_model_response_json', 'error', 'latency_ms'];
  const rows = records.map(r => [r.id, r.sampleId, r.imageSha256, r.imageBytes, r.capturedAt, r.status, r.modelVersion, r.promptVersion, r.finding?.facialTension, r.finding?.eyes, r.finding?.brow, r.finding?.mouth, r.finding?.summary, r.finding ? JSON.stringify(r.finding.observations) : '', r.finding?.scoreRationale, r.reviewerScore, r.reviewer, r.reviewedAt, r.rawResponse, r.error, r.latencyMs]);
  return [headers, ...rows].map(row => row.map(cell).join(',')).join('\n');
}
