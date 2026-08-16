import { useState, type ReactNode } from 'react';
import { Menu, X } from 'lucide-react';
import { useStore } from '../state/store';
import { PROTOCOL_VERSION } from '../data/protocol/ach';
import { NAV_GROUPS, SCREEN_META } from './nav';

/**
 * Application shell.
 *
 * The layout follows the one Dr Mohammad built in DeepRelief, because it was the
 * better shape: a fixed dark rail that always says where you are, a titled
 * content area, and work that happens in two columns rather than a single
 * scrolling stack. What is different is what the panels are allowed to claim.
 *
 * Colours were checked rather than chosen. The rail is #0f1c2e; nav labels at
 * #cbd5e1 give 11.5:1, the group headings at #94a3b8 give 6.7:1, and the active
 * fill is #0f766e rather than DeepRelief's brighter #0d9488 because that one put
 * white 14px text at 3.7:1, under the 4.5 needed for normal-weight body text.
 * #0f766e reads 5.5:1 on white text and 3.1:1 against the rail, so the block is
 * still visibly a block.
 */

const RAIL = '#0f1c2e';
const RAIL_PANEL = '#16263b';
export const ACTIVE_FILL = '#0f766e';

const Brand = () => (
  <div className="flex items-center gap-2.5 px-4 py-4">
    <div
      className="w-9 h-9 rounded-lg grid place-items-center shrink-0"
      style={{ background: ACTIVE_FILL }}
    >
      <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="#fff" strokeWidth={2}>
        <path d="M3 12h3l2-5 3 10 2.5-7 1.5 2h6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
    <div className="leading-tight min-w-0">
      <p className="font-bold text-white text-[15px] leading-none">TENDER</p>
      <p className="text-[10px] leading-snug mt-1" style={{ color: '#94a3b8' }}>
        <span className="text-white font-semibold">T</span>ool for{' '}
        <span className="text-white font-semibold">E</span>valuating{' '}
        <span className="text-white font-semibold">N</span>eonatal{' '}
        <span className="text-white font-semibold">D</span>istress in{' '}
        <span className="text-white font-semibold">E</span>xtended{' '}
        <span className="text-white font-semibold">R</span>eal-time
      </p>
    </div>
  </div>
);

const NavList = ({ onNavigate }: { onNavigate?: () => void }) => {
  const screen = useStore((s) => s.screen);
  const setScreen = useStore((s) => s.setScreen);

  return (
    <nav className="flex-1 overflow-y-auto px-2 pb-4">
      {NAV_GROUPS.map((group) => (
        <div key={group.label} className="mb-3">
          <p
            className="px-2 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-wider"
            style={{ color: '#94a3b8' }}
          >
            {group.label}
          </p>
          {group.items.map((id) => {
            const meta = SCREEN_META[id];
            const Icon = meta.icon;
            const active = screen === id;
            return (
              <button
                key={id}
                onClick={() => {
                  setScreen(id);
                  onNavigate?.();
                }}
                aria-current={active ? 'page' : undefined}
                className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-left transition mb-0.5"
                style={{
                  background: active ? ACTIVE_FILL : 'transparent',
                  color: active ? '#ffffff' : '#cbd5e1',
                }}
                onMouseEnter={(e) => {
                  if (!active) e.currentTarget.style.background = RAIL_PANEL;
                }}
                onMouseLeave={(e) => {
                  if (!active) e.currentTarget.style.background = 'transparent';
                }}
              >
                <Icon className="w-[18px] h-[18px] shrink-0" />
                <span className="text-sm font-medium flex-1 leading-tight">{meta.nav}</span>
                {meta.badge && (
                  <span
                    className="text-[10px] px-1.5 py-0.5 rounded font-semibold shrink-0"
                    style={{
                      background: active ? 'rgba(255,255,255,0.22)' : RAIL_PANEL,
                      color: active ? '#ffffff' : '#cbd5e1',
                    }}
                  >
                    {meta.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      ))}
    </nav>
  );
};

const RailFooter = () => (
  <div className="px-4 py-3 border-t" style={{ borderColor: RAIL_PANEL }}>
    <p className="text-[11px]" style={{ color: '#94a3b8' }}>
      Processing:{' '}
      <span className="font-semibold" style={{ color: '#34d399' }}>
        on this device
      </span>
    </p>
    <p className="text-[11px] mt-0.5" style={{ color: '#64748b' }}>
      {PROTOCOL_VERSION.version} · pre-release
    </p>
  </div>
);

export const Shell = ({ children }: { children: ReactNode }) => {
  const screen = useStore((s) => s.screen);
  const localId = useStore((s) => s.ctx.localId);
  const clinician = useStore((s) => s.clinician);
  const [menuOpen, setMenuOpen] = useState(false);
  const meta = SCREEN_META[screen];

  const initials =
    clinician
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase())
      .join('') || '–';

  return (
    <div className="min-h-screen flex" style={{ background: '#f1f5f9' }}>
      {/* Fixed rail, desktop. */}
      <aside
        className="hidden md:flex w-60 shrink-0 flex-col sticky top-0 h-screen"
        style={{ background: RAIL }}
      >
        <Brand />
        <NavList />
        <RailFooter />
      </aside>

      {/* Slide-over rail, small screens. */}
      {menuOpen && (
        <div className="md:hidden fixed inset-0 z-40 flex">
          <div
            className="w-64 flex flex-col h-full shadow-xl"
            style={{ background: RAIL }}
          >
            <div className="flex items-center justify-between pr-2">
              <Brand />
              <button
                onClick={() => setMenuOpen(false)}
                className="p-2 rounded-lg"
                style={{ color: '#cbd5e1' }}
                aria-label="Close navigation"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <NavList onNavigate={() => setMenuOpen(false)} />
            <RailFooter />
          </div>
          <button
            className="flex-1 bg-black/40"
            onClick={() => setMenuOpen(false)}
            aria-label="Close navigation"
          />
        </div>
      )}

      <div className="flex-1 min-w-0 flex flex-col">
        <header className="bg-white border-b border-slate-200 sticky top-0 z-30">
          <div className="px-4 sm:px-6 h-16 flex items-center gap-3">
            <button
              onClick={() => setMenuOpen(true)}
              className="md:hidden p-2 -ml-2 rounded-lg text-slate-600 hover:bg-slate-100"
              aria-label="Open navigation"
            >
              <Menu className="w-5 h-5" />
            </button>

            <div className="min-w-0 flex-1">
              <h1 className="text-lg font-semibold text-slate-900 truncate">{meta.title}</h1>
              {meta.subtitle && (
                <p className="text-xs text-slate-500 truncate">{meta.subtitle}</p>
              )}
            </div>

            {localId && (
              <span className="hidden sm:inline text-xs font-semibold px-2.5 py-1 rounded-full bg-slate-100 text-slate-700">
                {localId}
              </span>
            )}
            <div
              className="w-9 h-9 rounded-full grid place-items-center text-xs font-bold text-white shrink-0"
              style={{ background: RAIL }}
              title={clinician || 'No clinician recorded'}
            >
              {initials}
            </div>
          </div>
        </header>

        <main className="flex-1 px-4 sm:px-6 py-6">
          <div className="max-w-6xl mx-auto">{children}</div>
        </main>

        <footer className="border-t border-slate-200 bg-white">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4 text-xs text-slate-500 space-y-1">
            <p className="font-semibold uppercase text-slate-600">Clinical decision support</p>
            <p>
              TENDER supports clinical judgement; it does not replace it. Every dose, score and
              recommendation must be verified by the responsible clinician before it reaches a
              patient.
            </p>
            <p>
              Camera and image processing runs entirely in this browser. No image, audio or
              identifiable information is transmitted or written to disk.
            </p>
          </div>
        </footer>
      </div>
    </div>
  );
};
