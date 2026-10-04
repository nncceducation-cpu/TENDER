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

/**
 * Source document: "Alberta Children's Hospital NICU — Acute Post-Operative Pain
 * Management & Opioid Weaning Pathway", 24 February 2025.
 *
 * Every value below was checked against that pathway on 16 August 2026. Where the
 * pathway is silent, the value carried over from the PainWise NICU source and is
 * marked as such.
 */
export const PROTOCOL_VERSION: ProtocolVersion = {
  id: 'ACH-NICU-POSTOP-OPIOID',
  version: '2.8.2',
  effectiveDate: '2025-02-24',
  owner: 'Section of Newborn Critical Care, Alberta Children\'s Hospital',
  changelog: [
    { version: '2.8.2', date: '2026-10-03', note: 'Removes automatic geometry-derived COMFORT scores, weighted tension percentages and scored overlays from photograph analysis. Preserves technical measurements, calibrated NFCS coding and clinician-confirmed facial items. Technical quality is explicitly not pain confidence. Medication rules unchanged.' },
    { version: '2.8.1', date: '2026-10-03', note: 'Adds an explicit one-image scoring option without a baseline. Reports only the existing experimental COMFORT facial tension estimate, with warnings at selection, result and application. Requires manual acceptance of the item. Does not create a complete pain score or NFCS epoch, and retains quality, multiple-face and stability rejection. Also withholds baseline-free facial levels when eyelid closure is the only geometric signal, preventing closed eyes alone from scoring high tension. Caps eyelid contribution by independent regional evidence and allows clinician-confirmed relaxed facial muscles at 1/5 with manual provenance. Adds the PIPP-R/BIIP comparison and explicitly documents the missing BIIP calculator. Reference bands and medication rules are unchanged.' },
    { version: '2.8.0', date: '2026-10-03', note: 'Expanded public-media robustness release. Detects and rejects multiple faces, preserves other images around corrupt inputs, withholds facial levels when resampling or reflection cannot reproduce them, keeps detector timestamps increasing across repeated clips, and permits cancelling stalled video seeks. Duplicate filenames retain their own image overlays. Public media sources and reproducible bench tools are documented separately from clinical validation. Also withholds baseline-free facial levels when eyelid closure is the only geometric signal, preventing closed eyes alone from scoring high tension. Caps eyelid contribution by independent regional evidence and allows clinician-confirmed relaxed facial muscles at 1/5 with manual provenance. Adds the PIPP-R/BIIP comparison and explicitly documents the missing BIIP calculator. Reference bands and medication rules are unchanged.' },
    { version: '2.7.0', date: '2026-10-03', note: 'Research software release after exhaustive legal-score enumeration, synthetic stress matrices and real-model public-photo robustness checks. Rejects malformed/nonfinite measurements, confines facial summaries to the requested time window, preserves withdrawal escalation with invalid pain scores, rejects higher-order cry pitch aliases, reports every rejected image, and withholds a single-level proposal for unstable facial readings. No clinical thresholds or doses changed. Clinical validation remains outstanding.' },
    {
      version: '2.6.0-draft',
      date: '2026-10-04',
      note: 'Correctness review of the on-device facial, clip and cry layer. The transparent index abstained nowhere: a window in which the face was never usable returned index 0.000, identical to a genuinely settled infant, with no abstention recorded. Both NFCS sums are counts of seconds and were being compared against the instruments\' nominal ranges, so a four-second usable window with all three pain actions present throughout scored 0.400 instead of 1.000. NFCS-P-3 items are no longer filled when the reachable total sits below the published 9 of 30 threshold, because a two-second window could only ever read as subclinical. Cry pitch detection reported a 120 Hz adult voice as 750 Hz, the top of the neonatal band and the maximum pain contribution; out-of-band sources are now declined. faceDetected was the literal true everywhere, including for frames with no landmarks. A photograph the stills module judged unmeasurable could still display a COMFORT level. The frame quality gate never assessed exposure despite saying it did. No clinical threshold, dose or scoring constant changed.',
    },
    {
      version: '2.5.0-draft',
      date: '2026-10-04',
      note: 'Escalation now evaluates the pain and withdrawal arms independently. Previously a missing N-PASS discarded the WAT-1 entirely, so a withdrawal score of 11 of 12 at nine days of exposure reported low urgency and never mentioned withdrawal, while the same score beside a reassuring N-PASS of 0 reported high urgency and a rescue dose. A missing score is now a stated blind spot and the reassuring headline is unreachable while an applicable score is outstanding. Hepatic dysfunction is collected and enforced as the absolute exclusion the protocol already declared but which no field existed to express. Acetaminophen dosing states that it is unmodified under hepatic dysfunction instead of leaving the gap silent, and the Orders screen now renders dosing warnings at all. The oral conversion arm offers the cross-tolerance reduction the IV arm already offered, applied to the rotated dose only. Breakthrough disagreement with the protocol bolus is flagged in both directions. No clinical value changed.',
    },
    { version: '1.0.0', date: '2025-02-01', note: 'Original protocol as encoded in PainWise NICU, PDSA cycle 2.' },
    {
      version: '2.4.0-draft',
      date: '2026-08-16',
      note: 'The multisensorial comfort checklist the pathway names twice and never enumerates now ships, with the mechanism and reported effect size on each measure, and completing it is recorded. Behaviour-blunting measures flag any score taken within 30 minutes. CRIES added for postoperative pain from 32 weeks. Developmental neurophysiology, drug cautions and the outcome evidence added from the unit teaching reference. FANS and BPSN are disclosed as named but not implemented rather than being reproduced from recollection.',
    },
    {
      version: '2.3.0-draft',
      date: '2026-08-16',
      note: 'Second pass over the same pathway document. The 10-day opioid exposure limit is an entry criterion, not a running one, so it no longer ejects an infant who accumulated past it on the protocol. The 11-or-more-day taper is inside the pathway, as the flowchart prints it, and is no longer labelled off-pathway. The middle escalation band now says CONSIDER, matching the document, where it previously said give and pause. Both bands now name the return cadence.',
    },
    {
      version: '2.2.0-draft',
      date: '2026-08-16',
      note: 'Checked line by line against the 24 Feb 2025 pathway document. Added the 24-hour weaning readiness gate and the two-consecutive-elevated-scores rule, both of which the pathway specifies and neither of which was implemented. Effective date corrected to 24 Feb 2025.',
    },
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
  /**
   * Opioid exposure at the moment of post-operative admission, not cumulative
   * exposure thereafter.
   *
   * The pathway's eligibility box reads "neonates admitted to ACH NICU
   * immediately post-operative AND ... 10 days opioid exposure or less". It is a
   * screening question asked once, on arrival from theatre. Exposure then
   * accumulates while the infant is on the protocol, which is why the pathway's
   * own weaning box prints a rule for 11 or more days. Applying this cap to the
   * running total would eject an infant from a pathway they entered legitimately
   * on the day their exposure ticked past ten.
   */
  maxOpioidExposureDaysAtEntry: 10,
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
  /** The IV and oral courses together are a five-day scheduled course. */
  acetaminophenTotalCourseDays: 5,
} as const;

/**
 * The gate between the post-operative period and the start of weaning.
 *
 * The pathway does not start weaning at 24 hours; it assesses at 24 hours and
 * starts weaning only when two conditions hold together. Until they do, the
 * pathway loops back to three-hourly reassessment. The previous implementation
 * had the 24-hour rule and the up-titration flag but never combined them into
 * the gate, so an infant scoring 6 at 24 hours would have been shown a weaning
 * schedule the pathway does not authorise.
 */
export const WEANING_READINESS = {
  /** Measured from return to the unit, which is what the pathway's note says. */
  earliestHoursPostOp: 24,
  /** N-PASS must sit in the lowest band. */
  maxNpass: 3,
  /** And no opioid up-titration within this window. */
  noUptitrationWithinHours: 24,
  recheckIntervalHours: 3,
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
  /**
   * How many consecutive elevated scores, taken 30 to 60 minutes apart, before
   * the wean is paused.
   *
   * The pathway is explicit about this: the middle and upper bands both act
   * immediately, then carry the note "elevated scores q 30-60 min x 2" before the
   * pause step. One elevated score buys a comfort checklist and a rescore; two
   * buy a pause. The previous implementation paused on the first.
   */
  consecutiveElevatedBeforePause: 2,
  /** The middle band considers a pause; the upper band takes one. */
  pauseWeanHoursMidBand: 12,
  pauseWeanHours: [12, 24] as [number, number],
} as const;

// ---------------------------------------------------------------------------
// Weaning
// ---------------------------------------------------------------------------

/**
 * What "original dose" means in the pathway, quoted so it cannot drift.
 *
 * Reductions are a percentage of this, not of the current rate, which is why the
 * infusion reaches zero in a fixed number of steps rather than asymptotically.
 */
export const ORIGINAL_DOSE_DEFINITION =
  'Infusion rate upon return from OR and settled on the ward.';

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
     * Within the pathway, contrary to what v2.2 assumed.
     *
     * The 24 Feb 2025 flowchart prints "11+ days: decrease opioid dose 10% of
     * original dose q24h" inside the standard weaning box, downstream of the
     * eligibility gate. It is reachable for any infant who entered the pathway
     * eligible and stayed on opioid long enough, which is exactly the infant most
     * at risk of iatrogenic withdrawal. Marking it off-pathway added a warning
     * the document does not support and implied the taper needed authorising.
     */
    withinStandardPathway: true,
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
      'This flag previously overstated what the software did. Hepatic dysfunction was declared an absolute exclusion here but was not collected anywhere: PatientContext had no field for it, checkEligibility never tested it, and so every infant screened eligible on that criterion and the exclusion could never fire. It is now collected on the context screen and enforced as the declared exclusion. It still does not modify acetaminophen dosing, which is the drug it most directly affects; the dosing panel now states that the figures are unmodified rather than leaving the gap silent.',
    question:
      'Should acetaminophen be contraindicated, dose-reduced, or duration-limited when hepatic dysfunction is recorded?',
  },
  {
    id: 'npass-uncorrected',
    severity: 'high',
    where: 'Escalation thresholds',
    finding:
      'v1 applied escalation thresholds to a raw N-PASS score and capped entry at 10, so the prematurity correction could not be entered. The most preterm infants were the ones most likely to be under-escalated. Re-reading the 24 Feb 2025 pathway makes the ambiguity sharper rather than resolving it: the printed bands are 0 to 3, 4 to 6 and 7 to 10, and they top out at 10, which is exactly the maximum of an uncorrected N-PASS pain score. With the prematurity correction of up to +3 the maximum is 13, a value the pathway has no band for. The document as written does not appear to contemplate the correction at all.',
    question:
      'Do the bands 0-3, 4-6 and 7-10 apply to the raw score or the gestational-age-corrected score? If corrected, what band covers 11 to 13? v2 applies them to the corrected score and treats anything above 10 as the top band.',
  },
  {
    id: 'acetaminophen-pma-bands',
    severity: 'medium',
    where: 'POSTOP_DOSING.acetaminophen.ivByPma',
    finding:
      'The pathway prints acetaminophen IV 7.5 to 15 mg/kg/dose q6h, dose based on postmenstrual age, and gives no band breakpoints. The three bands in use, under 32 weeks at 7.5 mg/kg, under 37 at 10, and 37 or above at 15, were carried over from the PainWise NICU source and are not in the pathway document. The daily maxima are likewise carried over.',
    question:
      'Confirm the postmenstrual age breakpoints and the daily maxima, or point to the local monograph they should come from.',
  },
  {
    id: 'eye-squeeze-gate',
    severity: 'high',
    where: 'RELAXED_REFERENCE.eyeSqueezeFloor and readSingleImage',
    finding:
      'Three photographs of calm, content infants each scored COMFORT facial tension 3 of 5, because an open mouth was counted as tension at full weight while the eyes were wide open. The module now requires eye squeeze before the mouth counts and caps the level at 2 when the eyes are clearly open, which follows NFCS, where eye squeeze is the discriminating action. That fixed three out of three false positives. It has not been tested against a single photograph of an infant in genuine pain, so the false negative rate is unknown, and the rule is capable of under-calling an infant who is in pain with the eyes open. Measured addition: the cap is also a discontinuity, not a gentle ceiling. Holding the brow fully lowered and the mouth wide open and varying only eye aperture, the reading is level 4 at an aperture of 0.075 of interocular distance and level 2 at 0.080, skipping level 3 entirely across a change of 0.005. Nothing in the output tells a reader that a level 2 sat one five-thousandth of an interocular distance from a level 4.',
    question:
      'Supply photographs of infants during a known noxious event so the false negative side can be measured. Until then, should the single-image route be available for clinical use at all, or restricted to the research protocol?',
  },
  {
    id: 'consecutive-elevated-mixed-instruments',
    severity: 'medium',
    where: 'countConsecutiveElevated',
    finding:
      'Each score is tested against the threshold for its own instrument, so a run of consecutive elevated scores may mix instruments: an elevated N-PASS followed by an elevated WAT-1 counts as two. The count is the same as for two readings of one instrument, but the two instruments measure different things, so a mixed pair reaches the pause step without either pain or withdrawal having been elevated twice in a row. Pausing the wean is the conservative direction, so the behaviour was left as found rather than quietly narrowed.',
    question:
      'Does the pathway\'s "elevated scores q 30-60 min x 2" note count two readings of the same instrument, or any two consecutive elevated scores?',
  },
  {
    id: 'frame-exposure-not-assessed',
    severity: 'medium',
    where: 'assessFrameQuality',
    finding:
      'The frame quality gate measures face size, head pose and frame resolution. It does not measure exposure, and it cannot: it receives the landmark result and the frame dimensions, never the pixels. Both its own doc comment and stillAnalysis described it as rejecting a face "too dark" to measure, which was never true. Measured, a correctly framed frontal face scores 1.00 whatever the lighting. The comments are corrected and the gate now returns a notAssessed list naming the gap rather than implying a complete check. No luminance term was added, because adding one means choosing a threshold and no neonatal data exists here to set one from.',
    question:
      'Should a luminance or contrast term be added to the quality gate, and at what value? Supply photographs and clip frames spanning the lighting actually used at the bedside, including a phototherapy cot and an overnight room, so a threshold can be measured rather than guessed.',
  },
  {
    id: 'nfcs-short-window-items-withheld',
    severity: 'medium',
    where: 'buildSuggestions, NFCS_P3 branch',
    finding:
      'NFCS-P-3 items are counts of seconds, so the reachable total is three times the number of usable seconds. The scale defines a 10-second epoch scored 0 to 30 with a published clinical threshold at 9 of 30. A window with two usable seconds therefore has a ceiling of 6 and cannot reach the threshold however distressed the infant is, yet the items were filled as 2, 2 and 2 at confidence 1.00 and the banding reported "below the published clinical threshold" for a maximal facial response. Items are now withheld, with an abstention naming the ceiling, whenever the reachable total sits below the published threshold. A window of three usable seconds has a ceiling of exactly 9 and is still scored.',
    question:
      'Is withholding the right behaviour, or should a short window be scored and reported as a proportion of its own ceiling instead? The second option keeps a number on the chart but makes it incomparable with a full epoch and with the published threshold.',
  },
  {
    id: 'nfcs7-total-cannot-reach-70',
    severity: 'medium',
    where: 'summariseWindow, nfcs7Sum',
    finding:
      'The 7-action NFCS total is published as 0 to 70 over a 10-second epoch. This implementation cannot reach 70: taut tongue has no signal in a general face landmarker and is listed in UNAVAILABLE_ACTIONS, so six of seven actions are codeable and a fully coded window reaches 60. The type comment claimed the published range and the extractor claimed the partial total "is flagged incomplete whenever it is requested", which was true only in buildSuggestions and not on the data itself. The summary now carries nfcs7AchievableMax, actionsUnavailable and nfcs7Complete so any consumer can see the ceiling, and the ONNX feature vector gained window-independent fraction variants alongside the raw sums.',
    question:
      'Should the 7-action total be offered at all while one action is unsignalled, or restricted to the 3-action constellation which is complete? Reporting a 6-action sum under a 7-action name invites comparison with published cut-offs that assume seven.',
  },
  {
    id: 'unimplemented-instruments',
    severity: 'medium',
    where: 'Instrument library',
    finding:
      'FANS and BPSN are named in the unit teaching reference and are not implemented here. FANS in particular covers the case the facial coding abstains on, which is the face obscured by prongs, tape or prone positioning. Their item definitions were not reproduced because doing so from recollection rather than from the licensed table is the failure mode this codebase exists to avoid.',
    question:
      'Supply the licensed item tables for FANS and BPSN, or confirm the unit does not use them.',
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
