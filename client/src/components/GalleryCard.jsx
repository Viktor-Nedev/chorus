export function GalleryCard({ artwork, onOpen, onEdit, onDelete }) {
  const date = new Date(artwork.createdAt).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

  return (
    <div className="group rounded-xl bg-ink-soft border border-ink-line overflow-hidden hover:border-violet-500/50 transition animate-fade-in">
      <button onClick={onOpen} className="block w-full text-left">
        <div className="aspect-video bg-ink overflow-hidden">
          {artwork.imageData ? (
            <img
              src={artwork.imageData}
              alt={artwork.title}
              className="w-full h-full object-cover group-hover:scale-105 transition duration-500"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-gray-600 text-3xl">
              ✦
            </div>
          )}
        </div>
        <div className="p-4">
          <div className="flex items-center gap-2 mb-1">
            <span
              className={`text-[9px] uppercase tracking-widest px-1.5 py-0.5 rounded ${
                artwork.mode === 'collective'
                  ? 'bg-cyan-950 text-cyan-400'
                  : 'bg-violet-950 text-violet-400'
              }`}
            >
              {artwork.mode}
            </span>
            <span className="text-[10px] text-gray-500">{date}</span>
          </div>
          <h3 className="font-display text-white text-sm truncate">{artwork.title}</h3>
          <p className="text-xs text-gray-500 truncate">by {artwork.author}</p>
          {artwork.poem && (
            <p className="mt-2 text-[11px] text-gray-400 italic line-clamp-2 leading-snug">
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
          className="flex-1 py-2 text-center text-[11px] text-gray-400 hover:text-white hover:bg-ink-line/40 transition"
        >
          Download
        </a>
        {artwork.mode === 'solo' && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onEdit?.();
            }}
            className="flex-1 py-2 text-[11px] text-cyan-400/80 hover:text-cyan-300 hover:bg-ink-line/40 transition"
          >
            Edit
          </button>
        )}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          className="flex-1 py-2 text-[11px] text-gray-500 hover:text-red-400 hover:bg-ink-line/40 transition"
        >
          Delete
        </button>
      </div>
    </div>
  );
}
