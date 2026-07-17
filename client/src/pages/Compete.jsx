import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../hooks/useAuth';
import { useArtworkStore } from '../hooks/useArtworkStore';

// Състезания по рисуване: тема + краен срок; всеки влиза с една своя
// творба; един глас на потребител (не за себе си); победител при изтичане.
function Countdown({ endsAt }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(id);
  }, []);
  const ms = new Date(endsAt).getTime() - now;
  if (ms <= 0) return <span className="text-red-400">ended</span>;
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  return <span>{h > 0 ? `${h}h ${m}m` : `${m}m`} left</span>;
}

export function Compete({ navigate }) {
  const { user, authFetch } = useAuth();
  const { fetchGallery } = useArtworkStore();
  const [comps, setComps] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [enterFor, setEnterFor] = useState(null); // competition id
  const [myWorks, setMyWorks] = useState([]);
  const [expanded, setExpanded] = useState(null);
  const [toast, setToast] = useState(null);

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  const load = useCallback(async () => {
    try {
      const res = await authFetch('/api/competitions');
      setComps(await res.json());
    } catch {
      showToast('Could not load competitions');
    } finally {
      setLoading(false);
    }
  }, [authFetch]);

  useEffect(() => {
    load();
  }, [load]);

  const act = async (path, body, okMsg) => {
    try {
      const res = await authFetch(path, { method: 'POST', body: JSON.stringify(body) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
      setComps((prev) => {
        const i = prev.findIndex((c) => c.id === data.id);
        if (i >= 0) {
          const next = [...prev];
          next[i] = data;
          return next;
        }
        return [data, ...prev];
      });
      if (okMsg) showToast(okMsg);
      return true;
    } catch (e) {
      showToast(e.message);
      return false;
    }
  };

  const openEnter = async (compId) => {
    const gallery = await fetchGallery().catch(() => []);
    setMyWorks(gallery.filter((a) => a.userId === user?.id));
    setEnterFor(compId);
  };

  const active = comps.filter((c) => !c.ended);
  const past = comps.filter((c) => c.ended);

  return (
    <div className="h-full w-full bg-ink overflow-y-auto">
      <div className="max-w-5xl mx-auto px-6 md:px-10 py-12">
        <button
          onClick={() => navigate('landing')}
          className="text-xs tracking-[0.25em] uppercase text-gray-500 hover:text-white transition"
        >
          ← Back
        </button>

        <div className="mt-6 mb-10 flex flex-col md:flex-row md:items-end justify-between gap-4">
          <h1
            className="font-display font-extrabold text-white leading-none tracking-tight"
            style={{ fontSize: 'clamp(2.6rem, 7vw, 5.5rem)' }}
          >
            COMPETE
          </h1>
          <button
            onClick={() => setShowCreate(true)}
            className="rounded-lg bg-accent-violet/85 px-5 h-10 text-sm font-bold text-ink hover:bg-accent-violet transition self-start md:self-auto"
          >
            + New competition
          </button>
        </div>

        {loading && <div className="text-center py-16 text-gray-500 text-sm glow-pulse">Loading…</div>}

        {!loading && comps.length === 0 && (
          <div className="text-center py-20 rounded-xl border border-dashed border-ink-line">
            <p className="text-gray-400">No competitions yet — start the first one!</p>
          </div>
        )}

        {/* ── ACTIVE ── */}
        {active.length > 0 && (
          <>
            <h2 className="text-xs uppercase tracking-[0.3em] text-gray-500 mb-4">Active</h2>
            <div className="space-y-5 mb-12">
              {active.map((c) => (
                <CompetitionCard
                  key={c.id}
                  comp={c}
                  me={user}
                  expanded={expanded === c.id}
                  onToggle={() => setExpanded(expanded === c.id ? null : c.id)}
                  onEnter={() => openEnter(c.id)}
                  onVote={(entryUserId) =>
                    act(`/api/competitions/${c.id}/vote`, { entryUserId }, '✓ Vote recorded')
                  }
                />
              ))}
            </div>
          </>
        )}

        {/* ── PAST ── */}
        {past.length > 0 && (
          <>
            <h2 className="text-xs uppercase tracking-[0.3em] text-gray-500 mb-4">Finished</h2>
            <div className="space-y-5 pb-16">
              {past.map((c) => (
                <CompetitionCard
                  key={c.id}
                  comp={c}
                  me={user}
                  expanded={expanded === c.id}
                  onToggle={() => setExpanded(expanded === c.id ? null : c.id)}
                />
              ))}
            </div>
          </>
        )}
      </div>

      {/* ── Create modal ── */}
      {showCreate && (
        <CreateModal
          onCancel={() => setShowCreate(false)}
          onCreate={async (theme, description, hours) => {
            const ok = await act('/api/competitions', { theme, description, hours }, '✓ Competition created');
            if (ok) setShowCreate(false);
          }}
        />
      )}

      {/* ── Enter modal: избери своя творба ── */}
      {enterFor && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/70 backdrop-blur-sm animate-fade-in">
          <div className="max-w-2xl w-full mx-4 rounded-2xl bg-ink-soft border border-ink-line p-6 animate-slide-up max-h-[80vh] overflow-y-auto">
            <h2 className="font-display font-bold text-lg text-white mb-4">Pick your entry</h2>
            {myWorks.length === 0 ? (
              <p className="text-sm text-gray-500 py-8 text-center">
                You have no artworks yet — create one in any mode first.
              </p>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {myWorks.map((w) => (
                  <button
                    key={w.id}
                    onClick={async () => {
                      const ok = await act(
                        `/api/competitions/${enterFor}/enter`,
                        { artworkId: w.id },
                        '✓ Entered!'
                      );
                      if (ok) setEnterFor(null);
                    }}
                    className="rounded-lg overflow-hidden border border-ink-line hover:border-accent-violet transition text-left"
                  >
                    <img src={w.imageData} alt={w.title} className="aspect-video object-cover w-full" />
                    <div className="px-2 py-1.5 text-[11px] text-gray-300 truncate">{w.title}</div>
                  </button>
                ))}
              </div>
            )}
            <button
              onClick={() => setEnterFor(null)}
              className="mt-5 w-full rounded-lg border border-ink-line py-2 text-sm text-gray-300 hover:bg-ink-line/50 transition"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {toast && (
        <div className="fixed top-6 left-1/2 -translate-x-1/2 z-50 rounded-full bg-ink-soft border border-ink-line px-5 py-2 text-sm text-white backdrop-blur animate-fade-in">
          {toast}
        </div>
      )}
    </div>
  );
}

function CompetitionCard({ comp, me, expanded, onToggle, onEnter, onVote }) {
  const iEntered = comp.entries.some((e) => e.userId === me?.id);
  return (
    <div className="rounded-xl border border-ink-line bg-ink-soft/50 overflow-hidden">
      <button onClick={onToggle} className="w-full text-left px-5 py-4 flex items-center gap-4">
        <div className="flex-1 min-w-0">
          <div className="font-display font-bold text-white text-lg truncate">{comp.theme}</div>
          <div className="text-[11px] text-gray-500 mt-0.5">
            by {comp.createdBy.username} · {comp.entries.length} entries · {comp.totalVotes} votes ·{' '}
            {comp.ended ? (
              comp.winner ? (
                <span className="text-yellow-400">🏆 {comp.winner.username}</span>
              ) : (
                'no winner'
              )
            ) : (
              <Countdown endsAt={comp.endsAt} />
            )}
          </div>
        </div>
        {!comp.ended && !iEntered && onEnter && (
          <span
            onClick={(e) => {
              e.stopPropagation();
              onEnter();
            }}
            className="rounded-lg border border-accent-cyan/50 bg-accent-cyan/10 px-3 py-1.5 text-xs text-accent-cyan hover:bg-accent-cyan/20 transition shrink-0"
          >
            Enter
          </span>
        )}
        <span className="text-gray-600">{expanded ? '▲' : '▼'}</span>
      </button>

      {expanded && (
        <div className="px-5 pb-5">
          {comp.description && <p className="text-xs text-gray-400 mb-4">{comp.description}</p>}
          {comp.entries.length === 0 ? (
            <p className="text-xs text-gray-600 py-4 text-center">No entries yet.</p>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {comp.entries.map((e) => {
                const isMine = e.userId === me?.id;
                const isMyVote = comp.myVote === e.userId;
                const isWinner = comp.ended && comp.winner?.userId === e.userId;
                return (
                  <div
                    key={e.userId}
                    className={`rounded-lg overflow-hidden border transition ${
                      isWinner ? 'border-yellow-500' : isMyVote ? 'border-accent-violet' : 'border-ink-line'
                    }`}
                  >
                    <img src={e.imageData} alt={e.title} className="aspect-video object-cover w-full" />
                    <div className="px-2.5 py-2 flex items-center gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="text-[11px] text-white truncate">{e.title}</div>
                        <div className="text-[10px] text-gray-500 truncate">
                          {isWinner && '🏆 '}
                          {e.username} · {e.votes} vote{e.votes === 1 ? '' : 's'}
                        </div>
                      </div>
                      {!comp.ended && !isMine && onVote && (
                        <button
                          onClick={() => onVote(e.userId)}
                          className={`shrink-0 rounded px-2 py-1 text-[10px] transition border ${
                            isMyVote
                              ? 'bg-accent-violet/25 border-accent-violet text-white'
                              : 'border-ink-line text-gray-400 hover:text-white hover:border-gray-500'
                          }`}
                        >
                          {isMyVote ? '✓ Voted' : 'Vote'}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function CreateModal({ onCreate, onCancel }) {
  const [theme, setTheme] = useState('');
  const [description, setDescription] = useState('');
  const [hours, setHours] = useState(24);
  const [busy, setBusy] = useState(false);

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/70 backdrop-blur-sm animate-fade-in">
      <div className="max-w-sm w-full mx-4 rounded-2xl bg-ink-soft border border-ink-line p-6 animate-slide-up">
        <h2 className="font-display font-bold text-lg text-white mb-4">New competition</h2>
        <label className="block mb-3">
          <span className="text-xs text-gray-400 mb-1 block">Theme</span>
          <input
            autoFocus
            value={theme}
            onChange={(e) => setTheme(e.target.value)}
            maxLength={80}
            placeholder='e.g. "Dreams in neon"'
            className="w-full rounded-lg bg-ink border border-ink-line px-3 py-2 text-sm text-white focus:border-accent-violet focus:outline-none"
          />
        </label>
        <label className="block mb-3">
          <span className="text-xs text-gray-400 mb-1 block">Description (optional)</span>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={300}
            rows={2}
            className="w-full rounded-lg bg-ink border border-ink-line px-3 py-2 text-sm text-white focus:border-accent-violet focus:outline-none resize-none"
          />
        </label>
        <label className="block mb-5">
          <span className="text-xs text-gray-400 mb-1 block">Duration</span>
          <select
            value={hours}
            onChange={(e) => setHours(Number(e.target.value))}
            className="w-full rounded-lg bg-ink border border-ink-line px-3 py-2 text-sm text-white focus:outline-none"
          >
            <option value={1}>1 hour</option>
            <option value={6}>6 hours</option>
            <option value={24}>24 hours</option>
            <option value={72}>3 days</option>
            <option value={168}>1 week</option>
          </select>
        </label>
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 rounded-lg border border-ink-line py-2 text-sm text-gray-300 hover:bg-ink-line/50 transition"
          >
            Cancel
          </button>
          <button
            disabled={theme.trim().length < 3 || busy}
            onClick={async () => {
              setBusy(true);
              await onCreate(theme.trim(), description.trim(), hours);
              setBusy(false);
            }}
            className="flex-1 rounded-lg bg-accent-violet/85 py-2 text-sm font-bold text-ink hover:bg-accent-violet transition disabled:opacity-40"
          >
            {busy ? 'Creating…' : 'Create'}
          </button>
        </div>
      </div>
    </div>
  );
}
