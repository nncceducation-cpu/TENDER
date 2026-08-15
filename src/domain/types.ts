/**
 * PainWise NICU - core domain types
 *
 * Design rule: every clinical construct is data, not code. Scales, thresholds and
 * protocol constants live in `src/data`; the engine in `src/engine` is generic and
 * unit-testable against them. Nothing in this file encodes a local policy value.
 */

// ---------------------------------------------------------------------------
// Patient context
// ---------------------------------------------------------------------------

export interface GestationalAge {
  /** Completed weeks at birth. */
  weeks: number;
  /** Additional days (0-6). */
  days: number;
}

export type VentilationStatus =
  | 'spontaneous'
  | 'nasal_cannula'
  | 'nippv_cpap'
  | 'invasive_ventilation'
  | 'hfov';

export type ConsciousnessModifier =
  | 'none'
  | 'therapeutic_hypothermia'
  | 'neuromuscular_blockade'
  | 'encephalopathy'
  | 'deep_sedation';

export interface PatientContext {
  /** De-identified local study/bed identifier. Never an MRN in this tool. */
  localId: string;
  gestationalAgeAtBirth: GestationalAge;
  postnatalAgeDays: number;
  weightKg: number | null;
  ventilation: VentilationStatus;
  modifiers: ConsciousnessModifier[];
  /** Null when the infant has not had surgery. */
  postOpDay: number | null;
  /** Continuous opioid/sedative infusions currently running. */
  infusions: ActiveInfusion[];
}

export interface ActiveInfusion {
  drug: OpioidDrug | SedativeDrug;
  /** mcg/kg/h for fentanyl-family, mg/kg/h for morphine, mg/kg/h for midazolam. */
  rate: number;
  unit: 'mcg/kg/h' | 'mg/kg/h';
  startedAt: string; // ISO
}

export type OpioidDrug = 'morphine' | 'fentanyl' | 'hydromorphone' | 'methadone';
export type SedativeDrug = 'midazolam' | 'dexmedetomidine' | 'lorazepam' | 'phenobarbital';

// ---------------------------------------------------------------------------
// Pain construct
// ---------------------------------------------------------------------------

/**
 * The four constructs neonatal scales actually measure. Conflating them is the
 * single most common measurement error at the bedside, so the tool forces a choice.
 */
export type PainConstruct =
  | 'acute_procedural'
  | 'postoperative'
  | 'prolonged_ongoing'
  | 'sedation_adequacy';

export type ScaleId =
  | 'NIPS'
  | 'PIPP_R'
  | 'N_PASS'
  | 'COMFORTneo'
  | 'EDIN'
  | 'NFCS_P3'
  | 'WAT_1';

// ---------------------------------------------------------------------------
// Scale definition model
// ---------------------------------------------------------------------------

export interface ScaleOption {
  label: string;
  value: number;
  /** Bedside anchor text, shown verbatim to the scorer. */
  anchor?: string;
}

export interface ScaleItem {
  id: string;
  label: string;
  /** Which observation channel produces this item. Drives AI pre-fill eligibility. */
  channel: 'facial' | 'vocal' | 'motor' | 'state' | 'physiologic' | 'context' | 'interaction';
  options: ScaleOption[];
  help?: string;
  /** Item is only scored when the predicate holds (e.g. ventilated vs not). */
  appliesWhen?: (ctx: PatientContext) => boolean;
}

export interface ScaleBand {
  min: number;
  /** Inclusive upper bound; null means open-ended. */
  max: number | null;
  label: string;
  severity: 'none' | 'mild' | 'moderate' | 'severe' | 'oversedated' | 'undersedated';
  action: string;
}

export interface ScaleDefinition {
  id: ScaleId;
  name: string;
  fullName: string;
  constructs: PainConstruct[];
  items: ScaleItem[];
  /** Raw total range before any contextual adjustment. */
  range: { min: number; max: number };
  bands: ScaleBand[];
  /**
   * Optional post-processing: PIPP-R suppresses contextual indicators when the
   * behavioural/physiologic subtotal is zero; N-PASS adds a prematurity correction.
   */
  transform?: (rawByItem: Record<string, number>, ctx: PatientContext) => ScoreTransformResult;
  /** Populations in which the instrument has published validation. */
  validatedIn: string;
  /** Known measurement limits. Displayed, not hidden. */
  caveats: string[];
  observationWindowSeconds: number;
  references: Reference[];
}

export interface ScoreTransformResult {
  total: number;
  /** Human-readable trace of every adjustment applied. Goes into the audit log. */
  workings: string[];
  /** Secondary score for two-dimensional instruments (N-PASS sedation arm). */
  secondary?: { label: string; value: number; band: ScaleBand | null };
}

export interface Reference {
  citation: string;
  pmid?: string;
  doi?: string;
  url?: string;
}

// ---------------------------------------------------------------------------
// Assessment record
// ---------------------------------------------------------------------------

export type ItemSource = 'clinician' | 'ai_suggested' | 'ai_accepted' | 'monitor';

export interface ScoredItem {
  itemId: string;
  value: number;
  source: ItemSource;
  /** Model confidence 0-1 when source is AI-derived. */
  confidence?: number;
}

export interface Assessment {
  id: string;
  scaleId: ScaleId;
  construct: PainConstruct;
  timestamp: string;
  items: ScoredItem[];
  total: number;
  band: ScaleBand | null;
  workings: string[];
  secondary?: { label: string; value: number; band: ScaleBand | null };
  /** Vitals captured alongside, for trending and for PIPP-R deltas. */
  vitals?: VitalsSnapshot;
  aiEvidence?: AiEvidence;
  note?: string;
  scoredBy: string;
}

export interface VitalsSnapshot {
  heartRate?: number;
  baselineHeartRate?: number;
  spo2?: number;
  baselineSpo2?: number;
  respiratoryRate?: number;
  meanBP?: number;
  capturedAt: string;
}

// ---------------------------------------------------------------------------
// AI layer
// ---------------------------------------------------------------------------

/** The seven NFCS facial actions (Grunau & Craig), coded present/absent per second. */
export type NfcsAction =
  | 'brow_bulge'
  | 'eye_squeeze'
  | 'nasolabial_furrow'
  | 'open_lips'
  | 'vertical_mouth_stretch'
  | 'horizontal_mouth_stretch'
  | 'taut_tongue';

export interface NfcsFrame {
  t: number; // ms since capture start
  actions: Record<NfcsAction, boolean>;
  /** Per-action continuous activation before thresholding, for calibration work. */
  activations: Record<NfcsAction, number>;
  faceDetected: boolean;
  /** Face quality gate: 0-1. Low values suppress scoring rather than guess. */
  quality: number;
}

export interface NfcsWindowSummary {
  windowSeconds: number;
  framesScored: number;
  /** Proportion of scored frames in which each action was present (0-1). */
  proportionPresent: Record<NfcsAction, number>;
  /** Sum over seconds, per Grunau/Craig convention: 0-70 for 7 actions over 10 s. */
  nfcs7Sum: number;
  /** Restricted 3-action constellation: 0-30 over 10 s. */
  nfcsP3Sum: number;
  meanQuality: number;
  secondsUsable: number;
}

export interface CryFeatures {
  /** Fundamental frequency of the cry, Hz. High-pitched cry is a pain marker. */
  f0Median: number | null;
  f0Max: number | null;
  /** Proportion of the window with voiced cry activity. */
  cryProportion: number;
  /** Root-mean-square energy, normalised. */
  rmsNormalised: number;
  /** Longest continuous cry bout, seconds. */
  longestBoutSeconds: number;
  usable: boolean;
}

export interface PhysiologicFeatures {
  deltaHeartRate: number | null;
  deltaSpo2: number | null;
  /** Short-window RMSSD proxy if beat-to-beat data is available. */
  rmssd: number | null;
}

export interface AiEvidence {
  modelVersion: string;
  capturedAt: string;
  facial?: NfcsWindowSummary;
  cry?: CryFeatures;
  physiologic?: PhysiologicFeatures;
  /** Suggested item values, keyed by scale item id. Never auto-committed. */
  suggestions: Record<string, { value: number; confidence: number; rationale: string }>;
  /** Overall index. Explicitly labelled research-grade, not a validated score. */
  index: { value: number; confidence: number; calibrated: boolean } | null;
  /** Reasons the model abstained, if it did. */
  abstentions: string[];
}

// ---------------------------------------------------------------------------
// Audit
// ---------------------------------------------------------------------------

export interface AuditEntry {
  at: string;
  actor: string;
  action: string;
  detail: string;
  /** Hash chain over prior entries, so tampering is detectable on export. */
  prevHash: string;
  hash: string;
}
