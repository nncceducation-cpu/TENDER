import type { NfcsAction } from '../domain/types';

/**
 * Cloud vision assessor, carried over from DeepRelief AI.
 *
 * This is the one part of TENDER that transmits anything. A still image of an
 * infant's face is sent to Google's Gemini API and a structured assessment comes
 * back. Three deliberate constraints govern it.
 *
 * It is off unless a key is configured locally, and the key is never present in a
 * deployed build. `isConfigured()` is false on the public site, and the UI shows
 * the panel disabled with the reason rather than hiding it.
 *
 * It asks for the instrument, not for a verdict. DeepRelief asked the model for a
 * "pain probability score" from 0 to 100, a quantity that corresponds to no
 * validated neonatal instrument and cannot be compared against any published
 * threshold. This version asks for two things TENDER already knows how to
 * interpret: the COMFORT behaviour facial tension level from 1 to 5, which is the
 * COMFORTneo item, and per-action NFCS coding, which is what the on-device coder
 * produces. The output therefore lands in the same pipeline and is bounded by the
 * same instrument definitions.
 *
 * It fails closed. Every failure path in the original returned
 * `painScore: 0, severity: 'No Pain'`, so an expired key, a rate limit or a
 * dropped connection rendered in the interface as a comfortable infant, in green.
 * This version returns an explicit unavailable state and the UI shows nothing
 * clinical at all.
 */

export type VisionStatus = 'ok' | 'not_configured' | 'abstained' | 'error';

export interface VisionAssessment {
  status: VisionStatus;
  /**
   * COMFORT behaviour facial tension, 1 to 5. This is the same item and the same
   * anchors as COMFORTneo's `facial_tension`, so it can be proposed directly
   * against that instrument.
   */
  facialTension: 1 | 2 | 3 | 4 | 5 | null;
  /** Per-action NFCS coding on the single frame supplied. */
  nfcsActions: Partial<Record<NfcsAction, boolean>>;
  /** Free-text observations from the model. Never parsed, only displayed. */
  observations: string[];
  /** Fraction of the face obscured by tubes, tape or fixation, as judged by the model. */
  occlusion: 'none' | 'partial' | 'substantial' | null;
  /** The model's own statement of whether the image supports an assessment. */
  assessable: boolean;
  /** Why the model declined, or why the call failed. Always populated when status is not ok. */
  reason: string | null;
  modelVersion: string;
  capturedAt: string;
}

const MODEL = 'gemini-2.5-flash';

const SYSTEM_INSTRUCTION = `
You are scoring a single still image of a neonate's face against two published
observational instruments. You are not diagnosing pain and you are not producing
a pain probability. Score only what is visible.

INSTRUMENT 1: COMFORT behaviour scale, facial tension item. Choose exactly one level.
  1  Facial muscles totally relaxed.
  2  Normal facial tone.
  3  Tension evident in some facial muscles, not sustained.
  4  Tension evident throughout the facial muscles, sustained.
  5  Facial muscles contorted and grimacing.

INSTRUMENT 2: Neonatal Facial Coding System. For each action, state whether it is
present in this image:
  brow_bulge, eye_squeeze, nasolabial_furrow, open_lips,
  vertical_mouth_stretch, horizontal_mouth_stretch, taut_tongue

RULES YOU MUST FOLLOW:
  - A single still image cannot establish whether tension is sustained. If you
    cannot distinguish level 3 from level 4 on one frame, say so in observations
    and choose the lower level.
  - Neonatal faces in intensive care are frequently obscured by endotracheal tubes,
    nasogastric tubes, CPAP prongs, fixation tape and eye shields. Report the degree
    of occlusion. If more than roughly a third of the face is covered, set
    assessable to false.
  - If the image does not contain a neonate's face, or is too dark, blurred or
    oblique to code, set assessable to false and explain why.
  - Do not infer pain, distress or a clinical recommendation. Do not suggest
    analgesia. Those judgements belong to the clinician using this tool.
  - Never guess an action you cannot see. Absent and not visible are different;
    if an action is not visible, mark it false and note the occlusion.
`;

// Schema types are plain strings on the wire, so the SDK is not needed to build
// this and can stay behind a dynamic import.
const RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    assessable: {
      type: 'BOOLEAN',
      description: 'False when the image cannot support coding.',
    },
    reason: {
      type: 'STRING',
      description: 'Why the image is not assessable. Empty string when it is.',
    },
    facialTension: {
      type: 'INTEGER',
      description: 'COMFORT behaviour facial tension level, 1 to 5. Zero when not assessable.',
    },
    occlusion: {
      type: 'STRING',
      enum: ['none', 'partial', 'substantial'],
    },
    nfcsActions: {
      type: 'OBJECT',
      properties: {
        brow_bulge: { type: 'BOOLEAN' },
        eye_squeeze: { type: 'BOOLEAN' },
        nasolabial_furrow: { type: 'BOOLEAN' },
        open_lips: { type: 'BOOLEAN' },
        vertical_mouth_stretch: { type: 'BOOLEAN' },
        horizontal_mouth_stretch: { type: 'BOOLEAN' },
        taut_tongue: { type: 'BOOLEAN' },
      },
      required: [
        'brow_bulge',
        'eye_squeeze',
        'nasolabial_furrow',
        'open_lips',
        'vertical_mouth_stretch',
        'horizontal_mouth_stretch',
        'taut_tongue',
      ],
    },
    observations: {
      type: 'ARRAY',
      items: { type: 'STRING' },
      description: 'What was visible, in the language of the instruments. No clinical advice.',
    },
  },
  required: ['assessable', 'reason', 'facialTension', 'occlusion', 'nfcsActions', 'observations'],
};

const apiKey = (): string | undefined => {
  // Vite exposes only VITE_-prefixed variables, and the Pages workflow never
  // defines this one, so a deployed build has no key to leak.
  const key = import.meta.env.VITE_GEMINI_API_KEY;
  return typeof key === 'string' && key.length > 0 ? key : undefined;
};

/** True only when a key is present in this build. False on the public deployment. */
export const isConfigured = (): boolean => !__TENDER_PUBLIC_DEMO__ && Boolean(apiKey());

export const unavailable = (status: VisionStatus, reason: string): VisionAssessment => ({
  status,
  facialTension: null,
  nfcsActions: {},
  observations: [],
  occlusion: null,
  assessable: false,
  reason,
  modelVersion: MODEL,
  capturedAt: new Date().toISOString(),
});

/**
 * Assess a single still image.
 *
 * `imageDataUrl` is a data URL from a canvas capture or a file read. It is sent
 * to Google. Callers must have obtained explicit confirmation from the clinician
 * before calling this, because it is the only outbound transmission in the
 * application.
 */
export const assessImage = async (imageDataUrl: string): Promise<VisionAssessment> => {
  const key = apiKey();
  if (!key || __TENDER_PUBLIC_DEMO__) {
    return unavailable(
      'not_configured',
      'No Gemini key is configured in this build. The cloud assessor is available only when the application is run locally with a key in .env.local, so that no key is ever published and no image is transmitted from a deployed page.',
    );
  }

  const base64 = imageDataUrl.includes(',') ? imageDataUrl.split(',')[1] : imageDataUrl;
  if (!base64) return unavailable('error', 'The captured image was empty.');

  try {
    // Imported here so the SDK is never fetched by a build that cannot use it.
    const { GoogleGenAI } = await import('@google/genai');
    const ai = new GoogleGenAI({ apiKey: key });
    const response = await ai.models.generateContent({
      model: MODEL,
      contents: {
        parts: [
          { inlineData: { mimeType: 'image/jpeg', data: base64 } },
          {
            text: 'Score this image against the two instruments in your instructions. Return JSON only.',
          },
        ],
      },
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        responseMimeType: 'application/json',
        responseSchema: RESPONSE_SCHEMA,
        temperature: 0,
      },
    });

    const text = response.text;
    if (!text) return unavailable('error', 'The model returned an empty response.');

    const data = JSON.parse(text) as {
      assessable: boolean;
      reason: string;
      facialTension: number;
      occlusion: 'none' | 'partial' | 'substantial';
      nfcsActions: Record<string, boolean>;
      observations: string[];
    };

    if (!data.assessable) {
      return {
        ...unavailable('abstained', data.reason || 'The model judged the image unassessable.'),
        occlusion: data.occlusion ?? null,
        observations: data.observations ?? [],
      };
    }

    const level = Math.round(data.facialTension);
    if (!Number.isFinite(level) || level < 1 || level > 5) {
      return unavailable(
        'error',
        `The model returned a facial tension level of ${data.facialTension}, which is outside the 1 to 5 range the instrument defines.`,
      );
    }

    return {
      status: 'ok',
      facialTension: level as 1 | 2 | 3 | 4 | 5,
      nfcsActions: data.nfcsActions as Partial<Record<NfcsAction, boolean>>,
      observations: data.observations ?? [],
      occlusion: data.occlusion ?? null,
      assessable: true,
      reason: null,
      modelVersion: MODEL,
      capturedAt: new Date().toISOString(),
    };
  } catch (error) {
    // Fails closed. The caller renders nothing clinical from this.
    return unavailable(
      'error',
      error instanceof Error
        ? `The assessment could not be completed: ${error.message}. No result is shown, because a failed call is not evidence of a comfortable infant.`
        : 'The assessment could not be completed. No result is shown.',
    );
  }
};

/**
 * The provenance record shown next to any cloud assessment.
 *
 * DeepRelief's landing page attributed its analysis to "ResNet-18 and LSTM
 * architectures" and to the PFECIC dataset's 88.3% accuracy. Neither applies:
 * there is no ResNet and no LSTM in that codebase, the work is done by a
 * general-purpose multimodal language model, and PFECIC was built on 53
 * critically ill children aged one to eighteen years, a population that excludes
 * neonates entirely.
 */
export const VISION_MODEL_CARD = {
  id: 'tender-vision-gemini',
  model: MODEL,
  trainedOn: 'A general-purpose multimodal model. Not trained on neonatal pain data.',
  populations: 'Unknown. No neonatal validation has been published for this use.',
  reportedPerformance:
    'None. No sensitivity, specificity or agreement statistic has been measured for this model on neonatal facial coding.',
  knownLimitations: [
    'Assesses a single still frame, so it cannot distinguish sustained tension from transient tension. That distinction separates COMFORT levels 3 and 4.',
    'Sends the image to a third party. It is the only part of TENDER that transmits anything.',
    'Model outputs are not calibrated probabilities. Agreement with a trained human coder has not been measured here.',
    'The COMFORT facial tension anchors were developed and validated for human raters observing an infant, not for a model reading a photograph.',
  ],
  calibratedAtThisSite: false,
} as const;
