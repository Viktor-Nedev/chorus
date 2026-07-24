import { useState, useEffect } from 'react';

// Game Arena: рундове с prompt + таймер и пет вида игри (draw / memory /
// blind / pictionary / impostor), гласуване или AI съдия, точки, scoreboard и
// финален подиум.
const KIND_INFO = {
  draw: { icon: '🎨', title: 'Draw the prompt!' },
  memory: { icon: '🧠', title: 'Memory — memorize, then draw!' },
  blind: { icon: '🙈', title: 'Blind — your ink is invisible!' },
  pictionary: { icon: '✏️', title: 'Pictionary — guess in the chat!' },
  impostor: { icon: '🎭', title: 'Impostor — one of you is faking!' },
};

function Countdown({ endsAt }) {
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

export function ArenaOverlay({ socket, isCreator, myId }) {
  const { arena } = socket;
  const [votedFor, setVotedFor] = useState(null);
  const [showEmoji, setShowEmoji] = useState(false);

  useEffect(() => {
    if (arena?.phase === 'drawing' && arena.kind === 'memory') {
      setShowEmoji(true);
      const id = setTimeout(() => setShowEmoji(false), 4000);
      return () => clearTimeout(id);
    }
    return undefined;
  }, [arena?.phase, arena?.round, arena?.kind]);

  useEffect(() => {
    if (arena?.phase === 'drawing') setVotedFor(null);
  }, [arena?.phase, arena?.round]);

  if (!arena) {
    return (
      <div className="absolute inset-0 z-30 flex items-center justify-center pointer-events-none">
        <div className="text-center pointer-events-auto animate-fade-in">
          <div className="text-6xl mb-4">🏟</div>
          <h2 className="font-display font-extrabold text-3xl text-white tracking-wide">GAME ARENA</h2>
          <p className="mt-2 text-sm text-gray-400 max-w-sm">
            Draw, guess and deduce — 5 game types. Win rounds, collect points.
            <br />
            With fewer than 3 players, an AI judge picks the winners.
          </p>
          {isCreator ? (
            <button
              onClick={socket.startArena}
              className="mt-6 rounded-xl bg-accent-violet/85 px-8 py-3 text-sm font-bold text-ink hover:bg-accent-violet transition animate-slide-up"
            >
              ▶ Start the games
            </button>
          ) : (
            <p className="mt-6 text-xs text-gray-500 glow-pulse">Waiting for the host to start…</p>
          )}
        </div>
      </div>
    );
  }

  const info = KIND_INFO[arena.kind] || KIND_INFO.draw;
  const isPictionary = arena.kind === 'pictionary';
  const isImpostor = arena.kind === 'impostor';
  const amDrawer = isPictionary && arena.drawerId === myId;

  // Заглавие/подсказка за рисуващата фаза според вида игра
  const drawingHeadline = () => {
    if (isPictionary) {
      return amDrawer
        ? `You're drawing: ${arena.myWord || '…'}`
        : `${arena.drawerNickname || 'Someone'} is drawing — guess it in chat!`;
    }
    if (isImpostor) {
      return arena.impostor ? "You're the FAKE ARTIST 🎭 — blend in!" : `Draw: ${arena.myPrompt || '…'}`;
    }
    if (arena.kind === 'memory') return showEmoji ? 'Memorize it…' : 'Draw it from memory!';
    return `Draw ${arena.prompt?.text ?? ''}`;
  };

  const voteQuestion = isImpostor
    ? 'Who is the impostor? 🎭'
    : `Vote — who drew “${arena.prompt?.text}” best?`;

  return (
    <>
      {/* ── Рунд банер ── */}
      {arena.phase === 'drawing' && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 z-30 rounded-2xl bg-ink-soft/90 border border-accent-violet/60 backdrop-blur px-6 py-3 text-center animate-slide-up max-w-[92vw]">
          <div className="text-[10px] uppercase tracking-[0.3em] text-gray-500">
            {info.icon} Round {arena.round}/{arena.totalRounds} — {info.title}
          </div>
          <div className={`font-display font-bold text-xl my-0.5 ${isImpostor && arena.impostor ? 'text-amber-300' : 'text-white'}`}>
            {drawingHeadline()}
          </div>
          {isPictionary && !amDrawer && (
            <div className="text-[11px] text-accent-cyan">
              {arena.guessedCount || 0}/{arena.guessers ?? '?'} guessed
            </div>
          )}
          {isPictionary && amDrawer && (
            <div className="text-[11px] text-gray-500">Only you can draw — everyone else guesses.</div>
          )}
          <Countdown endsAt={arena.endsAt} />
        </div>
      )}

      {/* Memory флаш */}
      {arena.phase === 'drawing' && arena.kind === 'memory' && showEmoji && (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-ink/80 backdrop-blur-sm pointer-events-none animate-fade-in">
          <div className="text-center">
            <div style={{ fontSize: '10rem' }}>{arena.prompt?.emoji}</div>
            <p className="text-sm text-gray-400 mt-2">Memorize it! Drawing starts in a moment…</p>
          </div>
        </div>
      )}

      {arena.phase === 'collect' && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 z-30 rounded-2xl bg-ink-soft/90 border border-ink-line backdrop-blur px-6 py-3 text-sm text-gray-300 animate-fade-in">
          🖼 Pencils down! Collecting drawings…
        </div>
      )}

      {arena.phase === 'judging' && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/70 backdrop-blur-sm animate-fade-in">
          <div className="text-center">
            <div className="text-6xl mb-3 glow-pulse">🤖</div>
            <p className="font-display font-bold text-white text-xl">The AI judge is deliberating…</p>
            <p className="text-xs text-gray-500 mt-1">Gemini is looking at every drawing of “{arena.prompt?.text}”.</p>
          </div>
        </div>
      )}

      {/* ── Гласуване ── */}
      {arena.phase === 'voting' && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/80 backdrop-blur-sm animate-fade-in">
          <div className="max-w-3xl w-full mx-4 rounded-2xl bg-ink-soft border border-ink-line p-6 animate-slide-up max-h-[85vh] overflow-y-auto">
            <h2 className="font-display font-bold text-xl text-white mb-1">{voteQuestion}</h2>
            <p className="text-[11px] text-gray-500 mb-4">
              You can't vote for yourself. {arena.votesIn || 0} vote{(arena.votesIn || 0) === 1 ? '' : 's'} in.
            </p>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {arena.entries.map((e) => {
                const mine = e.userId === myId;
                const chosen = votedFor === e.userId;
                return (
                  <button
                    key={e.userId}
                    disabled={mine || !!votedFor}
                    onClick={() => {
                      setVotedFor(e.userId);
                      socket.sendArenaVote(e.userId);
                    }}
                    className={`rounded-xl overflow-hidden border-2 text-left transition disabled:cursor-not-allowed ${
                      chosen ? 'border-accent-violet scale-[1.02]' : mine ? 'border-ink-line opacity-60' : 'border-ink-line hover:border-accent-violet/70'
                    }`}
                  >
                    <img src={e.png} alt={e.nickname} className="w-full aspect-video object-cover bg-ink" />
                    <div className="px-2.5 py-1.5 text-xs text-gray-300">
                      {mine ? 'you' : e.nickname} {chosen && '· ✓'}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ── Резултати от рунда ── */}
      {arena.phase === 'results' && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/80 backdrop-blur-sm animate-fade-in">
          <div className="max-w-2xl w-full mx-4 rounded-2xl bg-ink-soft border border-ink-line p-6 animate-slide-up max-h-[85vh] overflow-y-auto">
            <h2 className="font-display font-bold text-xl text-white">
              Round {arena.round}/{arena.totalRounds} results
            </h2>

            {/* Reveal (дума / импостор) */}
            {arena.reveal?.word && (
              <p className="mt-1 text-sm text-accent-cyan">The word was “{arena.reveal.word}”.</p>
            )}
            {arena.reveal?.impostorNickname && (
              <p className="mt-1 text-sm text-amber-300">
                {arena.reveal.caught ? '🕵 Caught! ' : '🎭 Got away! '}
                The impostor was <span className="font-bold">{arena.reveal.impostorId === myId ? 'you' : arena.reveal.impostorNickname}</span>.
              </p>
            )}
            {arena.comment && (
              <p className="mt-1 text-xs text-gray-400">
                {arena.aiJudged ? '🤖 AI judge: ' : ''}
                {arena.comment}
              </p>
            )}

            <div className="mt-4 space-y-2">
              {(arena.results || []).map((r, i) => (
                <div
                  key={r.userId}
                  className={`flex items-center gap-3 rounded-xl border p-2.5 ${i === 0 && r.gained > 0 ? 'border-yellow-600 bg-yellow-950/20' : 'border-ink-line'}`}
                >
                  <span className="text-xl w-8 text-center">
                    {r.gained > 0 && i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`}
                  </span>
                  {r.png && <img src={r.png} alt="" className="w-20 aspect-video object-cover rounded bg-ink" />}
                  <span className="flex-1 text-sm text-white truncate">{r.userId === myId ? 'you' : r.nickname}</span>
                  <span className="text-xs text-accent-violet font-bold">+{r.gained}</span>
                  <span className="text-xs text-gray-500 w-16 text-right">{r.total} pts</span>
                </div>
              ))}
              {(arena.results || []).length === 0 && (
                <p className="text-sm text-gray-500 text-center py-4">{arena.comment}</p>
              )}
            </div>
            <p className="mt-4 text-[11px] text-gray-600 text-center glow-pulse">
              {arena.round < arena.totalRounds ? 'Next round starting…' : 'Final results coming up…'}
            </p>
          </div>
        </div>
      )}

      {/* ── Подиум ── */}
      {arena.phase === 'podium' && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/85 backdrop-blur-sm animate-fade-in">
          <div className="max-w-md w-full mx-4 rounded-2xl bg-ink-soft border border-yellow-700 p-8 text-center animate-slide-up">
            <div className="text-5xl mb-2">🏆</div>
            <h2 className="font-display font-extrabold text-2xl text-white mb-6">Final standings</h2>
            <div className="space-y-2 text-left">
              {(arena.standings || []).map((s, i) => (
                <div
                  key={s.userId}
                  className={`flex items-center gap-3 rounded-xl border px-4 py-2.5 ${i === 0 ? 'border-yellow-500 bg-yellow-950/30' : 'border-ink-line'}`}
                >
                  <span className="text-xl">{i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`}</span>
                  <span className="flex-1 text-sm font-bold text-white truncate">{s.userId === myId ? 'you' : s.nickname}</span>
                  <span className="text-sm text-accent-violet font-bold">{s.points} pts</span>
                </div>
              ))}
            </div>
            <p className="mt-4 text-[11px] text-gray-500">Points are saved to your profile.</p>
            <button
              onClick={socket.dismissArena}
              className="mt-5 w-full rounded-lg bg-accent-violet/85 py-2.5 text-sm font-bold text-ink hover:bg-accent-violet transition"
            >
              {isCreator ? 'Back to arena (play again!)' : 'Back to arena'}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
