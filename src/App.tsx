import { HeartPulse, Baby, Stethoscope, Pill, Clock, ArrowLeftRight, LineChart, ShieldCheck } from 'lucide-react';
import { useStore, type Screen } from './state/store';
import { ContextScreen } from './components/ContextScreen';
import { AssessScreen } from './components/AssessScreen';
import { OrdersScreen, WeanScreen } from './components/OrdersWeanScreens';
import { ConverterScreen } from './components/ConverterScreen';
import { ProtocolScreen, TrendScreen } from './components/ProtocolTrendScreens';
import { PreReleaseBanner } from './components/PreReleaseBanner';
import { PROTOCOL_VERSION } from './data/protocol/ach';

const NAV: { id: Screen; label: string; icon: typeof Baby }[] = [
  { id: 'context', label: 'Context', icon: Baby },
  { id: 'assess', label: 'Assess', icon: Stethoscope },
  { id: 'orders', label: 'Orders', icon: Pill },
  { id: 'wean', label: 'Wean', icon: Clock },
  { id: 'converter', label: 'Convert', icon: ArrowLeftRight },
  { id: 'trend', label: 'Trend', icon: LineChart },
  { id: 'protocol', label: 'Protocol', icon: ShieldCheck },
];

const SCREENS: Record<Screen, () => React.ReactElement> = {
  context: ContextScreen,
  assess: AssessScreen,
  orders: OrdersScreen,
  wean: WeanScreen,
  converter: ConverterScreen,
  trend: TrendScreen,
  protocol: ProtocolScreen,
};

export default function App() {
  const screen = useStore((s) => s.screen);
  const setScreen = useStore((s) => s.setScreen);
  const localId = useStore((s) => s.ctx.localId);
  const Current = SCREENS[screen];

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col">
      <PreReleaseBanner />
      <header className="bg-white border-b border-slate-200 sticky top-0 z-20">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2 shrink-0">
            <div className="w-8 h-8 rounded-lg bg-sky-700 text-white grid place-items-center">
              <HeartPulse size={18} />
            </div>
            <div className="leading-tight">
              <h1 className="font-bold text-slate-800 leading-none">TENDER</h1>
              <p className="text-[10px] text-slate-500 leading-tight mt-0.5">
                <span className="font-semibold text-slate-600">T</span>ool for{' '}
                <span className="font-semibold text-slate-600">E</span>valuating{' '}
                <span className="font-semibold text-slate-600">N</span>eonatal{' '}
                <span className="font-semibold text-slate-600">D</span>istress in{' '}
                <span className="font-semibold text-slate-600">E</span>xtended{' '}
                <span className="font-semibold text-slate-600">R</span>eal-time
              </p>
            </div>
          </div>
          <div className="text-right text-xs text-slate-500 hidden sm:block">
            {localId && <p className="font-semibold text-slate-700">{localId}</p>}
            <p>
              {PROTOCOL_VERSION.id} {PROTOCOL_VERSION.version}
            </p>
          </div>
        </div>
        <nav className="max-w-5xl mx-auto px-2 flex gap-1 overflow-x-auto">
          {NAV.map((n) => {
            const Icon = n.icon;
            const active = screen === n.id;
            return (
              <button
                key={n.id}
                onClick={() => setScreen(n.id)}
                className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 transition whitespace-nowrap ${
                  active
                    ? 'border-sky-700 text-sky-800'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                <Icon className="w-4 h-4" />
                {n.label}
              </button>
            );
          })}
        </nav>
      </header>

      <main className="flex-1 w-full max-w-5xl mx-auto px-4 py-6">
        <Current />
      </main>

      <footer className="border-t border-slate-200 bg-white">
        <div className="max-w-5xl mx-auto px-4 py-4 text-xs text-slate-500 space-y-1">
          <p className="font-semibold uppercase text-slate-600">Clinical decision support</p>
          <p>
            TENDER supports clinical judgement; it does not replace it. Every dose, score and
            recommendation must be verified by the responsible clinician before it reaches a patient.
          </p>
          <p>
            Camera and microphone processing runs entirely in this browser. No image, audio or
            identifiable information is transmitted or written to disk.
          </p>
        </div>
      </footer>
    </div>
  );
}
