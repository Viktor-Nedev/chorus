import { useState, useEffect } from 'react';

const THEME_IDEAS = [
  'A city that floats', 'Your happiest memory', 'Sound made visible',
  'The last tree on Earth', 'A creature of light', 'Dreams in neon',
  'Under the ocean sky', 'A door to nowhere',
];

function CountdownBadge({ endsAt }) {
  const [left, setLeft] = useState(Math.max(0, endsAt - Date.now()));
  useEffect(() => {
    const id = setInterval(() => setLeft(Math.max(0, endsAt - Date.now())), 250);
    return () => clearInterval(id);
  }, [endsAt]);
  const s = Math.ceil(left / 1000);
  return (
    <span className={`font-display font-extrabold text-2xl tabular-nums ${s <= 10 ? 'text-red-400' : 'text-white'}`}>
      {Math.floor(s / 60)}:{String(s % 60).padStart(2, '0')}
    </span>
  );
}

// Целият Draw Battle флоу: старт модал (creator) → банер с тема+таймер →
// галерия за гласуване → победител.
export function BattleOverlay({ socket, isCreator, myId, usersCount }) {
  const { battle } = socket;
  const [showStart, setShowStart] = useState(false);
  const [theme, setTheme] = useState('');
  const [seconds, setSeconds] = useState(120);
  const [votedFor, setVotedFor] = useState(null);

  useEffect(() => {
    if (battle?.phase === 'drawing') setVotedFor(null);
  }, [battle?.phase]);

  return (
    <>
      {/* Start бутон (creator, без активен battle, ≥2 души) */}
      {isCreator && !battle && usersCount >= 2 && (
        <button
          onClick={() => setShowStart(true)}
          className="rounded-lg border border-yellow-700 bg-yellow-950/40 px-3 py-1.5 text-xs text-yellow-300 hover:bg-yellow-900/40 transition"
        >
          ⚔ Draw Battle
        </button>
      )}

      {/* Start модал */}
      {showStart && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/70 backdrop-blur-sm animate-fade-in">
          <div className="max-w-sm w-full mx-4 rounded-2xl bg-ink-soft border border-ink-line p-6 animate-slide-up">
            <h2 className="font-display font-bold text-lg text-white mb-1">⚔ Draw Battle</h2>
            <p className="text-[11px] text-gray-500 mb-4">
              Everyone draws the theme on their own layer. Then the room votes.
            </p>
            <label className="block mb-2">
              <span className="text-xs text-gray-400 mb-1 block">Theme</span>
              <input
                value={theme}
                onChange={(e) => setTheme(e.target.value)}
                maxLength={60}
                placeholder="What should everyone draw?"
                className="w-full rounded-lg bg-ink border border-ink-line px-3 py-2 text-sm text-white focus:border-yellow-500 focus:outline-none"
              />
            </label>
            <button
              onClick={() => setTheme(THEME_IDEAS[Math.floor(Math.random() * THEME_IDEAS.length)])}
              className="text-[11px] text-accent-cyan hover:underline mb-4"
            >
              🎲 Random theme
            </button>
            <div className="flex gap-1.5 mb-5">
              {[60, 120, 180].map((s) => (
                <button
                  key={s}
                  onClick={() => setSeconds(s)}
                  className={`flex-1 rounded-lg py-1.5 text-xs transition border ${
                    seconds === s
                      ? 'bg-yellow-950/60 border-yellow-600 text-yellow-300'
                      : 'border-ink-line text-gray-400 hover:text-white'
                  }`}
                >
                  {s / 60} min
                </button>
              ))}
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setShowStart(false)}
                className="flex-1 rounded-lg border border-ink-line py-2 text-sm text-gray-300 hover:bg-ink-line/50 transition"
              >
                Cancel
              </button>
              <button
                disabled={!theme.trim()}
                onClick={() => {
                  socket.startBattle(theme.trim(), seconds);
                  setShowStart(false);
                }}
                className="flex-1 rounded-lg bg-yellow-600 py-2 text-sm font-bold text-ink hover:bg-yellow-500 transition disabled:opacity-40"
              >
                Start!
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Банер по време на рисуване */}
      {battle?.phase === 'drawing' && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 z-30 rounded-2xl bg-ink-soft/90 border border-yellow-700 backdrop-blur px-6 py-3 text-center animate-slide-up">
          <div className="text-[10px] uppercase tracking-[0.3em] text-gray-500">⚔ Draw battle — draw now!</div>
          <div className="font-display font-bold text-white text-lg my-0.5">“{battle.theme}”</div>
          <CountdownBadge endsAt={battle.endsAt} />
        </div>
      )}

      {battle?.phase === 'collect' && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 z-30 rounded-2xl bg-ink-soft/90 border border-ink-line backdrop-blur px-6 py-3 text-sm text-gray-300 animate-fade-in">
          🖼 Time's up! Collecting artworks…
        </div>
      )}

      {/* Гласуване */}
      {battle?.phase === 'voting' && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/80 backdrop-blur-sm animate-fade-in">
          <div className="max-w-3xl w-full mx-4 rounded-2xl bg-ink-soft border border-ink-line p-6 animate-slide-up max-h-[85vh] overflow-y-auto">
            <h2 className="font-display font-bold text-xl text-white mb-1">Vote for the best “{battle.theme}”</h2>
            <p className="text-[11px] text-gray-500 mb-4">
              You can't vote for yourself. {battle.votesIn || 0} vote{(battle.votesIn || 0) === 1 ? '' : 's'} in.
            </p>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {battle.entries.map((e) => {
                const mine = e.userId === myId;
                const chosen = votedFor === e.userId;
                return (
                  <button
                    key={e.userId}
                    disabled={mine || !!votedFor}
                    onClick={() => {
                      setVotedFor(e.userId);
                      socket.sendBattleVote(e.userId);
                    }}
                    className={`rounded-xl overflow-hidden border-2 text-left transition disabled:cursor-not-allowed ${
                      chosen
                        ? 'border-yellow-500 scale-[1.02]'
                        : mine
                          ? 'border-ink-line opacity-60'
                          : 'border-ink-line hover:border-yellow-600'
                    }`}
                  >
                    <img src={e.png} alt={e.nickname} className="w-full aspect-video object-cover bg-ink" />
                    <div className="px-2.5 py-1.5 text-xs text-gray-300">
                      {mine ? 'you' : e.nickname} {chosen && '· ✓ your vote'}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Резултат */}
      {battle?.phase === 'result' && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/80 backdrop-blur-sm animate-fade-in">
          <div className="max-w-sm w-full mx-4 rounded-2xl bg-ink-soft border border-yellow-700 p-8 text-center animate-slide-up">
            {battle.result?.aborted ? (
              <p className="text-sm text-gray-400">Battle ended — not enough entries to vote.</p>
            ) : (
              <>
                <div className="text-5xl mb-3">🏆</div>
                <div className="font-display font-extrabold text-2xl text-white">
                  {battle.result?.winnerId === myId ? 'You win!' : battle.result?.winnerNickname}
                </div>
                <p className="mt-2 text-xs text-gray-500">
                  {Object.values(battle.result?.tally || {}).reduce((a, b) => a + b, 0)} votes cast
                </p>
              </>
            )}
            <button
              onClick={socket.dismissBattle}
              className="mt-6 w-full rounded-lg bg-accent-violet/85 py-2 text-sm font-bold text-ink hover:bg-accent-violet transition"
            >
              Back to the canvas
            </button>
          </div>
        </div>
      )}
    </>
  );
}
