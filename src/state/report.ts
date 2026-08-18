import type { jsPDF } from 'jspdf';
import type {
  Assessment,
  AuditEntry,
  ComfortEvent,
  FacialReading,
  PatientContext,
} from '../domain/types';
import { PROTOCOL_VERSION } from '../data/protocol/ach';
import { SCALES } from '../data/scales';

/**
 * Session report, carried over from DeepRelief's PDF export.
 *
 * The idea was sound: a clinician who has just done an assessment wants
 * something to put in the chart or hand to the next shift. What changed is what
 * goes in it. DeepRelief printed a pain percentage and a model-generated clinical
 * recommendation, which is a machine's treatment advice on hospital letterhead.
 *
 * This prints what was actually measured: which instrument, which items, what
 * each one scored, which items came from a model rather than a person, the
 * protocol version in force, and the workings behind every total. Someone reading
 * it a week later can reconstruct the assessment. No recommendation is printed
 * that a person did not make.
 */

interface ReportInput {
  ctx: PatientContext;
  clinician: string;
  assessments: Assessment[];
  /** Optional: absent in older callers and in the tests. */
  facialReadings?: FacialReading[];
  comfortEvents?: ComfortEvent[];
  audit: readonly AuditEntry[];
}

const SLATE = [51, 65, 85] as const;
const MUTED = [100, 116, 139] as const;
const RULE = [203, 213, 225] as const;

/**
 * jsPDF is imported dynamically. Most sessions never export a report, and there
 * is no reason for a bedside tool to carry a PDF engine in its first paint.
 */
export const buildSessionReport = async (input: ReportInput): Promise<jsPDF> => {
  const { jsPDF: JsPDF } = await import('jspdf');
  const doc = new JsPDF({ unit: 'mm', format: 'a4' });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 15;
  let y = 0;

  const newPage = () => {
    doc.addPage();
    y = M + 5;
  };
  const need = (mm: number) => {
    if (y + mm > H - 20) newPage();
  };
  const rule = () => {
    doc.setDrawColor(...RULE);
    doc.line(M, y, W - M, y);
    y += 5;
  };
  const heading = (text: string) => {
    need(16);
    doc.setTextColor(...SLATE);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.text(text, M, y);
    y += 2;
    rule();
  };
  const body = (text: string, indent = 0) => {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.5);
    doc.setTextColor(...SLATE);
    const lines = doc.splitTextToSize(text, W - M * 2 - indent) as string[];
    for (const line of lines) {
      need(6);
      doc.text(line, M + indent, y);
      y += 4.6;
    }
  };
  const muted = (text: string, indent = 0) => {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(...MUTED);
    const lines = doc.splitTextToSize(text, W - M * 2 - indent) as string[];
    for (const line of lines) {
      need(5);
      doc.text(line, M + indent, y);
      y += 4;
    }
    doc.setTextColor(...SLATE);
  };

  // Banner
  doc.setFillColor(3, 105, 161);
  doc.rect(0, 0, W, 22, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.text('TENDER session report', M, 11);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.text('Pre-release software. Not for patient care without local verification.', M, 17);
  y = 32;

  // Header block
  const ga = `${input.ctx.gestationalAgeAtBirth.weeks}+${input.ctx.gestationalAgeAtBirth.days}`;
  heading('Session');
  body(`Local identifier: ${input.ctx.localId || 'not recorded'}`);
  body(`Gestational age at birth: ${ga} weeks`);
  body(`Postnatal age: ${input.ctx.postnatalAgeDays} days`);
  body(`Weight: ${input.ctx.weightKg !== null ? `${input.ctx.weightKg} kg` : 'not recorded'}`);
  body(`Respiratory support: ${input.ctx.ventilation.replace(/_/g, ' ')}`);
  body(
    `States suppressing behaviour: ${
      input.ctx.modifiers.length ? input.ctx.modifiers.map((m) => m.replace(/_/g, ' ')).join(', ') : 'none recorded'
    }`,
  );
  body(`Assessed by: ${input.clinician || 'unattributed'}`);
  body(`Protocol: ${PROTOCOL_VERSION.id} ${PROTOCOL_VERSION.version}`);
  body(`Report generated: ${new Date().toLocaleString()}`);
  y += 3;

  muted(
    'This report contains no name, no medical record number and no date of birth. The local identifier is whatever was typed at the bedside.',
  );
  y += 4;

  // Assessments
  heading(`Assessments (${input.assessments.length})`);

  if (input.assessments.length === 0) {
    body('No assessments were recorded in this session.');
  }

  for (const a of input.assessments) {
    const scale = SCALES[a.scaleId];
    need(30);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10.5);
    doc.setTextColor(...SLATE);
    doc.text(
      `${scale.name}  —  ${a.total}${a.band ? `  (${a.band.label})` : ''}`,
      M,
      y,
    );
    y += 5;
    muted(`${new Date(a.timestamp).toLocaleString()}  ·  scored by ${a.scoredBy}`);

    if (a.secondary) {
      body(`${a.secondary.label}: ${a.secondary.value}${a.secondary.band ? ` (${a.secondary.band.label})` : ''}`, 3);
    }

    // Item-level detail, which is what makes the number reconstructable.
    for (const item of a.items) {
      const def = scale.items.find((i) => i.id === item.itemId);
      const option = def?.options.find((o) => o.value === item.value);
      const origin =
        item.source === 'ai_accepted'
          ? ' [model-derived, accepted by scorer]'
          : item.source === 'monitor'
            ? ' [from monitor]'
            : '';
      body(`${def?.label ?? item.itemId}: ${option?.label ?? item.value}${origin}`, 3);
    }

    if (a.workings.length) {
      y += 1;
      muted('Working:', 3);
      for (const w of a.workings) muted(`• ${w}`, 6);
    }

    if (a.band) {
      y += 1;
      body(`Action indicated by the instrument: ${a.band.action}`, 3);
    }

    const aiItems = a.items.filter((i) => i.source === 'ai_accepted').length;
    if (aiItems > 0) {
      muted(
        `${aiItems} of ${a.items.length} items on this assessment were proposed by a model and accepted by the scorer.`,
        3,
      );
    }

    y += 5;
  }

  // Instruments used
  const used = [...new Set(input.assessments.map((a) => a.scaleId))];
  if (used.length) {
    heading('Instruments used');
    for (const id of used) {
      const s = SCALES[id];
      need(20);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9.5);
      doc.text(`${s.name} — ${s.fullName}`, M, y);
      y += 4.6;
      muted(`Validated in: ${s.validatedIn}`, 3);
      for (const c of s.caveats) muted(`• ${c}`, 3);
      for (const r of s.references) muted(r.citation, 3);
      y += 3;
    }
  }

  // Comfort measures
  const comfort = input.comfortEvents ?? [];
  if (comfort.length > 0) {
    heading(`Multisensorial comfort measures (${comfort.length})`);
    muted(
      'The pathway asks for the comfort checklist before any pharmacological step in the 4 to 6 band and alongside the dose in the 7 to 10 band. These entries are what was given and when.',
    );
    y += 2;
    for (const c of comfort) {
      need(10);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9.5);
      doc.setTextColor(...SLATE);
      doc.text(`${new Date(c.at).toLocaleTimeString()} — ${c.recordedBy}`, M, y);
      y += 4.6;
      body(c.measures.join(', '), 3);
      if (c.note) muted(c.note, 3);
      if (c.bluntsBehaviour) {
        muted(
          'Includes a measure that lowers behavioural scores without necessarily reducing spinal or cortical nociceptive activity. Read any score taken shortly afterwards in that light.',
          3,
        );
      }
      y += 1.5;
    }
    y += 2;
  }

  // Facial tension readings
  const readings = input.facialReadings ?? [];
  if (readings.length > 0) {
    heading(`Facial tension readings (${readings.length})`);
    muted(
      'Read from images by facial geometry. These are not assessments. No reading below was added to any instrument total, and a reading marked uncalibrated had no settled reference for this infant, so it describes the photograph rather than a change in the infant.',
    );
    y += 2;

    for (const r of readings) {
      need(14);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.setTextColor(...SLATE);
      doc.text(
        r.levelStable
          ? `${r.label}: COMFORT facial tension ${r.facialTension} of 5`
          : `${r.label}: COMFORT facial tension ${Math.min(r.facialTension, r.alternateLevel ?? r.facialTension)} to ${Math.max(r.facialTension, r.alternateLevel ?? r.facialTension)} of 5`,
        M,
        y,
      );
      y += 5;
      body(r.anchor, 3);
      muted(
        `Weighted tension ${(r.overallTension * 100).toFixed(0)}%, frame quality ${r.quality.toFixed(2)}, face box ${
          r.faceBoxPx === null ? 'unknown' : `${Math.round(r.faceBoxPx)} px`
        }, reference ${
          r.calibrated ? 'settled baseline for this infant' : 'NONE (uncalibrated)'
        }${
          r.levelStable ? '' : '. BOUNDARY: re-measured at another scale this face read as the neighbouring level'
        }, read by ${r.scoredBy} at ${new Date(r.at).toLocaleTimeString()}.`,
        3,
      );
      y += 2;
    }
    y += 2;
  }

  // Audit
  heading('Audit trail');
  muted(
    'Each entry hashes the one before it. A modified export is detectable by recomputing the chain.',
  );
  y += 1;
  doc.setFont('courier', 'normal');
  doc.setFontSize(7.5);
  for (const e of input.audit) {
    need(4);
    const line = `${new Date(e.at).toLocaleTimeString()}  ${e.action}  ${e.detail}`;
    const wrapped = doc.splitTextToSize(line, W - M * 2 - 20) as string[];
    for (const l of wrapped) {
      need(4);
      doc.setTextColor(...MUTED);
      doc.text(l, M, y);
      y += 3.4;
    }
    doc.setTextColor(...MUTED);
    doc.text(e.hash.slice(0, 12), W - M - 18, y - 3.4);
  }

  // Footer on every page
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(...MUTED);
    doc.text(
      'Generated by TENDER. Every score and dose must be verified by the responsible clinician.',
      M,
      H - 8,
    );
    doc.text(`${i} of ${pages}`, W - M, H - 8, { align: 'right' });
  }

  return doc;
};
