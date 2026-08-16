import { useStore, type Screen } from './state/store';
import { Shell } from './components/Shell';
import { DashboardScreen } from './components/DashboardScreen';
import { ContextScreen } from './components/ContextScreen';
import { StaticAnalysisScreen, LiveVideoScreen } from './components/CaptureScreens';
import { AssessScreen } from './components/AssessScreen';
import { OrdersScreen, WeanScreen } from './components/OrdersWeanScreens';
import { ConverterScreen } from './components/ConverterScreen';
import { ProtocolScreen, TrendScreen } from './components/ProtocolTrendScreens';
import { PreReleaseBanner } from './components/PreReleaseBanner';

const SCREENS: Record<Screen, () => React.ReactElement> = {
  dashboard: DashboardScreen,
  context: ContextScreen,
  image: StaticAnalysisScreen,
  live: LiveVideoScreen,
  assess: AssessScreen,
  orders: OrdersScreen,
  wean: WeanScreen,
  converter: ConverterScreen,
  trend: TrendScreen,
  protocol: ProtocolScreen,
};

export default function App() {
  const screen = useStore((s) => s.screen);
  const Current = SCREENS[screen];

  return (
    <Shell>
      <PreReleaseBanner />
      <Current />
    </Shell>
  );
}
