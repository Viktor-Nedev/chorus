import { useState, useRef, useCallback, useEffect } from 'react';
import { P5Canvas } from '../components/P5Canvas';
import { VideoProcessor } from '../components/VideoProcessor';
import { ParticipantsList } from '../components/HUD';
import { PoemOverlay } from '../components/PoemOverlay';
import { SaveModal } from '../components/SaveModal';
import { SharedCanvas } from '../components/collective/SharedCanvas';
import { ChatPanel } from '../components/collective/ChatPanel';
import { ReactionsBar } from '../components/collective/ReactionsBar';
import { BattleOverlay } from '../components/collective/BattleOverlay';
import { ArenaOverlay } from '../components/collective/ArenaOverlay';
import { CamStrip } from '../components/collective/CamStrip';
import { useMediaPipe } from '../hooks/useMediaPipe';
import { useAudio } from '../hooks/useAudio';
import { useSocket } from '../hooks/useSocket';
import { useArtworkStore } from '../hooks/useArtworkStore';
import { useAuth } from '../hooks/useAuth';
import { MobileNotice } from '../components/MobileNotice';

function hslToRgb(h, s, l) {
  s /= 100;
  l /= 100;
  const k = (n) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return { r: Math.round(f(0) * 255), g: Math.round(f(8) * 255), b: Math.round(f(4) * 255) };
}

// ── Lobby: избор на режим на игра + nickname + create/join ──
const GAME_MODES = [
  {
    id: 'canvas',
    icon: '🎨',
    title: 'Shared Canvas',
    desc: 'Everyone paints one canvas together — with live cameras of every artist.',
  },
  {
    id: 'arena',
    icon: '🏟',
    title: 'Game Arena',
    desc: 'Timed drawing games: draw the prompt, memory & blind rounds. Vote (or let AI judge) and collect points!',
  },
];

function Lobby({ onCreate, onJoin, joinError, navigate, defaultNickname }) {
  const [nickname, setNickname] = useState(defaultNickname || '');
  const [code, setCode] = useState('');
  const [mode, setMode] = useState(null); // 'create' | 'join'
  const [gameMode, setGameMode] = useState('canvas');
  const [rounds, setRounds] = useState(3);
  const [roundSeconds, setRoundSeconds] = useState(60);

  const valid = nickname.trim().length > 0;

  return (
    <div className="h-full w-full bg-ink flex items-center justify-center overflow-y-auto">
      <div className="w-full max-w-md mx-4 py-8 animate-slide-up">
        <button
          onClick={() => navigate('landing')}
          className="text-sm text-gray-500 hover:text-white transition mb-6"
        >
          ← Back
        </button>
        <h1 className="font-display text-3xl text-white tracking-widest mb-1">COLLECTIVE</h1>
        <p className="text-sm text-gray-400 mb-6">
          Up to 8 people. Pick how you want to play together.
        </p>

        {/* Избор на режим (за create) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-5">
          {GAME_MODES.map((g) => (
            <button
              key={g.id}
              onClick={() => setGameMode(g.id)}
              className={`rounded-xl border p-4 text-left transition ${
                gameMode === g.id
                  ? 'border-cyan-500 bg-cyan-950/30'
                  : 'border-ink-line bg-ink-soft/40 hover:border-gray-500'
              }`}
            >
              <div className="text-2xl">{g.icon}</div>
              <div className="mt-1.5 font-display font-bold text-sm text-white">{g.title}</div>
              <div className="mt-1 text-[11px] text-gray-500 leading-snug">{g.desc}</div>
            </button>
          ))}
        </div>

        {/* Настройки за Arena */}
        {gameMode === 'arena' && (
          <div className="mb-5 rounded-xl border border-ink-line bg-ink-soft/40 p-3 animate-fade-in flex gap-4">
            <label className="flex-1">
              <span className="text-[10px] uppercase tracking-[0.15em] text-gray-500 block mb-1">Rounds</span>
              <div className="flex gap-1.5">
                {[3, 5].map((r) => (
                  <button
                    key={r}
                    onClick={() => setRounds(r)}
                    className={`flex-1 rounded-lg py-1.5 text-xs transition border ${
                      rounds === r ? 'bg-cyan-950/60 border-cyan-600 text-cyan-300' : 'border-ink-line text-gray-400'
                    }`}
                  >
                    {r}
                  </button>
                ))}
              </div>
            </label>
            <label className="flex-[2]">
              <span className="text-[10px] uppercase tracking-[0.15em] text-gray-500 block mb-1">Round time</span>
              <div className="flex gap-1.5">
                {[30, 60, 90].map((s) => (
                  <button
                    key={s}
                    onClick={() => setRoundSeconds(s)}
                    className={`flex-1 rounded-lg py-1.5 text-xs transition border ${
                      roundSeconds === s ? 'bg-cyan-950/60 border-cyan-600 text-cyan-300' : 'border-ink-line text-gray-400'
                    }`}
                  >
                    {s}s
                  </button>
                ))}
              </div>
            </label>
          </div>
        )}

        <label className="block mb-4">
          <span className="text-xs text-gray-400 mb-1 block">Nickname</span>
          <input
            value={nickname}
            onChange={(e) => setNickname(e.target.value.slice(0, 20))}
            maxLength={20}
            placeholder="max 20 characters"
            className="w-full rounded-lg bg-ink-soft border border-ink-line px-3 py-2.5 text-sm text-white focus:border-cyan-400 focus:outline-none"
          />
        </label>

        {mode === 'join' && (
          <label className="block mb-4 animate-fade-in">
            <span className="text-xs text-gray-400 mb-1 block">Session code</span>
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase().slice(0, 4))}
              maxLength={4}
              placeholder="XKZR"
              className="w-full rounded-lg bg-ink-soft border border-ink-line px-3 py-2.5 text-lg tracking-[0.5em] text-center font-display text-white focus:border-cyan-400 focus:outline-none uppercase"
            />
          </label>
        )}

        {joinError && (
          <p className="text-sm text-red-400 mb-4 animate-fade-in">⚠ {joinError}</p>
        )}

        <div className="flex flex-col gap-3">
          <button
            onClick={() => onCreate(nickname, gameMode, { rounds, roundSeconds })}
            disabled={!valid}
            className="w-full rounded-lg bg-cyan-600 py-2.5 text-sm text-white hover:bg-cyan-500 transition disabled:opacity-40"
          >
            Create {gameMode === 'arena' ? 'Game Arena' : 'Shared Canvas'} session
          </button>
          <button
            onClick={() => (mode === 'join' ? onJoin(nickname, code) : setMode('join'))}
            disabled={mode === 'join' ? !valid || code.length !== 4 : false}
            className="w-full rounded-lg border border-cyan-700 bg-cyan-950/40 py-2.5 text-sm text-cyan-300 hover:bg-cyan-900/40 transition disabled:opacity-40"
          >
            {mode === 'join' ? 'Join session' : 'Join with a code instead'}
          </button>
        </div>

        <p className="mt-6 text-[11px] text-gray-600 text-center">
          Joining will request camera + microphone access.
        </p>
      </div>
    </div>
  );
}

// ── Активна сесия ──
function Session({ socket, navigate }) {
  const {
    sessionInfo,
    users,
    usersRef,
    sessionEnded,
    sendStateUpdate,
    sendParticleSnapshot,
    endSession,
    disconnect,
  } = socket;

  const videoRef = useRef(null);
  const systemRef = useRef(null);
  const p5InstanceRef = useRef(null);
  const myAudioLevelRef = useRef(0);
  const nicknameRef = useRef(sessionInfo?.nickname);

  const { emotion, gesture, emotionRef, gestureRef, handPositionRef, landmarksBufRef, landmarkStampRef, detect } = useMediaPipe(
    videoRef,
    true
  );
  const { authFetch } = useAuth();
  const [camAvatar, setCamAvatar] = useState(null);
  useEffect(() => {
    authFetch('/api/users/avatar')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.camAvatarId) {
          const a = (d.list || []).find((x) => x.id === d.camAvatarId);
          if (a) setCamAvatar({ color: a.fixedColor || '#8B7BFA' });
        }
      })
      .catch(() => {});
  }, [authFetch]);
  const { initAudio, stopAudio, getAudioData } = useAudio();
  const { saveArtwork, generatePoem, saving } = useArtworkStore();

  const [poemState, setPoemState] = useState(null);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [copied, setCopied] = useState(false);

  // Споделено рисуване
  const [drawMode, setDrawMode] = useState(false);
  const [erase, setErase] = useState(false);
  const [brushSize, setBrushSize] = useState(6);
  const sharedCanvasRef = useRef(null);

  const baseColor = sessionInfo?.yourColor
    ? hslToRgb(sessionInfo.yourColor.h, sessionInfo.yourColor.s, sessionInfo.yourColor.l)
    : { r: 150, g: 100, b: 255 };
  const colorCss = `rgb(${baseColor.r},${baseColor.g},${baseColor.b})`;

  // Режим на сесията: 'canvas' (споделено платно + камери) или 'arena' (игри)
  const isArena = sessionInfo?.mode === 'arena';
  // "Личен слой" фаза: battle (в canvas режим) или arena рунд
  const arenaDrawPhase =
    isArena && ['drawing', 'collect'].includes(socket.arena?.phase) ? socket.arena.phase : null;
  const battlePhase = socket.battle?.phase || arenaDrawPhase;
  const isBlindRound = isArena && socket.arena?.kind === 'blind' && !!arenaDrawPhase;
  // По време на battle/arena рунд рисуването е винаги активно (свой слой)
  const effectiveDrawMode = battlePhase === 'drawing' ? true : !isArena && drawMode;

  // Микрофон при влизане
  useEffect(() => {
    initAudio().catch(() => {});
    return () => stopAudio();
  }, [initAudio, stopAudio]);

  // STATE_UPDATE на всеки 100ms
  useEffect(() => {
    const interval = setInterval(() => {
      const audio = getAudioData();
      myAudioLevelRef.current = audio.totalLevel;
      sendStateUpdate({
        emotion: emotionRef.current,
        gesture: gestureRef.current,
        audioLevel: audio.totalLevel,
        handPosition: handPositionRef.current,
      });
    }, 100);
    return () => clearInterval(interval);
  }, [getAudioData, sendStateUpdate, emotionRef, gestureRef, handPositionRef]);

  // PARTICLE_SNAPSHOT на всеки 500ms
  useEffect(() => {
    const interval = setInterval(() => {
      if (systemRef.current) {
        sendParticleSnapshot(systemRef.current.getSnapshot());
      }
    }, 500);
    return () => clearInterval(interval);
  }, [sendParticleSnapshot]);

  const onSystemReady = useCallback((system, p) => {
    systemRef.current = system;
    p5InstanceRef.current = p;
  }, []);

  const copyCode = () => {
    navigator.clipboard?.writeText(sessionInfo.sessionCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  // При SESSION_ENDED — покажи поема + опция за запазване (за всички)
  useEffect(() => {
    if (!sessionEnded) return;
    let cancelled = false;
    (async () => {
      setPoemState({ loading: true, poem: '' });
      try {
        const poem = await generatePoem({
          duration: sessionEnded.duration,
          totalUsers: sessionEnded.totalUsers,
          emotionHistory: sessionEnded.emotionHistory,
          mode: 'collective',
        });
        if (!cancelled) setPoemState({ loading: false, poem });
      } catch {
        if (!cancelled) setPoemState({ loading: false, poem: 'The chorus fell silent.' });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sessionEnded, generatePoem]);

  const handleSaveCollective = async ({ title, author, description }) => {
    const p = p5InstanceRef.current;
    if (!p) return;
    const canvas = p.canvas ?? p.drawingContext.canvas;
    // Композирай p5 частиците + споделения слой с рисунките
    const combined = document.createElement('canvas');
    combined.width = canvas.width;
    combined.height = canvas.height;
    const cctx = combined.getContext('2d');
    cctx.drawImage(canvas, 0, 0);
    if (sharedCanvasRef.current) {
      cctx.drawImage(sharedCanvasRef.current, 0, 0, combined.width, combined.height);
    }
    try {
      await saveArtwork({
        title,
        author,
        description,
        imageData: combined.toDataURL('image/png'),
        emotionHistory: sessionEnded?.emotionHistory ?? [],
        poem: poemState?.poem ?? '',
        duration: sessionEnded?.duration ?? 0,
        totalUsers: sessionEnded?.totalUsers,
        mode: 'collective',
      });
      setShowSaveModal(false);
      disconnect();
      navigate('gallery');
    } catch {
      setShowSaveModal(false);
    }
  };

  return (
    <div className="relative h-full w-full bg-ink overflow-hidden">
      <MobileNotice label="Collective is best on desktop — a bigger canvas for the shared session" />
      <P5Canvas
        mode="collective"
        emotionRef={emotionRef}
        gestureRef={gestureRef}
        handPositionRef={handPositionRef}
        getAudioData={getAudioData}
        baseColor={baseColor}
        usersRef={usersRef}
        myAudioLevelRef={myAudioLevelRef}
        onSystemReady={onSystemReady}
      />

      {/* Споделен слой за рисуване (над частиците) */}
      <SharedCanvas
        socket={socket}
        drawMode={effectiveDrawMode}
        erase={erase}
        brushSize={brushSize}
        colorCss={colorCss}
        battlePhase={battlePhase}
        blind={isBlindRound}
        onCanvasReady={(el) => (sharedCanvasRef.current = el)}
      />

      <VideoProcessor ref={videoRef} detect={detect} active={true} />

      {/* Header */}
      <header className="absolute top-0 inset-x-0 z-20 flex items-center gap-3 px-4 h-14 bg-gradient-to-b from-ink/90 to-transparent">
        <button
          onClick={() => {
            disconnect();
            navigate('landing');
          }}
          className="text-sm text-gray-400 hover:text-white transition"
        >
          ← Leave
        </button>

        <button
          onClick={copyCode}
          title="Copy session code"
          className="ml-2 rounded-lg border border-ink-line bg-ink-soft/70 px-3 py-1 font-display tracking-[0.4em] text-cyan-300 text-sm hover:border-cyan-500 transition"
        >
          {copied ? 'COPIED' : sessionInfo?.sessionCode}
        </button>

        <div className="ml-auto flex items-center gap-2">
          {!isArena && (
            <BattleOverlay
              socket={socket}
              isCreator={!!sessionInfo?.isCreator}
              myId={sessionInfo?.yourId}
              usersCount={Object.keys(socket.users).length + 1}
            />
          )}
          {sessionInfo?.isCreator && !sessionEnded && (
            <button
              onClick={endSession}
              className="rounded-lg bg-cyan-600 px-3 py-1.5 text-xs text-white hover:bg-cyan-500 transition"
            >
              End & Save Session
            </button>
          )}
        </div>
      </header>

      {/* ── Arena overlay (режим игри) ── */}
      {isArena && (
        <ArenaOverlay socket={socket} isCreator={!!sessionInfo?.isCreator} myId={sessionInfo?.yourId} />
      )}

      {/* ── Живи камери (само Shared Canvas режим) ── */}
      {!isArena && (
        <CamStrip
          socket={socket}
          videoRef={videoRef}
          users={socket.users}
          myNickname={nicknameRef.current || 'you'}
          myColor={sessionInfo?.yourColor}
          camAvatar={camAvatar}
          landmarksBufRef={landmarksBufRef}
          landmarkStampRef={landmarkStampRef}
        />
      )}

      {/* ── Draw toolbar (ляво долу; в arena рисуваш само в рунд) ── */}
      <div className={`absolute left-4 bottom-4 z-30 flex items-center gap-2 rounded-full bg-ink-soft/80 border border-ink-line backdrop-blur px-2 py-1.5 ${isArena && !arenaDrawPhase ? 'hidden' : ''}`}>
        <button
          onClick={() => setDrawMode((d) => !d)}
          title="Draw on the shared canvas"
          className={`w-9 h-9 rounded-full text-base transition flex items-center justify-center ${
            effectiveDrawMode ? 'bg-accent-violet/30 border border-accent-violet' : 'hover:bg-ink-line/60'
          }`}
        >
          🖌
        </button>
        {effectiveDrawMode && (
          <>
            <button
              onClick={() => setErase((e) => !e)}
              title="Eraser"
              className={`w-9 h-9 rounded-full text-base transition flex items-center justify-center ${
                erase ? 'bg-red-950/70 border border-red-700' : 'hover:bg-ink-line/60'
              }`}
            >
              ⌫
            </button>
            <input
              type="range"
              min={2}
              max={40}
              value={brushSize}
              onChange={(e) => setBrushSize(Number(e.target.value))}
              title="Brush size"
              className="w-24 accent-accent-violet"
            />
            <span
              className="rounded-full border border-white/30 shrink-0"
              style={{ width: 14, height: 14, background: colorCss }}
              title="Your color"
            />
          </>
        )}
        {sessionInfo?.isCreator && !battlePhase && (
          <button
            onClick={() => window.confirm('Clear the shared canvas for everyone?') && socket.clearCanvas()}
            title="Clear shared canvas (host)"
            className="w-9 h-9 rounded-full text-sm text-gray-400 hover:text-red-400 hover:bg-ink-line/60 transition"
          >
            🗑
          </button>
        )}
      </div>

      <ReactionsBar socket={socket} />
      <ChatPanel messages={socket.chatMessages} onSend={socket.sendChat} myId={sessionInfo?.yourId} />

      <ParticipantsList
        users={users}
        myNickname={nicknameRef.current || 'you'}
        myColor={sessionInfo?.yourColor}
        sessionCode={sessionInfo?.sessionCode}
      />

      {/* Session ended → poem → save опция за всички */}
      {poemState && (
        <PoemOverlay
          poem={poemState.poem}
          loading={poemState.loading}
          onClose={() => {
            setPoemState(null);
            if (sessionEnded) setShowSaveModal(true);
          }}
        />
      )}

      {showSaveModal && (
        <SaveModal
          defaultTitle={`Chorus ${sessionInfo?.sessionCode} — ${new Date().toLocaleDateString()}`}
          mode="collective"
          onSave={handleSaveCollective}
          onCancel={() => {
            setShowSaveModal(false);
            disconnect();
            navigate('landing');
          }}
          saving={saving}
        />
      )}
    </div>
  );
}

export function CollectiveCanvas({ navigate }) {
  const socket = useSocket();
  const { user, token } = useAuth();
  const nicknameRef = useRef('');

  const handleCreate = (nickname, gameMode, settings) => {
    nicknameRef.current = nickname;
    socket.createSession(nickname, token, gameMode, settings);
  };
  const handleJoin = (nickname, code) => {
    nicknameRef.current = nickname;
    socket.joinSession(nickname, code, token);
  };

  if (!socket.sessionInfo) {
    return (
      <Lobby
        onCreate={handleCreate}
        onJoin={handleJoin}
        joinError={socket.joinError}
        navigate={navigate}
        defaultNickname={user?.username}
      />
    );
  }

  // Подай nickname в sessionInfo за ParticipantsList
  socket.sessionInfo.nickname = nicknameRef.current;

  return <Session socket={socket} navigate={navigate} />;
}
