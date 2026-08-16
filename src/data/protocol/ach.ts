/**
 * Alberta Children's Hospital NICU post-operative analgesia and opioid weaning
 * protocol, expressed as versioned configuration.
 *
 * Every value here was carried across from the original PainWise NICU
 * `constants.ts` and `services/calculatorService.ts`. Nothing was invented. Where
 * a value looked questionable on review it was kept as-is and annotated in
 * `REVIEW_FLAGS` below, so the protocol owner decides, not the code.
 *
 * Changing a value here changes the whole application. Bump `version` and add a
 * changelog line whenever you do; the version is stamped into every assessment
 * and every export, so a chart entry can always be traced to the rules in force.
 */

export interface ProtocolVersion {
  id: string;
  version: string;
  effectiveDate: string;
  owner: string;
  changelog: { version: string; date: string; note: string }[];
}

export const PROTOCOL_VERSION: ProtocolVersion = {
  id: 'ACH-NICU-POSTOP-OPIOID',
  version: '2.1.0-draft',
  effectiveDate: '2025-02-01',
  owner: 'Section of Newborn Critical Care, Alberta Children\'s Hospital',
  changelog: [
    { version: '1.0.0', date: '2025-02-01', note: 'Original protocol as encoded in PainWise NICU, PDSA cycle 2.' },
    {
      version: '2.1.0-draft',
      date: '2026-08-16',
      note: 'Merged DeepRelief AI. Cloud vision assessor added as an optional, local-only second opinion that scores the COMFORT facial tension item and fails closed. PDF session report added. See docs/AUDIT-deeprelief.md.',
    },
    {
      version: '2.0.0-draft',
      date: new Date().toISOString().slice(0, 10),
      note: 'Externalised to configuration; added dose ceilings, input guards, gestational-age correction for N-PASS, item-level WAT-1, audit trail. Clinical values unchanged pending protocol owner review of REVIEW_FLAGS.',
    },
  ],
};

// ---------------------------------------------------------------------------
// Eligibility
// ---------------------------------------------------------------------------

export const ELIGIBILITY = {
  /** Exposure beyond this many days takes the infant off the standard pathway. */
  maxOpioidExposureDays: 10,
  /** Absolute exclusions from the standard pathway. */
  exclusions: [
    {
      key: 'neuromuscular_blockade',
      label: 'Neuromuscular blockade',
      reason:
        'Behavioural pain scales cannot express pain under paralysis. Scores are uninterpretable and must not drive dosing.',
    },
    {
      key: 'hepatic_dysfunction',
      label: 'Hepatic dysfunction',
      reason:
        'Alters opioid and acetaminophen clearance. Requires individualised dosing rather than protocol defaults.',
    },
  ],
} as const;

export const MINOR_SURGERIES = [
  'inguinal hernia repair',
  'reservoir insertion',
  'minor exploratory',
  'puv repair',
  'circumcision',
  'umbilical hernia repair',
  'minor skin lesion',
  'central line insertion',
  'chest tube insertion',
] as const;

export const MAJOR_SURGERIES = [
  { value: 'tracheoesophageal fistula', label: 'Tracheoesophageal fistula (TEF)' },
  { value: 'bowel obstruction', label: 'Bowel obstruction' },
  { value: 'gastroschisis', label: 'Gastroschisis' },
  { value: 'congenital diaphragmatic hernia', label: 'Congenital diaphragmatic hernia (CDH)' },
  { value: 'imperforate anus', label: 'Imperforate anus' },
  { value: 'necrotizing enterocolitis', label: 'Necrotising enterocolitis (NEC)' },
  { value: 'other major abdominal', label: 'Other major abdominal surgery' },
] as const;

// ---------------------------------------------------------------------------
// Initial post-operative orders
// ---------------------------------------------------------------------------

export const POSTOP_DOSING = {
  fentanyl: {
    infusionMcgPerKgPerHour: 2,
    bolusMcgPerKg: 1,
    bolusInterval: 'q3h PRN',
    /**
     * Hard ceilings. Any computed dose above these blocks display and demands
     * re-entry. Set to bind at roughly 6 kg, above any infant this protocol
     * serves but well inside the accepted weight range, so the ceiling actually
     * catches a mistyped weight or an edited rate rather than sitting unreachable
     * behind the weight bound.
     */
    maxInfusionMcgPerHour: 12,
    maxBolusMcg: 6,
  },
  acetaminophen: {
    /** IV loading regimen by postmenstrual age, mg/kg q6h for the first 72 hours. */
    ivByPma: [
      { maxPma: 32, mgPerKg: 7.5, maxDailyMgPerKg: 30 },
      { maxPma: 37, mgPerKg: 10, maxDailyMgPerKg: 40 },
      { maxPma: Infinity, mgPerKg: 15, maxDailyMgPerKg: 60 },
    ],
    ivDurationHours: 72,
    oralMgPerKgRange: [10, 15] as [number, number],
    oralDurationHours: 48,
    oralInterval: 'q6h',
  },
  /** Stop dexmedetomidine if it was started pre-operatively. */
  stopPreopDexmedetomidine: true,
  noWeaningFirstHours: 24,
} as const;

// ---------------------------------------------------------------------------
// Assessment schedule
// ---------------------------------------------------------------------------

export const ASSESSMENT_SCHEDULE = {
  painScale: 'N_PASS' as const,
  intensiveIntervalHours: 3,
  intensiveDurationHours: 48,
  maintenanceIntervalHours: 6,
  wat1: {
    /** WAT-1 begins when cumulative opioid exposure exceeds this many days. */
    triggerExposureDays: 5,
    intervalHours: 12,
    clockTimes: ['08:00', '20:00'],
    continueHoursAfterOpioidStopped: 72,
  },
  reassessAfterInterventionMinutes: [30, 60] as [number, number],
  reassessAfterPrnMinutes: 60,
} as const;

// ---------------------------------------------------------------------------
// Escalation thresholds
// ---------------------------------------------------------------------------

export const ESCALATION = {
  /**
   * Applied to the GESTATIONAL-AGE-CORRECTED N-PASS pain score.
   *
   * The original tool applied these to the raw score and capped input at 10. For
   * an infant under 28 weeks the correction is +3, so a raw 4 is a corrected 7:
   * the same infant crossed from "complete the checklist" to "bolus" once the
   * correction is applied. This is the single highest-impact change in v2.
   */
  npassChecklistThreshold: 4,
  npassBolusThreshold: 7,
  wat1ChecklistThreshold: 3,
  wat1BolusThreshold: 6,
  pauseWeanHours: [12, 24] as [number, number],
} as const;

// ---------------------------------------------------------------------------
// Weaning
// ---------------------------------------------------------------------------

export interface WeanRule {
  label: string;
  minExposureDays: number;
  maxExposureDays: number;
  reductionPercent: number;
  intervalHours: number;
  frequencyLabel: string;
  wat1Required: boolean;
  withinStandardPathway: boolean;
}

export const WEAN_RULES: WeanRule[] = [
  {
    label: 'Fast wean (5 days exposure or less)',
    minExposureDays: 0,
    maxExposureDays: 5,
    reductionPercent: 25,
    intervalHours: 12,
    frequencyLabel: 'q12h',
    wat1Required: false,
    withinStandardPathway: true,
  },
  {
    label: 'Standard wean (6 to 10 days exposure)',
    minExposureDays: 6,
    maxExposureDays: 10,
    reductionPercent: 20,
    intervalHours: 24,
    frequencyLabel: 'q24h',
    wat1Required: true,
    withinStandardPathway: true,
  },
  {
    label: 'Slow wean (11 days exposure or more)',
    minExposureDays: 11,
    maxExposureDays: Infinity,
    reductionPercent: 10,
    intervalHours: 24,
    frequencyLabel: 'q24h',
    wat1Required: true,
    /**
     * Reachable in v1 only as dead code: eligibility capped exposure at 10 days,
     * so this branch could never be displayed through the guided flow. It is kept
     * because the clinical situation is real; the app now shows it explicitly as
     * off-pathway guidance requiring pain service input.
     */
    withinStandardPathway: false,
  },
];

// ---------------------------------------------------------------------------
// Opioid conversion
// ---------------------------------------------------------------------------

export interface OpioidConversionConfig {
  ivHydromorphoneToIvMorphine: number;
  ivFentanylToIvMorphine: number;
  ivMorphineToOralMorphine: number;
  oralHydromorphoneToOralMorphine: number;
  incompleteCrossToleranceReduction: number;
  prnFractionOfTotalDailyDose: number;
  methadone: { initialMgPerKgPerDose: number; frequency: string };
}

export const OPIOID_CONVERSION: OpioidConversionConfig = {
  /** 1 mg IV hydromorphone is equivalent to this many mg IV morphine. */
  ivHydromorphoneToIvMorphine: 5,
  /** 1 mcg IV fentanyl is equivalent to this many mcg IV morphine. */
  ivFentanylToIvMorphine: 50,
  /** 1 mg IV morphine is equivalent to this many mg oral morphine. */
  ivMorphineToOralMorphine: 2,
  /** 1 mg oral hydromorphone is equivalent to this many mg oral morphine. */
  oralHydromorphoneToOralMorphine: 5,
  /**
   * Reduction applied on rotation between opioids to account for incomplete
   * cross-tolerance. v1 applied none. The app now displays both the unreduced
   * figure (v1 behaviour) and the reduced figure, and will not pick for you.
   */
  incompleteCrossToleranceReduction: 0.25,
  /** PRN breakthrough dose as a fraction of the total daily dose. */
  prnFractionOfTotalDailyDose: 0.1,
  methadone: {
    initialMgPerKgPerDose: 0.1,
    frequency: 'q4h initially',
  },
};

// ---------------------------------------------------------------------------
// Open questions for the protocol owner
// ---------------------------------------------------------------------------

export interface ReviewFlag {
  id: string;
  severity: 'high' | 'medium';
  where: string;
  finding: string;
  question: string;
}

/**
 * Surfaced in the app's Protocol Review panel. These are decisions for the
 * protocol owner, not defects the code should quietly correct.
 */
export const REVIEW_FLAGS: ReviewFlag[] = [
  {
    id: 'prn-dose-conflict',
    severity: 'high',
    where: 'Opioid converter vs post-operative orders',
    finding:
      'Post-operative orders specify fentanyl 1 mcg/kg q3h PRN. The converter derives a PRN dose as 10% of the total daily dose, which on a 2 mcg/kg/h infusion is about 4.8 mcg/kg, roughly five times larger. Both figures are presented to the same clinician in the same tool.',
    question:
      'Which rule governs breakthrough dosing in this protocol, and should the converter be constrained by the protocol bolus ceiling?',
  },
  {
    id: 'fentanyl-equianalgesic-ratio',
    severity: 'high',
    where: 'OPIOID_CONVERSION.ivFentanylToIvMorphine',
    finding:
      'The tool uses 1 mcg IV fentanyl = 50 mcg IV morphine. Commonly published paediatric equianalgesic tables use 1 mcg fentanyl = 100 mcg (0.1 mg) morphine. At 50, a fentanyl-to-morphine rotation produces roughly half the morphine a 100 ratio would.',
    question:
      'Is 50 an intentional conservative local value, or should it be 100? Record the source table either way.',
  },
  {
    id: 'incomplete-cross-tolerance',
    severity: 'high',
    where: 'Opioid converter',
    finding:
      'No reduction was applied when rotating between opioids. Standard practice reduces the calculated equianalgesic dose by 25 to 50 percent because cross-tolerance is incomplete.',
    question: 'Should the converter apply a reduction by default, and at what percentage?',
  },
  {
    id: 'hepatic-flag-unused-for-acetaminophen',
    severity: 'high',
    where: 'Eligibility and acetaminophen dosing',
    finding:
      'Hepatic dysfunction is collected and used only to exclude the infant from the pathway. It does not modify or warn on acetaminophen dosing, which is the drug it most directly affects.',
    question:
      'Should acetaminophen be contraindicated, dose-reduced, or duration-limited when hepatic dysfunction is recorded?',
  },
  {
    id: 'npass-uncorrected',
    severity: 'high',
    where: 'Escalation thresholds',
    finding:
      'v1 applied escalation thresholds to a raw N-PASS score and capped entry at 10, so the prematurity correction could not be entered. The most preterm infants were the ones most likely to be under-escalated.',
    question:
      'Confirm that escalation thresholds of 4 and 7 are intended to apply to the corrected score, as v2 now assumes.',
  },
  {
    id: 'exposure-day-counter',
    severity: 'medium',
    where: 'Opioid exposure days',
    finding:
      'Exposure days is a static entry. It does not advance with time, so an infant entered on day 4 stays on the fast-wean rule indefinitely and never triggers WAT-1 at day 6.',
    question: 'Should exposure days be derived from an opioid start date rather than typed?',
  },
  {
    id: 'minor-surgery-substring-match',
    severity: 'medium',
    where: 'isMinorSurgery',
    finding:
      'Minor-versus-major classification used case-insensitive substring matching on free text. Any future label containing a minor-surgery substring silently downgrades the pathway, and a free-text entry that matches nothing defaults to the standard pathway without warning.',
    question:
      'Confirm the surgery list is exhaustive, and that unrecognised free text should default to the full protocol rather than prompting.',
  },
  {
    id: 'oral-conversion-units',
    severity: 'high',
    where: 'calculateOpioidConversion, oral arm',
    finding:
      'The v1 source comments debate whether existing oral doses are entered in mg or mcg and reach no conclusion, while the code multiplies by 1000. A unit mismatch here is a thousand-fold dosing error.',
    question:
      'v2 requires an explicit unit on every oral input and rejects ambiguous entry. Confirm the intended input unit for the chart.',
  },
];
