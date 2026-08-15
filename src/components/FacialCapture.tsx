import { useCallback, useEffect, useRef, useState } from 'react';
import { Camera, CircleStop, Gauge, ScanFace, ShieldCheck } from 'lucide-react';
import { FaceLandmarkerService, assessFrameQuality } from '../ai/faceLandmarker';
import { calibrate, codeFrame, rawActivations, summariseWindow } from '../ai/nfcsFeatures';
import { CryAnalyser } from '../ai/cry';
import { TransparentIndex } from '../ai/painModel';
import { buildSuggestions } from '../ai/suggestions';
import { useStore } from '../state/store';
import { Button, Callout, Card, Stat } from './ui';
import type { NfcsAction, NfcsFrame, AiEvidence } from '../domain/types';

type Mode = 'idle' | 'calibrating' | 'observing';

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

  const [mode, setMode] = useState<Mode>('idle');
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
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'environment' },
      audio: withAudio,
    });
    if (!videoRef.current) throw new Error('Video element not mounted.');
    videoRef.current.srcObject = stream;
    await videoRef.current.play();

    if (withAudio) {
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
        const result = service.detect(video, now);
        const q = assessFrameQuality(result, video.videoWidth, video.videoHeight);
        setProblems(q.problems);
        setElapsed((now - startedRef.current) / 1000);

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
    setError(null);
    try {
      serviceRef.current ??= new FaceLandmarkerService();
      setStatus('Loading the on-device model...');
      await serviceRef.current.load();
      await startStream(false);
      baselineRef.current = [];
      startedRef.current = performance.now();
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
    }
  };

  const finishCalibration = () => {
    cancelAnimationFrame(rafRef.current);
    stopAll();
    const result = calibrate(ctx.localId || 'unidentified', baselineRef.current, { fps: 30 });
    if ('error' in result) {
      setError(result.error);
      setStatus('Baseline rejected.');
    } else {
      setCalibration(result);
      setStatus(`Baseline stored: ${result.baselineSeconds.toFixed(0)} s.`);
    }
    setMode('idle');
  };

  const beginObservation = async () => {
    setError(null);
    try {
      serviceRef.current ??= new FaceLandmarkerService();
      await serviceRef.current.load();
      await startStream(true);
      framesRef.current = [];
      startedRef.current = performance.now();
      setMode('observing');
      setStatus('Coding facial actions.');
      loop('window');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setMode('idle');
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
            To use the facial coding layer, serve the application over <code>localhost</code>{' '}
            with <code>npm run dev</code>, or over HTTPS on the unit network.
          </Callout>
        )}

        <div className="flex flex-wrap gap-2">
          {mode === 'idle' && (
            <>
              <Button onClick={beginCalibration} variant="ghost" disabled={!captureAvailable}>
                <Gauge className="w-4 h-4" /> {calibration ? 'Re-record baseline' : 'Record baseline'}
              </Button>
              <Button onClick={beginObservation} disabled={!calibration || !captureAvailable}>
                <Camera className="w-4 h-4" /> Start observation window
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
