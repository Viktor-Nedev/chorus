import { useState, useEffect, useCallback } from 'react';
import { useSocial } from '../../hooks/useSocial';
import { PostCard } from './PostCard';
import { PostComposer } from './PostComposer';

const MODE_FILTERS = [
  ['all', 'All'], ['solo', '2D'], ['sculpt', '3D'], ['moodcheck', 'Mirror'], ['collective', 'Collective'],
];

export function Feed({ me, navigate }) {
  const { fetchFeed, deletePost } = useSocial();
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [scope, setScope] = useState('all');   // all | following
  const [mode, setMode] = useState('all');
  const [sort, setSort] = useState('new');      // new | top
  const [q, setQ] = useState('');
  const [showComposer, setShowComposer] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchFeed({
        scope, sort, q: q.trim(),
        mode: mode === 'all' ? undefined : mode,
        limit: 40,
      });
      setPosts(data);
    } catch {
      setPosts([]);
    } finally {
      setLoading(false);
    }
  }, [fetchFeed, scope, sort, q, mode]);

  // Debounce: презарежда 300ms след последната промяна на филтрите/търсенето
  useEffect(() => {
    const t = setTimeout(load, 300);
    return () => clearTimeout(t);
  }, [load]);

  const remove = async (id) => {
    setPosts((prev) => prev.filter((p) => p.id !== id));
    try { await deletePost(id); } catch { /* ignore */ }
  };

  return (
    <div>
      {/* Discovery бар */}
      <div className="sticky top-0 z-10 -mx-1 px-1 py-3 bg-ink/80 backdrop-blur border-b border-ink-line">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-lg border border-ink-line overflow-hidden">
            {['all', 'following'].map((s) => (
              <button
                key={s}
                onClick={() => setScope(s)}
                className={`px-3 py-1.5 text-xs capitalize transition ${scope === s ? 'bg-accent-violet/20 text-white' : 'text-gray-400 hover:text-white'}`}
              >
                {s === 'all' ? 'Everyone' : 'Following'}
              </button>
            ))}
          </div>
          <div className="flex rounded-lg border border-ink-line overflow-hidden">
            {[['new', '🆕 New'], ['top', '🔥 Trending']].map(([s, label]) => (
              <button
                key={s}
                onClick={() => setSort(s)}
                className={`px-3 py-1.5 text-xs transition ${sort === s ? 'bg-accent-cyan/20 text-white' : 'text-gray-400 hover:text-white'}`}
              >
                {label}
              </button>
            ))}
          </div>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search posts & creators…"
            className="flex-1 min-w-[140px] rounded-lg bg-ink-soft border border-ink-line px-3 py-1.5 text-xs text-white focus:border-accent-violet focus:outline-none"
          />
          <button
            onClick={() => setShowComposer(true)}
            className="rounded-lg bg-accent-violet/85 px-3 py-1.5 text-xs font-bold text-ink hover:bg-accent-violet transition"
          >
            ＋ Share
          </button>
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {MODE_FILTERS.map(([m, label]) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`rounded-full px-2.5 py-0.5 text-[11px] border transition ${mode === m ? 'border-accent-violet/60 bg-accent-violet/10 text-accent-violet' : 'border-ink-line text-gray-500 hover:text-white'}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Постове */}
      {loading ? (
        <div className="text-center py-20 text-gray-500 text-sm glow-pulse">Loading feed…</div>
      ) : posts.length === 0 ? (
        <div className="text-center py-20 rounded-xl border border-dashed border-ink-line mt-6">
          <p className="text-gray-400">
            {scope === 'following' ? 'Follow some creators to fill this feed.' : 'No posts yet — be the first to share.'}
          </p>
          <button onClick={() => setShowComposer(true)} className="mt-4 rounded-lg bg-accent-violet/80 px-5 py-2 text-sm text-ink hover:bg-accent-violet transition">
            Share an artwork
          </button>
        </div>
      ) : (
        <div className="mt-6 columns-1 md:columns-2 gap-5 [column-fill:_balance]">
          {posts.map((p) => (
            <div key={p.id} className="mb-5 break-inside-avoid">
              <PostCard post={p} me={me} onDelete={remove} navigate={navigate} />
            </div>
          ))}
        </div>
      )}

      {showComposer && (
        <PostComposer
          me={me}
          onClose={() => setShowComposer(false)}
          onPublished={(post) => { setShowComposer(false); setPosts((prev) => [post, ...prev]); }}
        />
      )}
    </div>
  );
}
