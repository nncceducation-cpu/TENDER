import type { ScaleDefinition } from '../../domain/types';

/**
 * NIPS - Neonatal Infant Pain Scale (Lawrence et al., 1993).
 * Six behavioural indicators, observed over one minute. Range 0-7.
 */
export const NIPS: ScaleDefinition = {
  id: 'NIPS',
  name: 'NIPS',
  fullName: 'Neonatal Infant Pain Scale',
  constructs: ['acute_procedural'],
  observationWindowSeconds: 60,
  range: { min: 0, max: 7 },
  items: [
    {
      id: 'facial_expression',
      label: 'Facial expression',
      channel: 'facial',
      options: [
        { label: 'Relaxed', value: 0, anchor: 'Restful face, neutral expression' },
        { label: 'Grimace', value: 1, anchor: 'Tight facial muscles; furrowed brow, chin, jaw' },
      ],
    },
    {
      id: 'cry',
      label: 'Cry',
      channel: 'vocal',
      options: [
        { label: 'No cry', value: 0, anchor: 'Quiet, not crying' },
        { label: 'Whimper', value: 1, anchor: 'Mild moaning, intermittent' },
        { label: 'Vigorous cry', value: 2, anchor: 'Loud scream, rising, shrill, continuous' },
      ],
      help: 'A ventilated infant with an endotracheal tube may show silent cry. Score the facial and effort correlates.',
    },
    {
      id: 'breathing',
      label: 'Breathing patterns',
      channel: 'physiologic',
      options: [
        { label: 'Relaxed', value: 0, anchor: 'Usual pattern for this infant' },
        { label: 'Change in breathing', value: 1, anchor: 'Indrawing, irregular, faster; gagging; breath holding' },
      ],
    },
    {
      id: 'arms',
      label: 'Arms',
      channel: 'motor',
      options: [
        { label: 'Relaxed / restrained', value: 0, anchor: 'No rigidity; occasional random movements' },
        { label: 'Flexed / extended', value: 1, anchor: 'Tense, straight arms; rigid or rapid extension, flexion' },
      ],
    },
    {
      id: 'legs',
      label: 'Legs',
      channel: 'motor',
      options: [
        { label: 'Relaxed / restrained', value: 0, anchor: 'No rigidity; occasional random movements' },
        { label: 'Flexed / extended', value: 1, anchor: 'Tense, straight legs; rigid or rapid extension, flexion' },
      ],
    },
    {
      id: 'arousal',
      label: 'State of arousal',
      channel: 'state',
      options: [
        { label: 'Sleeping / awake', value: 0, anchor: 'Quiet, peaceful sleeping or alert random movement' },
        { label: 'Fussy', value: 1, anchor: 'Alert, restless, thrashing' },
      ],
    },
  ],
  bands: [
    { min: 0, max: 2, label: 'No pain indicated', severity: 'none', action: 'Continue routine comfort care and clustered handling.' },
    { min: 3, max: 4, label: 'Possible pain', severity: 'mild', action: 'Non-pharmacological measures first: facilitated tucking, sucrose, non-nutritive sucking, skin-to-skin. Reassess.' },
    { min: 5, max: 7, label: 'Pain likely', severity: 'moderate', action: 'Non-pharmacological measures plus review analgesia. Reassess within 30 minutes of intervention.' },
  ],
  validatedIn: 'Preterm and term neonates during acute procedural pain (heel lance, venipuncture).',
  caveats: [
    'Not validated for prolonged or postoperative pain.',
    'No contextual correction for gestational age, so blunted responses in extremely preterm infants can be scored as no pain.',
    'Motor items are invalid under neuromuscular blockade.',
  ],
  references: [
    {
      citation:
        'Lawrence J, Alcock D, McGrath P, Kay J, MacMurray SB, Dulberg C. The development of a tool to assess neonatal pain. Neonatal Netw. 1993;12(6):59-66.',
      pmid: '8413140',
    },
  ],
};
