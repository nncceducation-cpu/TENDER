import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * The behaviour under test is the one DeepRelief got wrong.
 *
 * Every failure path in the original returned `painScore: 0` with severity
 * "No Pain", which the interface rendered in green. An expired key, a rate limit
 * and a dropped connection all displayed as a comfortable infant. These tests
 * exist to make that regression impossible to reintroduce quietly.
 */

const generateContent = vi.fn();

vi.mock('@google/genai', () => ({
  GoogleGenAI: class {
    models = { generateContent };
  },
  Type: {
    OBJECT: 'OBJECT',
    STRING: 'STRING',
    NUMBER: 'NUMBER',
    INTEGER: 'INTEGER',
    BOOLEAN: 'BOOLEAN',
    ARRAY: 'ARRAY',
  },
}));

const IMAGE = 'data:image/jpeg;base64,QUJD';

const load = async () => await import('../visionModel');

const withKey = (key: string | undefined) => {
  // Each module gets its own import.meta, so stubEnv is the only way to change
  // what the module under test sees.
  if (key === undefined) vi.stubEnv('VITE_GEMINI_API_KEY', '');
  else vi.stubEnv('VITE_GEMINI_API_KEY', key);
};

const ok = (over: Record<string, unknown> = {}) => ({
  text: JSON.stringify({
    assessable: true,
    reason: '',
    facialTension: 4,
    occlusion: 'partial',
    nfcsActions: {
      brow_bulge: true,
      eye_squeeze: true,
      nasolabial_furrow: false,
      open_lips: true,
      vertical_mouth_stretch: false,
      horizontal_mouth_stretch: false,
      taut_tongue: false,
    },
    observations: ['Sustained tension across the brow.'],
    ...over,
  }),
});

beforeEach(() => {
  vi.resetModules();
  generateContent.mockReset();
  withKey('test-key');
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('configuration gate', () => {
  it('reports unconfigured when no key is present', async () => {
    withKey(undefined);
    const { isConfigured } = await load();
    expect(isConfigured()).toBe(false);
  });

  it('reports configured when a key is present', async () => {
    const { isConfigured } = await load();
    expect(isConfigured()).toBe(true);
  });

  it('refuses to transmit without a key, and never calls the API', async () => {
    withKey(undefined);
    const { assessImage } = await load();
    const r = await assessImage(IMAGE);
    expect(r.status).toBe('not_configured');
    expect(generateContent).not.toHaveBeenCalled();
    expect(r.facialTension).toBeNull();
  });
});

describe('failing closed', () => {
  it('returns no score when the network call throws', async () => {
    generateContent.mockRejectedValue(new Error('fetch failed'));
    const { assessImage } = await load();
    const r = await assessImage(IMAGE);

    expect(r.status).toBe('error');
    expect(r.facialTension).toBeNull();
    expect(r.assessable).toBe(false);
    expect(r.reason).toMatch(/not evidence of a comfortable infant/);
  });

  it('returns no score when the response is empty', async () => {
    generateContent.mockResolvedValue({ text: '' });
    const { assessImage } = await load();
    expect((await assessImage(IMAGE)).status).toBe('error');
  });

  it('returns no score when the response is not valid JSON', async () => {
    generateContent.mockResolvedValue({ text: 'the infant appears comfortable' });
    const { assessImage } = await load();
    const r = await assessImage(IMAGE);
    expect(r.status).toBe('error');
    expect(r.facialTension).toBeNull();
  });

  it('rejects a facial tension level outside the instrument range', async () => {
    generateContent.mockResolvedValue(ok({ facialTension: 7 }));
    const { assessImage } = await load();
    const r = await assessImage(IMAGE);
    expect(r.status).toBe('error');
    expect(r.reason).toMatch(/outside the 1 to 5 range/);
  });

  it('rejects a zero level, which the schema uses to mean unassessable', async () => {
    generateContent.mockResolvedValue(ok({ facialTension: 0 }));
    const { assessImage } = await load();
    expect((await assessImage(IMAGE)).status).toBe('error');
  });

  it('never produces a comfortable-looking result from any failure', async () => {
    const failures = [
      () => generateContent.mockRejectedValue(new Error('429 rate limited')),
      () => generateContent.mockRejectedValue(new Error('401 invalid key')),
      () => generateContent.mockResolvedValue({ text: '' }),
      () => generateContent.mockResolvedValue({ text: '{' }),
      () => generateContent.mockResolvedValue(ok({ facialTension: -3 })),
    ];
    const { assessImage } = await load();
    for (const setup of failures) {
      generateContent.mockReset();
      setup();
      const r = await assessImage(IMAGE);
      // The only safe rendering of a failure is nothing at all.
      expect(r.status).not.toBe('ok');
      expect(r.facialTension).toBeNull();
      expect(r.assessable).toBe(false);
      expect(r.reason).toBeTruthy();
    }
  });
});

describe('abstention', () => {
  it('preserves the model reason and occlusion when it declines', async () => {
    generateContent.mockResolvedValue(
      ok({
        assessable: false,
        reason: 'More than a third of the face is covered by fixation tape.',
        facialTension: 0,
      }),
    );
    const { assessImage } = await load();
    const r = await assessImage(IMAGE);

    expect(r.status).toBe('abstained');
    expect(r.facialTension).toBeNull();
    expect(r.reason).toMatch(/fixation tape/);
    expect(r.occlusion).toBe('partial');
  });
});

describe('a successful assessment', () => {
  it('returns the COMFORT facial tension level and the coded actions', async () => {
    generateContent.mockResolvedValue(ok());
    const { assessImage } = await load();
    const r = await assessImage(IMAGE);

    expect(r.status).toBe('ok');
    expect(r.facialTension).toBe(4);
    expect(r.nfcsActions.brow_bulge).toBe(true);
    expect(r.nfcsActions.nasolabial_furrow).toBe(false);
    expect(r.occlusion).toBe('partial');
    expect(r.observations).toHaveLength(1);
  });

  it('sends only the base64 payload, not the data URL prefix', async () => {
    generateContent.mockResolvedValue(ok());
    const { assessImage } = await load();
    await assessImage(IMAGE);

    const parts = generateContent.mock.calls[0][0].contents.parts;
    expect(parts[0].inlineData.data).toBe('QUJD');
  });

  it('asks the model for the instrument, not for a pain probability', async () => {
    generateContent.mockResolvedValue(ok());
    const { assessImage } = await load();
    await assessImage(IMAGE);

    const instruction = generateContent.mock.calls[0][0].config.systemInstruction as string;
    expect(instruction).toMatch(/COMFORT behaviour scale, facial tension item/);
    expect(instruction).toMatch(/Neonatal Facial Coding System/);
    expect(instruction).toMatch(/not producing\s+a pain probability/);
    expect(instruction).toMatch(/Do not suggest\s+analgesia/);
  });

  it('runs at temperature zero so the same frame scores the same way', async () => {
    generateContent.mockResolvedValue(ok());
    const { assessImage } = await load();
    await assessImage(IMAGE);
    expect(generateContent.mock.calls[0][0].config.temperature).toBe(0);
  });
});

describe('model card honesty', () => {
  it('claims no measured performance', async () => {
    const { VISION_MODEL_CARD } = await load();
    expect(VISION_MODEL_CARD.reportedPerformance).toMatch(/None/);
    expect(VISION_MODEL_CARD.calibratedAtThisSite).toBe(false);
  });

  it('records that a single frame cannot separate COMFORT levels 3 and 4', async () => {
    const { VISION_MODEL_CARD } = await load();
    expect(VISION_MODEL_CARD.knownLimitations.join(' ')).toMatch(/single still frame/);
  });
});
