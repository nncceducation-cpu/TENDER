import { describe, it, expect } from 'vitest';
import { readSingleImage, RELAXED_REFERENCE, type GeometryMeasures } from '../faceGeometry';

/**
 * Regression tests built from real failures.
 *
 * On 18 August 2026 three photographs of calm, content infants were run through
 * this module and every one came back COMFORT facial tension 3 of 5, "tension
 * evident in some facial muscles". Three out of three false positives on the only
 * real test that had ever been run.
 *
 * The measurements below are the ones the tool actually produced on those images,
 * so these tests fail if the module ever goes back to calling a content infant
 * tense. They are the closest thing to ground truth this module has, and n is 3.
 */

const measures = (over: Partial<GeometryMeasures>): GeometryMeasures => ({
  eyeAperture: 0.1,
  mouthOpening: 0.02,
  mouthWidth: 0.4,
  browToEye: 0.24,
  faceProportion: 1.6,
  points: {
    leftEye: { top: { x: 0, y: 0 }, bottom: { x: 0, y: 0 }, outer: { x: 0, y: 0 }, inner: { x: 0, y: 0 }, brow: { x: 0, y: 0 } },
    rightEye: { top: { x: 0, y: 0 }, bottom: { x: 0, y: 0 }, outer: { x: 0, y: 0 }, inner: { x: 0, y: 0 }, brow: { x: 0, y: 0 } },
    mouth: { top: { x: 0, y: 0 }, bottom: { x: 0, y: 0 }, left: { x: 0, y: 0 }, right: { x: 0, y: 0 } },
    face: { top: { x: 0, y: 0 }, chin: { x: 0, y: 0 } },
    box: { x: 0, y: 0, w: 100, h: 100 },
  },
  ...over,
});

describe('three calm infants that used to score 3 of 5', () => {
  const CALM = [
    { name: '9.jpe', eyeAperture: 0.092, mouthOpening: 0.204, browToEye: 0.252 },
    { name: '10.jpe', eyeAperture: 0.114, mouthOpening: 0.205, browToEye: 0.221 },
    { name: '11.jpe', eyeAperture: 0.103, mouthOpening: 0.171, browToEye: 0.224 },
  ];

  for (const c of CALM) {
    it(`${c.name} reads as normal facial tone, not as tension`, () => {
      const r = readSingleImage(measures(c));
      expect(r.facialTension).toBe(2);
      expect(r.anchor).toMatch(/Normal facial tone/);
    });

    it(`${c.name} does not let the open mouth carry the reading`, () => {
      const r = readSingleImage(measures(c));
      const mouth = r.regions.find((x) => x.region === 'Mouth')!;
      expect(mouth.tension).toBe(0);
      expect(mouth.reading).toMatch(/Not counted as tension/);
    });
  }

  it('says why the level was capped', () => {
    const r = readSingleImage(measures(CALM[0]));
    expect(r.caveats.join(' ')).toMatch(/eyes are clearly open, so the level is capped at 2/);
  });
});

describe('the eye squeeze still drives a real grimace', () => {
  it('reads a squeezed, brow-lowered, stretched face at the top of the scale', () => {
    const r = readSingleImage(
      measures({ eyeAperture: 0.02, browToEye: 0.14, mouthOpening: 0.3 }),
    );
    expect(r.facialTension).toBe(5);
  });

  it('counts the mouth once the eyes are no longer clearly open', () => {
    const r = readSingleImage(
      measures({ eyeAperture: 0.05, browToEye: 0.19, mouthOpening: 0.25 }),
    );
    const mouth = r.regions.find((x) => x.region === 'Mouth')!;
    expect(mouth.tension).toBeGreaterThan(0);
    expect(r.facialTension).toBeGreaterThanOrEqual(3);
  });

  it('places a half-squeezed face in the middle rather than at an extreme', () => {
    const r = readSingleImage(
      measures({ eyeAperture: 0.06, browToEye: 0.2, mouthOpening: 0.15 }),
    );
    expect(r.facialTension).toBe(3);
  });

  it('never produces level 1', () => {
    const r = readSingleImage(measures({ eyeAperture: 0.2, browToEye: 0.3, mouthOpening: 0 }));
    expect(r.facialTension).toBe(2);
  });
});

describe('the reference the levels are read against', () => {
  it('keeps the brow reference at the value set from the three calm infants', () => {
    // If this changes, the three regression cases above must be re-checked.
    expect(RELAXED_REFERENCE.browNeutral).toBe(0.24);
  });
});


describe('sleep and blink ambiguity', () => {
  it("withholds the exact geometry shown in the user's sleeping-infant report", () => {
    const r = readSingleImage(measures({ eyeAperture: 0.013, mouthOpening: 0.005, browToEye: 0.271 }));
    expect(r.scoreAvailable).toBe(false);
    expect(r.regions.find(x => x.region === 'Eyes')!.tension).toBe(0);
    expect(r.overallTension).toBe(0);
    expect(r.caveats.join(' ')).toMatch(/No facial level is available/);
  });

  it('does not turn isolated partial or full closure into a high level', () => {
    for (const eyeAperture of [0, 0.013, 0.02, 0.03, 0.06, 0.08]) {
      const r = readSingleImage(measures({ eyeAperture, mouthOpening: 0, browToEye: 0.3 }));
      expect(r.scoreAvailable).toBe(false);
      expect(r.overallTension).toBe(0);
    }
  });

  it('does not let closed lids dominate small independent measurements', () => {
    const r = readSingleImage(measures({ eyeAperture: 0.013, mouthOpening: 0.025, browToEye: 0.229 }));
    expect(r.facialTension).toBeLessThan(4);
    expect(r.regions.find(x => x.region === 'Eyes')!.tension).toBeCloseTo(.11);
  });

  it('retains an experimental proposal when other regions also contribute' , () => {
    expect(readSingleImage(measures({ eyeAperture: 0.02, mouthOpening: 0.3, browToEye: 0.14 })).scoreAvailable).toBe(true);
  });
});
