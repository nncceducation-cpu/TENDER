import type { ScaleDefinition, ScaleBand, PatientContext } from '../../domain/types';

const BANDS: ScaleBand[] = [
  { min: 0, max: 6, label: 'Minimal or no pain', severity: 'none', action: 'Continue supportive care. No analgesic change indicated on this score alone.' },
  { min: 7, max: 12, label: 'Mild to moderate pain', severity: 'moderate', action: 'Non-pharmacological measures; consider sucrose or breast milk for procedural pain. Reassess.' },
  { min: 13, max: 21, label: 'Moderate to severe pain', severity: 'severe', action: 'Escalate: pharmacological analgesia per unit protocol plus non-pharmacological measures. Reassess within 30 minutes.' },
];

const gaPoints = (weeks: number, days: number): number => {
  const decimal = weeks + days / 7;
  if (decimal >= 36) return 0;
  if (decimal >= 32) return 1;
  if (decimal >= 28) return 2;
  return 3;
};

/**
 * PIPP-R - Premature Infant Pain Profile-Revised (Stevens et al., 2014).
 *
 * The revision's defining rule: the two contextual indicators (gestational age and
 * behavioural state) are scored only when at least one physiological or facial
 * indicator scores above zero. Scoring them unconditionally, as the original PIPP
 * did, inflates the score of a quietly sleeping preterm infant who is not in pain.
 */
export const PIPP_R: ScaleDefinition = {
  id: 'PIPP_R',
  name: 'PIPP-R',
  fullName: 'Premature Infant Pain Profile-Revised',
  constructs: ['acute_procedural', 'postoperative'],
  observationWindowSeconds: 30,
  range: { min: 0, max: 21 },
  items: [
    {
      id: 'hr_change',
      label: 'Maximum heart rate increase from baseline',
      channel: 'physiologic',
      options: [
        { label: '0-4 bpm', value: 0 },
        { label: '5-14 bpm', value: 1 },
        { label: '15-24 bpm', value: 2 },
        { label: '25 bpm or more', value: 3 },
      ],
      help: 'Record a 15-second baseline before the procedure, then the maximum during the 30 seconds after.',
    },
    {
      id: 'spo2_change',
      label: 'Minimum oxygen saturation decrease from baseline',
      channel: 'physiologic',
      options: [
        { label: '0-2.4%', value: 0 },
        { label: '2.5-4.9%', value: 1 },
        { label: '5.0-7.4%', value: 2 },
        { label: '7.5% or more', value: 3 },
      ],
    },
    {
      id: 'brow_bulge',
      label: 'Brow bulge',
      channel: 'facial',
      options: [
        { label: 'None (0-9% of time)', value: 0 },
        { label: 'Minimum (10-39%)', value: 1 },
        { label: 'Moderate (40-69%)', value: 2 },
        { label: 'Maximum (70% or more)', value: 3 },
      ],
    },
    {
      id: 'eye_squeeze',
      label: 'Eye squeeze',
      channel: 'facial',
      options: [
        { label: 'None (0-9% of time)', value: 0 },
        { label: 'Minimum (10-39%)', value: 1 },
        { label: 'Moderate (40-69%)', value: 2 },
        { label: 'Maximum (70% or more)', value: 3 },
      ],
    },
    {
      id: 'nasolabial_furrow',
      label: 'Nasolabial furrow',
      channel: 'facial',
      options: [
        { label: 'None (0-9% of time)', value: 0 },
        { label: 'Minimum (10-39%)', value: 1 },
        { label: 'Moderate (40-69%)', value: 2 },
        { label: 'Maximum (70% or more)', value: 3 },
      ],
    },
    {
      id: 'behavioural_state',
      label: 'Behavioural state (contextual)',
      channel: 'context',
      options: [
        { label: 'Active / awake, eyes open, facial movements', value: 0 },
        { label: 'Quiet / awake, eyes open, no facial movements', value: 1 },
        { label: 'Active / sleep, eyes closed, facial movements', value: 2 },
        { label: 'Quiet / sleep, eyes closed, no facial movements', value: 3 },
      ],
      help: 'Observed for 15 seconds immediately before the procedure. Counted only if a core indicator scores above zero.',
    },
    {
      id: 'gestational_age',
      label: 'Gestational age (contextual)',
      channel: 'context',
      options: [
        { label: '36 weeks or more', value: 0 },
        { label: '32 0/7 to 35 6/7 weeks', value: 1 },
        { label: '28 0/7 to 31 6/7 weeks', value: 2 },
        { label: 'Less than 28 weeks', value: 3 },
      ],
      help: 'Auto-populated from the patient record.',
    },
  ],
  transform: (raw: Record<string, number>, ctx: PatientContext) => {
    const core = ['hr_change', 'spo2_change', 'brow_bulge', 'eye_squeeze', 'nasolabial_furrow'];
    const coreSum = core.reduce((s, k) => s + (raw[k] ?? 0), 0);
    const workings: string[] = [`Core indicators (physiologic + facial) = ${coreSum}`];

    if (coreSum === 0) {
      workings.push('Core subtotal is zero, so PIPP-R suppresses both contextual indicators. Total = 0.');
      return { total: 0, workings };
    }

    const ga = gaPoints(ctx.gestationalAgeAtBirth.weeks, ctx.gestationalAgeAtBirth.days);
    const state = raw['behavioural_state'] ?? 0;
    workings.push(`Core subtotal is above zero, so contextual indicators are added.`);
    workings.push(`Gestational age ${ctx.gestationalAgeAtBirth.weeks}+${ctx.gestationalAgeAtBirth.days} scores ${ga}.`);
    workings.push(`Behavioural state scores ${state}.`);
    const total = coreSum + ga + state;
    workings.push(`Total = ${coreSum} + ${ga} + ${state} = ${total}.`);
    return { total, workings };
  },
  bands: BANDS,
  validatedIn:
    'Preterm infants from 25 weeks through term, for acute procedural pain; used in postoperative research with less consistent performance.',
  caveats: [
    'Requires a valid pre-procedure baseline for heart rate and saturation. Without it the physiologic items are not interpretable.',
    'Facial items require an unobstructed view. CPAP prongs, tape and phototherapy eye shields degrade or invalidate them.',
    'Performs less well for prolonged or persistent pain than for a discrete noxious event.',
  ],
  references: [
    {
      citation:
        'Stevens BJ, Gibbins S, Yamada J, et al. The Premature Infant Pain Profile-Revised (PIPP-R): initial validation and feasibility. Clin J Pain. 2014;30(3):238-243.',
      pmid: '23792340',
      doi: '10.1097/AJP.0b013e3182906aed',
    },
    {
      citation:
        'Gibbins S, Stevens BJ, Yamada J, et al. Validation of the Premature Infant Pain Profile-Revised (PIPP-R). Early Hum Dev. 2014;90(4):189-193.',
      pmid: '24491306',
      doi: '10.1016/j.earlhumdev.2014.01.005',
    },
  ],
};

export { gaPoints };
