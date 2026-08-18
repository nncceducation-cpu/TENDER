/**
 * Developmental neurophysiology, as configuration.
 *
 * Source: "Human Pain: Anatomy and Physiology" (K. Mohammad, Section of Newborn
 * Critical Care, University of Calgary), references verified against PubMed.
 *
 * This is not decoration. It is the evidence base for the two most consequential
 * behaviours in this application. The gestational-age correction on N-PASS exists
 * because excitation is in place from the second trimester while descending
 * inhibition arrives last and is net facilitatory before it matures. The refusal
 * to read a low behavioural score as comfort exists because the behavioural
 * repertoire a scale measures is exactly what immaturity removes.
 */

export interface Milestone {
  age: string;
  /**
   * The START of the range, in weeks. Start rather than midpoint, so the rail
   * stays in the same order as the list and so "reached" means the milestone has
   * begun rather than completed.
   */
  weeks: number;
  event: string;
  /** Why it matters for someone scoring an infant at this age. */
  bedside?: string;
}

export const MILESTONES: Milestone[] = [
  { age: '6 to 7 weeks', weeks: 6, event: 'First sensory nerve fibres and nociceptive CGRP fibres appear in skin.' },
  {
    age: '7 to 8 weeks',
    weeks: 7,
    event: 'Spinal reflex arc functional, withdrawal to touch.',
    bedside: 'Withdrawal needs no cortex. A limb that moves is not evidence of a felt experience, and a limb that does not is not evidence of its absence.',
  },
  { age: '8 to 16 weeks', weeks: 8, event: 'Excitatory transmitters appear in the cord: substance P, CGRP, glutamate.' },
  { age: '19 to 20 weeks', weeks: 19, event: 'Nociceptive neurons abundant, near-adult density of pain fibres.' },
  { age: '20 to 22 weeks', weeks: 20, event: 'Thalamic fibres reach the subplate beneath somatosensory cortex.' },
  {
    age: '23 to 25 weeks',
    weeks: 23,
    event: 'Thalamocortical axons penetrate cortex, so noxious signals can reach cortical level.',
    bedside: 'The lower bound of the population this unit treats sits on this line.',
  },
  {
    age: '28 to 30 weeks',
    weeks: 28,
    event: 'Facial and EEG responses to noxious stimuli emerge, but the cortical response is not yet modality specific.',
    bedside: 'Facial coding starts to carry information here. Below it, expect abstention rather than a low score.',
  },
  {
    age: '34 to 38 weeks',
    weeks: 34,
    event: 'Descending monoaminergic modulators appear: noradrenaline then dopamine. Serotonin postnatally.',
    bedside: 'The brake is still arriving. Before this, descending control is anatomically present but functionally net facilitatory.',
  },
  { age: 'about 35 weeks', weeks: 35, event: 'Nociceptive-specific cortical activity becomes distinguishable from touch.' },
  { age: 'Term, 40 weeks', weeks: 40, event: '18 of 20 adult pain-related brain regions active on fMRI.' },
  {
    age: 'about 48 weeks',
    weeks: 48,
    event: 'Descending modulatory transmitters approach maturity, roughly 8 weeks postnatal.',
    bedside: 'This is the chemistry arriving rather than the brake working. Functional maturity lags the transmitters.',
  },
];

export interface AdultNewbornRow {
  feature: string;
  adult: string;
  newborn: string;
  /** What it changes about interpreting the infant in front of you. */
  consequence: string;
}

export const ADULT_VS_NEWBORN: AdultNewbornRow[] = [
  {
    feature: 'Cutaneous reflex threshold',
    adult: 'High, stimulus specific',
    newborn: 'Low, and lower still at earlier postmenstrual age',
    consequence: 'A response to a stimulus an adult would ignore is expected, not exaggerated.',
  },
  {
    feature: 'Receptive field size',
    adult: 'Small, sharply bounded',
    newborn: 'Large and overlapping',
    consequence: 'Localisation is poor. Do not read the site of a response as the site of the injury.',
  },
  {
    feature: 'Dorsal horn input balance',
    adult: 'Nociceptive-specific and wide dynamic range cells clearly segregated',
    newborn: 'A fibre dominated, less segregation',
    consequence: 'Tactile input can drive nociceptive circuits. Routine handling is not neutral.',
  },
  {
    feature: 'Spinal inhibitory interneurons',
    adult: 'Precisely targeted GABA and glycine control',
    newborn: 'Present but diffusely targeted',
    consequence: 'Inhibition is blunt. Precision develops postnatally.',
  },
  {
    feature: 'Descending brainstem control',
    adult: 'Bidirectional, inhibition available',
    newborn: 'Anatomically present, functionally net facilitatory in early life',
    consequence: 'The brake can push. This is the core reason the preterm infant is not a small adult here.',
  },
  {
    feature: 'Reflex behaviour',
    adult: 'Localised withdrawal',
    newborn: 'Exaggerated, generalised, whole-limb or whole-body',
    consequence: 'Body-movement items behave differently from the adult intuition behind them.',
  },
  {
    feature: 'Response to repetition',
    adult: 'Habituation is common',
    newborn: 'Sensitisation is common, thresholds fall further',
    consequence: 'The tenth heel lance is not the first. Expect the score to rise, not settle.',
  },
];

export interface StageAction {
  stage: string;
  mechanism: string;
  acts: string;
}

export const MECHANISM_TO_BEDSIDE: StageAction[] = [
  {
    stage: 'Transduction',
    mechanism: 'Transducer channel activation, mediator-driven sensitisation',
    acts: 'Fewer skin breaks, clustered care, topical anaesthetic where the evidence supports it',
  },
  {
    stage: 'Transmission',
    mechanism: 'Action potential conduction along A-delta and C fibres',
    acts: 'Infiltrated or regional local anaesthetic, sodium channel blockade',
  },
  {
    stage: 'Spinal modulation',
    mechanism: 'Gate control, inhibitory interneurons, descending drive',
    acts: 'Sucrose with non-nutritive sucking, breastfeeding, skin-to-skin, facilitated tucking, opioids, alpha-2 agonists',
  },
  {
    stage: 'Sensitisation',
    mechanism: 'NMDA-dependent central sensitisation, wind-up',
    acts: 'Pre-emptive rather than reactive analgesia, adequate dosing for repeated procedures',
  },
  {
    stage: 'Perception',
    mechanism: 'Cortical and limbic construction of the experience',
    acts: 'Reduced light and noise, parental presence, developmental care, sedation where indicated',
  },
];

/**
 * Cautions that belong beside a prescribing screen rather than in a lecture.
 */
export interface DrugCaution {
  agent: string;
  finding: string;
  when: string;
  risk: string;
}

export const DRUG_CAUTIONS: DrugCaution[] = [
  {
    agent: 'Acetaminophen',
    finding:
      'No procedural benefit. Inferior to glucose or sucrose for procedures, and may worsen the later response.',
    when: 'Not for procedures. Opioid-sparing after surgery only, which is how this pathway uses it.',
    risk: 'Possible pro-nociceptive effect; hepatic.',
  },
  {
    agent: 'Opioids',
    finding:
      'Modest reduction in PIPP and NIPS, with no benefit beyond the procedure itself.',
    when: 'Major or invasive procedures, surgery, ventilated infants.',
    risk: 'Apnoea, respiratory depression, hypotension, chest wall rigidity with fentanyl.',
  },
  {
    agent: 'Topical lidocaine-prilocaine',
    finding:
      'Effective for circumcision, venepuncture and lumbar puncture. Not for heel lance, and inferior to sucrose or breastfeeding.',
    when: 'Skin-breaking procedures, as an adjunct to a sweet solution.',
    risk: 'Methaemoglobinaemia, low with a single dose.',
  },
  {
    agent: 'NSAIDs',
    finding: 'Not studied for procedural pain.',
    when: 'Opioid-sparing adjunct only.',
    risk: 'Cerebral blood flow, IVH, platelet and renal effects.',
  },
];

export interface OutcomeRow {
  exposure: string;
  signal: string;
  caveat: string;
}

export const OUTCOME_EVIDENCE: OutcomeRow[] = [
  {
    exposure: 'Iatrogenic pain, short course of 7 days or less',
    signal: 'No clear impairment.',
    caveat: 'Very low certainty, estimates near null.',
  },
  {
    exposure: 'Iatrogenic pain, prolonged or high cumulative',
    signal: 'Lower motor scores, possible cognitive and language deficits.',
    caveat: 'Confounded by illness severity and ventilation.',
  },
  {
    exposure: 'Pre-emptive morphine infusion in ventilated preterm (NEOPAIN)',
    signal:
      'The randomised infusion did not reduce death, severe IVH or PVL. The worse-outcome signal came from open-label bolus morphine.',
    caveat:
      'The infusion caused hypotension, longer ventilation and delayed feeds, hence no routine pre-emptive infusion.',
  },
  {
    exposure: 'Fentanyl, high cumulative dose',
    signal: 'Reduced cerebellar growth, adverse two-year outcomes.',
    caveat: 'Observational.',
  },
  {
    exposure: 'Repeated skin-breaking procedures in very preterm infants',
    signal:
      'Slower thalamic growth on serial MRI, altered thalamocortical microstructure, and cognitive and motor scores at three years corrected age.',
    caveat: 'Human imaging, observational.',
  },
];

/** The line the whole developmental section exists to support. */
export const CORE_CLAIM =
  'The newborn nervous system conducts pain efficiently and inhibits it poorly, at exactly the stage when the circuits are being wired by the activity passing through them.';

export const CLOSING_LINES = [
  'Nociception is not pain, but in a patient who cannot report, nociception is the best proxy available.',
  'The newborn feels more and inhibits less than the adult, at the moment the circuits are being wired.',
  'Every procedure avoided is a procedure that needs no analgesia.',
];

export const SOURCE_NOTE =
  'Human Pain: Anatomy and Physiology. K. Mohammad, Section of Newborn Critical Care, Cumming School of Medicine, University of Calgary. Records verified against PubMed; see docs/EVIDENCE.md for the reference list.';
