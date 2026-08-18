import type { PainConstruct, PatientContext, ScaleDefinition } from '../domain/types';
import { PAIN_SCALES } from '../data/scales';

export interface ScaleRecommendation {
  scale: ScaleDefinition;
  rank: number;
  fit: 'preferred' | 'acceptable' | 'not_recommended';
  reasons: string[];
  blockers: string[];
}

/**
 * Choose the instrument, rather than defaulting to whichever one the unit happens
 * to use for everything.
 *
 * The systematic reviews converge on one point: no neonatal scale performs well
 * across every construct, and the common failure is applying a procedural-pain
 * instrument to prolonged pain, or a behavioural instrument to an infant whose
 * behaviour is pharmacologically suppressed. This function makes that choice
 * explicit and records why.
 */
export const recommendScales = (
  construct: PainConstruct,
  ctx: PatientContext,
): ScaleRecommendation[] => {
  const results = PAIN_SCALES.map((scale): ScaleRecommendation => {
    const reasons: string[] = [];
    const blockers: string[] = [];
    let score = 0;

    if (scale.constructs.includes(construct)) {
      score += 100;
      reasons.push(`Validated for ${label(construct)}.`);
    } else {
      blockers.push(`Not validated for ${label(construct)}.`);
    }

    const gaWeeks =
      ctx.gestationalAgeAtBirth.weeks + ctx.gestationalAgeAtBirth.days / 7;

    /**
     * CRIES was developed and validated from 32 weeks. Below that it is not an
     * option, and saying so is more useful than quietly ranking it last.
     */
    if (scale.id === 'CRIES') {
      if (gaWeeks < 32) {
        blockers.push('Not validated below 32 weeks gestation.');
        score -= 100;
      } else {
        reasons.push(
          'Developed specifically for postoperative pain from 32 weeks, which is this indication.',
        );
      }
    }

    // Gestational-age correction matters most at the extremes of prematurity.
    if (gaWeeks < 32) {
      if (scale.id === 'PIPP_R' || scale.id === 'N_PASS') {
        score += 25;
        reasons.push(
          'Carries an explicit gestational-age correction, which matters at this degree of prematurity.',
        );
      } else if (scale.id === 'NIPS') {
        score -= 15;
        reasons.push(
          'No gestational-age correction. A blunted response in a very preterm infant can score as no pain.',
        );
      }
    }

    const ventilated =
      ctx.ventilation === 'invasive_ventilation' || ctx.ventilation === 'hfov';
    if (ventilated) {
      if (scale.id === 'COMFORTneo') {
        score += 15;
        reasons.push('Substitutes a ventilator-response item for crying, so it stays valid on the ventilator.');
      }
      if (scale.id === 'NIPS') {
        score -= 10;
        reasons.push('The cry item degrades in an intubated infant.');
      }
    }

    if (construct === 'sedation_adequacy') {
      if (scale.id === 'N_PASS') {
        score += 20;
        reasons.push('Carries a dedicated sedation dimension.');
      }
      if (scale.id === 'COMFORTneo') {
        score += 10;
        reasons.push('A score below 9 supports considering dose reduction.');
      }
    }

    if (ctx.modifiers.includes('neuromuscular_blockade')) {
      const behavioural = scale.items.filter((i) =>
        ['motor', 'facial', 'vocal', 'state', 'interaction'].includes(i.channel),
      ).length;
      if (behavioural > 0) {
        blockers.push(
          'Under neuromuscular blockade no behavioural instrument is interpretable. Dose on context, procedure and physiology, and document that reasoning.',
        );
        score -= 200;
      }
    }

    if (ctx.modifiers.includes('therapeutic_hypothermia')) {
      score -= 10;
      reasons.push('Cooling suppresses behavioural expression. Interpret any behavioural total cautiously.');
    }

    const fit: ScaleRecommendation['fit'] =
      blockers.length > 0 ? 'not_recommended' : score >= 110 ? 'preferred' : 'acceptable';

    return { scale, rank: score, fit, reasons, blockers };
  });

  return results.sort((a, b) => b.rank - a.rank);
};

const label = (c: PainConstruct): string =>
  ({
    acute_procedural: 'acute procedural pain',
    postoperative: 'postoperative pain',
    prolonged_ongoing: 'prolonged or ongoing pain',
    sedation_adequacy: 'sedation adequacy',
  })[c];
