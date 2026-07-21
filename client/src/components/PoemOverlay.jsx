import { useEffect, useState } from 'react';

const LOADING_MESSAGES = [
  'Reading your colours…',
  'Listening to the shapes…',
  'Following the strokes…',
  'Finding the words…',
];

// Плаващи мастилени точки — чист CSS, задава се позиция/забавяне inline.
const INK_DOTS = Array.from({ length: 7 }, (_, i) => ({
  left: `${10 + i * 12}%`,
  delay: `${(i * 0.35).toFixed(2)}s`,
  size: 6 + (i % 3) * 4,
}));

export function PoemOverlay({ poem, loading, onClose }) {
  const [msgIndex, setMsgIndex] = useState(0);
  const [typed, setTyped] = useState('');

  // Ротиращи съобщения докато се зарежда
  useEffect(() => {
    if (!loading) return undefined;
    const id = setInterval(() => setMsgIndex((i) => (i + 1) % LOADING_MESSAGES.length), 1900);
    return () => clearInterval(id);
  }, [loading]);

  // Typewriter разкриване на поемата
  useEffect(() => {
    if (loading || !poem) { setTyped(''); return undefined; }
    setTyped('');
    let i = 0;
    const id = setInterval(() => {
      i += 2; // по 2 символа на тик за плавно, но не бавно
      setTyped(poem.slice(0, i));
      if (i >= poem.length) clearInterval(id);
    }, 18);
    return () => clearInterval(id);
  }, [poem, loading]);

  const done = !loading && typed.length >= (poem?.length || 0);

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/70 backdrop-blur-sm animate-fade-in p-4">
      <div className="max-w-lg w-full rounded-2xl bg-ink-soft border border-ink-line p-6 sm:p-8 animate-slide-up">
        <div className="text-[10px] uppercase tracking-[0.3em] text-gray-500 mb-4 font-body">
          A poem for this moment
        </div>

        {loading ? (
          <div className="py-8">
            {/* Мастилена сцена */}
            <div className="relative h-16 mb-5 overflow-hidden">
              {INK_DOTS.map((d, i) => (
                <span
                  key={i}
                  className="absolute top-1/2 rounded-full bg-violet-400/70 poem-ink-dot"
                  style={{
                    left: d.left,
                    width: d.size,
                    height: d.size,
                    animationDelay: d.delay,
                  }}
                />
              ))}
              <span className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 poem-shimmer" />
            </div>
            <p className="text-center text-gray-400 text-sm transition-opacity duration-500">
              {LOADING_MESSAGES[msgIndex]}
            </p>
          </div>
        ) : (
          <pre className="whitespace-pre-wrap font-body text-[15px] leading-relaxed text-gray-100 min-h-[3rem]">
            {typed}
            {!done && <span className="poem-caret">▍</span>}
          </pre>
        )}

        <button
          onClick={onClose}
          className="mt-6 w-full rounded-lg border border-ink-line py-2 text-sm text-gray-300 hover:bg-ink-line/50 transition"
        >
          Close
        </button>
      </div>
    </div>
  );
}
