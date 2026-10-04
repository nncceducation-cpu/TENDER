import type * as ORT from 'onnxruntime-web';
import type { CryFeatures, NfcsWindowSummary, PhysiologicFeatures } from '../domain/types';

/**
 * Pluggable inference layer.
 *
 * The published multimodal work is the reason this is an interface rather than a
 * shipped model. The best-performing open neonatal pain systems fuse face, body
 * and cry and report roughly 0.90 AUC at about 79 percent accuracy on a
 * single-centre dataset of 45 infants. That is a strong research result and a
 * weak basis for an unvalidated model to influence analgesia at another site.
 *
 * So this file ships two things and no trained weights:
 *
 *  - `TransparentIndex`, a deterministic, fully inspectable index over the
 *    features already extracted, marked uncalibrated, offered as a trend line
 *    rather than a score.
 *  - `OnnxPainModel`, a slot for a model the unit trains and validates on its own
 *    data, loaded from a pinned local file with a model card attached.
 *
 * A model that has not been calibrated at this site reports `calibrated: false`,
 * and the interface makes that impossible to hide.
 */

export interface PainModelInput {
  facial?: NfcsWindowSummary;
  cry?: CryFeatures;
  physiologic?: PhysiologicFeatures;
}

export interface PainModelOutput {
  /** 0-1. Not a probability of pain unless the model has been calibrated locally. */
  value: number;
  confidence: number;
  calibrated: boolean;
  contributions: { feature: string; weight: number; value: number }[];
  abstentions: string[];
}

export interface ModelCard {
  id: string;
  version: string;
  trainedOn: string;
  populations: string;
  reportedPerformance: string;
  knownLimitations: string[];
  calibratedAtThisSite: boolean;
  calibrationDate: string | null;
}

export interface PainModel {
  readonly card: ModelCard;
  infer(input: PainModelInput): Promise<PainModelOutput>;
}

// ---------------------------------------------------------------------------
// Transparent default
// ---------------------------------------------------------------------------

const WEIGHTS = {
  nfcsP3: 0.5,
  cryProportion: 0.2,
  cryPitch: 0.1,
  deltaHr: 0.12,
  deltaSpo2: 0.08,
} as const;

export class TransparentIndex implements PainModel {
  readonly card: ModelCard = {
    id: 'tender-transparent-index',
    version: '1.0.0',
    trainedOn: 'Not trained. A fixed weighted combination of published pain indicators.',
    populations: 'None. Weights are stated a priori, not learned.',
    reportedPerformance:
      'Unvalidated. No sensitivity, specificity or AUC is claimed because none has been measured.',
    knownLimitations: [
      'Weights were chosen for interpretability, not fitted to outcome data.',
      'The index is a trend aid across serial windows in the same infant. Comparing it between infants is not supported.',
      'It must not be used to set or withhold a dose on its own.',
    ],
    calibratedAtThisSite: false,
    calibrationDate: null,
  };

  async infer(input: PainModelInput): Promise<PainModelOutput> {
    const contributions: PainModelOutput['contributions'] = [];
    const abstentions: string[] = [];
    let total = 0;
    let weightUsed = 0;

    /**
     * The facial arm abstains when nothing in the window was usable.
     *
     * It used to test only whether `input.facial` was present. A window in which
     * the face was never usable arrives as a real summary object with
     * `secondsUsable: 0` and `nfcsP3Sum: 0`, so the arm contributed its full
     * weight at value 0 and recorded no abstention. Measured, that produced
     * index 0.000 for a blind window, identical to a genuinely settled infant
     * over ten usable seconds, with nothing in the output to tell them apart
     * except a lower confidence. A measurement that was never taken is not
     * evidence of comfort.
     *
     * The denominator changed with it. Both NFCS sums are counts of seconds, so
     * their ceiling is `3 x secondsUsable`, not the instrument's nominal 30. A
     * four-second usable window with all three actions present throughout scored
     * 0.400 against the fixed 30 when the true fraction was 1.000, under-reporting
     * pain in the direction that withholds analgesia.
     */
    if (!input.facial) {
      abstentions.push('No facial features in this window.');
    } else if (input.facial.secondsUsable <= 0 || input.facial.nfcsP3AchievableMax <= 0) {
      abstentions.push(
        'A facial window was recorded but no second of it was usable, so the facial arm contributes nothing. This is a blind spot, not a reassuring reading.',
      );
    } else {
      const v = Math.min(1, input.facial.nfcsP3Sum / input.facial.nfcsP3AchievableMax);
      contributions.push({ feature: 'NFCS-P-3 facial activity', weight: WEIGHTS.nfcsP3, value: v });
      total += WEIGHTS.nfcsP3 * v;
      weightUsed += WEIGHTS.nfcsP3;
    }

    if (input.cry?.usable) {
      contributions.push({
        feature: 'Cry proportion',
        weight: WEIGHTS.cryProportion,
        value: input.cry.cryProportion,
      });
      total += WEIGHTS.cryProportion * input.cry.cryProportion;
      weightUsed += WEIGHTS.cryProportion;

      if (input.cry.f0Median !== null) {
        // High-pitched cry is a recognised pain marker; scaled across 350-600 Hz.
        const v = Math.min(1, Math.max(0, (input.cry.f0Median - 350) / 250));
        contributions.push({ feature: 'Cry pitch', weight: WEIGHTS.cryPitch, value: v });
        total += WEIGHTS.cryPitch * v;
        weightUsed += WEIGHTS.cryPitch;
      }
    } else {
      abstentions.push('No usable audio in this window.');
    }

    if (input.physiologic?.deltaHeartRate != null) {
      const v = Math.min(1, Math.max(0, input.physiologic.deltaHeartRate / 30));
      contributions.push({ feature: 'Heart rate rise', weight: WEIGHTS.deltaHr, value: v });
      total += WEIGHTS.deltaHr * v;
      weightUsed += WEIGHTS.deltaHr;
    }

    if (input.physiologic?.deltaSpo2 != null) {
      const v = Math.min(1, Math.max(0, Math.abs(input.physiologic.deltaSpo2) / 10));
      contributions.push({ feature: 'Saturation fall', weight: WEIGHTS.deltaSpo2, value: v });
      total += WEIGHTS.deltaSpo2 * v;
      weightUsed += WEIGHTS.deltaSpo2;
    }

    if (weightUsed === 0) {
      return { value: 0, confidence: 0, calibrated: false, contributions, abstentions };
    }

    const facialQuality = input.facial?.meanQuality ?? 0;
    const coverage = weightUsed / Object.values(WEIGHTS).reduce((a, b) => a + b, 0);

    /**
     * How much of the requested window was actually coded. Mean quality alone
     * cannot express this: two usable seconds out of thirty can carry a mean
     * quality of 1.0, which previously reported the same confidence as a fully
     * coded window. `suggestions.ts` has always folded temporal coverage into
     * its confidence; this brings the index into line with it.
     */
    const windowCoverage =
      input.facial && input.facial.windowSeconds > 0
        ? Math.min(1, input.facial.secondsUsable / input.facial.windowSeconds)
        : 1;

    return {
      value: total / weightUsed,
      confidence: Math.min(1, coverage * windowCoverage * (0.4 + 0.6 * facialQuality)),
      calibrated: false,
      contributions,
      abstentions,
    };
  }
}

// ---------------------------------------------------------------------------
// ONNX slot
// ---------------------------------------------------------------------------

export interface OnnxModelConfig {
  modelPath: string;
  card: ModelCard;
  /** Order in which features are packed into the input tensor. */
  featureOrder: string[];
  inputName?: string;
  outputName?: string;
}

/**
 * Loads a locally trained model. Inference runs in-browser via WASM, so the
 * feature vector never leaves the device either.
 *
 * The feature vector is built from the same extracted features the transparent
 * index uses, so a model trained on exports from this application sees exactly
 * the inputs it will see in production. That property is the whole point of
 * keeping feature extraction and inference in the same codebase.
 */
export class OnnxPainModel implements PainModel {
  private session: ORT.InferenceSession | null = null;
  private ort: typeof ORT | null = null;

  private config: OnnxModelConfig;

  constructor(config: OnnxModelConfig) {
    this.config = config;
  }

  get card(): ModelCard {
    return this.config.card;
  }

  /**
   * onnxruntime-web ships a ~27 MB WASM binary. It is imported dynamically so a
   * unit that never loads a trained model never pays for it, and the bedside
   * bundle stays small enough to open quickly on a hospital workstation.
   */
  async load(): Promise<void> {
    this.ort ??= await import('onnxruntime-web');
    this.session = await this.ort.InferenceSession.create(this.config.modelPath, {
      executionProviders: ['wasm'],
    });
  }

  private vector(input: PainModelInput): number[] {
    /**
     * `nfcs_p3_sum` and `nfcs7_sum` are counts of seconds, so their scale
     * depends on how long the window was and how much of it was usable. A model
     * trained on exports from a unit that records thirty-second windows sees a
     * different feature distribution from one that records ten, for the same
     * infant. The fraction variants are window-independent and are the ones a
     * `featureOrder` should normally name; the raw sums are kept so an already
     * trained model is not silently re-scaled under it.
     */
    const lookup: Record<string, number> = {
      nfcs_p3_sum: input.facial?.nfcsP3Sum ?? 0,
      nfcs7_sum: input.facial?.nfcs7Sum ?? 0,
      nfcs_p3_fraction:
        input.facial && input.facial.nfcsP3AchievableMax > 0
          ? input.facial.nfcsP3Sum / input.facial.nfcsP3AchievableMax
          : 0,
      nfcs7_fraction:
        input.facial && input.facial.nfcs7AchievableMax > 0
          ? input.facial.nfcs7Sum / input.facial.nfcs7AchievableMax
          : 0,
      seconds_usable: input.facial?.secondsUsable ?? 0,
      brow_bulge: input.facial?.proportionPresent.brow_bulge ?? 0,
      eye_squeeze: input.facial?.proportionPresent.eye_squeeze ?? 0,
      nasolabial_furrow: input.facial?.proportionPresent.nasolabial_furrow ?? 0,
      open_lips: input.facial?.proportionPresent.open_lips ?? 0,
      vertical_mouth_stretch: input.facial?.proportionPresent.vertical_mouth_stretch ?? 0,
      horizontal_mouth_stretch: input.facial?.proportionPresent.horizontal_mouth_stretch ?? 0,
      mean_quality: input.facial?.meanQuality ?? 0,
      cry_proportion: input.cry?.cryProportion ?? 0,
      cry_f0_median: input.cry?.f0Median ?? 0,
      cry_rms: input.cry?.rmsNormalised ?? 0,
      delta_hr: input.physiologic?.deltaHeartRate ?? 0,
      delta_spo2: input.physiologic?.deltaSpo2 ?? 0,
      rmssd: input.physiologic?.rmssd ?? 0,
    };
    return this.config.featureOrder.map((f) => lookup[f] ?? 0);
  }

  async infer(input: PainModelInput): Promise<PainModelOutput> {
    if (!this.session) await this.load();
    const vec = this.vector(input);
    const tensor = new this.ort!.Tensor('float32', Float32Array.from(vec), [1, vec.length]);
    const inputName = this.config.inputName ?? this.session!.inputNames[0];
    const result = await this.session!.run({ [inputName]: tensor });
    const outputName = this.config.outputName ?? this.session!.outputNames[0];
    const raw = result[outputName].data as Float32Array;
    const value = raw.length > 1 ? raw[raw.length - 1] : raw[0];

    return {
      value: Math.min(1, Math.max(0, value)),
      confidence: input.facial?.meanQuality ?? 0.5,
      calibrated: this.card.calibratedAtThisSite,
      contributions: this.config.featureOrder.map((f, i) => ({
        feature: f,
        weight: Number.NaN, // not recoverable from an opaque model
        value: vec[i],
      })),
      abstentions: this.card.calibratedAtThisSite
        ? []
        : ['This model has not been calibrated at this site. Treat the output as research data only.'],
    };
  }
}
