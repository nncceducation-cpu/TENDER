import type { ReactNode } from 'react';
import { AlertTriangle, Info, ShieldAlert, CheckCircle2 } from 'lucide-react';

export const Card = ({
  title,
  icon,
  children,
  footer,
}: {
  title?: string;
  icon?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}) => (
  <section className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
    {title && (
      <header className="px-5 py-3 bg-slate-50 border-b border-slate-200 flex items-center gap-2">
        {icon}
        <h2 className="font-semibold text-slate-800">{title}</h2>
      </header>
    )}
    <div className="p-5">{children}</div>
    {footer && <div className="px-5 py-3 bg-slate-50 border-t border-slate-200">{footer}</div>}
  </section>
);

type Tone = 'info' | 'warn' | 'danger' | 'ok';

const TONES: Record<Tone, { wrap: string; icon: ReactNode }> = {
  info: { wrap: 'bg-sky-50 border-sky-200 text-sky-900', icon: <Info className="w-4 h-4 shrink-0 mt-0.5" /> },
  warn: {
    wrap: 'bg-amber-50 border-amber-200 text-amber-900',
    icon: <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />,
  },
  danger: {
    wrap: 'bg-red-50 border-red-300 text-red-900',
    icon: <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />,
  },
  ok: {
    wrap: 'bg-emerald-50 border-emerald-200 text-emerald-900',
    icon: <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />,
  },
};

export const Callout = ({
  tone = 'info',
  title,
  children,
}: {
  tone?: Tone;
  title?: string;
  children: ReactNode;
}) => {
  const t = TONES[tone];
  return (
    <div className={`rounded-lg border p-3 flex gap-2 text-sm ${t.wrap}`}>
      {t.icon}
      <div className="space-y-1">
        {title && <p className="font-semibold">{title}</p>}
        <div className="leading-relaxed">{children}</div>
      </div>
    </div>
  );
};

export const Field = ({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) => (
  <label className="block space-y-1">
    <span className="block text-sm font-medium text-slate-700">{label}</span>
    {children}
    {hint && <span className="block text-xs text-slate-500">{hint}</span>}
  </label>
);

export const inputClass =
  'w-full px-3 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500 transition';

export const Button = ({
  children,
  onClick,
  variant = 'primary',
  disabled,
  type = 'button',
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: 'primary' | 'ghost' | 'danger';
  disabled?: boolean;
  type?: 'button' | 'submit';
}) => {
  const base =
    'inline-flex items-center gap-2 font-medium rounded-lg px-4 py-2 text-sm transition disabled:opacity-40 disabled:cursor-not-allowed';
  const styles = {
    primary: 'bg-sky-700 text-white hover:bg-sky-800',
    ghost: 'text-slate-700 hover:bg-slate-100 border border-slate-300',
    danger: 'bg-red-700 text-white hover:bg-red-800',
  }[variant];
  return (
    <button type={type} onClick={onClick} disabled={disabled} className={`${base} ${styles}`}>
      {children}
    </button>
  );
};

export const Stat = ({
  label,
  value,
  unit,
  tone,
}: {
  label: string;
  value: string | number;
  unit?: string;
  tone?: 'default' | 'alert';
}) => (
  <div
    className={`rounded-lg border p-3 ${
      tone === 'alert' ? 'border-red-300 bg-red-50' : 'border-slate-200 bg-white'
    }`}
  >
    <p className="text-[11px] uppercase tracking-wide font-semibold text-slate-500">{label}</p>
    <p className="mt-1">
      <span className={`text-2xl font-bold ${tone === 'alert' ? 'text-red-800' : 'text-slate-800'}`}>
        {value}
      </span>
      {unit && <span className="ml-1 text-sm text-slate-500">{unit}</span>}
    </p>
  </div>
);
