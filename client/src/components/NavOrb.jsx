import { useState, useEffect, useCallback } from 'react';
import { useSocial } from '../hooks/useSocial';

// Глобална навигация след логин: малък orb долу-дясно, който отваря
// full-screen launcher с цветно-кодирани карти за всеки режим (без емоджита).
// Скрит е напълно когато няма логнат човек (рендерира се условно в App.jsx).
const MODES = [
  { screen: 'solo', label: 'Solo', tag: 'Create your artwork', hue: 265 },
  { screen: 'collective', label: 'Collective', tag: 'Paint together', hue: 190 },
  { screen: 'moodcheck', label: 'Mirror', tag: 'Your face as particles', hue: 330 },
  { screen: 'sculpt', label: 'Sculpt', tag: 'Draw in 3D', hue: 150 },
  { screen: 'webforge', label: 'WebForge', tag: 'Draw a website', hue: 38 },
  { screen: 'social', label: 'Social', tag: 'Share & compete', hue: 205 },
  { screen: 'gallery', label: 'Archive', tag: 'Your gallery', hue: 245 },
  { screen: 'profile', label: 'Profile', tag: 'Stats & badges', hue: 300 },
];

export function NavOrb({ navigate, current }) {
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const { fetchNotifications } = useSocial();

  // Лек polling за непрочетени (компонентът съществува само докато сме логнати)
  useEffect(() => {
    let alive = true;
    const tick = () => fetchNotifications().then((n) => { if (alive) setUnread(n.filter((x) => !x.read).length); }).catch(() => {});
    tick();
    const id = setInterval(tick, 45000);
    return () => { alive = false; clearInterval(id); };
  }, [fetchNotifications]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const pick = useCallback((screen) => {
    setOpen(false);
    if (screen !== current) navigate(screen);
  }, [current, navigate]);

  return (
    <>
      {/* ── Full-screen launcher ── */}
      {open && (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 backdrop-blur-md animate-fade-in"
          onClick={() => setOpen(false)}
        >
          <div className="w-full max-w-3xl px-6" onClick={(e) => e.stopPropagation()}>
            <div className="mb-6 text-center">
              <div className="text-[11px] uppercase tracking-[0.5em] text-gray-500">CHORUS</div>
              <h2 className="font-display font-extrabold text-white text-3xl mt-1">Jump to a mode</h2>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {MODES.map((m, i) => {
                const active = current === m.screen;
                const c = `hsl(${m.hue} 80% 62%)`;
                const cd = `hsl(${m.hue} 75% 46%)`;
                return (
                  <button
                    key={m.screen}
                    onClick={() => pick(m.screen)}
                    className={`launcher-card group relative overflow-hidden rounded-2xl border p-4 text-left transition-all duration-300 hover:-translate-y-1 ${
                      active ? 'border-white/80' : 'border-white/10 hover:border-white/40'
                    }`}
                    style={{
                      background: `linear-gradient(150deg, ${c}22, ${cd}0a 60%)`,
                      boxShadow: active ? `0 0 30px -6px ${c}` : 'none',
                      animation: `launcherIn 0.42s cubic-bezier(0.2,0.8,0.2,1) both`,
                      animationDelay: `${i * 45}ms`,
                    }}
                  >
                    {/* цветна лента вместо емоджи */}
                    <span className="block h-1.5 w-10 rounded-full mb-4" style={{ background: `linear-gradient(90deg, ${c}, ${cd})` }} />
                    <div className="font-display font-extrabold text-lg text-white leading-none">{m.label}</div>
                    <div className="mt-1.5 text-[11px] text-gray-400 leading-snug">{m.tag}</div>
                    <span
                      className="pointer-events-none absolute -right-6 -bottom-6 h-20 w-20 rounded-full opacity-20 blur-xl transition-opacity duration-300 group-hover:opacity-40"
                      style={{ background: c }}
                    />
                    {active && <span className="absolute top-3 right-3 text-[9px] uppercase tracking-widest text-white/80">Here</span>}
                  </button>
                );
              })}
            </div>
            <p className="mt-6 text-center text-[11px] text-gray-600">Esc or click outside to close</p>
          </div>
        </div>
      )}

      {/* ── Orb trigger (долу-дясно) ── */}
      <button
        onClick={() => setOpen((o) => !o)}
        title="Menu"
        aria-label="Open navigation"
        className="fixed bottom-5 right-5 z-[81] flex h-14 w-14 items-center justify-center rounded-full border border-white/15 shadow-2xl transition-transform duration-300 hover:scale-105"
        style={{ background: 'radial-gradient(circle at 30% 30%, rgb(var(--accent-violet)), rgb(var(--accent-cyan)))' }}
      >
        {/* Хамбургер → X морф от три черти (без емоджи) */}
        <span className="relative block h-3.5 w-5">
          <span className={`absolute left-0 h-0.5 w-5 rounded bg-ink transition-all duration-300 ${open ? 'top-1.5 rotate-45' : 'top-0'}`} />
          <span className={`absolute left-0 top-1.5 h-0.5 w-5 rounded bg-ink transition-all duration-300 ${open ? 'opacity-0' : 'opacity-100'}`} />
          <span className={`absolute left-0 h-0.5 w-5 rounded bg-ink transition-all duration-300 ${open ? 'top-1.5 -rotate-45' : 'top-3'}`} />
        </span>
        {!open && unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-white text-ink text-[10px] font-bold flex items-center justify-center border border-ink">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
        <span className="absolute inset-0 rounded-full border border-white/20 animate-ping" style={{ animationDuration: '3s' }} />
      </button>
    </>
  );
}
