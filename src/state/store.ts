import { create } from 'zustand';
import type {
  Assessment,
  FacialReading,
  PatientContext,
  ScaleId,
  PainConstruct,
  AiEvidence,
} from '../domain/types';
import { AuditLog } from './audit';
import { describeCalibration } from '../ai/nfcsFeatures';
import type { InfantCalibration } from '../ai/nfcsFeatures';
import type { RawFrameRow } from './rawExport';
import { PROTOCOL_VERSION } from '../data/protocol/ach';

export type Screen =
  | 'dashboard'
  | 'context'
  | 'image'
  | 'live'
  | 'assess'
  | 'orders'
  | 'wean'
  | 'converter'
  | 'trend'
  | 'protocol';

export const EMPTY_CONTEXT: PatientContext = {
  localId: '',
  gestationalAgeAtBirth: { weeks: 0, days: 0 },
  postnatalAgeDays: 0,
  weightKg: null,
  ventilation: 'spontaneous',
  modifiers: [],
  postOpDay: null,
  infusions: [],
};

interface AppState {
  screen: Screen;
  clinician: string;
  ctx: PatientContext;
  /** Free-text surgery label; classification happens in the engine. */
  surgeryType: string;
  /** Cumulative opioid exposure to date. Selects the taper rule and WAT-1. */
  opioidExposureDays: number;
  /** Exposure on arrival from theatre. Screening only, asked once. */
  opioidExposureDaysAtEntry: number;
  currentInfusionMcgPerKgPerHour: number | null;
  recentUptitration: boolean;
  /** Hours since return from theatre. Drives the weaning readiness gate. */
  hoursSincePostOp: number | null;
  postmenstrualAgeWeeks: number;

  construct: PainConstruct;
  selectedScale: ScaleId;
  assessments: Assessment[];
  /**
   * Facial tension levels read from images or clip frames. Not assessments, and
   * never totalled with them. See the FacialReading doc comment.
   */
  facialReadings: FacialReading[];
  calibration: InfantCalibration | null;
  latestAiEvidence: AiEvidence | null;
  /**
   * A COMFORT facial tension level offered by the image route, waiting for the
   * scoring screen. Held in the session rather than passed as a prop because the
   * two are now separate screens.
   */
  proposedFacialTension: number | null;
  /**
   * Per-sample rows from the most recent coding run, kept so they can be
   * exported. A summary nobody can recompute is a summary nobody should trust.
   */
  rawFrames: RawFrameRow[];

  audit: AuditLog;

  setScreen: (s: Screen) => void;
  setClinician: (name: string) => void;
  patchContext: (patch: Partial<PatientContext>) => void;
  setField: <K extends keyof AppState>(key: K, value: AppState[K]) => void;
  addAssessment: (a: Assessment) => void;
  addFacialReadings: (r: Omit<FacialReading, 'at' | 'scoredBy'>[]) => void;
  clearFacialReadings: () => void;
  setCalibration: (c: InfantCalibration | null) => void;
  setAiEvidence: (e: AiEvidence | null) => void;
  proposeFacialTension: (level: number | null) => void;
  setRawFrames: (rows: RawFrameRow[]) => void;
  reset: () => void;
  exportSession: () => string;
}

/**
 * Session state lives in memory only.
 *
 * There is no persistence layer here and that is intentional. Persisting the
 * working record would mean writing identifiable infant health information to a
 * shared workstation's browser profile, which is what the previous version did.
 * Continuity across a shift belongs in the chart, so the export function produces
 * a document to paste or attach, and the session itself is disposable.
 */
export const useStore = create<AppState>((set, get) => ({
  screen: 'dashboard',
  clinician: '',
  ctx: { ...EMPTY_CONTEXT },
  surgeryType: '',
  opioidExposureDays: 0,
  opioidExposureDaysAtEntry: 0,
  currentInfusionMcgPerKgPerHour: null,
  recentUptitration: false,
  hoursSincePostOp: null,
  postmenstrualAgeWeeks: 0,

  construct: 'postoperative',
  selectedScale: 'N_PASS',
  assessments: [],
  facialReadings: [],
  calibration: null,
  latestAiEvidence: null,
  proposedFacialTension: null,
  rawFrames: [],

  audit: new AuditLog(),

  setScreen: (screen) => set({ screen }),
  setClinician: (clinician) => set({ clinician }),
  patchContext: (patch) => set((s) => ({ ctx: { ...s.ctx, ...patch } })),
  setField: (key, value) => set({ [key]: value } as never),

  addAssessment: (a) => {
    const { audit, clinician } = get();
    void audit.append(
      clinician || 'unattributed',
      'assessment.recorded',
      `${a.scaleId} total ${a.total}${a.band ? ` (${a.band.label})` : ''}; ` +
        `${a.items.filter((i) => i.source === 'ai_accepted').length} of ${a.items.length} items accepted from model suggestions.`,
    );
    set((s) => ({ assessments: [...s.assessments, a] }));
  },

  addFacialReadings: (rows) => {
    if (rows.length === 0) return;
    const { audit, clinician } = get();
    const at = new Date().toISOString();
    const stamped: FacialReading[] = rows.map((r) => ({
      ...r,
      at,
      scoredBy: clinician || 'unattributed',
    }));
    const uncal = stamped.filter((r) => !r.calibrated).length;
    void audit.append(
      clinician || 'unattributed',
      'facial.read',
      `${stamped.length} facial tension reading(s) recorded, levels ${stamped
        .map((r) => r.facialTension)
        .join(', ')}${uncal > 0 ? `; ${uncal} uncalibrated` : ''}.`,
    );
    set((s) => ({ facialReadings: [...s.facialReadings, ...stamped] }));
  },

  clearFacialReadings: () => set({ facialReadings: [] }),

  setCalibration: (calibration) => {
    const { audit, clinician } = get();
    if (calibration) {
      void audit.append(
        clinician || 'unattributed',
        'ai.calibrated',
        `Facial baseline recorded from ${describeCalibration(calibration)} at k=${calibration.k}.`,
      );
    }
    set({ calibration });
  },

  setAiEvidence: (latestAiEvidence) => set({ latestAiEvidence }),

  proposeFacialTension: (proposedFacialTension) => set({ proposedFacialTension }),

  setRawFrames: (rawFrames) => set({ rawFrames }),

  reset: () =>
    set({
      ctx: { ...EMPTY_CONTEXT },
      surgeryType: '',
      opioidExposureDays: 0,
      opioidExposureDaysAtEntry: 0,
      currentInfusionMcgPerKgPerHour: null,
      recentUptitration: false,
      hoursSincePostOp: null,
      postmenstrualAgeWeeks: 0,
      assessments: [],
      facialReadings: [],
      calibration: null,
      latestAiEvidence: null,
      proposedFacialTension: null,
      rawFrames: [],
      audit: new AuditLog(),
      screen: 'dashboard',
    }),

  exportSession: () => {
    const s = get();
    return JSON.stringify(
      {
        exportedAt: new Date().toISOString(),
        protocol: PROTOCOL_VERSION,
        clinician: s.clinician,
        localId: s.ctx.localId,
        context: s.ctx,
        /**
         * The protocol inputs, not just the scores.
         *
         * Without these the export records that the tool recommended a 10% q24h
         * taper and gives no way to check whether that was the right rule. Anyone
         * re-reading this file later needs the numbers the recommendation was
         * derived from, not only the recommendation.
         */
        protocolInputs: {
          surgeryType: s.surgeryType,
          opioidExposureDays: s.opioidExposureDays,
          opioidExposureDaysAtEntry: s.opioidExposureDaysAtEntry,
          currentInfusionMcgPerKgPerHour: s.currentInfusionMcgPerKgPerHour,
          recentUptitration: s.recentUptitration,
          hoursSincePostOp: s.hoursSincePostOp,
          postmenstrualAgeWeeks: s.postmenstrualAgeWeeks,
        },
        assessments: s.assessments,
        facialReadings: s.facialReadings,
        calibration: s.calibration
          ? {
              createdAt: s.calibration.createdAt,
              source: s.calibration.source,
              k: s.calibration.k,
              baselineSeconds: s.calibration.baselineSeconds,
              baselineSamples: s.calibration.baselineSamples,
            }
          : null,
        audit: s.audit.all(),
        note: 'Contains no name, no medical record number and no date of birth. The local identifier is whatever the unit chose to type.',
      },
      null,
      2,
    );
  },
}));
