import { useRef, useState } from 'react';
import { Cloud, CloudOff, Image as ImageIcon, Loader2, ShieldAlert, Upload } from 'lucide-react';
import { assessImage, isConfigured, VISION_MODEL_CARD, type VisionAssessment } from '../ai/visionModel';
import { COMFORTNEO } from '../data/scales';
import { useStore } from '../state/store';
import { Button, Callout, Card } from './ui';

/**
 * Cloud vision panel, rebuilt from DeepRelief's static analysis screen.
 *
 * The interaction is deliberately two-step. Selecting an image does nothing but
 * show it. A separate, explicitly labelled action transmits it. This is the only
 * outbound transmission in the application, and the person pressing the button
 * should know that at the moment they press it, not from a paragraph in a
 * settings page.
 */
export const VisionAssist = ({
  onFacialTension,
}: {
  onFacialTension?: (level: number) => void;
}) => {
  const [image, setImage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<VisionAssessment | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const clinician = useStore((s) => s.clinician);
  const audit = useStore((s) => s.audit);
  const configured = isConfigured();

  const tensionAnchor = (level: number) =>
    COMFORTNEO.items.find((i) => i.id === 'facial_tension')?.options.find((o) => o.value === level)
      ?.label ?? '';

  const pick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 8_000_000) {
      setResult({
        status: 'error',
        facialTension: null,
        nfcsActions: {},
        observations: [],
        occlusion: null,
        assessable: false,
        reason: 'That image is larger than 8 MB. Use a smaller capture.',
        modelVersion: VISION_MODEL_CARD.model,
        capturedAt: new Date().toISOString(),
      });
      return;
    }
    const reader = new FileReader();
    reader.onloadend = () => {
      setImage(reader.result as string);
      setResult(null);
    };
    reader.readAsDataURL(file);
  };

  const send = async () => {
    if (!image) return;
    setBusy(true);
    void audit.append(
      clinician || 'unattributed',
      'vision.transmitted',
      `A still image was transmitted to ${VISION_MODEL_CARD.model} for facial coding.`,
    );
    const r = await assessImage(image);
    setResult(r);
    void audit.append(
      clinician || 'unattributed',
      'vision.result',
      r.status === 'ok'
        ? `Cloud assessor returned facial tension ${r.facialTension} with occlusion ${r.occlusion}.`
        : `Cloud assessor returned no result: ${r.status}.`,
    );
    setBusy(false);
  };

  return (
    <Card
      title="Cloud second opinion"
      icon={configured ? <Cloud className="w-5 h-5 text-sky-700" /> : <CloudOff className="w-5 h-5 text-slate-400" />}
    >
      <div className="space-y-4">
        {!configured ? (
          <Callout tone="info" title="Disabled in this build">
            No Gemini key is present here, by design. The cloud assessor runs only when
            you start the application locally with a key in <code>.env.local</code>, so
            that no key is ever published and no infant image can be transmitted from a
            public page. Everything else in TENDER works without it.
          </Callout>
        ) : (
          <Callout tone="warn" title="This panel transmits">
            The image you select is sent to Google's Gemini API. It is the only part of
            this application that sends anything anywhere. Do not use it for an
            identifiable infant without the consent and approvals your unit requires.
          </Callout>
        )}

        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <div
              onClick={() => configured && fileRef.current?.click()}
              className={`h-56 rounded-lg border-2 border-dashed grid place-items-center overflow-hidden ${
                configured
                  ? 'cursor-pointer border-slate-300 hover:border-sky-500 hover:bg-sky-50/40'
                  : 'border-slate-200 bg-slate-50 cursor-not-allowed'
              }`}
            >
              {image ? (
                <img src={image} alt="Selected frame" className="max-h-full max-w-full object-contain" />
              ) : (
                <span className="text-sm text-slate-500 flex flex-col items-center gap-2">
                  <Upload className="w-6 h-6" />
                  {configured ? 'Choose a still image' : 'Unavailable in this build'}
                </span>
              )}
            </div>
            <input ref={fileRef} type="file" accept="image/*" onChange={pick} className="hidden" />

            <div className="mt-3 flex gap-2">
              <Button onClick={send} disabled={!image || busy || !configured}>
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <ImageIcon className="w-4 h-4" />}
                {busy ? 'Sending...' : 'Send to Gemini and score'}
              </Button>
              {image && (
                <Button
                  variant="ghost"
                  onClick={() => {
                    setImage(null);
                    setResult(null);
                  }}
                >
                  Clear
                </Button>
              )}
            </div>
          </div>

          <div className="space-y-3">
            {!result && (
              <p className="text-sm text-slate-500">
                Results appear here. Nothing is filled into a scale automatically.
              </p>
            )}

            {result?.status === 'ok' && result.facialTension && (
              <>
                <div className="rounded-lg border border-slate-200 p-3">
                  <p className="text-[11px] uppercase tracking-wide font-semibold text-slate-500">
                    COMFORT facial tension
                  </p>
                  <p className="text-2xl font-bold text-slate-800 mt-1">
                    Level {result.facialTension}
                  </p>
                  <p className="text-sm text-slate-600 mt-1">{tensionAnchor(result.facialTension)}</p>
                  {onFacialTension && (
                    <div className="mt-3">
                      <Button variant="ghost" onClick={() => onFacialTension(result.facialTension!)}>
                        Propose for COMFORTneo facial tension
                      </Button>
                    </div>
                  )}
                </div>

                <div className="rounded-lg border border-slate-200 p-3">
                  <p className="text-[11px] uppercase tracking-wide font-semibold text-slate-500 mb-2">
                    NFCS actions coded on this frame
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {Object.entries(result.nfcsActions).map(([action, present]) => (
                      <span
                        key={action}
                        className={`px-2 py-0.5 rounded-full text-xs border ${
                          present
                            ? 'bg-amber-50 border-amber-200 text-amber-900'
                            : 'bg-slate-50 border-slate-200 text-slate-400'
                        }`}
                      >
                        {action.replace(/_/g, ' ')}
                      </span>
                    ))}
                  </div>
                  <p className="mt-2 text-xs text-slate-500">
                    Occlusion judged {result.occlusion ?? 'unknown'}. One frame cannot
                    produce an NFCS epoch score, which is summed per second across a
                    window. Use the on-device coder for that.
                  </p>
                </div>

                {result.observations.length > 0 && (
                  <ul className="text-sm text-slate-600 list-disc list-inside space-y-1">
                    {result.observations.map((o) => (
                      <li key={o}>{o}</li>
                    ))}
                  </ul>
                )}
              </>
            )}

            {result && result.status !== 'ok' && (
              <Callout
                tone={result.status === 'abstained' ? 'info' : 'danger'}
                title={result.status === 'abstained' ? 'The model declined to score' : 'No result'}
              >
                {result.reason}
              </Callout>
            )}
          </div>
        </div>

        <details className="text-sm">
          <summary className="cursor-pointer font-medium text-slate-700 flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-amber-600" />
            What this model is, and what it is not
          </summary>
          <div className="mt-2 space-y-2 text-slate-600">
            <p>
              <span className="font-medium">Model:</span> {VISION_MODEL_CARD.model}.{' '}
              {VISION_MODEL_CARD.trainedOn}
            </p>
            <p>
              <span className="font-medium">Measured performance:</span>{' '}
              {VISION_MODEL_CARD.reportedPerformance}
            </p>
            <ul className="list-disc list-inside space-y-1">
              {VISION_MODEL_CARD.knownLimitations.map((l) => (
                <li key={l}>{l}</li>
              ))}
            </ul>
            <p className="pt-2 border-t border-slate-200">
              The predecessor tool attributed this analysis to ResNet-18 and LSTM
              architectures and cited 88.3% accuracy from the PFECIC dataset. Neither
              applies. There is no ResNet and no LSTM in that codebase, the work is done
              by a general-purpose language model, and PFECIC was built on 53 critically
              ill children aged one to eighteen years, a population that excludes
              neonates. No accuracy figure from that work transfers here.
            </p>
          </div>
        </details>
      </div>
    </Card>
  );
};
