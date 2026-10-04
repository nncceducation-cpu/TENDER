import { usableFacialSummary } from './validity';
import type { AiEvidence, CryFeatures, NfcsWindowSummary, PhysiologicFeatures, ScaleId } from '../domain/types';
import { UNAVAILABLE_ACTIONS } from './nfcsFeatures';
import { NFCS_P3 } from '../data/scales/nfcs';

/**
 * Turning facial coding into scale item suggestions.
 *
 * The most defensible place for computer vision in neonatal pain assessment is
 * not predicting a pain score. It is performing the coding the scale already
 * specifies but which no human can do reliably at the bedside.
 *
 * PIPP-R makes this concrete. Its three facial items are not clinician
 * impressions; they are defined as the proportion of the observation window
 * during which brow bulge, eye squeeze and nasolabial furrow are present, banded
 * at 0-9, 10-39, 40-69 and 70 percent or more. A nurse holding an infant cannot
 * measure that. A per-second coder can. So the model fills in exactly those
 * bands, shows the underlying proportions, and leaves every other item, and the
 * decision to accept, to the clinician.
 *
 * Nothing here is auto-committed. Suggestions arrive as proposals with their
 * evidence attached, and the assessment records whether each item was scored by
 * the clinician, suggested by the model, or accepted from the model.
 */

const PIPP_BAND = (proportion: number): { value: number; label: string } => {
  const pct = proportion * 100;
  if (pct < 10) return { value: 0, label: 'None (0-9% of time)' };
  if (pct < 40) return { value: 1, label: 'Minimum (10-39%)' };
  if (pct < 70) return { value: 2, label: 'Moderate (40-69%)' };
  return { value: 3, label: 'Maximum (70% or more)' };
};

export interface SuggestionSet {
  suggestions: AiEvidence['suggestions'];
  abstentions: string[];
}

/**
 * Confidence is a function of how much usable, in-focus video the window
 * actually contained, not of how emphatic the model feels. A window with four
 * usable seconds out of thirty gets a low number regardless of what it saw.
 */
const windowConfidence = (f: NfcsWindowSummary): number => {
  if (!usableFacialSummary(f)) return 0;
  const coverage = f.windowSeconds > 0 ? Math.min(1, f.secondsUsable / f.windowSeconds) : 0;
  return Math.max(0, Math.min(1, coverage * f.meanQuality));
};

export const buildSuggestions = (
  scaleId: ScaleId,
  facial: NfcsWindowSummary | undefined,
  cry: CryFeatures | undefined,
  physiologic: PhysiologicFeatures | undefined,
): SuggestionSet => {
  const suggestions: AiEvidence['suggestions'] = {};
  const abstentions: string[] = [];

  if (!facial) {
    abstentions.push('No facial capture in this window, so no facial items were suggested.');
  } else {
    const conf = windowConfidence(facial);
    if (conf < 0.35) {
      abstentions.push(
        `Only ${facial.secondsUsable} of ${facial.windowSeconds} seconds were usable at a mean quality of ${facial.meanQuality.toFixed(2)}. Facial suggestions withheld.`,
      );
    } else {
      if (scaleId === 'PIPP_R') {
        const map: [string, keyof NfcsWindowSummary['proportionPresent']][] = [
          ['brow_bulge', 'brow_bulge'],
          ['eye_squeeze', 'eye_squeeze'],
          ['nasolabial_furrow', 'nasolabial_furrow'],
        ];
        for (const [itemId, action] of map) {
          const p = facial.proportionPresent[action] ?? 0;
          const band = PIPP_BAND(p);
          suggestions[itemId] = {
            value: band.value,
            confidence: conf,
            rationale: `Coded present in ${(p * 100).toFixed(0)}% of the ${facial.secondsUsable} usable seconds, which falls in the "${band.label}" band.`,
          };
        }
      }

      if (scaleId === 'NFCS_P3') {
        /**
         * NFCS-P-3 items are counts of seconds, so a short window caps the total
         * below the instrument's published threshold.
         *
         * The scale defines a 10-second epoch scored 0-30 with a clinical
         * threshold at 9/30. With only two usable seconds the ceiling is 6, so
         * the total cannot reach 9 however distressed the infant is, and the
         * banding in the scale definition then reports "below the published
         * clinical threshold" for a maximal facial response. Measured before
         * this guard: a two-second window with all three actions present in
         * every second filled the items as 2/2/2 for a total of 6, at
         * confidence 1.00, because `windowConfidence` sees full coverage of a
         * two-second window as complete.
         *
         * So the items are withheld when the ceiling sits below the threshold
         * the scale itself publishes. The numbers come from the scale
         * definition, not from a judgement made here. A short window is still
         * reported, as an abstention naming the ceiling, which is the honest
         * output: it says the observation was too short to score rather than
         * scoring it as subclinical.
         */
        const ceiling = facial.nfcsP3AchievableMax;
        const threshold = NFCS_P3.bands.find((b) => b.min > 0)?.min ?? null;
        if (threshold !== null && ceiling < threshold) {
          abstentions.push(
            `Only ${facial.secondsUsable} second${facial.secondsUsable === 1 ? '' : 's'} of this window could be coded, so the highest NFCS-P-3 total reachable is ${ceiling} of ${NFCS_P3.range.max}. That is below the published ${threshold}/${NFCS_P3.range.max} threshold, so any score here would read as subclinical whatever the infant's face was doing. Items withheld; record a full ${NFCS_P3.observationWindowSeconds}-second epoch.`,
          );
        } else {
          for (const action of ['brow_bulge', 'eye_squeeze', 'nasolabial_furrow'] as const) {
            const seconds = Math.round((facial.proportionPresent[action] ?? 0) * facial.secondsUsable);
            suggestions[action] = {
              value: Math.min(10, seconds),
              confidence: conf,
              rationale: `Present in ${seconds} of ${facial.secondsUsable} usable seconds. Highest total reachable from this window is ${ceiling} of ${NFCS_P3.range.max}.`,
            };
          }
        }
      }

      if (scaleId === 'N_PASS') {
        const anyPain = Math.max(
          facial.proportionPresent.brow_bulge ?? 0,
          facial.proportionPresent.eye_squeeze ?? 0,
          facial.proportionPresent.nasolabial_furrow ?? 0,
        );
        const value = anyPain >= 0.7 ? 2 : anyPain >= 0.1 ? 1 : 0;
        suggestions['facial_expression'] = {
          value,
          confidence: conf * 0.8,
          rationale: `Strongest pain-related facial action present in ${(anyPain * 100).toFixed(0)}% of usable seconds. Mapped to ${value === 2 ? 'continual' : value === 1 ? 'intermittent' : 'relaxed'}. This mapping is a local convention, not a published one.`,
        };
      }

      if (scaleId === 'COMFORTneo') {
        /**
         * COMFORT facial tension is a five-level judgement of how much of the
         * face is tense and for how long. The on-device coder measures exactly
         * those two things: how many distinct pain-related actions were present,
         * and what proportion of the window they were present for. The mapping
         * below is a local convention, not a published one, and says so.
         */
        const p3 = ['brow_bulge', 'eye_squeeze', 'nasolabial_furrow'] as const;
        const proportions = p3.map((a) => facial.proportionPresent[a] ?? 0);
        const peak = Math.max(...proportions);
        const spread = proportions.filter((x) => x >= 0.1).length;

        let value: number;
        if (peak < 0.1) value = 2; // normal facial tone; level 1 is total relaxation, which coding cannot establish
        else if (peak < 0.4) value = 3; // tension in some muscles, not sustained
        else if (spread >= 2 || peak < 0.7) value = 4; // tension throughout, sustained
        else value = 5; // contorted and grimacing

        suggestions['facial_tension'] = {
          value,
          confidence: conf * 0.7,
          rationale: `Strongest pain-related action present in ${(peak * 100).toFixed(0)}% of usable seconds, with ${spread} of 3 actions above threshold. Mapped to level ${value}. This mapping is a local convention; level 1, total relaxation, is never proposed because coding cannot establish it.`,
        };
      }

      if (scaleId === 'NIPS') {
        const anyPain = Math.max(
          facial.proportionPresent.brow_bulge ?? 0,
          facial.proportionPresent.nasolabial_furrow ?? 0,
        );
        suggestions['facial_expression'] = {
          value: anyPain >= 0.25 ? 1 : 0,
          confidence: conf * 0.75,
          rationale: `Brow bulge or nasolabial furrow present in ${(anyPain * 100).toFixed(0)}% of usable seconds. NIPS is binary, so this reduces a continuous measurement to a threshold; the threshold is a local convention.`,
        };
      }

      if (UNAVAILABLE_ACTIONS.length > 0) {
        abstentions.push(
          `No signal is available for ${UNAVAILABLE_ACTIONS.map((a) => a.replace(/_/g, ' ')).join(', ')}. Any 7-action NFCS total is therefore incomplete and is not offered.`,
        );
      }
    }
  }

  if (cry && cry.usable && scaleId === 'NIPS') {
    const value = cry.cryProportion >= 0.5 ? 2 : cry.cryProportion > 0.05 ? 1 : 0;
    suggestions['cry'] = {
      value,
      confidence: Math.min(0.6, cry.cryProportion + 0.3),
      rationale: `Voiced cry detected in ${(cry.cryProportion * 100).toFixed(0)}% of the window${cry.f0Median ? `, median fundamental frequency ${cry.f0Median.toFixed(0)} Hz` : ''}. Confidence is capped because ambient NICU noise and a second infant in the room are not separated.`,
    };
  } else if (scaleId === 'NIPS') {
    abstentions.push('Audio was not captured or was unusable, so the cry item was not suggested.');
  }

  if (physiologic && scaleId === 'PIPP_R') {
    if (physiologic.deltaHeartRate !== null) {
      const d = physiologic.deltaHeartRate;
      const value = d >= 25 ? 3 : d >= 15 ? 2 : d >= 5 ? 1 : 0;
      suggestions['hr_change'] = {
        value,
        confidence: 0.9,
        rationale: `Maximum heart rate rose ${d.toFixed(0)} bpm above the recorded baseline.`,
      };
    }
    if (physiologic.deltaSpo2 !== null) {
      const d = Math.abs(physiologic.deltaSpo2);
      const value = d >= 7.5 ? 3 : d >= 5 ? 2 : d >= 2.5 ? 1 : 0;
      suggestions['spo2_change'] = {
        value,
        confidence: 0.9,
        rationale: `Minimum saturation fell ${d.toFixed(1)} percentage points below the recorded baseline.`,
      };
    }
  }

  return { suggestions, abstentions };
};
