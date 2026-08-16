import { create } from 'zustand';
import type {
  Assessment,
  PatientContext,
  ScaleId,
  PainConstruct,
  AiEvidence,
} from '../domain/types';
import { AuditLog } from './audit';
import type { InfantCalibration } from '../ai/nfcsFeatures';
import { PROTOCOL_VERSION } from '../data/protocol/ach';

export type Screen =
  | 'context'
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
  opioidExposureDays: number;
  currentInfusionMcgPerKgPerHour: number | null;
  recentUptitration: boolean;
  postmenstrualAgeWeeks: number;

  construct: PainConstruct;
  selectedScale: ScaleId;
  assessments: Assessment[];
  calibration: InfantCalibration | null;
  latestAiEvidence: AiEvidence | null;

  audit: AuditLog;

  setScreen: (s: Screen) => void;
  setClinician: (name: string) => void;
  patchContext: (patch: Partial<PatientContext>) => void;
  setField: <K extends keyof AppState>(key: K, value: AppState[K]) => void;
  addAssessment: (a: Assessment) => void;
  setCalibration: (c: InfantCalibration | null) => void;
  setAiEvidence: (e: AiEvidence | null) => void;
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
  screen: 'context',
  clinician: '',
  ctx: { ...EMPTY_CONTEXT },
  surgeryType: '',
  opioidExposureDays: 0,
  currentInfusionMcgPerKgPerHour: null,
  recentUptitration: false,
  postmenstrualAgeWeeks: 0,

  construct: 'postoperative',
  selectedScale: 'N_PASS',
  assessments: [],
  calibration: null,
  latestAiEvidence: null,

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

  setCalibration: (calibration) => {
    const { audit, clinician } = get();
    if (calibration) {
      void audit.append(
        clinician || 'unattributed',
        'ai.calibrated',
        `Facial baseline recorded over ${calibration.baselineSeconds.toFixed(0)} s at k=${calibration.k}.`,
      );
    }
    set({ calibration });
  },

  setAiEvidence: (latestAiEvidence) => set({ latestAiEvidence }),

  reset: () =>
    set({
      ctx: { ...EMPTY_CONTEXT },
      surgeryType: '',
      opioidExposureDays: 0,
      currentInfusionMcgPerKgPerHour: null,
      recentUptitration: false,
      postmenstrualAgeWeeks: 0,
      assessments: [],
      calibration: null,
      latestAiEvidence: null,
      audit: new AuditLog(),
      screen: 'context',
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
        assessments: s.assessments,
        calibration: s.calibration
          ? { createdAt: s.calibration.createdAt, k: s.calibration.k, baselineSeconds: s.calibration.baselineSeconds }
          : null,
        audit: s.audit.all(),
        note: 'Contains no name, no medical record number and no date of birth. The local identifier is whatever the unit chose to type.',
      },
      null,
      2,
    );
  },
}));
