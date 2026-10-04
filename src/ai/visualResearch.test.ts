import { describe, it, expect } from 'vitest';
import { validateVisualFinding, visualRecordsToCsv, type VisualResearchRecord } from './visualResearch';
const calm = { assessable: true, summary: 'Relaxed.', eyes: 'relaxed', brow: 'relaxed', mouth: 'relaxed', observations: ['Gently closed eyes.'], facialTension: 1, scoreRationale: 'All regions relaxed.', reason: '' };
describe('visual research contracts', () => {
  it('accepts coherent relaxed findings without converting them into absence of pain', () => {
    expect(validateVisualFinding(calm).facialTension).toBe(1);
  });
  it('rejects high tension with all relaxed regions, obscured scoring and missing abstention reasons', () => {
    expect(() => validateVisualFinding({ ...calm, facialTension: 4 })).toThrow();
    expect(() => validateVisualFinding({ ...calm, eyes: 'unclear' })).toThrow();
    expect(() => validateVisualFinding({ ...calm, facialTension: null })).toThrow();
  });
  it('preserves raw response, independent reviewer column and failed records with safe spreadsheet quoting', () => {
    const r: VisualResearchRecord = { id: '1', sampleId: '=danger.jpg', imageSha256: 'abc', imageBytes: 10, capturedAt: 'now', status: 'error', modelVersion: 'unknown', promptVersion: 'v1', finding: null, rawResponse: null, reviewerScore: null, reviewer: '', reviewedAt: null, error: 'Failed, no score', latencyMs: 2 };
    const csv = visualRecordsToCsv([r]);
    expect(csv).toContain("\"'=danger.jpg\"");
    expect(csv).toContain('reviewer_facial_item');
    expect(csv).toContain('raw_model_response_json');
    expect(csv).toContain('"Failed, no score"');
  });
});
