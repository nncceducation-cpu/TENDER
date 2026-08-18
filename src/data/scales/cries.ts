import type { ScaleDefinition } from '../../domain/types';

/**
 * CRIES - Krechel and Bildner, 1995.
 *
 * Added because the teaching reference lists it as the postoperative instrument
 * validated from 32 weeks, and postoperative pain from 32 weeks is precisely the
 * population this application's protocol serves. Until now the only postoperative
 * options offered were N-PASS and COMFORTneo, both of which are sound but neither
 * of which was designed for the question.
 *
 * Five items, each 0 to 2, total 0 to 10. The acronym is the instrument: Crying,
 * Requires oxygen, Increased vital signs, Expression, Sleeplessness.
 *
 * Two items need a reference value the tool cannot supply on its own. "Requires
 * oxygen" is scored against the saturation target for this infant, and "increased
 * vital signs" against pre-operative baseline heart rate and blood pressure, so
 * both carry a help line saying where the number comes from.
 */
export const CRIES: ScaleDefinition = {
  id: 'CRIES',
  name: 'CRIES',
  fullName: 'Crying, Requires oxygen, Increased vital signs, Expression, Sleeplessness',
  constructs: ['postoperative'],
  observationWindowSeconds: 60,
  range: { min: 0, max: 10 },
  items: [
    {
      id: 'crying',
      label: 'Crying',
      channel: 'vocal',
      options: [
        { label: 'No cry, or cry that is not high pitched', value: 0, anchor: 'Absent, or a normal-pitched cry' },
        { label: 'High pitched but consolable', value: 1, anchor: 'High pitched, settles with comforting' },
        { label: 'High pitched and inconsolable', value: 2, anchor: 'High pitched, does not settle with comforting' },
      ],
      help: 'A ventilated infant may show a silent cry. Score the facial and effort correlates rather than recording zero.',
    },
    {
      id: 'requires_oxygen',
      label: 'Requires oxygen for saturation',
      channel: 'physiologic',
      options: [
        { label: 'No extra oxygen', value: 0, anchor: 'Saturation held on the current support' },
        { label: 'Under 30% extra', value: 1, anchor: 'Small increase in inspired oxygen needed' },
        { label: '30% or more extra', value: 2, anchor: 'Large increase in inspired oxygen needed' },
      ],
      help: 'Scored against this infant’s own saturation target. Hypoxaemia has many causes; consider the others before attributing a rise in oxygen requirement to pain.',
    },
    {
      id: 'increased_vitals',
      label: 'Increased vital signs',
      channel: 'physiologic',
      options: [
        { label: 'Heart rate and blood pressure at or below baseline', value: 0, anchor: 'No rise from the pre-operative values' },
        { label: 'Rise of less than 20%', value: 1, anchor: 'Either heart rate or blood pressure up by under a fifth' },
        { label: 'Rise of 20% or more', value: 2, anchor: 'Either heart rate or blood pressure up by a fifth or more' },
      ],
      help: 'Needs the pre-operative baseline heart rate and blood pressure. Without it this item is not interpretable, and guessing the baseline is worse than leaving the instrument unscored.',
    },
    {
      id: 'expression',
      label: 'Expression',
      channel: 'facial',
      options: [
        { label: 'No grimace', value: 0, anchor: 'Face at rest' },
        { label: 'Grimace', value: 1, anchor: 'Brow lowered, eyes squeezed, nasolabial furrow deepened' },
        { label: 'Grimace with a grunt', value: 2, anchor: 'Grimace accompanied by audible grunting' },
      ],
    },
    {
      id: 'sleepless',
      label: 'Sleeplessness',
      channel: 'state',
      options: [
        { label: 'Sleeping steadily', value: 0, anchor: 'Settled through the preceding hour' },
        { label: 'Waking at frequent intervals', value: 1, anchor: 'Repeated brief arousals' },
        { label: 'Constantly awake', value: 2, anchor: 'No settled sleep in the preceding hour' },
      ],
      help: 'Scored over the hour before the observation, so it needs the preceding shift’s account rather than the current minute.',
    },
  ],
  bands: [
    {
      min: 0,
      max: 3,
      label: 'No intervention indicated',
      severity: 'none',
      action: 'Continue the current plan and routine comfort care.',
    },
    {
      min: 4,
      max: 6,
      label: 'Analgesia should be considered',
      severity: 'moderate',
      action:
        'Complete the multisensorial comfort checklist first, then reassess. Escalate to analgesia if the repeat score stays at or above 4.',
    },
    {
      min: 7,
      max: 10,
      label: 'Analgesia indicated',
      severity: 'severe',
      action:
        'Give analgesia per the unit protocol together with comfort measures, and rescore within an hour.',
    },
  ],
  validatedIn:
    'Neonates from 32 weeks gestation, for postoperative pain. Developed and validated in the postoperative setting rather than for procedures.',
  caveats: [
    'Two of the five items are physiological, so an infant on inotropes, with sepsis or with a cardiac lesion can score for reasons other than pain.',
    'The vital-signs item requires a documented pre-operative baseline. Without it, score the instrument as not obtainable rather than assuming a baseline.',
    'Not validated below 32 weeks, and not validated for procedural pain.',
    'Widely reproduced in local handbooks. Verify the anchor wording against the licensed table before clinical deployment; the text here is abbreviated bedside prompting.',
  ],
  references: [
    {
      citation:
        'Krechel SW, Bildner J. CRIES: a new neonatal postoperative pain measurement score. Initial testing of validity and reliability. Paediatr Anaesth. 1995;5(1):53-61. doi:10.1111/j.1460-9592.1995.tb00242.x',
      pmid: '8556129',
    },
  ],
};
