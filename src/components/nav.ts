import {
  ArrowLeftRight,
  Baby,
  Camera,
  Clock,
  LayoutDashboard,
  LineChart,
  Pill,
  ScanFace,
  ShieldCheck,
  Stethoscope,
} from 'lucide-react';
import type { Screen } from '../state/store';

/**
 * Navigation metadata, kept out of the shell so the shell stays layout only.
 *
 * The split between Static Analysis and Live & Video mirrors the original app.
 * It is a better division than the one TENDER had, where every capture route was
 * stacked inside one long assessment screen: a photograph and a bedside video are
 * different tasks, done at different moments, and the instrument scoring is a
 * third thing that neither of them completes on its own.
 */

export interface ScreenMeta {
  /** Short label for the rail. */
  nav: string;
  /** Page heading. */
  title: string;
  subtitle?: string;
  badge?: string;
  icon: typeof Baby;
}

export const SCREEN_META: Record<Screen, ScreenMeta> = {
  dashboard: {
    nav: 'Dashboard',
    title: 'Overview',
    subtitle: 'What this tool measures, and what it does not',
    icon: LayoutDashboard,
  },
  context: {
    nav: 'Infant context',
    title: 'Infant context',
    subtitle: 'Drives instrument choice, dosing and the escalation thresholds',
    icon: Baby,
  },
  image: {
    nav: 'Static analysis',
    title: 'Static facial analysis',
    subtitle: 'Facial geometry and NFCS actions from photographs, on device',
    badge: 'Face',
    icon: ScanFace,
  },
  live: {
    nav: 'Live & video',
    title: 'Live and recorded video',
    subtitle: 'Per-second coding across an observation window',
    badge: 'Behaviour',
    icon: Camera,
  },
  assess: {
    nav: 'Score instrument',
    title: 'Score an instrument',
    subtitle: 'The scored total, and what the protocol says to do about it',
    icon: Stethoscope,
  },
  orders: {
    nav: 'Post-op orders',
    title: 'Post-operative orders',
    subtitle: 'Analgesia and the assessment schedule on return from OR',
    icon: Pill,
  },
  wean: {
    nav: 'Opioid weaning',
    title: 'Opioid weaning',
    subtitle: 'The readiness gate, then the taper',
    icon: Clock,
  },
  converter: {
    nav: 'Opioid converter',
    title: 'Opioid conversion',
    subtitle: 'Equianalgesic arithmetic with its ratios stated',
    icon: ArrowLeftRight,
  },
  trend: {
    nav: 'Trends & export',
    title: 'Trends, report and raw data',
    subtitle: 'Everything recorded this session',
    icon: LineChart,
  },
  protocol: {
    nav: 'Protocol & evidence',
    title: 'Protocol and evidence',
    subtitle: 'The rules in force, the open questions, and the instrument library',
    icon: ShieldCheck,
  },
};

export const NAV_GROUPS: { label: string; items: Screen[] }[] = [
  { label: 'Overview', items: ['dashboard', 'context'] },
  { label: 'Assessment', items: ['image', 'live', 'assess'] },
  { label: 'Management', items: ['orders', 'wean', 'converter'] },
  { label: 'Record', items: ['trend', 'protocol'] },
];
