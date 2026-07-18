export function GalleryCard({ artwork, onOpen, onEdit, onDelete }) {
  const date = new Date(artwork.createdAt).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

  return (
    <div className="energy-border group rounded-xl bg-ink-soft/60 border border-ink-line overflow-hidden transition-colors duration-500 animate-fade-in">
      <button onClick={onOpen} className="block w-full text-left">
        <div className="relative aspect-video bg-ink overflow-hidden">
          {artwork.imageData ? (
            <img
              src={artwork.imageData}
              alt={artwork.title}
              className="w-full h-full object-cover grayscale-[0.5] group-hover:grayscale-0 group-hover:scale-105 transition-all duration-700"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-gray-600 text-3xl">
              ✦
            </div>
          )}
          {artwork.videoUrl && (
            <span className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <span className="w-11 h-11 rounded-full bg-black/50 border border-white/40 backdrop-blur flex items-center justify-center text-white text-lg">
                ▶
              </span>
            </span>
          )}
        </div>
        <div className="p-5">
          <div className="flex items-center gap-3 mb-2">
            <span
              className={`text-[9px] uppercase tracking-[0.25em] ${
                artwork.mode === 'collective'
                  ? 'text-accent-cyan/80'
                  : artwork.mode === 'moodcheck'
                    ? 'text-yellow-400/80'
                    : 'text-accent-violet/80'
              }`}
            >
              {artwork.mode === 'moodcheck' ? 'mood check' : artwork.mode}
            </span>
            <span className="text-[10px] text-gray-600">{date}</span>
          </div>
          <h3 className="font-display font-extrabold text-white text-base truncate">
            {artwork.title}
          </h3>
          <p className="text-xs text-gray-500 truncate mt-0.5">by {artwork.author}</p>
          {artwork.poem && (
            <p className="mt-3 text-[11px] text-gray-500 italic line-clamp-2 leading-snug">
              {artwork.poem}
            </p>
          )}
        </div>
      </button>
      <div className="flex border-t border-ink-line divide-x divide-ink-line">
        <a
          href={artwork.imageData}
          download={`${artwork.title || 'chorus'}.png`}
          onClick={(e) => e.stopPropagation()}
          className="flex-1 py-2.5 text-center text-[10px] uppercase tracking-[0.2em] text-gray-500 hover:text-white hover:bg-ink-line/40 transition"
        >
          Download
        </a>
        {artwork.mode === 'solo' && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onEdit?.();
            }}
            className="flex-1 py-2.5 text-[10px] uppercase tracking-[0.2em] text-accent-cyan/70 hover:text-accent-cyan hover:bg-ink-line/40 transition"
          >
            Edit
          </button>
        )}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          className="flex-1 py-2.5 text-[10px] uppercase tracking-[0.2em] text-gray-600 hover:text-red-400 hover:bg-ink-line/40 transition"
        >
          Delete
        </button>
      </div>
    </div>
  );
}
