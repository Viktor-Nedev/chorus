import { useState, useEffect, useRef } from 'react';

const EMOJIS = ['❤', '🔥', '👏', '✨', '😂'];

// Емоджи реакции: бар с бутони + плаващи нагоре емоджита при получаване.
export function ReactionsBar({ socket }) {
  const [floats, setFloats] = useState([]);
  const idRef = useRef(0);

  useEffect(() => {
    const off = socket.onEvent('REACTION', ({ emoji }) => {
      const id = idRef.current++;
      setFloats((f) => [...f.slice(-30), { id, emoji, x: 10 + Math.random() * 80 }]);
      setTimeout(() => setFloats((f) => f.filter((r) => r.id !== id)), 2600);
    });
    return off;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      <style>{`
        @keyframes chorus-float-up {
          0% { transform: translateY(0) scale(0.7); opacity: 0; }
          15% { opacity: 1; transform: translateY(-8vh) scale(1.15); }
          100% { transform: translateY(-46vh) scale(1); opacity: 0; }
        }
      `}</style>

      {/* Плаващи реакции */}
      <div className="absolute inset-0 z-20 pointer-events-none overflow-hidden">
        {floats.map((r) => (
          <span
            key={r.id}
            className="absolute bottom-24 text-3xl"
            style={{ left: `${r.x}%`, animation: 'chorus-float-up 2.6s ease-out forwards' }}
          >
            {r.emoji}
          </span>
        ))}
      </div>

      {/* Бар с бутони */}
      <div className="absolute left-1/2 -translate-x-1/2 bottom-4 z-30 flex items-center gap-1 rounded-full bg-ink-soft/80 border border-ink-line backdrop-blur px-2 py-1">
        {EMOJIS.map((e) => (
          <button
            key={e}
            onClick={() => socket.sendReaction(e)}
            className="w-9 h-9 rounded-full text-lg hover:bg-ink-line/60 hover:scale-125 transition"
          >
            {e}
          </button>
        ))}
      </div>
    </>
  );
}
