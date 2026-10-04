import { describe, it, expect } from 'vitest';
import { detectF0 } from '../cry';
import { tone, noise } from './faceFixtures';

const SR = 48000;

/**
 * The band the extractor searches is 300 to 750 Hz. Restricting the lag search
 * guarantees the ANSWER is in band; it does not exclude an out-of-band source,
 * and the module used to claim it did. These tests pin the distinction, because
 * the two failure modes point in opposite clinical directions: a misread adult
 * voice lands at the top of the band and drives the maximum cry-pitch pain
 * contribution, while an octave error halves a genuinely high-pitched cry.
 */
describe('detectF0', () => {
  it.each([
    [310, 310],
    [350, 350],
    [400, 400],
    [450, 449],
    [500, 500],
    [600, 600],
    [700, 696],
  ])('reads a %i Hz tone as about %i Hz', (hz, expected) => {
    const f = detectF0(tone(hz, SR), SR);
    expect(f).not.toBeNull();
    expect(f!).toBeCloseTo(expected, 0);
  });

  it('stays within 1% across the band', () => {
    for (const hz of [310, 350, 400, 450, 500, 550, 600, 650, 700]) {
      const f = detectF0(tone(hz, SR), SR);
      expect(f).not.toBeNull();
      expect(Math.abs(f! - hz) / hz).toBeLessThan(0.01);
    }
  });

  /**
   * A conversation at the bedside used to be reported as 750 Hz: the
   * correlation of a long-period source is still rising at the shortest lag
   * searched, so the peak pinned against the range boundary and came back as the
   * top of the neonatal band. Measured before the guard: 120 Hz and 150 Hz both
   * returned 750.
   */
  it.each([80, 110, 120, 150, 180, 200, 250, 280])(
    'declines a %i Hz source below the band rather than reporting a band edge',
    (hz) => {
      expect(detectF0(tone(hz, SR), SR)).toBeNull();
    },
  );

  /**
   * A source above the band correlates at a multiple of its true period that
   * falls inside the searched range. Measured before the guard: 800 Hz returned
   * 400, 900 returned 449, 1000 returned 500 - each an octave error landing
   * squarely in band and under-reporting a high-pitched cry.
   */
  it.each([800, 900, 1000, 1200])('declines a %i Hz source above the band', (hz) => {
    expect(detectF0(tone(hz, SR), SR)).toBeNull();
  });

  it('never reports a frequency outside the band it searches', () => {
    for (let hz = 60; hz <= 1400; hz += 20) {
      const f = detectF0(tone(hz, SR), SR);
      if (f !== null) {
        expect(f).toBeGreaterThanOrEqual(300);
        expect(f).toBeLessThanOrEqual(750);
      }
    }
  });

  /**
   * Real cry is harmonically rich. The octave guard compares the correlation at
   * half the detected lag, so it must not fire on a strong second harmonic: a
   * genuine fundamental anti-correlates at half its own period.
   */
  it('reads a harmonically rich cry at its fundamental, not its harmonic', () => {
    for (const h of [0.3, 0.6, 0.9]) {
      const f = detectF0(tone(450, SR, 2048, h), SR);
      expect(f).not.toBeNull();
      expect(f!).toBeCloseTo(449, 0);
    }
  });

  it('reports nothing for silence, noise or a buffer shorter than the longest lag', () => {
    expect(detectF0(new Float32Array(2048), SR)).toBeNull();
    expect(detectF0(noise(2048), SR)).toBeNull();
    expect(detectF0(new Float32Array(100), SR)).toBeNull();
  });

  /**
   * The cost of the boundary guard, stated rather than discovered later: a cry
   * at exactly the band edge is declined. 310 and 700 Hz still read correctly,
   * so the usable band is open rather than closed at its ends.
   */
  it('declines exactly the band edges, which is the stated cost of the boundary guard', () => {
    expect(detectF0(tone(300, SR), SR)).toBeNull();
    expect(detectF0(tone(750, SR), SR)).toBeNull();
    expect(detectF0(tone(310, SR), SR)).not.toBeNull();
    expect(detectF0(tone(700, SR), SR)).not.toBeNull();
  });
});
