import type { ScaleDefinition, NfcsAction } from '../../domain/types';

/**
 * NFCS - Neonatal Facial Coding System (Grunau & Craig).
 *
 * Each facial action is coded present/absent second by second across the
 * observation epoch and summed. Over a 10-second epoch the 7-action version runs
 * 0-70 and the restricted 3-action constellation (NFCS-P-3: brow bulge, eye
 * squeeze, nasolabial furrow) runs 0-30.
 *
 * This is the instrument the on-device facial model targets, because it is the
 * only widely used neonatal scale whose unit of observation is a per-second
 * binary facial action rather than a clinician gestalt. That makes it the honest
 * place to put computer vision: the model codes actions, the clinician keeps the
 * interpretation.
 */

export const NFCS_ACTIONS: { id: NfcsAction; label: string; inP3: boolean; description: string }[] = [
  { id: 'brow_bulge', label: 'Brow bulge', inP3: true, description: 'Bulging, creasing and vertical furrows above and between the brows.' },
  { id: 'eye_squeeze', label: 'Eye squeeze', inP3: true, description: 'Squeezing or tight closure of the eyelids, with bulging of the fatty pads around the eye.' },
  { id: 'nasolabial_furrow', label: 'Nasolabial furrow', inP3: true, description: 'Deepening of the furrow running from the nostril wing down beyond the lip corner.' },
  { id: 'open_lips', label: 'Open lips', inP3: false, description: 'Any parting of the lips.' },
  { id: 'vertical_mouth_stretch', label: 'Vertical mouth stretch', inP3: false, description: 'Tautness at the lip corners with a pronounced downward pull of the jaw.' },
  { id: 'horizontal_mouth_stretch', label: 'Horizontal mouth stretch', inP3: false, description: 'Distinct horizontal pull at the corners of the mouth.' },
  { id: 'taut_tongue', label: 'Taut tongue', inP3: false, description: 'Raised, cupped tongue with sharp, tensed edges.' },
];

const P3_ACTIONS = NFCS_ACTIONS.filter((a) => a.inP3).map((a) => a.id);

/**
 * A 10-second epoch of NFCS-P-3 coding. Scored 0-30. The published clinical
 * threshold separating clinically significant from subclinical pain-related
 * facial activity is 9 out of 30.
 */
export const NFCS_P3: ScaleDefinition = {
  id: 'NFCS_P3',
  name: 'NFCS-P-3',
  fullName: 'Neonatal Facial Coding System, 3-action pain constellation',
  constructs: ['acute_procedural'],
  observationWindowSeconds: 10,
  range: { min: 0, max: 30 },
  items: P3_ACTIONS.map((id) => {
    const meta = NFCS_ACTIONS.find((a) => a.id === id)!;
    return {
      id,
      label: `${meta.label} (seconds present, 0-10)`,
      channel: 'facial' as const,
      help: meta.description,
      options: Array.from({ length: 11 }, (_, s) => ({ label: `${s} s`, value: s })),
    };
  }),
  bands: [
    {
      min: 0,
      max: 8,
      label: 'Subclinical facial pain activity',
      severity: 'none',
      action: 'Below the published clinical threshold. Interpret alongside the primary scale, not instead of it.',
    },
    {
      min: 9,
      max: 30,
      label: 'Clinically significant facial pain activity',
      severity: 'moderate',
      action: 'At or above the 9/30 threshold. Supports the presence of a nociceptive response to the preceding event.',
    },
  ],
  validatedIn:
    'Term and preterm neonates during heel lance; the 3-action constellation is the subset most consistently associated with noxious events.',
  caveats: [
    'Facial activity indexes how the brain processes a stimulus, not simply how much cortical activation occurred. Absent facial activity does not prove absent nociception.',
    'Requires an unobstructed, reasonably frontal view. Prongs, tape, tube ties and eye shields degrade or invalidate coding.',
    'Coding is epoch-based. A single frame is not an NFCS score.',
  ],
  references: [
    {
      citation:
        'Grunau RVE, Craig KD. Pain expression in neonates: facial action and cry. Pain. 1987;28(3):395-410.',
      pmid: '3574966',
    },
    {
      citation:
        'Peters JWB, Koot HM, Grunau RE, et al. Neonatal Facial Coding System for assessing postoperative pain in infants: item reduction is valid and feasible. Clin J Pain. 2003;19(6):353-363.',
      pmid: '14600535',
    },
    {
      citation:
        'Mangat AK, Oei JL, Chen K, Quah-Smith I, Schmölzer GM, et al. Clinical thresholds in pain-related facial activity linked to differences in cortical network activation in neonates. Pain. 2023;164(5):1039-1050.',
      doi: '10.1097/j.pain.0000000000002798',
      url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC10108588/',
    },
  ],
};

export { P3_ACTIONS };
