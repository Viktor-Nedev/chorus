import { useState, useEffect } from 'react';
import { useSocial } from '../../hooks/useSocial';
import { avatarGradient, initials } from '../../utils/avatar';
import { BadgeRow } from './Badge';

const MEDAL = ['🥇', '🥈', '🥉'];

export function Leaderboard() {
  const { fetchLeaderboard } = useSocial();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchLeaderboard().then(setRows).catch(() => setRows([])).finally(() => setLoading(false));
  }, [fetchLeaderboard]);

  if (loading) return <div className="text-center py-20 text-gray-500 text-sm glow-pulse">Loading leaderboard…</div>;
  if (!rows.length) return <div className="text-center py-20 text-gray-500 text-sm">No creators ranked yet — publish and win badges to climb.</div>;

  return (
    <div>
      <h2 className="font-display font-extrabold text-2xl text-white mb-1">Top Creators</h2>
      <p className="text-xs text-gray-500 mb-6">Ranked by champion badges, then total likes, then arena points.</p>
      <div className="space-y-3">
        {rows.map((c, i) => (
          <div key={c.userId} className={`flex items-center gap-4 rounded-xl border p-4 ${i < 3 ? 'border-yellow-500/30 bg-yellow-500/[0.05]' : 'border-ink-line bg-ink-soft/40'}`}>
            <div className="w-8 text-center font-display font-extrabold text-lg text-gray-500">{MEDAL[i] || i + 1}</div>
            <div className="w-11 h-11 rounded-full flex items-center justify-center font-display font-bold text-sm text-ink shrink-0" style={{ background: avatarGradient(c.username) }}>
              {initials(c.username)}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-white truncate">{c.username}</span>
                <BadgeRow badges={c.badgeList} max={4} />
              </div>
              <div className="text-[11px] text-gray-500">{c.posts} posts · {c.likes} likes · {c.points} pts</div>
            </div>
            <div className="text-right">
              <div className="font-display font-extrabold text-xl text-yellow-300">{c.badges}</div>
              <div className="text-[10px] uppercase tracking-wider text-gray-600">badges</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
