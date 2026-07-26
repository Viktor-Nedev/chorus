import { useState, useEffect, useMemo } from 'react';
import { useArtworkStore } from '../../hooks/useArtworkStore';
import { useSocial } from '../../hooks/useSocial';

// Публикуване на творба в социалния feed. Избираш измежду СВОИТЕ творби
// (или е предварително подадена от Gallery), добавяш описание и тагове.
// Ако си дошъл през „Remix", четем кредита от sessionStorage и го подаваме.
export function PostComposer({ me, presetArtworkId, onClose, onPublished }) {
  const { fetchGallery } = useArtworkStore();
  const { createPost } = useSocial();
  const [works, setWorks] = useState([]);
  const [picked, setPicked] = useState(presetArtworkId || null);
  const [caption, setCaption] = useState('');
  const [tags, setTags] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const remix = useMemo(() => {
    try { return JSON.parse(sessionStorage.getItem('chorus-remix') || 'null'); } catch { return null; }
  }, []);

  useEffect(() => {
    fetchGallery()
      .then((g) => setWorks(g.filter((a) => a.userId === me?.id)))
      .catch(() => setWorks([]));
  }, [fetchGallery, me?.id]);

  const publish = async () => {
    if (!picked) return;
    setBusy(true);
    setError(null);
    try {
      const post = await createPost({
        artworkId: picked,
        caption: caption.trim(),
        tags: tags.split(/[\s,#]+/).map((t) => t.trim()).filter(Boolean),
        remixOfPostId: remix?.postId,
      });
      sessionStorage.removeItem('chorus-remix');
      onPublished?.(post);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-fade-in" onClick={onClose}>
      <div className="w-full max-w-lg rounded-2xl bg-ink-soft border border-ink-line p-6 animate-slide-up max-h-[88vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-display font-bold text-lg text-white">Share to Social</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-white transition">✕</button>
        </div>

        {remix && (
          <div className="mb-4 rounded-lg border border-accent-cyan/40 bg-accent-cyan/10 px-3 py-2 text-xs text-accent-cyan">
            ♻ Remix — this post will credit <b>{remix.author}</b>
          </div>
        )}

        {!presetArtworkId && (
          <>
            <p className="text-xs text-gray-400 mb-2">Pick an artwork</p>
            {works.length === 0 ? (
              <p className="text-sm text-gray-500 py-6 text-center">No artworks yet — create one in any mode first.</p>
            ) : (
              <div className="grid grid-cols-3 gap-2 mb-4 max-h-52 overflow-y-auto pr-1">
                {works.map((w) => (
                  <button
                    key={w.id}
                    onClick={() => setPicked(w.id)}
                    className={`rounded-lg overflow-hidden border transition ${picked === w.id ? 'border-accent-violet ring-1 ring-accent-violet' : 'border-ink-line hover:border-gray-500'}`}
                  >
                    <img src={w.imageData} alt={w.title} className="aspect-square object-cover w-full" />
                  </button>
                ))}
              </div>
            )}
          </>
        )}

        <textarea
          value={caption}
          onChange={(e) => setCaption(e.target.value)}
          maxLength={500}
          rows={3}
          placeholder="Say something about it…"
          className="w-full rounded-lg bg-ink border border-ink-line px-3 py-2 text-sm text-white focus:border-accent-violet focus:outline-none resize-none mb-3"
        />
        <input
          value={tags}
          onChange={(e) => setTags(e.target.value)}
          placeholder="tags: neon, portrait, abstract"
          className="w-full rounded-lg bg-ink border border-ink-line px-3 py-2 text-sm text-white focus:border-accent-violet focus:outline-none mb-4"
        />

        {error && <p className="text-xs text-red-400 mb-3">{error}</p>}

        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 rounded-lg border border-ink-line py-2 text-sm text-gray-300 hover:bg-ink-line/50 transition">Cancel</button>
          <button
            onClick={publish}
            disabled={!picked || busy}
            className="flex-1 rounded-lg bg-accent-violet/85 py-2 text-sm font-bold text-ink hover:bg-accent-violet transition disabled:opacity-40"
          >
            {busy ? 'Publishing…' : 'Publish'}
          </button>
        </div>
      </div>
    </div>
  );
}
