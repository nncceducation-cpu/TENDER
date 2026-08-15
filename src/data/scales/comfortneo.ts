import type { ScaleDefinition, PatientContext } from '../../domain/types';

const isVentilated = (ctx: PatientContext) =>
  ctx.ventilation === 'invasive_ventilation' || ctx.ventilation === 'hfov';

/**
 * COMFORTneo (van Dijk et al., 2009) - behavioural instrument for prolonged pain
 * and distress in neonates.
 *
 * Seven items are defined but only six are scored on any given assessment: the
 * respiratory response item applies to ventilated infants, the crying item to
 * spontaneously breathing infants. Total therefore runs 6-30.
 */
export const COMFORTNEO: ScaleDefinition = {
  id: 'COMFORTneo',
  name: 'COMFORTneo',
  fullName: 'COMFORTneo behavioural scale',
  constructs: ['prolonged_ongoing', 'postoperative', 'sedation_adequacy'],
  observationWindowSeconds: 120,
  range: { min: 6, max: 30 },
  items: [
    {
      id: 'alertness',
      label: 'Alertness',
      channel: 'state',
      options: [
        { label: 'Deeply asleep', value: 1 },
        { label: 'Lightly asleep', value: 2 },
        { label: 'Drowsy', value: 3 },
        { label: 'Awake and alert', value: 4 },
        { label: 'Hyper-alert', value: 5 },
      ],
    },
    {
      id: 'calmness',
      label: 'Calmness / agitation',
      channel: 'state',
      options: [
        { label: 'Calm', value: 1 },
        { label: 'Slightly anxious', value: 2 },
        { label: 'Anxious', value: 3 },
        { label: 'Very anxious', value: 4 },
        { label: 'Panicky', value: 5 },
      ],
    },
    {
      id: 'respiratory_response',
      label: 'Respiratory response (ventilated infants)',
      channel: 'physiologic',
      appliesWhen: isVentilated,
      options: [
        { label: 'No spontaneous respiration', value: 1 },
        { label: 'Spontaneous and ventilator respiration, no coughing', value: 2 },
        { label: 'Restlessness or resistance to ventilator', value: 3 },
        { label: 'Actively breathes against ventilator or coughs regularly', value: 4 },
        { label: 'Fights ventilator', value: 5 },
      ],
    },
    {
      id: 'crying',
      label: 'Crying (spontaneously breathing infants)',
      channel: 'vocal',
      appliesWhen: (ctx) => !isVentilated(ctx),
      options: [
        { label: 'Quiet breathing, no crying', value: 1 },
        { label: 'Sobbing or gasping', value: 2 },
        { label: 'Moaning', value: 3 },
        { label: 'Crying', value: 4 },
        { label: 'Screaming or shrieking', value: 5 },
      ],
    },
    {
      id: 'body_movement',
      label: 'Body movement',
      channel: 'motor',
      options: [
        { label: 'No movement', value: 1 },
        { label: 'Occasional slight movement', value: 2 },
        { label: 'Frequent slight movement', value: 3 },
        { label: 'Vigorous movement of extremities only', value: 4 },
        { label: 'Vigorous movement including head and torso', value: 5 },
      ],
    },
    {
      id: 'facial_tension',
      label: 'Facial tension',
      channel: 'facial',
      options: [
        { label: 'Facial muscles totally relaxed', value: 1 },
        { label: 'Normal facial tone', value: 2 },
        { label: 'Tension evident in some facial muscles', value: 3 },
        { label: 'Tension evident throughout facial muscles', value: 4 },
        { label: 'Facial muscles contorted and grimacing', value: 5 },
      ],
    },
    {
      id: 'muscle_tone',
      label: 'Body muscle tone',
      channel: 'motor',
      options: [
        { label: 'Muscles totally relaxed, no tone', value: 1 },
        { label: 'Reduced muscle tone', value: 2 },
        { label: 'Normal muscle tone', value: 3 },
        { label: 'Increased muscle tone, flexion of fingers and toes', value: 4 },
        { label: 'Extreme muscle rigidity, flexion of fingers and toes', value: 5 },
      ],
    },
  ],
  bands: [
    {
      min: 6,
      max: 8,
      label: 'Comfortable, possibly oversedated',
      severity: 'oversedated',
      action: 'A score below 9 supports considering a reduction in opioid or sedative dose, in context.',
    },
    { min: 9, max: 13, label: 'Comfortable', severity: 'none', action: 'Current management appears adequate. Continue.' },
    {
      min: 14,
      max: 30,
      label: 'Pain or distress',
      severity: 'moderate',
      action: 'A score of 14 or above indicates distress or pain. Act on it, then rescore. Pair with the nurse NRS-pain and NRS-distress ratings to separate the two constructs.',
    },
  ],
  transform: (raw, ctx) => {
    const total = Object.values(raw).reduce((a, b) => a + b, 0);
    const workings = [
      isVentilated(ctx)
        ? 'Ventilated: respiratory response item scored, crying item omitted.'
        : 'Spontaneously breathing: crying item scored, respiratory response item omitted.',
      `Six items summed to ${total}.`,
    ];
    if (ctx.modifiers.includes('therapeutic_hypothermia')) {
      workings.push(
        'Therapeutic hypothermia is recorded. Behavioural responsiveness is suppressed during cooling; a low score does not exclude pain.',
      );
    }
    return { total, workings };
  },
  validatedIn:
    'Neonates 24-42 weeks gestation in the NICU, for prolonged pain and distress; inter-rater ICC 0.93 in the validation cohort.',
  caveats: [
    'Measures distress broadly. It does not separate pain from non-pain distress on its own, which is why the paired nurse NRS ratings are part of the method.',
    'Muscle tone and movement items are invalid under neuromuscular blockade.',
    'Cooling, sedation and encephalopathy all depress the score independent of pain.',
  ],
  references: [
    {
      citation:
        'van Dijk M, Roofthooft DWE, Anand KJS, et al. Taking up the challenge of measuring prolonged pain in (premature) neonates: the COMFORTneo scale seems promising. Clin J Pain. 2009;25(7):607-616.',
      pmid: '19692803',
      doi: '10.1097/AJP.0b013e3181a5b52a',
    },
  ],
};
