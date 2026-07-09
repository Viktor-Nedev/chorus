export function PoemOverlay({ poem, loading, onClose }) {
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/70 backdrop-blur-sm animate-fade-in">
      <div className="max-w-lg w-full mx-4 rounded-2xl bg-ink-soft border border-ink-line p-8 animate-slide-up">
        <div className="text-[10px] uppercase tracking-[0.3em] text-gray-500 mb-4 font-body">
          A poem for this moment
        </div>
        {loading ? (
          <div className="py-10 text-center text-gray-400 text-sm">
            <span className="glow-pulse inline-block">✦</span>
            <p className="mt-3">Listening to what you created…</p>
          </div>
        ) : (
          <pre className="whitespace-pre-wrap font-body text-[15px] leading-relaxed text-gray-100">
            {poem}
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
