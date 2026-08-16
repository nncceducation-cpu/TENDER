import {
  ArrowRight,
  Camera,
  ClipboardCheck,
  Eye,
  Lock,
  ScanFace,
  Scale,
} from 'lucide-react';
import { useStore } from '../state/store';
import { Card } from './ui';
import { INK } from './viz/tokens';
import { ACTIVE_FILL } from './Shell';
import { PROTOCOL_VERSION, REVIEW_FLAGS } from '../data/protocol/ach';

/**
 * Landing page.
 *
 * The original opened on a welcome card with three claims: high precision using
 * ResNet-18 and LSTM, clinical support, non-invasive. Two of those were true and
 * one described an architecture that did not exist in the codebase. The shape is
 * kept because it works. The claims are replaced with things that can be checked
 * by reading the source, which is the only kind of claim a tool like this should
 * make on its front page.
 */

const CAPABILITIES = [
  {
    icon: Scale,
    title: 'Instruments, not invented scores',
    body: 'PIPP-R, N-PASS, COMFORTneo, EDIN, NIPS, NFCS and WAT-1, each with its validation population, its caveats and its citations. Every total prints the workings that produced it.',
  },
  {
    icon: Eye,
    title: 'Coding you can disagree with',
    body: 'The camera performs the per-second facial action coding the instruments already define, measured against this infant’s own resting face. It never fills a scale item on its own, and it abstains rather than guessing.',
  },
  {
    icon: Lock,
    title: 'Nothing leaves this device',
    body: 'Images, video and audio are processed in this browser and never uploaded, never written to disk and never persisted. Closing the tab destroys the session, deliberately.',
  },
];

export const DashboardScreen = () => {
  const setScreen = useStore((s) => s.setScreen);
  const assessments = useStore((s) => s.assessments);
  const readings = useStore((s) => s.facialReadings);
  const highFlags = REVIEW_FLAGS.filter((f) => f.severity === 'high').length;

  return (
    <div className="space-y-5">
      {/* Hero */}
      <div
        className="rounded-2xl p-6 sm:p-8 text-white"
        style={{
          background: `linear-gradient(135deg, ${ACTIVE_FILL} 0%, #0f1c2e 100%)`,
        }}
      >
        <h2 className="text-2xl sm:text-3xl font-bold leading-tight">Welcome to TENDER</h2>
        <p className="mt-2 max-w-2xl text-sm sm:text-base" style={{ color: '#d7e6e3' }}>
          Neonatal pain and sedation assessment for the Alberta Children&apos;s Hospital
          post-operative pathway, combining validated instruments with on-device facial coding.
        </p>
        <div className="mt-5 flex flex-wrap gap-2.5">
          <button
            onClick={() => setScreen('image')}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-white text-sm font-semibold"
            style={{ color: '#0f1c2e' }}
          >
            <ScanFace className="w-4 h-4" /> Start static analysis
          </button>
          <button
            onClick={() => setScreen('live')}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold border border-white/40 hover:bg-white/10"
          >
            <Camera className="w-4 h-4" /> Launch live and video
          </button>
          <button
            onClick={() => setScreen('assess')}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold border border-white/40 hover:bg-white/10"
          >
            <ClipboardCheck className="w-4 h-4" /> Score an instrument
          </button>
        </div>
      </div>

      {/* Session at a glance */}
      <div className="grid sm:grid-cols-3 gap-4">
        {[
          { label: 'Assessments this session', value: assessments.length, to: 'trend' as const },
          { label: 'Facial readings', value: readings.length, to: 'trend' as const },
          { label: 'Decisions awaiting the protocol owner', value: highFlags, to: 'protocol' as const },
        ].map((s) => (
          <button
            key={s.label}
            onClick={() => setScreen(s.to)}
            className="text-left rounded-xl bg-white border p-4 hover:border-slate-300 transition"
            style={{ borderColor: INK.grid }}
          >
            <p className="text-3xl font-bold tabular-nums" style={{ color: INK.primary }}>
              {s.value}
            </p>
            <p className="text-xs mt-1 flex items-center gap-1" style={{ color: INK.secondary }}>
              {s.label} <ArrowRight className="w-3 h-3" />
            </p>
          </button>
        ))}
      </div>

      {/* Capabilities */}
      <div className="grid md:grid-cols-3 gap-4">
        {CAPABILITIES.map((c) => {
          const Icon = c.icon;
          return (
            <div
              key={c.title}
              className="rounded-xl bg-white border p-5"
              style={{ borderColor: INK.grid }}
            >
              <div
                className="w-10 h-10 rounded-lg grid place-items-center mb-3"
                style={{ background: '#0f766e14', color: ACTIVE_FILL }}
              >
                <Icon className="w-5 h-5" />
              </div>
              <p className="font-semibold text-sm" style={{ color: INK.primary }}>
                {c.title}
              </p>
              <p className="text-sm mt-1.5 leading-relaxed" style={{ color: INK.secondary }}>
                {c.body}
              </p>
            </div>
          );
        })}
      </div>

      <Card title="What this tool does not do">
        <ul className="text-sm space-y-2 list-disc list-inside" style={{ color: INK.secondary }}>
          <li>
            It ships no trained pain classifier. The strongest published neonatal models report
            around 85 to 87 percent accuracy on datasets that are not this unit&apos;s, with a
            reported out-of-distribution gap of about 7.5 percent, so none of them transfers here
            without local validation.
          </li>
          <li>
            It produces no pain probability and no invented score out of 100. Where a number appears
            it is a defined instrument item or a stated geometric measure.
          </li>
          <li>
            It does not prescribe. It shows what the {PROTOCOL_VERSION.id} pathway says, and every
            threshold names the document it came from.
          </li>
          <li>
            The camera layer is investigational. It almost certainly meets the FDA definition of a
            device function and should be used under a research protocol, not as routine clinical
            software.
          </li>
        </ul>
      </Card>
    </div>
  );
};
