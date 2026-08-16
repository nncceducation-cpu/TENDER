import { useCallback, useEffect, useRef, useState } from 'react';
import { Camera, CircleStop, Gauge, ScanFace, ShieldCheck } from 'lucide-react';
import { FaceLandmarkerService, assessFrameQuality } from '../ai/faceLandmarker';
import { calibrate, codeFrame, describeCalibration, rawActivations, summariseWindow } from '../ai/nfcsFeatures';
import { CryAnalyser } from '../ai/cry';
import { TransparentIndex } from '../ai/painModel';
import { buildSuggestions } from '../ai/suggestions';
import { useStore } from '../state/store';
import { Button, Callout, Card, Stat } from './ui';
import type { NfcsAction, NfcsFrame, AiEvidence } from '../domain/types';

type Mode = 'idle' | 'calibrating' | 'observing';

/**
 * Landmarking runs at this rate rather than at the display refresh rate.
 *
 * NFCS is coded per second and frames are collapsed into one-second bins by
 * majority vote, so fifteen samples a second is ample evidence for each bin.
 * Running inference on every animation frame quadrupled the CPU cost for no
 * measurable gain and, on a workstation without a usable GPU, left the main
 * thread too busy to respond to the button that ends the recording.
 */
const DETECT_INTERVAL_MS = 1000 / 15;

/**
 * Bedside capture panel.
 *
 * Two things about the flow are deliberate. The camera is never on unless the
 * clinician has just pressed a button, and the panel refuses to code anything
 * until a settled baseline has been recorded for this infant, because NFCS is
 * defined relative to the individual face at rest.
 */
export const FacialCapture = ({ onEvidence }: { onEvidence?: (e: AiEvidence) => void }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const serviceRef = useRef<FaceLandmarkerService | null>(null);
  const cryRef = useRef<CryAnalyser | null>(null);
  const framesRef = useRef<NfcsFrame[]>([]);
  const baselineRef = useRef<{ activations: Record<NfcsAction, number>; quality: number }[]>([]);
  const rafRef = useRef(0);
  const startedRef = useRef(0);
  const lastUiUpdateRef = useRef(0);
  const lastDetectRef = useRef(0);

  const [mode, setMode] = useState<Mode>('idle');
  /**
   * Compiling the landmarker WASM and initialising the graph takes a few seconds
   * the first time. Without a busy state the buttons stayed live during that
   * window, and a second click started a second load.
   */
  const [starting, setStarting] = useState(false);
  const [status, setStatus] = useState<string>('Camera off.');
  const [problems, setProblems] = useState<string[]>([]);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const calibration = useStore((s) => s.calibration);
  const setCalibration = useStore((s) => s.setCalibration);
  const selectedScale = useStore((s) => s.selectedScale);
  const ctx = useStore((s) => s.ctx);
  const setAiEvidence = useStore((s) => s.setAiEvidence);

  /**
   * getUserMedia requires a secure context. Opening the standalone build from a
   * file:// origin is not one, so the panel says why instead of throwing an
   * opaque permission error when the button is pressed.
   */
  const fromDisk = typeof location !== 'undefined' && location.protocol === 'file:';
  const captureAvailable =
    !fromDisk &&
    typeof window !== 'undefined' &&
    window.isSecureContext &&
    typeof navigator !== 'undefined' &&
    Boolean(navigator.mediaDevices?.getUserMedia);

  const stopAll = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    cryRef.current?.stop();
    cryRef.current = null;
    const stream = videoRef.current?.srcObject as MediaStream | null;
    stream?.getTracks().forEach((t) => t.stop());
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  useEffect(() => () => stopAll(), [stopAll]);

  const startStream = async (withAudio: boolean) => {
    // 960x540 is well above what facial action coding needs and costs less to
    // move through the pipeline than 720p on a workstation without a usable GPU.
    const video = { width: { ideal: 960 }, height: { ideal: 540 }, facingMode: 'environment' };

    /**
     * Requesting audio and video together fails as a unit. A workstation with no
     * microphone, or a user who declines the microphone prompt, would lose facial
     * coding as well. Audio is optional, so it is requested separately and its
     * absence is tolerated.
     */
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video, audio: withAudio });
    } catch (e) {
      if (!withAudio) throw e;
      stream = await navigator.mediaDevices.getUserMedia({ video, audio: false });
      setStatus('Microphone unavailable, so cry features will not be captured. Facial coding continues.');
      withAudio = false;
    }
    if (!videoRef.current) throw new Error('Video element not mounted.');
    videoRef.current.srcObject = stream;
    await videoRef.current.play();

    if (withAudio && stream.getAudioTracks().length > 0) {
      cryRef.current = new CryAnalyser();
      await cryRef.current.start(stream);
    }
    return stream;
  };

  const loop = useCallback(
    (collecting: 'baseline' | 'window') => {
      const tick = () => {
        const video = videoRef.current;
        const service = serviceRef.current;
        if (!video || !service || video.readyState < 2) {
          rafRef.current = requestAnimationFrame(tick);
          return;
        }

        const now = performance.now();
        if (now - lastDetectRef.current < DETECT_INTERVAL_MS) {
          rafRef.current = requestAnimationFrame(tick);
          return;
        }
        lastDetectRef.current = now;

        const result = service.detect(video, now);
        const q = assessFrameQuality(result, video.videoWidth, video.videoHeight);

        /**
         * Coding runs every frame; the interface updates four times a second.
         * Setting React state on every animation frame re-rendered this panel at
         * the camera's frame rate, which competed with the landmarker for the
         * main thread and dropped the frames the coding depends on.
         */
        if (now - lastUiUpdateRef.current > 250) {
          lastUiUpdateRef.current = now;
          setProblems(q.problems);
          setElapsed((now - startedRef.current) / 1000);
        }

        if (result && result.faceLandmarks.length > 0) {
          if (collecting === 'baseline') {
            baselineRef.current.push({ activations: rawActivations(result), quality: q.quality });
          } else {
            framesRef.current.push(
              codeFrame(result, calibration, q.quality, now - startedRef.current),
            );
          }
        }
        rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);
    },
    [calibration],
  );

  const beginCalibration = async () => {
    if (starting || mode !== 'idle') return;
    setError(null);
    setStarting(true);
    try {
      serviceRef.current ??= new FaceLandmarkerService();
      setStatus('Loading the on-device model...');
      await serviceRef.current.load();
      await startStream(false);
      baselineRef.current = [];
      startedRef.current = performance.now();
      lastDetectRef.current = 0;
      setMode('calibrating');
      setStatus('Recording a settled baseline. Do not handle the infant.');
      loop('baseline');
    } catch (e) {
      setError(
        e instanceof Error
          ? `${e.message}. Check that the browser has camera permission and that the model files are present in public/models.`
          : String(e),
      );
      setMode('idle');
    } finally {
      setStarting(false);
    }
  };

  const finishCalibration = () => {
    cancelAnimationFrame(rafRef.current);
    const elapsedSeconds = (performance.now() - startedRef.current) / 1000;
    stopAll();
    const result = calibrate(ctx.localId || 'unidentified', baselineRef.current, {
      elapsedSeconds,
      source: 'live',
    });
    if ('error' in result) {
      setError(result.error);
      setStatus('Baseline rejected.');
    } else {
      setCalibration(result);
      setStatus(`Baseline stored: ${describeCalibration(result)}.`);
    }
    setMode('idle');
  };

  const beginObservation = async () => {
    if (starting || mode !== 'idle') return;
    setError(null);
    setStarting(true);
    try {
      serviceRef.current ??= new FaceLandmarkerService();
      await serviceRef.current.load();
      await startStream(true);
      framesRef.current = [];
      startedRef.current = performance.now();
      lastDetectRef.current = 0;
      setMode('observing');
      setStatus('Coding facial actions.');
      loop('window');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setMode('idle');
    } finally {
      setStarting(false);
    }
  };

  const finishObservation = async () => {
    cancelAnimationFrame(rafRef.current);
    const windowSeconds = (performance.now() - startedRef.current) / 1000;
    const cry = cryRef.current?.summarise();
    stopAll();

    const facial = summariseWindow(framesRef.current, windowSeconds);
    const index = await new TransparentIndex().infer({ facial, cry });
    const { suggestions, abstentions } = buildSuggestions(selectedScale, facial, cry, undefined);

    const evidence: AiEvidence = {
      modelVersion: 'tender-facial-1.0.0 / transparent-index-1.0.0',
      capturedAt: new Date().toISOString(),
      facial,
      cry,
      suggestions,
      index: { value: index.value, confidence: index.confidence, calibrated: index.calibrated },
      abstentions: [...abstentions, ...index.abstentions],
    };

    setAiEvidence(evidence);
    onEvidence?.(evidence);
    setMode('idle');
    setStatus(
      `Window closed: ${facial.secondsUsable} usable seconds of ${windowSeconds.toFixed(0)}, NFCS-P-3 ${facial.nfcsP3Sum}/30.`,
    );
  };

  const evidence = useStore((s) => s.latestAiEvidence);

  return (
    <Card title="On-device facial coding" icon={<ScanFace className="w-5 h-5 text-sky-700" />}>
      <div className="space-y-4">
        <Callout tone="ok" title="Nothing leaves this device">
          Video and audio are processed in the browser. No frame, no landmark and no audio sample is
          transmitted or stored. What is retained is the coded action counts and the score.
        </Callout>

        <div className="relative rounded-lg overflow-hidden bg-slate-900 aspect-video">
          <video ref={videoRef} className="w-full h-full object-cover" muted playsInline />
          {mode === 'idle' && (
            <div className="absolute inset-0 grid place-items-center text-slate-400 text-sm">
              <span className="flex items-center gap-2">
                <Camera className="w-4 h-4" /> Camera off
              </span>
            </div>
          )}
          {mode !== 'idle' && (
            <div className="absolute top-2 left-2 px-2 py-1 rounded bg-black/60 text-white text-xs font-mono">
              {mode === 'calibrating' ? 'BASELINE' : 'CODING'} {elapsed.toFixed(1)} s
            </div>
          )}
        </div>

        <p className="text-sm text-slate-600">{status}</p>

        {problems.length > 0 && mode !== 'idle' && (
          <Callout tone="warn" title="Capture quality">
            <ul className="list-disc list-inside space-y-0.5">
              {problems.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          </Callout>
        )}

        {error && (
          <Callout tone="danger" title="Capture failed">
            {error}
          </Callout>
        )}

        {!calibration && mode === 'idle' && (
          <Callout tone="warn" title="Baseline required before coding">
            NFCS actions are defined relative to this infant's own resting face. Record at least 20
            seconds while the infant is settled and unhandled. A baseline taken during handling makes
            every later reading measure against a distressed reference and will under-report pain.
          </Callout>
        )}

        {calibration && (
          <div className="text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded p-3 space-y-1">
            <p className="font-semibold text-slate-700 flex items-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5" /> Calibrated for {calibration.localId}
            </p>
            {calibration.notes.map((n) => (
              <p key={n}>{n}</p>
            ))}
          </div>
        )}

        {!captureAvailable && (
          <Callout tone="warn" title="Camera unavailable from this origin">
            {fromDisk
              ? 'This page was opened directly from disk. Chrome will not grant camera access to a file:// origin, and the model files cannot be loaded from one either. Every other screen works normally here.'
              : 'The browser will only grant camera access in a secure context.'}{' '}
            To use live capture, serve the application over <code>localhost</code> with{' '}
            <code>npm run dev</code>, or over HTTPS on the unit network. Coding a recorded
            clip needs no camera permission and works here.
          </Callout>
        )}

        <div className="flex flex-wrap gap-2">
          {mode === 'idle' && (
            <>
              <Button
                onClick={beginCalibration}
                variant="ghost"
                disabled={!captureAvailable || starting}
              >
                <Gauge className="w-4 h-4" />
                {starting
                  ? 'Starting...'
                  : calibration
                    ? 'Re-record baseline'
                    : 'Record baseline'}
              </Button>
              <Button
                onClick={beginObservation}
                disabled={!calibration || !captureAvailable || starting}
              >
                <Camera className="w-4 h-4" />
                {starting ? 'Starting...' : 'Start observation window'}
              </Button>
            </>
          )}
          {mode === 'calibrating' && (
            <Button onClick={finishCalibration} variant="ghost">
              <CircleStop className="w-4 h-4" /> Finish baseline
            </Button>
          )}
          {mode === 'observing' && (
            <Button onClick={finishObservation} variant="danger">
              <CircleStop className="w-4 h-4" /> Close window and score
            </Button>
          )}
        </div>

        {evidence?.facial && (
          <div className="space-y-3 pt-2 border-t border-slate-200">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <Stat label="NFCS-P-3" value={`${evidence.facial.nfcsP3Sum}/30`} />
              <Stat label="Usable seconds" value={evidence.facial.secondsUsable} />
              <Stat label="Mean quality" value={evidence.facial.meanQuality.toFixed(2)} />
              <Stat
                label="Index (uncalibrated)"
                value={evidence.index ? evidence.index.value.toFixed(2) : '-'}
              />
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase text-slate-500">
                  <th className="py-1">Action</th>
                  <th className="py-1 text-right">Present</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(evidence.facial.proportionPresent).map(([action, p]) => (
                  <tr key={action} className="border-t border-slate-100">
                    <td className="py-1 capitalize text-slate-700">{action.replace(/_/g, ' ')}</td>
                    <td className="py-1 text-right tabular-nums text-slate-600">
                      {Number.isFinite(p) ? `${(p * 100).toFixed(0)}%` : 'not measurable'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {evidence.abstentions.length > 0 && (
              <Callout tone="info" title="What the model would not say">
                <ul className="list-disc list-inside space-y-0.5">
                  {evidence.abstentions.map((a) => (
                    <li key={a}>{a}</li>
                  ))}
                </ul>
              </Callout>
            )}
          </div>
        )}
      </div>
    </Card>
  );
};
