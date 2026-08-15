import type { ScaleDefinition } from '../../domain/types';

/**
 * WAT-1 - Withdrawal Assessment Tool version 1 (Franck et al.).
 *
 * Eleven items across four observation sources, total 0-12. The original app
 * accepted WAT-1 as a free number, which leaves inter-rater drift unmanaged and
 * makes a mistyped score indistinguishable from a real one. Here it is scored
 * item by item, in the order the tool requires.
 *
 * LICENSING NOTE: WAT-1 is freely available for non-commercial clinical and
 * research use with attribution and registration through the authors. Record the
 * unit's registration in docs/INSTRUMENT_LICENCES.md before deployment.
 */
export const WAT_1: ScaleDefinition = {
  id: 'WAT_1',
  name: 'WAT-1',
  fullName: 'Withdrawal Assessment Tool version 1',
  constructs: ['prolonged_ongoing'],
  observationWindowSeconds: 300,
  range: { min: 0, max: 12 },
  items: [
    {
      id: 'loose_stools',
      label: 'Loose or watery stools (previous 12 h record)',
      channel: 'context',
      options: [
        { label: 'No', value: 0 },
        { label: 'Yes', value: 1 },
      ],
    },
    {
      id: 'vomiting',
      label: 'Vomiting, retching or gagging (previous 12 h record)',
      channel: 'context',
      options: [
        { label: 'No', value: 0 },
        { label: 'Yes', value: 1 },
      ],
    },
    {
      id: 'temperature',
      label: 'Modal temperature above 37.8 °C (previous 12 h record)',
      channel: 'context',
      options: [
        { label: 'No', value: 0 },
        { label: 'Yes', value: 1 },
      ],
    },
    {
      id: 'state',
      label: 'State (2-minute pre-stimulus observation)',
      channel: 'state',
      options: [
        { label: 'Asleep or calm (SBS ≤ 0)', value: 0 },
        { label: 'Awake and distressed (SBS ≥ +1)', value: 1 },
      ],
    },
    {
      id: 'tremor',
      label: 'Tremor (2-minute pre-stimulus observation)',
      channel: 'motor',
      options: [
        { label: 'None or mild', value: 0 },
        { label: 'Moderate to severe', value: 1 },
      ],
    },
    {
      id: 'sweating',
      label: 'Any sweating (2-minute pre-stimulus observation)',
      channel: 'physiologic',
      options: [
        { label: 'No', value: 0 },
        { label: 'Yes', value: 1 },
      ],
    },
    {
      id: 'uncoordinated_movement',
      label: 'Uncoordinated or repetitive movement (2-minute pre-stimulus observation)',
      channel: 'motor',
      options: [
        { label: 'None or mild', value: 0 },
        { label: 'Moderate to severe', value: 1 },
      ],
    },
    {
      id: 'yawning_sneezing',
      label: 'Yawning or sneezing (2-minute pre-stimulus observation)',
      channel: 'motor',
      options: [
        { label: 'None or one', value: 0 },
        { label: 'More than one', value: 1 },
      ],
    },
    {
      id: 'startle_to_touch',
      label: 'Startle to touch (1-minute stimulus)',
      channel: 'motor',
      options: [
        { label: 'None or mild', value: 0 },
        { label: 'Moderate to severe', value: 1 },
      ],
    },
    {
      id: 'muscle_tone',
      label: 'Muscle tone (1-minute stimulus)',
      channel: 'motor',
      options: [
        { label: 'Normal', value: 0 },
        { label: 'Increased', value: 1 },
      ],
    },
    {
      id: 'time_to_calm',
      label: 'Time to regain calm state, SBS ≤ 0 (post-stimulus recovery)',
      channel: 'state',
      options: [
        { label: 'Less than 2 minutes', value: 0 },
        { label: '2 to 5 minutes', value: 1 },
        { label: 'More than 5 minutes', value: 2 },
      ],
    },
  ],
  bands: [
    { min: 0, max: 2, label: 'Withdrawal unlikely', severity: 'none', action: 'Continue the current weaning plan.' },
    {
      min: 3,
      max: 5,
      label: 'Withdrawal likely',
      severity: 'moderate',
      action: 'Complete the multisensorial comfort checklist and reassess. Consider pausing the next taper step.',
    },
    {
      min: 6,
      max: 12,
      label: 'Significant withdrawal',
      severity: 'severe',
      action: 'Rescue dose per protocol plus comfort checklist. Pause the wean and reassess within 30 to 60 minutes.',
    },
  ],
  validatedIn:
    'Paediatric and neonatal ICU patients weaning from opioids and benzodiazepines after at least 5 days of exposure.',
  caveats: [
    'Designed for iatrogenic withdrawal during weaning, not for neonatal opioid withdrawal syndrome after intrauterine exposure.',
    'The stimulus and recovery items require the infant to be handled. Skipping them and summing the rest produces a falsely low score.',
    'Assessment is time-anchored. Scoring off-schedule breaks comparability across the taper.',
  ],
  references: [
    {
      citation:
        'Franck LS, Harris SK, Soetenga DJ, Amling JK, Curley MAQ. The Withdrawal Assessment Tool-1 (WAT-1): an assessment instrument for monitoring opioid and benzodiazepine withdrawal symptoms in pediatric patients. Pediatr Crit Care Med. 2008;9(6):573-580.',
      pmid: '18838937',
    },
    {
      citation:
        'Franck LS, Scoppettuolo LA, Wypij D, Curley MAQ. Validity and generalizability of the Withdrawal Assessment Tool-1 (WAT-1) in pediatric patients. Pain. 2012;153(1):142-148.',
      pmid: '22093816',
    },
  ],
};
