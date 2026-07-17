import { useState, useEffect, useCallback } from 'react';
import { GalleryCard } from '../components/GalleryCard';
import { useAuth } from '../hooks/useAuth';
import { useArtworkStore } from '../hooks/useArtworkStore';

// Аватар: инициали върху цвят, изведен от username-а (детерминистичен hue)
function avatarHue(name) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % 360;
  return h;
}

const ACHIEVEMENTS = [
  { id: 'first', icon: '✦', title: 'First Light', desc: 'Save your first artwork', test: (s) => s.artworks >= 1 },
  { id: 'prolific', icon: '🎨', title: 'Prolific', desc: 'Save 5 artworks', test: (s) => s.artworks >= 5 },
  { id: 'fav', icon: '💜', title: 'Crowd Favorite', desc: 'Receive 10 competition votes', test: (s) => s.votesReceived >= 10 },
  { id: 'contender', icon: '🏁', title: 'Contender', desc: 'Enter a competition', test: (s) => s.competitionsEntered >= 1 },
  { id: 'champion', icon: '🏆', title: 'Champion', desc: 'Win a competition', test: (s) => s.competitionsWon >= 1 },
  { id: 'battle', icon: '⚔', title: 'Battle Master', desc: 'Win a live draw battle', test: (s) => s.battleWins >= 1 },
];

export function Profile({ navigate }) {
  const { user, logout, authFetch, backend } = useAuth();
  const { fetchGallery } = useArtworkStore();
  const [stats, setStats] = useState(null);
  const [works, setWorks] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [statsRes, gallery] = await Promise.all([
        authFetch('/api/users/stats').then((r) => (r.ok ? r.json() : null)),
        fetchGallery().catch(() => []),
      ]);
      setStats(statsRes);
      setWorks(gallery.filter((a) => a.userId === user?.id));
    } finally {
      setLoading(false);
    }
  }, [authFetch, fetchGallery, user?.id]);

  useEffect(() => {
    load();
  }, [load]);

  if (!user) return null;
  const hue = avatarHue(user.username || '?');
  const memberSince = user.createdAt
    ? new Date(user.createdAt).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
    : null;

  const statCards = [
    { label: 'Artworks', value: stats?.artworks ?? '—', icon: '🖼' },
    { label: 'Votes received', value: stats?.votesReceived ?? '—', icon: '🗳' },
    { label: 'Competitions won', value: stats?.competitionsWon ?? '—', icon: '🏆' },
    { label: 'Battle wins', value: stats?.battleWins ?? '—', icon: '⚔' },
  ];

  return (
    <div className="h-full w-full bg-ink overflow-y-auto">
      <div className="max-w-5xl mx-auto px-6 md:px-10 py-12">
        <button
          onClick={() => navigate('landing')}
          className="text-xs tracking-[0.25em] uppercase text-gray-500 hover:text-white transition"
        >
          ← Back
        </button>

        {/* ── Header ── */}
        <div className="mt-8 flex flex-col sm:flex-row items-start sm:items-center gap-6">
          <div
            className="w-24 h-24 rounded-full flex items-center justify-center font-display font-extrabold text-3xl text-ink shrink-0"
            style={{ background: `linear-gradient(135deg, hsl(${hue},70%,62%), hsl(${(hue + 50) % 360},70%,52%))` }}
          >
            {(user.username || '?').slice(0, 2).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="font-display font-extrabold text-white text-4xl tracking-tight truncate">
              {user.username}
            </h1>
            <p className="mt-1 text-sm text-gray-500">
              {user.email}
              {memberSince && <span> · member since {memberSince}</span>}
              <span className="ml-2 text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-ink-soft border border-ink-line text-gray-400">
                {backend === 'supabase' ? 'Supabase' : 'local'}
              </span>
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => navigate('compete')}
              className="rounded-lg border border-accent-cyan/50 bg-accent-cyan/10 px-4 py-2 text-xs text-accent-cyan hover:bg-accent-cyan/20 transition"
            >
              🏁 Competitions
            </button>
            <button
              onClick={async () => {
                await logout();
                navigate('landing');
              }}
              className="rounded-lg border border-red-900 bg-red-950/40 px-4 py-2 text-xs text-red-400 hover:bg-red-900/40 transition"
            >
              Log out
            </button>
          </div>
        </div>

        {/* ── Stats ── */}
        <div className="mt-10 grid grid-cols-2 md:grid-cols-4 gap-4">
          {statCards.map((s) => (
            <div key={s.label} className="rounded-xl border border-ink-line bg-ink-soft/50 p-5">
              <div className="text-2xl">{s.icon}</div>
              <div className="mt-2 font-display font-extrabold text-3xl text-white">{s.value}</div>
              <div className="text-[11px] uppercase tracking-[0.15em] text-gray-500">{s.label}</div>
            </div>
          ))}
        </div>

        {/* ── Achievements ── */}
        <h2 className="mt-12 mb-4 text-xs uppercase tracking-[0.3em] text-gray-500">Achievements</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {ACHIEVEMENTS.map((a) => {
            const unlocked = stats ? a.test(stats) : false;
            return (
              <div
                key={a.id}
                className={`rounded-xl border p-4 flex items-center gap-3 transition ${
                  unlocked
                    ? 'border-accent-violet/60 bg-accent-violet/10'
                    : 'border-ink-line bg-ink-soft/30 opacity-50'
                }`}
              >
                <span className={`text-2xl ${unlocked ? '' : 'grayscale'}`}>{a.icon}</span>
                <div className="min-w-0">
                  <div className="text-sm font-bold text-white truncate">{a.title}</div>
                  <div className="text-[10px] text-gray-500">{a.desc}</div>
                </div>
                {unlocked && <span className="ml-auto text-accent-violet">✓</span>}
              </div>
            );
          })}
        </div>

        {/* ── My works ── */}
        <div className="mt-12 mb-4 flex items-center justify-between">
          <h2 className="text-xs uppercase tracking-[0.3em] text-gray-500">
            My works ({works.length})
          </h2>
          <button
            onClick={() => navigate('gallery')}
            className="text-[11px] uppercase tracking-[0.2em] text-gray-500 hover:text-white transition"
          >
            Full archive →
          </button>
        </div>

        {loading ? (
          <div className="text-center py-16 text-gray-500 text-sm glow-pulse">Loading…</div>
        ) : works.length === 0 ? (
          <div className="text-center py-16 rounded-xl border border-dashed border-ink-line">
            <p className="text-sm text-gray-500">No artworks yet.</p>
            <button
              onClick={() => navigate('solo')}
              className="mt-4 rounded-lg bg-accent-violet/80 px-5 py-2 text-sm text-ink hover:bg-accent-violet transition"
            >
              Start painting
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 pb-16">
            {works.map((art) => (
              <GalleryCard
                key={art.id}
                artwork={art}
                onOpen={() => navigate('gallery')}
                onEdit={() => navigate(art.mode === 'sculpt' ? 'sculpt' : 'solo', art)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
