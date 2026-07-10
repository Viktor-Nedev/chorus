import { useState, useRef, useCallback, useEffect } from 'react';
import { P5Canvas } from '../components/P5Canvas';
import { VideoProcessor } from '../components/VideoProcessor';
import { ParticipantsList } from '../components/HUD';
import { PoemOverlay } from '../components/PoemOverlay';
import { SaveModal } from '../components/SaveModal';
import { ThemeToggle } from '../components/ThemeToggle';
import { useMediaPipe } from '../hooks/useMediaPipe';
import { useAudio } from '../hooks/useAudio';
import { useSocket } from '../hooks/useSocket';
import { useArtworkStore } from '../hooks/useArtworkStore';

function hslToRgb(h, s, l) {
  s /= 100;
  l /= 100;
  const k = (n) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return { r: Math.round(f(0) * 255), g: Math.round(f(8) * 255), b: Math.round(f(4) * 255) };
}

// ── Lobby: nickname + create/join ──
function Lobby({ onCreate, onJoin, joinError, navigate, theme, toggleTheme }) {
  const [nickname, setNickname] = useState('');
  const [code, setCode] = useState('');
  const [mode, setMode] = useState(null); // 'create' | 'join'

  const valid = nickname.trim().length > 0;

  return (
    <div className="h-full w-full bg-ink flex items-center justify-center">
      <ThemeToggle theme={theme} onToggle={toggleTheme} className="absolute top-4 right-4" />
      <div className="w-full max-w-sm mx-4 animate-slide-up">
        <button
          onClick={() => navigate('landing')}
          className="text-sm text-gray-500 hover:text-white transition mb-6"
        >
          ← Back
        </button>
        <h1 className="font-display text-3xl text-white tracking-widest mb-1">COLLECTIVE</h1>
        <p className="text-sm text-gray-400 mb-8">
          Up to 8 people paint one canvas with their emotions.
        </p>

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
            onClick={() => (mode === 'join' ? onJoin(nickname, code) : setMode('join'))}
            disabled={mode === 'join' ? !valid || code.length !== 4 : false}
            className="w-full rounded-lg border border-cyan-700 bg-cyan-950/40 py-2.5 text-sm text-cyan-300 hover:bg-cyan-900/40 transition disabled:opacity-40"
          >
            {mode === 'join' ? 'Join session' : 'Join with Code'}
          </button>
          <button
            onClick={() => onCreate(nickname)}
            disabled={!valid}
            className="w-full rounded-lg bg-cyan-600 py-2.5 text-sm text-white hover:bg-cyan-500 transition disabled:opacity-40"
          >
            Create New Session
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
function Session({ socket, navigate, theme, toggleTheme }) {
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
  const themeRef = useRef(theme);
  themeRef.current = theme;

  const { emotion, gesture, emotionRef, gestureRef, handPositionRef, detect } = useMediaPipe(
    videoRef,
    true
  );
  const { initAudio, stopAudio, getAudioData } = useAudio();
  const { saveArtwork, generatePoem, saving } = useArtworkStore();

  const [poemState, setPoemState] = useState(null);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [copied, setCopied] = useState(false);

  const baseColor = sessionInfo?.yourColor
    ? hslToRgb(sessionInfo.yourColor.h, sessionInfo.yourColor.s, sessionInfo.yourColor.l)
    : { r: 150, g: 100, b: 255 };

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
    try {
      await saveArtwork({
        title,
        author,
        description,
        imageData: canvas.toDataURL('image/png'),
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
      <P5Canvas
        mode="collective"
        emotionRef={emotionRef}
        gestureRef={gestureRef}
        handPositionRef={handPositionRef}
        getAudioData={getAudioData}
        baseColor={baseColor}
        usersRef={usersRef}
        myAudioLevelRef={myAudioLevelRef}
        themeRef={themeRef}
        onSystemReady={onSystemReady}
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
          <ThemeToggle theme={theme} onToggle={toggleTheme} />
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

export function CollectiveCanvas({ navigate, theme, toggleTheme }) {
  const socket = useSocket();
  const nicknameRef = useRef('');

  const handleCreate = (nickname) => {
    nicknameRef.current = nickname;
    socket.createSession(nickname);
  };
  const handleJoin = (nickname, code) => {
    nicknameRef.current = nickname;
    socket.joinSession(nickname, code);
  };

  if (!socket.sessionInfo) {
    return (
      <Lobby
        onCreate={handleCreate}
        onJoin={handleJoin}
        joinError={socket.joinError}
        navigate={navigate}
        theme={theme}
        toggleTheme={toggleTheme}
      />
    );
  }

  // Подай nickname в sessionInfo за ParticipantsList
  socket.sessionInfo.nickname = nicknameRef.current;

  return <Session socket={socket} navigate={navigate} theme={theme} toggleTheme={toggleTheme} />;
}
