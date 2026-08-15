import type { ScaleDefinition } from '../../domain/types';

/**
 * EDIN - Échelle Douleur Inconfort Nouveau-Né (Debillon et al., 2001).
 * Five behavioural items scored 0-3 over a prolonged observation period.
 * Range 0-15; a score above 6 indicates marked prolonged pain.
 */
export const EDIN: ScaleDefinition = {
  id: 'EDIN',
  name: 'EDIN',
  fullName: 'Échelle Douleur Inconfort Nouveau-Né',
  constructs: ['prolonged_ongoing'],
  observationWindowSeconds: 240,
  range: { min: 0, max: 15 },
  items: [
    {
      id: 'facial_activity',
      label: 'Facial activity',
      channel: 'facial',
      options: [
        { label: 'Relaxed', value: 0 },
        { label: 'Transient grimacing, frowning, lip pursing, chin quivering, trembling', value: 1 },
        { label: 'Frequent grimacing, marked or prolonged', value: 2 },
        { label: 'Permanent grimacing, or face without expression, fixed', value: 3 },
      ],
    },
    {
      id: 'body_movements',
      label: 'Body movements',
      channel: 'motor',
      options: [
        { label: 'Relaxed', value: 0 },
        { label: 'Transient agitation, often quiet', value: 1 },
        { label: 'Frequent agitation but can be calmed', value: 2 },
        { label: 'Permanent agitation with rigid extremities and fingers, or immobile with no movement', value: 3 },
      ],
    },
    {
      id: 'sleep_quality',
      label: 'Quality of sleep',
      channel: 'state',
      options: [
        { label: 'Falls asleep easily', value: 0 },
        { label: 'Falls asleep with difficulty', value: 1 },
        { label: 'Frequent spontaneous awakenings, restless sleep', value: 2 },
        { label: 'No sleep', value: 3 },
      ],
    },
    {
      id: 'contact_quality',
      label: 'Quality of contact with caregivers',
      channel: 'interaction',
      options: [
        { label: 'Smiling, attentive to voice', value: 0 },
        { label: 'Apprehensive during contact', value: 1 },
        { label: 'Difficult to make contact, cries at the slightest stimulation', value: 2 },
        { label: 'Refuses contact, no relationship possible, moans without any stimulation', value: 3 },
      ],
    },
    {
      id: 'consolability',
      label: 'Consolability',
      channel: 'interaction',
      options: [
        { label: 'Quiet, totally relaxed', value: 0 },
        { label: 'Calms quickly in response to stroking, voice or sucking', value: 1 },
        { label: 'Calms with difficulty', value: 2 },
        { label: 'Inconsolable, sucks desperately', value: 3 },
      ],
    },
  ],
  bands: [
    { min: 0, max: 4, label: 'No prolonged pain indicated', severity: 'none', action: 'Continue developmental care and comfort measures.' },
    { min: 5, max: 6, label: 'Borderline', severity: 'mild', action: 'Review environment, handling burden and comfort measures. Rescore after intervention.' },
    { min: 7, max: 15, label: 'Marked prolonged pain', severity: 'severe', action: 'A score above 6 indicates marked prolonged pain. Review the analgesic plan with the medical team.' },
  ],
  validatedIn: 'Preterm infants, prolonged pain and discomfort over a nursing shift rather than a discrete procedure.',
  caveats: [
    'Scored over hours of observation, so it is not a procedural pain tool and must not be substituted for one.',
    'The contact and consolability items assume the infant is handleable. They are not scorable during sustained instability.',
    'Some cohorts report gestational-age dependence in EDIN scores; interpret extreme prematurity in context.',
  ],
  references: [
    {
      citation:
        'Debillon T, Zupan V, Ravault N, Magny JF, Dehan M. Development and initial validation of the EDIN scale, a new tool for assessing prolonged pain in preterm infants. Arch Dis Child Fetal Neonatal Ed. 2001;85(1):F36-F41.',
      pmid: '11420320',
      doi: '10.1136/fn.85.1.F36',
    },
  ],
};
