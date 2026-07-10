import { useMemo } from 'react';
import { ThemeToggle } from '../components/ThemeToggle';

// 200 CSS-only частици — генерираме inline стилове веднъж
function ParticleField() {
  const particles = useMemo(
    () =>
      Array.from({ length: 200 }, (_, i) => {
        const size = Math.random() * 3 + 1;
        const hue = [265, 190, 45, 330][i % 4];
        return {
          id: i,
          style: {
            left: `${Math.random() * 100}%`,
            top: `${Math.random() * 100}%`,
            width: `${size}px`,
            height: `${size}px`,
            background: `hsla(${hue}, 70%, 65%, ${Math.random() * 0.5 + 0.15})`,
            animationDuration: `${Math.random() * 40 + 25}s`,
            animationDelay: `-${Math.random() * 40}s`,
            '--dx1': `${(Math.random() - 0.5) * 120}px`,
            '--dy1': `${(Math.random() - 0.5) * 120}px`,
            '--dx2': `${(Math.random() - 0.5) * 120}px`,
            '--dy2': `${(Math.random() - 0.5) * 120}px`,
            '--dx3': `${(Math.random() - 0.5) * 120}px`,
            '--dy3': `${(Math.random() - 0.5) * 120}px`,
          },
        };
      }),
    []
  );

  return (
    <div className="particle-field">
      {particles.map((p) => (
        <span key={p.id} className="css-particle" style={p.style} />
      ))}
    </div>
  );
}

const FEATURES = [
  { icon: '😊', label: 'Emotion' },
  { icon: '🖐', label: 'Gesture' },
  { icon: '🎙', label: 'Voice' },
  { icon: '🖌', label: 'Brushes' },
];

export function Landing({ navigate, theme, toggleTheme }) {
  return (
    <div className="relative h-full w-full overflow-hidden bg-ink flex flex-col items-center justify-center">
      <ParticleField />

      <ThemeToggle theme={theme} onToggle={toggleTheme} className="absolute top-5 right-5 z-20" />

      <div className="relative z-10 flex flex-col items-center px-6 animate-slide-up">
        <h1 className="font-display text-6xl md:text-8xl font-bold tracking-[0.15em] text-white glow-pulse">
          CHORUS
        </h1>
        <p className="mt-3 font-body text-sm md:text-base text-gray-400 tracking-wide text-center">
          Your voice, face and hands become the brush.
        </p>

        {/* Feature strip — какво захранва рисуването */}
        <div className="mt-5 flex items-center gap-2">
          {FEATURES.map((f, i) => (
            <div key={f.label} className="flex items-center gap-2">
              <span
                className="flex items-center gap-1.5 rounded-full border border-ink-line bg-ink-soft/50 px-3 py-1 text-xs text-gray-400 backdrop-blur"
                title={f.label}
              >
                <span className="text-sm leading-none">{f.icon}</span>
                {f.label}
              </span>
              {i < FEATURES.length - 1 && <span className="text-ink-line text-xs">·</span>}
            </div>
          ))}
        </div>

        <div className="mt-10 flex flex-col md:flex-row gap-5 w-full max-w-2xl">
          <button
            onClick={() => navigate('solo')}
            className="group flex-1 rounded-2xl border border-ink-line bg-ink-soft/60 backdrop-blur p-6 text-left hover:border-violet-500 hover:bg-violet-950/20 transition-all duration-300 hover:-translate-y-0.5"
          >
            <div className="font-display text-xl text-white group-hover:text-violet-300 transition">
              SOLO
            </div>
            <div className="mt-1 text-xs uppercase tracking-widest text-violet-400/70">
              Create Your Artwork
            </div>
            <p className="mt-3 text-sm text-gray-400 leading-relaxed">
              Paint alone with a full toolbar — brushes, lines, shapes — while your emotions, voice
              and gestures shape the particles around you. Save it when it feels done.
            </p>
          </button>

          <button
            onClick={() => navigate('collective')}
            className="group flex-1 rounded-2xl border border-ink-line bg-ink-soft/60 backdrop-blur p-6 text-left hover:border-cyan-500 hover:bg-cyan-950/20 transition-all duration-300 hover:-translate-y-0.5"
          >
            <div className="font-display text-xl text-white group-hover:text-cyan-300 transition">
              COLLECTIVE
            </div>
            <div className="mt-1 text-xs uppercase tracking-widest text-cyan-400/70">
              Join the Chorus
            </div>
            <p className="mt-3 text-sm text-gray-400 leading-relaxed">
              Enter a shared session with up to 7 others. The art belongs to everyone in the room —
              end the session to receive a poem written about your moment together.
            </p>
          </button>
        </div>

        <button
          onClick={() => navigate('gallery')}
          className="mt-8 rounded-full border border-ink-line px-8 py-2.5 text-sm text-gray-300 hover:text-white hover:border-gray-500 transition backdrop-blur bg-ink-soft/40"
        >
          Gallery
        </button>
      </div>

      <div className="absolute bottom-5 text-[10px] text-gray-600 tracking-widest uppercase z-10">
        camera + microphone required for live painting
      </div>
    </div>
  );
}
