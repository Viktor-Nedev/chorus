import { useState, useEffect, useCallback } from 'react';
import { GalleryCard } from '../components/GalleryCard';
import { useArtworkStore } from '../hooks/useArtworkStore';

export function Gallery({ navigate }) {
  const { fetchGallery, fetchArtwork, deleteArtwork, loading } = useArtworkStore();
  const [artworks, setArtworks] = useState([]);
  const [filter, setFilter] = useState('all'); // 'all' | 'solo' | 'collective'
  const [sort, setSort] = useState('newest'); // 'newest' | 'oldest'
  const [selected, setSelected] = useState(null); // пълният artwork с imageData
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      const data = await fetchGallery();
      setArtworks(data);
    } catch {
      setError('Could not load gallery. Is the server running?');
    }
  }, [fetchGallery]);

  useEffect(() => {
    load();
  }, [load]);

  const openArtwork = async (art) => {
    try {
      const full = await fetchArtwork(art.id);
      setSelected(full);
    } catch {
      setSelected(art);
    }
  };

  const handleEdit = async (art) => {
    const target = art.mode === 'sculpt' ? 'sculpt' : 'solo';
    try {
      const full = await fetchArtwork(art.id);
      navigate(target, full);
    } catch {
      navigate(target, art);
    }
  };

  const handleDelete = async (id) => {
    try {
      await deleteArtwork(id);
      setArtworks((prev) => prev.filter((a) => a.id !== id));
    } catch {
      // ignore
    }
    setConfirmDelete(null);
  };

  const visible = artworks
    .filter((a) => filter === 'all' || a.mode === filter)
    .sort((a, b) =>
      sort === 'newest'
        ? new Date(b.createdAt) - new Date(a.createdAt)
        : new Date(a.createdAt) - new Date(b.createdAt)
    );

  return (
    <div className="h-full w-full bg-ink overflow-y-auto">
      <div className="max-w-6xl mx-auto px-6 md:px-10 py-12">
        <button
          onClick={() => navigate('landing')}
          className="text-xs tracking-[0.25em] uppercase text-gray-500 hover:text-white transition"
        >
          ← Back
        </button>

        <div className="mt-6 mb-12 flex flex-col md:flex-row md:items-end justify-between gap-6">
          <h1
            className="font-display font-extrabold text-white leading-none tracking-tight"
            style={{ fontSize: 'clamp(3rem, 8vw, 6.5rem)' }}
          >
            ARCHIVE
          </h1>

          <div className="flex items-center gap-6 text-xs pb-2">
            {['all', 'solo', 'collective', 'moodcheck', 'sculpt'].map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`uppercase tracking-[0.2em] pb-1 border-b transition ${
                  filter === f
                    ? 'border-white text-white'
                    : 'border-transparent text-gray-500 hover:text-gray-300'
                }`}
              >
                {f}
              </button>
            ))}
            <span className="w-px h-4 bg-ink-line" />
            <button
              onClick={() => setSort((s) => (s === 'newest' ? 'oldest' : 'newest'))}
              className="uppercase tracking-[0.2em] text-gray-500 hover:text-gray-300 transition"
            >
              {sort} ↕
            </button>
          </div>
        </div>

        {error && (
          <div className="text-center py-20">
            <p className="text-gray-400 text-sm">{error}</p>
            <button
              onClick={load}
              className="mt-4 rounded-lg border border-ink-line px-4 py-2 text-xs text-gray-300 hover:bg-ink-line/50"
            >
              Retry
            </button>
          </div>
        )}

        {!error && loading && (
          <div className="text-center py-20 text-gray-500 text-sm glow-pulse">Loading…</div>
        )}

        {!error && !loading && visible.length === 0 && (
          <div className="text-center py-20">
            <div className="text-4xl mb-3">✦</div>
            <p className="text-gray-400 text-sm">No artworks yet.</p>
            <button
              onClick={() => navigate('solo')}
              className="mt-4 rounded-lg bg-violet-600 px-5 py-2 text-sm text-white hover:bg-violet-500 transition"
            >
              Create the first one
            </button>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {visible.map((art) => (
            <GalleryCard
              key={art.id}
              artwork={art}
              onOpen={() => openArtwork(art)}
              onEdit={() => handleEdit(art)}
              onDelete={() => setConfirmDelete(art)}
            />
          ))}
        </div>
      </div>

      {/* ── Detail modal ── */}
      {selected && (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center bg-black/80 backdrop-blur-sm p-6 animate-fade-in"
          onClick={() => setSelected(null)}
        >
          <div
            className="max-w-3xl w-full max-h-full overflow-y-auto rounded-2xl bg-ink-soft border border-ink-line animate-slide-up"
            onClick={(e) => e.stopPropagation()}
          >
            {selected.imageData && (
              <img src={selected.imageData} alt={selected.title} className="w-full rounded-t-2xl" />
            )}
            <div className="p-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="font-display text-xl text-white">{selected.title}</h2>
                  <p className="text-sm text-gray-400 mt-0.5">
                    by {selected.author} ·{' '}
                    {new Date(selected.createdAt).toLocaleDateString('en-GB', {
                      day: 'numeric',
                      month: 'long',
                      year: 'numeric',
                    })}
                    {selected.duration ? ` · ${selected.duration}s of creation` : ''}
                  </p>
                </div>
                <span
                  className={`text-[10px] uppercase tracking-widest px-2 py-1 rounded shrink-0 ${
                    selected.mode === 'collective'
                      ? 'bg-cyan-950 text-cyan-400'
                      : selected.mode === 'moodcheck'
                        ? 'bg-yellow-950 text-yellow-400'
                        : 'bg-violet-950 text-violet-400'
                  }`}
                >
                  {selected.mode === 'moodcheck' ? 'mood check' : selected.mode}
                </span>
              </div>

              {selected.description && (
                <p className="mt-3 text-sm text-gray-300">{selected.description}</p>
              )}

              {selected.poem && (
                <pre className="mt-5 whitespace-pre-wrap font-body italic text-sm leading-relaxed text-gray-200 border-l border-accent-violet/60 pl-5">
                  {selected.poem}
                </pre>
              )}

              <div className="mt-6 flex gap-3">
                <a
                  href={selected.imageData}
                  download={`${selected.title || 'chorus'}.png`}
                  className="rounded-lg bg-violet-600 px-4 py-2 text-sm text-white hover:bg-violet-500 transition"
                >
                  Download
                </a>
                {(selected.mode === 'solo' || selected.mode === 'sculpt') && (
                  <button
                    onClick={() => handleEdit(selected)}
                    className="rounded-lg border border-cyan-700 bg-cyan-950/40 px-4 py-2 text-sm text-cyan-300 hover:bg-cyan-900/40 transition"
                  >
                    {selected.mode === 'sculpt' ? 'Open in Sculpt' : 'Edit'}
                  </button>
                )}
                <button
                  onClick={() => setSelected(null)}
                  className="rounded-lg border border-ink-line px-4 py-2 text-sm text-gray-300 hover:bg-ink-line/50 transition"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Confirm delete ── */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm animate-fade-in">
          <div className="max-w-xs w-full mx-4 rounded-2xl bg-ink-soft border border-ink-line p-6 animate-slide-up">
            <p className="text-sm text-gray-200">
              Delete <span className="font-medium text-white">"{confirmDelete.title}"</span>?
            </p>
            <p className="text-xs text-gray-500 mt-1">This cannot be undone.</p>
            <div className="mt-5 flex gap-3">
              <button
                onClick={() => setConfirmDelete(null)}
                className="flex-1 rounded-lg border border-ink-line py-2 text-sm text-gray-300 hover:bg-ink-line/50 transition"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDelete(confirmDelete.id)}
                className="flex-1 rounded-lg bg-red-600 py-2 text-sm text-white hover:bg-red-500 transition"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
