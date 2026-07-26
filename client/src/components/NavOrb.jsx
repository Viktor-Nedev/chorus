import { useState, useEffect, useRef, useCallback } from 'react';
import { useSocial } from '../hooks/useSocial';

// Радиален „orb" dock — глобална навигация след логин. Колабсиран е малък orb
// долу-дясно; при клик разцъфва дъга от режими (stagger + glow). Показва и
// точка за непрочетени нотификации. Скрит е напълно когато няма логнат човек
// (рендерира се условно в App.jsx).
const MODES = [
  { screen: 'solo', label: 'Solo', icon: '✦', accent: 'var(--accent-violet)' },
  { screen: 'collective', label: 'Collective', icon: '🌐', accent: 'var(--accent-cyan)' },
  { screen: 'moodcheck', label: 'Mirror', icon: '🪞', accent: 'var(--accent-violet)' },
  { screen: 'sculpt', label: 'Sculpt', icon: '🧊', accent: 'var(--accent-cyan)' },
  { screen: 'webforge', label: 'WebForge', icon: '⚙', accent: 'var(--accent-violet)' },
  { screen: 'social', label: 'Social', icon: '🖧', accent: 'var(--accent-cyan)' },
  { screen: 'gallery', label: 'Archive', icon: '🗂', accent: 'var(--accent-violet)' },
  { screen: 'profile', label: 'Profile', icon: '👤', accent: 'var(--accent-cyan)' },
];
const R = 176; // радиус на дъгата

export function NavOrb({ navigate, current }) {
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const { fetchNotifications } = useSocial();
  const rootRef = useRef(null);

  // Лек polling за непрочетени (само докато сме логнати → компонентът съществува)
  useEffect(() => {
    let alive = true;
    const tick = () => fetchNotifications().then((n) => { if (alive) setUnread(n.filter((x) => !x.read).length); }).catch(() => {});
    tick();
    const id = setInterval(tick, 45000);
    return () => { alive = false; clearInterval(id); };
  }, [fetchNotifications]);

  // Esc + клик навън затварят
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

  // Позиция на i-тия елемент по дъга от „нагоре" до „наляво"
  const posFor = (i) => {
    const t = MODES.length > 1 ? i / (MODES.length - 1) : 0;
    const a = ((90 + t * 92) * Math.PI) / 180; // 90°(up) → 182°(left)
    return { dx: R * Math.cos(a), dy: -R * Math.sin(a) };
  };

  return (
    <div ref={rootRef} className="fixed bottom-5 right-5 z-[70] select-none" style={{ pointerEvents: 'none' }}>
      {/* Backdrop за клик навън */}
      {open && (
        <div
          className="fixed inset-0 -z-10 bg-black/30 backdrop-blur-[2px] animate-fade-in"
          style={{ pointerEvents: 'auto' }}
          onClick={() => setOpen(false)}
        />
      )}

      {/* Режими */}
      {MODES.map((m, i) => {
        const { dx, dy } = posFor(i);
        const active = current === m.screen;
        return (
          <button
            key={m.screen}
            onClick={() => pick(m.screen)}
            title={m.label}
            className={`group absolute bottom-1 right-1 flex items-center gap-2 rounded-full border pl-2 pr-3 py-2 backdrop-blur transition-all duration-500 ${
              active ? 'border-white/70 bg-white/15 text-white' : 'border-ink-line bg-ink-soft/90 text-gray-200 hover:text-white'
            }`}
            style={{
              pointerEvents: open ? 'auto' : 'none',
              transform: open ? `translate(${dx}px, ${dy}px) scale(1)` : 'translate(0,0) scale(0.2)',
              opacity: open ? 1 : 0,
              transitionDelay: `${(open ? i : MODES.length - i) * 32}ms`,
              boxShadow: active ? `0 0 22px -4px ${m.accent}` : undefined,
            }}
          >
            <span
              className="flex h-7 w-7 items-center justify-center rounded-full text-sm"
              style={{ background: `color-mix(in srgb, ${m.accent} 22%, transparent)` }}
            >
              {m.icon}
            </span>
            <span className="text-xs font-medium whitespace-nowrap">{m.label}</span>
          </button>
        );
      })}

      {/* Централен orb */}
      <button
        onClick={() => setOpen((o) => !o)}
        title="Menu"
        className="relative flex h-14 w-14 items-center justify-center rounded-full border border-white/15 text-ink shadow-2xl transition-transform duration-500 hover:scale-105"
        style={{
          pointerEvents: 'auto',
          background: 'radial-gradient(circle at 30% 30%, rgb(var(--accent-violet)), rgb(var(--accent-cyan)))',
          transform: open ? 'rotate(135deg)' : 'rotate(0deg)',
        }}
      >
        <span className="font-display font-extrabold text-lg" style={{ transform: open ? 'rotate(-135deg)' : 'none' }}>
          {open ? '✕' : '✦'}
        </span>
        {/* Пулсиращ ринг */}
        <span className="absolute inset-0 rounded-full border border-white/20 animate-ping" style={{ animationDuration: '3s' }} />
        {/* Непрочетени */}
        {!open && unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-white text-ink text-[10px] font-bold flex items-center justify-center border border-ink">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>
    </div>
  );
}
