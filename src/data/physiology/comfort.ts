/**
 * Non-pharmacological analgesia, as configuration.
 *
 * The ACH pathway instructs "COMPLETE multisensorial checklist" at both elevated
 * escalation bands and never says what is on it. The application repeated that
 * instruction faithfully and also never said, which made it a prompt to do
 * something undefined at exactly the moment a nurse needs to act.
 *
 * Contents and effect sizes are from "Human Pain: Anatomy and Physiology"
 * (K. Mohammad, Section of Newborn Critical Care, University of Calgary), whose
 * records are verified against PubMed. Each entry carries the stage of the
 * nociceptive pathway it acts on, because the reason these work is mechanical
 * rather than sentimental: they add competing non-noxious afferent traffic and
 * recruit the same inhibitory machinery a drug would target.
 */

export type PathwayStage =
  | 'transduction'
  | 'transmission'
  | 'spinal_modulation'
  | 'sensitisation'
  | 'perception';

export type Certainty = 'high' | 'moderate' | 'low' | 'very_low' | 'not_stated';

export interface ComfortMeasure {
  id: string;
  label: string;
  /** What it does, in one line a nurse can act on. */
  how: string;
  /** Reported magnitude, quoted rather than paraphrased into a claim. */
  effect: string;
  certainty: Certainty;
  stage: PathwayStage;
  /** True where the measure is known to blunt behaviour more than nociception. */
  blunts: boolean;
}

export const CERTAINTY_LABEL: Record<Certainty, string> = {
  high: 'High certainty',
  moderate: 'Moderate certainty',
  low: 'Low certainty',
  very_low: 'Very low certainty',
  not_stated: 'Certainty not stated',
};

export const COMFORT_MEASURES: ComfortMeasure[] = [
  {
    id: 'sucrose_nns',
    label: 'Sucrose with non-nutritive sucking',
    how: 'Give the sweet solution and offer the soother together, about two minutes before the skin break.',
    effect: 'Superior to either alone, SMD -1.39 to -1.69.',
    certainty: 'not_stated',
    stage: 'spinal_modulation',
    blunts: true,
  },
  {
    id: 'sucrose',
    label: 'Sucrose alone',
    how: 'Oral sweet solution before the procedure.',
    effect: 'PIPP falls by roughly 1.7 points at 30 s after heel lance. Pooled -1.74 (95% CI -2.11 to -1.37), I squared 62%.',
    certainty: 'high',
    stage: 'spinal_modulation',
    blunts: true,
  },
  {
    id: 'nns',
    label: 'Non-nutritive sucking alone',
    how: 'Soother offered before and through the procedure.',
    effect: 'Pain reactivity SMD -1.13 in term infants. Top-ranked single intervention in the network comparison.',
    certainty: 'very_low',
    stage: 'spinal_modulation',
    blunts: false,
  },
  {
    id: 'breastfeeding',
    label: 'Breastfeeding',
    how: 'Feed at the breast through the procedure where the mother is present and willing.',
    effect: 'Crying reduced by 36 s, NIPS -2.5. Approximately equal to sucrose.',
    certainty: 'moderate',
    stage: 'spinal_modulation',
    blunts: false,
  },
  {
    id: 'tucking',
    label: 'Facilitated tucking or swaddling',
    how: 'Hold the limbs flexed and midline, or swaddle, before and through the procedure.',
    effect: 'Shorter cry duration and better heart rate stability. Among the top three for preterm infants.',
    certainty: 'very_low',
    stage: 'spinal_modulation',
    blunts: false,
  },
  {
    id: 'kangaroo',
    label: 'Skin-to-skin or kangaroo care',
    how: 'Infant prone on a parent chest, ideally from before the procedure begins.',
    effect: 'Less pain and faster recovery, sustained across repeated procedures.',
    certainty: 'low',
    stage: 'spinal_modulation',
    blunts: false,
  },
  {
    id: 'odour',
    label: 'Familiar odour',
    how: 'Maternal milk or a familiar cloth near the face.',
    effect: 'Effective and safe.',
    certainty: 'low',
    stage: 'perception',
    blunts: false,
  },
  {
    id: 'environment',
    label: 'Light, noise and clustered care',
    how: 'Reduce light and noise, bring parents in, and cluster handling so fewer separate events occur.',
    effect: 'Acts on the construction of the experience rather than the input. Every procedure avoided is a procedure needing no analgesia.',
    certainty: 'not_stated',
    stage: 'perception',
    blunts: false,
  },
];

/**
 * Why the checklist works, in the terms of the pathway.
 *
 * Kept alongside the measures so the reason travels with the instruction. A nurse
 * asked to do six things without being told why does five of them.
 */
export const CHECKLIST_RATIONALE =
  'Facilitated tucking, containment holding, non-nutritive sucking and skin-to-skin care are not comfort theatre. They add competing non-noxious afferent traffic and recruit the same inhibitory machinery a drug would target, which is why they measurably lower pain scores during heel lance.';

/**
 * The caveat that has to travel with any score taken after a sweet solution.
 *
 * Quoted rather than softened, because it is the single most important thing to
 * know about a low behavioural score in a NICU.
 */
export const BLUNTING_CAVEAT =
  'Behavioural scores fall when sucrose is given. Spinal reflex activity and noxious-evoked cortical activity may not fall with them. A quiet baby is not necessarily a baby without nociception.';

export const BLUNTING_FOLLOWS =
  'Do not treat a low score as proof of comfort in a paralysed, ventilated or extremely preterm infant. The behavioural repertoire the scale measures is exactly what illness and immaturity take away.';

export const BLUNTING_DOES_NOT_FOLLOW =
  'This is not an argument against sucrose or against scoring. It is an argument for scoring in context, and for putting most of the effort into procedures avoided rather than procedures scored.';

/** Pre-emptive rather than reactive: the physiological argument, in one line. */
export const PREEMPTIVE_ANALGESIA =
  'Analgesia given before tissue injury outperforms the same drug given after, because sensitisation is easier to prevent than to reverse. Treat the heel lance, not the cry that follows it.';
