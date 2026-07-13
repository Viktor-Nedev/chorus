import { useMemo } from 'react';

// Пълноекранен воал за преходи между екрани — тъмна завеса с дрейфащи
// частици, за да изглежда смяната като "разтваряща се материя", не като
// мигновен swap. Управлява се от App.jsx чрез phase: 'in' | 'out' | null.
export function TransitionVeil({ phase }) {
  const particles = useMemo(
    () =>
      Array.from({ length: 40 }, (_, i) => {
        const size = Math.random() * 3 + 1.5;
        return {
          id: i,
          style: {
            left: `${Math.random() * 100}%`,
            top: `${Math.random() * 100}%`,
            width: `${size}px`,
            height: `${size}px`,
            background:
              i % 5 === 0
                ? 'rgb(var(--accent-cyan) / 0.6)'
                : i % 7 === 0
                  ? 'rgb(var(--accent-violet) / 0.5)'
                  : 'rgb(var(--c-2) / 0.4)',
            animationDuration: `${Math.random() * 6 + 4}s`,
            animationDelay: `-${Math.random() * 6}s`,
            '--dx1': `${(Math.random() - 0.5) * 90}px`,
            '--dy1': `${(Math.random() - 0.5) * 90}px`,
            '--dx2': `${(Math.random() - 0.5) * 90}px`,
            '--dy2': `${(Math.random() - 0.5) * 90}px`,
            '--dx3': `${(Math.random() - 0.5) * 90}px`,
            '--dy3': `${(Math.random() - 0.5) * 90}px`,
          },
        };
      }),
    []
  );

  if (!phase) return null;

  return (
    <div className={`fixed inset-0 z-[150] bg-ink ${phase === 'in' ? 'veil-in' : 'veil-out'}`}>
      <div className="particle-field">
        {particles.map((p) => (
          <span key={p.id} className="css-particle" style={p.style} />
        ))}
      </div>
    </div>
  );
}
