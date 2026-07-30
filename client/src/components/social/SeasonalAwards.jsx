import { useState, useEffect, useCallback } from 'react';
import { Icon, IconText } from '../Icon';
import { useSocial } from '../../hooks/useSocial';
import { useArtworkStore } from '../../hooks/useArtworkStore';

function Countdown({ endsAt }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(id);
  }, []);
  const ms = new Date(endsAt).getTime() - now;
  if (ms <= 0) return <span className="text-red-400">closing…</span>;
  const d = Math.floor(ms / 86400000);
  const h = Math.floor((ms % 86400000) / 3600000);
  return <span>{d > 0 ? `${d}d ${h}h` : `${h}h`} left</span>;
}

export function SeasonalAwards({ me, toast }) {
  const { fetchAwards, enterAward, voteAward } = useSocial();
  const { fetchGallery } = useArtworkStore();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [enterCat, setEnterCat] = useState(null); // category obj
  const [myWorks, setMyWorks] = useState([]);

  const load = useCallback(async () => {
    setLoading(true);
    try { setData(await fetchAwards()); } catch { setData(null); } finally { setLoading(false); }
  }, [fetchAwards]);

  useEffect(() => { load(); }, [load]);

  const openEnter = async (cat) => {
    const gallery = await fetchGallery().catch(() => []);
    setMyWorks(gallery.filter((a) => a.userId === me?.id && (a.mode || 'solo') === cat.mode));
    setEnterCat(cat);
  };

  const doEnter = async (artworkId) => {
    try {
      await enterAward(enterCat.key, artworkId);
      setEnterCat(null);
      toast?.('✓ Entered the season');
      load();
    } catch (e) { toast?.(e.message); }
  };

  const doVote = async (catKey, entryUserId) => {
    try { await voteAward(catKey, entryUserId); load(); }
    catch (e) { toast?.(e.message); }
  };

  if (loading) return <div className="text-center py-20 text-gray-500 text-sm glow-pulse">Loading awards…</div>;
  if (!data) return <div className="text-center py-20 text-gray-500 text-sm">Could not load awards.</div>;

  return (
    <div>
      {/* Банер */}
      <div className="rounded-2xl border border-yellow-500/30 bg-gradient-to-br from-yellow-500/10 via-transparent to-accent-violet/10 p-6 mb-8">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <div className="text-[11px] uppercase tracking-[0.3em] text-yellow-400/80">Seasonal Awards</div>
            <h2 className="font-display font-extrabold text-3xl text-white mt-1">{data.label}</h2>
          </div>
          <div className="text-sm text-gray-300">
            Voting ends in <b className="text-white"><Countdown endsAt={data.endsAt} /></b>
          </div>
        </div>
        <p className="mt-3 text-xs text-gray-400 max-w-2xl">
          Enter one artwork per category, vote for your favourites (not your own), and at month's end the top pick in
          each category earns its creator a <span className="text-yellow-300">Champion badge</span> shown next to their name.
        </p>
      </div>

      {/* Победители от миналия сезон */}
      {data.pastWinners && Object.keys(data.pastWinners.winners).length > 0 && (
        <div className="mb-8 rounded-xl border border-ink-line bg-ink-soft/40 p-4">
          <div className="text-[11px] uppercase tracking-[0.25em] text-gray-500 mb-3"><Icon glyph="🏆" /> {data.pastWinners.label} Champions</div>
          <div className="flex flex-wrap gap-4">
            {data.categories.map((cat) => {
              const w = data.pastWinners.winners[cat.key];
              if (!w) return null;
              return (
                <div key={cat.key} className="flex items-center gap-2 text-sm">
                  <span className="text-lg"><Icon glyph={cat.icon} size={20} /></span>
                  <span className="text-gray-400">{cat.label}:</span>
                  <span className="text-white font-medium">{w.username}</span>
                  {w.votes != null && <span className="text-[11px] text-gray-600">({w.votes} votes)</span>}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Категории */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {data.categories.map((cat) => (
          <div key={cat.key} className="rounded-2xl border border-ink-line bg-ink-soft/40 overflow-hidden">
            <div className="flex items-center gap-3 px-5 py-4 border-b border-ink-line">
              <span className="text-2xl"><Icon glyph={cat.icon} size={26} /></span>
              <div className="flex-1">
                <div className="font-display font-bold text-white">{cat.label}</div>
                <div className="text-[11px] text-gray-500">{cat.entries.length} entries</div>
              </div>
              {cat.myEntry ? (
                <span className="text-[11px] text-emerald-400 border border-emerald-500/30 bg-emerald-500/10 rounded-full px-3 py-1"><Icon glyph="✓" /> Entered</span>
              ) : (
                <button
                  onClick={() => openEnter(cat)}
                  className="text-[11px] rounded-full border border-accent-cyan/50 bg-accent-cyan/10 text-accent-cyan px-3 py-1 hover:bg-accent-cyan/20 transition"
                >
                  Enter
                </button>
              )}
            </div>

            {cat.entries.length === 0 ? (
              <p className="text-xs text-gray-600 text-center py-8">No entries yet — be the first.</p>
            ) : (
              <div className="grid grid-cols-2 gap-3 p-4">
                {cat.entries.map((e, i) => {
                  const isMine = e.userId === me?.id;
                  const isMyVote = cat.myVote === e.userId;
                  return (
                    <div key={e.userId} className={`rounded-lg overflow-hidden border transition ${isMyVote ? 'border-accent-violet' : i === 0 ? 'border-yellow-500/50' : 'border-ink-line'}`}>
                      <div className="relative">
                        <img src={e.imageData} alt={e.title} className="aspect-video object-cover w-full" />
                        {i === 0 && <span className="absolute top-1 left-1 text-[10px] bg-yellow-500/80 text-ink rounded px-1.5 py-0.5 font-bold">#1</span>}
                      </div>
                      <div className="px-2.5 py-2 flex items-center gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="text-[11px] text-white truncate">{e.title}</div>
                          <div className="text-[10px] text-gray-500 truncate">{e.username} · {e.votes} votes</div>
                        </div>
                        {!isMine && (
                          <button
                            onClick={() => doVote(cat.key, e.userId)}
                            className={`shrink-0 rounded px-2 py-1 text-[10px] border transition ${isMyVote ? 'bg-accent-violet/25 border-accent-violet text-white' : 'border-ink-line text-gray-400 hover:text-white hover:border-gray-500'}`}
                          >
                            <IconText size={14}>{isMyVote ? '✓' : 'Vote'}</IconText>
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Enter picker */}
      {enterCat && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-fade-in" onClick={() => setEnterCat(null)}>
          <div className="w-full max-w-2xl rounded-2xl bg-ink-soft border border-ink-line p-6 animate-slide-up max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <h2 className="font-display font-bold text-lg text-white mb-1"><Icon glyph={enterCat.icon} size={18} /> Enter {enterCat.label}</h2>
            <p className="text-xs text-gray-500 mb-4">Pick one of your {enterCat.mode} artworks.</p>
            {myWorks.length === 0 ? (
              <p className="text-sm text-gray-500 py-8 text-center">No eligible artworks — make one in the matching mode first.</p>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {myWorks.map((w) => (
                  <button key={w.id} onClick={() => doEnter(w.id)} className="rounded-lg overflow-hidden border border-ink-line hover:border-accent-violet transition text-left">
                    <img src={w.imageData} alt={w.title} className="aspect-video object-cover w-full" />
                    <div className="px-2 py-1.5 text-[11px] text-gray-300 truncate">{w.title}</div>
                  </button>
                ))}
              </div>
            )}
            <button onClick={() => setEnterCat(null)} className="mt-5 w-full rounded-lg border border-ink-line py-2 text-sm text-gray-300 hover:bg-ink-line/50 transition">Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}
