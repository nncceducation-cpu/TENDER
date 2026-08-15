import type { ScaleDefinition, ScaleBand, PatientContext } from '../../domain/types';

/**
 * N-PASS - Neonatal Pain, Agitation and Sedation Scale (Hummel et al.).
 *
 * Two-dimensional: each of five criteria is scored 0 to +2 for pain/agitation and
 * 0 to -2 for sedation, giving a pain score of 0 to +10 and a sedation score of
 * 0 to -10. A prematurity correction is then added to the pain score only, using the
 * same gestational age bands as PIPP; the published pain range of 0-13 confirms a
 * maximum correction of +3.
 *
 * LICENSING NOTE: N-PASS is a copyrighted instrument (P. Hummel, Loyola University).
 * The anchor strings below are abbreviated bedside prompts, not the licensed table.
 * Before clinical deployment, replace `anchor` text with the wording on the unit's
 * licensed copy and record the licence in `docs/INSTRUMENT_LICENCES.md`.
 */

const PAIN_BANDS: ScaleBand[] = [
  { min: 0, max: 2, label: 'No significant pain or agitation', severity: 'none', action: 'Continue current management. Reassess per unit frequency.' },
  { min: 3, max: 7, label: 'Pain or agitation present', severity: 'moderate', action: 'Non-pharmacological measures first: containment, non-nutritive sucking, sucrose, positioning, reduce environmental load. Reassess.' },
  { min: 8, max: 13, label: 'Substantial pain or agitation', severity: 'severe', action: 'Escalate to the medical team for pharmacological analgesia alongside non-pharmacological measures. Reassess within 30 minutes.' },
];

const SEDATION_BANDS: ScaleBand[] = [
  { min: -1, max: 0, label: 'Minimal or no sedation', severity: 'undersedated', action: 'If sedation is a goal, current regimen is not achieving it.' },
  { min: -5, max: -2, label: 'Light sedation', severity: 'none', action: 'Usual target range for a ventilated infant.' },
  { min: -10, max: -6, label: 'Deep sedation', severity: 'oversedated', action: 'Deeper than the usual target. Review infusion rates for weaning unless deep sedation is deliberate.' },
];

const prematurityCorrection = (weeks: number, days: number): number => {
  const decimal = weeks + days / 7;
  if (decimal >= 36) return 0;
  if (decimal >= 32) return 1;
  if (decimal >= 28) return 2;
  return 3;
};

const fiveWay = (
  sed2: string,
  sed1: string,
  neutral: string,
  pain1: string,
  pain2: string,
) => [
  { label: '-2', value: -2, anchor: sed2 },
  { label: '-1', value: -1, anchor: sed1 },
  { label: '0', value: 0, anchor: neutral },
  { label: '+1', value: 1, anchor: pain1 },
  { label: '+2', value: 2, anchor: pain2 },
];

export const N_PASS: ScaleDefinition = {
  id: 'N_PASS',
  name: 'N-PASS',
  fullName: 'Neonatal Pain, Agitation and Sedation Scale',
  constructs: ['prolonged_ongoing', 'postoperative', 'sedation_adequacy'],
  observationWindowSeconds: 60,
  range: { min: -10, max: 13 },
  items: [
    {
      id: 'crying_irritability',
      label: 'Crying / irritability',
      channel: 'vocal',
      options: fiveWay(
        'No cry with painful stimuli',
        'Moans or cries minimally with painful stimuli',
        'Appropriate crying, not irritable',
        'Irritable or crying at intervals, consolable',
        'High-pitched or silent continuous cry, inconsolable',
      ),
    },
    {
      id: 'behaviour_state',
      label: 'Behaviour / state',
      channel: 'state',
      options: fiveWay(
        'No arousal to any stimuli, no spontaneous movement',
        'Arouses minimally to stimuli, little spontaneous movement',
        'Appropriate for gestational age',
        'Restless, squirming, awakens frequently',
        'Arching, kicking, constantly awake or arouses minimally',
      ),
    },
    {
      id: 'facial_expression',
      label: 'Facial expression',
      channel: 'facial',
      options: fiveWay(
        'Mouth lax, no expression',
        'Minimal expression with stimuli',
        'Relaxed, appropriate',
        'Any pain expression, intermittent',
        'Any pain expression, continual',
      ),
    },
    {
      id: 'extremities_tone',
      label: 'Extremities / tone',
      channel: 'motor',
      options: fiveWay(
        'No grasp reflex, flaccid tone',
        'Weak grasp reflex, decreased muscle tone',
        'Relaxed hands and feet, normal tone',
        'Intermittent clenched toes or fists, body not tense',
        'Continual clenched toes or fists, body tense',
      ),
    },
    {
      id: 'vital_signs',
      label: 'Vital signs (HR, RR, BP, SpO2)',
      channel: 'physiologic',
      options: fiveWay(
        'No variability with stimuli, hypoventilation or apnoea',
        'Less than 10% variability from baseline with stimuli',
        'Within baseline or normal for gestational age',
        'Increase 10-20% from baseline',
        'Increase more than 20% from baseline',
      ),
    },
  ],
  transform: (raw: Record<string, number>, ctx: PatientContext) => {
    const values = Object.values(raw);
    const painRaw = values.filter((v) => v > 0).reduce((a, b) => a + b, 0);
    const sedationRaw = values.filter((v) => v < 0).reduce((a, b) => a + b, 0);
    const correction = prematurityCorrection(
      ctx.gestationalAgeAtBirth.weeks,
      ctx.gestationalAgeAtBirth.days,
    );
    const total = painRaw + correction;

    const workings = [
      `Positive (pain/agitation) items sum to ${painRaw}.`,
      `Negative (sedation) items sum to ${sedationRaw}.`,
      `Prematurity correction for ${ctx.gestationalAgeAtBirth.weeks}+${ctx.gestationalAgeAtBirth.days} weeks adds ${correction} to the pain score only.`,
      `Corrected pain score = ${painRaw} + ${correction} = ${total}.`,
    ];

    if (ctx.modifiers.includes('neuromuscular_blockade')) {
      workings.push(
        'WARNING: neuromuscular blockade is recorded. Behavioural and tone items cannot express pain. Treat the score as uninterpretable and dose analgesia on context, not on this number.',
      );
    }

    const sedBand = SEDATION_BANDS.find(
      (b) => sedationRaw >= b.min && (b.max === null || sedationRaw <= b.max),
    ) ?? null;

    return {
      total,
      workings,
      secondary: { label: 'Sedation score', value: sedationRaw, band: sedBand },
    };
  },
  bands: PAIN_BANDS,
  validatedIn:
    'Neonates 0-100 days, 23-40 weeks gestation, including ventilated and postoperative infants; validated for prolonged pain and for sedation depth.',
  caveats: [
    'The sedation arm reliably detects oversedation but does not discriminate well between intermediate sedation levels.',
    'Inter-rater reliability is high only with structured training. Untrained scoring is the main source of drift.',
    'Anchor text here is abbreviated. Verify against the unit licensed N-PASS copy before clinical use.',
  ],
  references: [
    {
      citation:
        'Hummel P, Puchalski M, Creech SD, Weiss MG. Clinical reliability and validity of the N-PASS: neonatal pain, agitation and sedation scale with prolonged pain. J Perinatol. 2008;28(1):55-60.',
      pmid: '18165830',
      doi: '10.1038/sj.jp.7211861',
    },
    {
      citation:
        'Hillman BA, Tabrizi MN, Gauda EB, Carson KA, Aucott SW. The Neonatal Pain, Agitation and Sedation Scale and the bedside nurse assessment of premature infants. J Perinatol. 2015;35(2):128-131.',
      pmid: '25211286',
    },
  ],
};

export { prematurityCorrection };
