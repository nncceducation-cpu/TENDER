import type { CryFeatures } from '../domain/types';

/**
 * Cry feature extraction, on device.
 *
 * Cry carries real signal: the published unimodal results put sound at around
 * 0.87 AUC, ahead of face or body alone. But an open NICU is the worst possible
 * acoustic environment for it. A neighbouring infant, a ventilator alarm and a
 * conversation at the bedside all land in the same microphone, and none of the
 * open work solves source separation.
 *
 * This extractor therefore does something narrow and defensible: it measures
 * voiced activity and fundamental frequency in the band where neonatal cry lives,
 * reports how noisy the window was, and marks itself unusable when the
 * background is loud enough that attribution is unsafe. Downstream, cry
 * suggestions are confidence-capped for the same reason.
 */

const NEONATAL_F0_MIN_HZ = 300;
const NEONATAL_F0_MAX_HZ = 750;

export interface CryCaptureOptions {
  fftSize?: number;
  /** Frames whose RMS falls below this fraction of the window peak are silence. */
  silenceFloor?: number;
  /** Above this, the window is treated as too noisy to attribute. */
  noiseFloorRatio?: number;
}

export class CryAnalyser {
  private ctx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private samples: { t: number; rms: number; f0: number | null }[] = [];
  private raf = 0;
  private lastF0At = 0;
  private lastF0: number | null = null;

  private options: CryCaptureOptions;

  constructor(options: CryCaptureOptions = {}) {
    this.options = options;
  }

  async start(stream: MediaStream): Promise<void> {
    this.ctx = new AudioContext();
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = this.options.fftSize ?? 2048;
    this.source = this.ctx.createMediaStreamSource(stream);
    this.source.connect(this.analyser);
    this.samples = [];

    const buffer = new Float32Array(this.analyser.fftSize);
    const started = performance.now();

    const tick = () => {
      if (!this.analyser || !this.ctx) return;
      this.analyser.getFloatTimeDomainData(buffer);
      const rms = Math.sqrt(buffer.reduce((s, x) => s + x * x, 0) / buffer.length);
      const now = performance.now();

      /**
       * Autocorrelation is quadratic in the search range and was running on every
       * animation frame alongside face landmarking. Cry pitch does not change
       * meaningfully within 50 ms, so it is measured at 20 Hz and held between
       * measurements. Amplitude, which is cheap, is still sampled every frame.
       */
      if (rms > 0.01 && now - this.lastF0At > 50) {
        this.lastF0At = now;
        this.lastF0 = detectF0(buffer, this.ctx.sampleRate);
      } else if (rms <= 0.01) {
        this.lastF0 = null;
      }

      this.samples.push({ t: now - started, rms, f0: this.lastF0 });
      this.raf = requestAnimationFrame(tick);
    };
    tick();
  }

  stop(): void {
    cancelAnimationFrame(this.raf);
    this.source?.disconnect();
    void this.ctx?.close();
    this.ctx = null;
    this.analyser = null;
    this.source = null;
  }

  summarise(): CryFeatures {
    if (this.samples.length === 0) {
      return {
        f0Median: null,
        f0Max: null,
        cryProportion: 0,
        rmsNormalised: 0,
        longestBoutSeconds: 0,
        usable: false,
      };
    }

    const peak = Math.max(...this.samples.map((s) => s.rms));
    const floor = (this.options.silenceFloor ?? 0.15) * peak;

    const voiced = this.samples.filter(
      (s) => s.rms > floor && s.f0 !== null && s.f0 >= NEONATAL_F0_MIN_HZ && s.f0 <= NEONATAL_F0_MAX_HZ,
    );

    // Background level estimated from the quietest quartile of the window.
    const sorted = [...this.samples].map((s) => s.rms).sort((a, b) => a - b);
    const background = sorted[Math.floor(sorted.length * 0.25)] ?? 0;
    const snr = background > 0 ? peak / background : Infinity;
    const usable = voiced.length > 0 && snr > (this.options.noiseFloorRatio ?? 3);

    const f0s = voiced.map((s) => s.f0!).sort((a, b) => a - b);
    const med = f0s.length ? f0s[Math.floor(f0s.length / 2)] : null;

    // Longest continuous run of voiced frames.
    let longest = 0;
    let run = 0;
    let lastT = 0;
    for (const s of this.samples) {
      const isVoiced = s.rms > floor && s.f0 !== null;
      if (isVoiced) {
        run += s.t - lastT;
        longest = Math.max(longest, run);
      } else {
        run = 0;
      }
      lastT = s.t;
    }

    return {
      f0Median: med,
      f0Max: f0s.length ? f0s[f0s.length - 1] : null,
      cryProportion: voiced.length / this.samples.length,
      rmsNormalised: peak > 0 ? voiced.reduce((s, v) => s + v.rms, 0) / (voiced.length || 1) / peak : 0,
      longestBoutSeconds: longest / 1000,
      usable,
    };
  }
}

/**
 * Fundamental frequency by autocorrelation, restricted to the neonatal cry band.
 *
 * Restricting the lag search guarantees only that the answer is in band. It does
 * not exclude an out-of-band source, which was the previous claim here and was
 * wrong: adult speech was reported at the top of the band rather than declined.
 * The two guards at the end of the function are what actually reject a source
 * whose true period lies outside the searched range; see the comment there for
 * the measured values.
 */
export const detectF0 = (buffer: Float32Array, sampleRate: number): number | null => {
  const minLag = Math.floor(sampleRate / NEONATAL_F0_MAX_HZ);
  const maxLag = Math.floor(sampleRate / NEONATAL_F0_MIN_HZ);
  if (maxLag >= buffer.length) return null;

  let bestLag = -1;
  let bestCorr = 0;
  let energy = 0;
  for (let i = 0; i < buffer.length; i++) energy += buffer[i] * buffer[i];
  if (energy === 0) return null;

  for (let lag = minLag; lag <= maxLag; lag++) {
    let corr = 0;
    for (let i = 0; i < buffer.length - lag; i++) corr += buffer[i] * buffer[i + lag];
    const normalised = corr / energy;
    if (normalised > bestCorr) {
      bestCorr = normalised;
      bestLag = lag;
    }
  }

  // A weak peak means no periodic source; report nothing rather than a number.
  if (bestLag < 0 || bestCorr < 0.3) return null;

  /**
   * Restricting the lag search does not, on its own, exclude an out-of-band
   * source. It only guarantees the ANSWER is in band, which is a different and
   * much weaker property, and the comment above used to claim the stronger one.
   *
   * Measured against pure tones, the unguarded search reported a 120 Hz adult
   * voice as 750 Hz and a 150 Hz voice as 750 Hz, because the correlation of a
   * long-period source is still rising at the shortest lag searched, so the peak
   * lands pinned against the range boundary. It reported 800 Hz as 400 Hz and
   * 900 Hz as 449 Hz, because a source above the band correlates at a multiple
   * of its true period that happens to fall inside the searched range.
   *
   * Both matter clinically and in opposite directions. 750 Hz is the top of the
   * band and drives the maximum cry-pitch contribution in the pain index, so a
   * conversation at the bedside produced the strongest possible cry signal. An
   * octave error halves a genuinely high-pitched cry and under-reports it.
   *
   * The two guards below are properties of the signal, not clinical thresholds.
   */

  // A peak pinned against either end of the search range is characteristic of a
  // source whose true period lies outside it. The cost is that a cry at exactly
  // 300 or 750 Hz is now declined; 310 and 700 Hz still read correctly.
  if (bestLag === minLag || bestLag === maxLag) return null;

  // If the waveform correlates as strongly at half the detected lag, the true
  // period is the shorter one and the fundamental is above the band, so this is
  // an octave error rather than a reading. A genuine fundamental anti-correlates
  // at half its period, so this does not fire on real cry, including cry with a
  // strong second harmonic.
  const half = Math.round(bestLag / 2);
  if (half >= 1 && normalisedCorrelation(buffer, half) >= 0.8 * normalisedCorrelation(buffer, bestLag)) {
    return null;
  }

  return sampleRate / bestLag;
};

/**
 * Correlation at one lag, normalised by the energy of the two overlapping
 * windows rather than of the whole buffer, so values at different lags are
 * comparable. The search above uses whole-buffer energy, which is fine for
 * finding a peak but not for comparing two lags against each other.
 */
const normalisedCorrelation = (buffer: Float32Array, lag: number): number => {
  let corr = 0;
  let energyA = 0;
  let energyB = 0;
  for (let i = 0; i < buffer.length - lag; i++) {
    corr += buffer[i] * buffer[i + lag];
    energyA += buffer[i] * buffer[i];
    energyB += buffer[i + lag] * buffer[i + lag];
  }
  const denominator = Math.sqrt(energyA * energyB);
  return denominator > 0 ? corr / denominator : 0;
};
