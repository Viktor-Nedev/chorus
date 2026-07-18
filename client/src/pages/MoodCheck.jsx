import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { MoodParticleScene } from '../components/moodcheck/MoodParticleScene';
import { VideoProcessor } from '../components/VideoProcessor';
import { SaveModal } from '../components/SaveModal';
import { CustomAvatarModal } from '../components/moodcheck/CustomAvatarModal';
import { useMediaPipe } from '../hooks/useMediaPipe';
import { useArtworkStore } from '../hooks/useArtworkStore';
import { useRecorder } from '../hooks/useRecorder';
import { useAuth } from '../hooks/useAuth';
import { EMOTION_CONFIGS, EMOTION_HEX } from '../constants/emotions';
import { AVATARS, AVATAR_MAP, DEFAULT_AVATAR, toRuntime, clampAvatar } from '../components/moodcheck/avatars';

const fmtTime = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const FACE_AVATARS = AVATARS.filter((a) => a.family === 'face');
const CHAR_AVATARS = AVATARS.filter((a) => a.family === 'character');

export function MoodCheck({ navigate }) {
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [toast, setToast] = useState(null);
  const [avatarId, setAvatarId] = useState(DEFAULT_AVATAR);
  const [presenting, setPresenting] = useState(false);
  const [micOn, setMicOn] = useState(true);
  const [emotionColor, setEmotionColor] = useState(true);
  const [showAvatars, setShowAvatars] = useState(false);
  const [showCustom, setShowCustom] = useState(false);
  const [customAvatar, setCustomAvatar] = useState(null); // runtime (с fixedColorObj)
  const [savingAvatar, setSavingAvatar] = useState(false);

  const videoRef = useRef(null);
  const snapshotFnRef = useRef(null);
  const canvasElRef = useRef(null);
  const startTimeRef = useRef(Date.now());
  const rootRef = useRef(null);
  const avatarRef = useRef(AVATAR_MAP[DEFAULT_AVATAR]);
  const emotionColorRef = useRef(true);
  emotionColorRef.current = emotionColor;

  const { emotion, emotionRef, landmarksBufRef, landmarkStampRef, detect, ready, error } =
    useMediaPipe(videoRef, true);
  const { saveArtwork, uploadVideo, saving } = useArtworkStore();
  const { authFetch } = useAuth();
  const recorder = useRecorder(() => canvasElRef.current);

  // Emotion history — 1/сек (mood journal)
  const [emotionHistory, setEmotionHistory] = useState([]);
  useEffect(() => {
    const interval = setInterval(() => {
      setEmotionHistory((prev) => [
        ...prev.slice(-599),
        { timestamp: Math.floor((Date.now() - startTimeRef.current) / 1000), emotion: emotionRef.current },
      ]);
    }, 1000);
    return () => clearInterval(interval);
  }, [emotionRef]);

  // Зареди запазения custom avatar
  useEffect(() => {
    authFetch('/api/users/avatar')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.avatar) setCustomAvatar(toRuntime(clampAvatar(d.avatar)));
      })
      .catch(() => {});
  }, [authFetch]);

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  const handleSnapshotReady = useCallback((fn) => (snapshotFnRef.current = fn), []);
  const handleCanvasReady = useCallback((el) => (canvasElRef.current = el), []);

  // ── Avatar смяна (live, без re-mount) ──
  const applyAvatar = (runtime) => {
    avatarRef.current = runtime;
  };
  const selectAvatar = (id) => {
    setAvatarId(id);
    setShowAvatars(false);
    if (id === 'custom' && customAvatar) applyAvatar(customAvatar);
    else applyAvatar(AVATAR_MAP[id] || AVATAR_MAP[DEFAULT_AVATAR]);
  };

  // Селфи от камерата (за AI вдъхновение)
  const getSelfie = useCallback(async () => {
    const video = videoRef.current;
    if (!video || video.readyState < 2) return undefined;
    const c = document.createElement('canvas');
    c.width = 320;
    c.height = 240;
    const ctx = c.getContext('2d');
    ctx.save();
    ctx.scale(-1, 1);
    ctx.drawImage(video, -c.width, 0, c.width, c.height);
    ctx.restore();
    return c.toDataURL('image/jpeg', 0.7);
  }, []);

  const aiGenerate = useCallback(
    async (prompt, image) => {
      const res = await authFetch('/api/users/avatar/ai', {
        method: 'POST',
        body: JSON.stringify({ prompt, image }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'AI failed');
      return data.avatar;
    },
    [authFetch]
  );

  const saveCustom = async (params) => {
    setSavingAvatar(true);
    try {
      const res = await authFetch('/api/users/avatar', { method: 'PUT', body: JSON.stringify(params) });
      const data = await res.json();
      const runtime = toRuntime(clampAvatar(data.avatar || params));
      setCustomAvatar(runtime);
      setShowCustom(false);
      setAvatarId('custom');
      applyAvatar(runtime);
      showToast('✓ Custom avatar saved');
    } catch {
      showToast('Could not save avatar');
    } finally {
      setSavingAvatar(false);
    }
  };

  // ── Present (fullscreen за screen-share) ──
  const togglePresent = () => {
    if (!document.fullscreenElement) rootRef.current?.requestFullscreen?.().catch(() => {});
    else document.exitFullscreen?.();
  };
  useEffect(() => {
    const onFs = () => setPresenting(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onFs);
    return () => document.removeEventListener('fullscreenchange', onFs);
  }, []);

  // ── Mood journal статистика ──
  const moodStats = useMemo(() => {
    if (!emotionHistory.length) return null;
    const counts = {};
    for (const e of emotionHistory) counts[e.emotion] = (counts[e.emotion] || 0) + 1;
    const total = emotionHistory.length;
    const sorted = Object.entries(counts)
      .map(([em, n]) => ({ emotion: em, pct: Math.round((n / total) * 100) }))
      .sort((a, b) => b.pct - a.pct);
    return { dominant: sorted[0], recent: emotionHistory.slice(-60) };
  }, [emotionHistory]);

  // ── Save изображение ──
  const handleSaveImage = async ({ title, author, description }) => {
    const snapshot = snapshotFnRef.current?.();
    if (!snapshot) {
      showToast('Snapshot failed');
      setShowSaveModal(false);
      return;
    }
    try {
      await saveArtwork({
        title, author, description, imageData: snapshot, emotionHistory,
        duration: Math.floor((Date.now() - startTimeRef.current) / 1000), mode: 'moodcheck',
      });
      setShowSaveModal(false);
      showToast('✓ Saved to gallery');
    } catch {
      showToast('Save failed — is the server running?');
    }
  };

  // ── Save видео ──
  const [savingVideo, setSavingVideo] = useState(false);
  const handleSaveVideo = async () => {
    if (!recorder.result?.blob) return;
    setSavingVideo(true);
    try {
      const { url } = await uploadVideo(recorder.result.blob);
      await saveArtwork({
        title: `Avatar clip — ${new Date().toLocaleDateString()}`,
        imageData: snapshotFnRef.current?.() || undefined,
        videoUrl: url, emotionHistory, duration: Math.round(recorder.elapsed || 0), mode: 'moodcheck',
      });
      recorder.clearResult();
      showToast('✓ Clip saved to your archive');
    } catch (e) {
      showToast('Video save failed — ' + e.message);
    } finally {
      setSavingVideo(false);
    }
  };

  const downloadClip = () => {
    if (!recorder.result?.url) return;
    const a = document.createElement('a');
    a.href = recorder.result.url;
    a.download = `chorus-avatar-${Date.now()}.webm`;
    a.click();
  };

  const config = EMOTION_CONFIGS[emotion] || EMOTION_CONFIGS.neutral;
  const currentAvatar = avatarId === 'custom' ? customAvatar : AVATAR_MAP[avatarId];

  const AvatarButton = ({ a, id }) => (
    <button
      onClick={() => selectAvatar(id || a.id)}
      className={`flex items-center gap-2 w-full text-left px-2.5 py-1.5 rounded-lg text-xs transition ${
        avatarId === (id || a.id) ? 'bg-accent-violet/25 text-white' : 'text-gray-300 hover:bg-ink-line/50'
      }`}
    >
      <span className="text-sm">{a.emoji}</span> {a.label}
    </button>
  );

  return (
    <div ref={rootRef} className="relative h-full w-full bg-ink overflow-hidden">
      <div className="absolute inset-0">
        <MoodParticleScene
          emotionRef={emotionRef}
          landmarksBufRef={landmarksBufRef}
          landmarkStampRef={landmarkStampRef}
          avatarRef={avatarRef}
          emotionColorRef={emotionColorRef}
          onSnapshotReady={handleSnapshotReady}
          onCanvasReady={handleCanvasReady}
        />
      </div>

      <VideoProcessor ref={videoRef} detect={detect} active={true} />

      {presenting ? (
        <button
          onClick={togglePresent}
          className="absolute top-4 right-4 z-30 rounded-full bg-black/50 border border-white/20 px-3 py-1.5 text-[11px] text-white/80 hover:text-white backdrop-blur"
        >
          ✕ Exit present
        </button>
      ) : (
        <>
          {/* ── HEADER ── */}
          <header className="absolute top-0 inset-x-0 z-20 flex items-center gap-2 px-4 h-14 bg-gradient-to-b from-ink/90 to-transparent">
            <button onClick={() => navigate('landing')} className="text-sm text-gray-400 hover:text-white transition shrink-0">
              ← Back
            </button>
            <span className="font-display font-extrabold text-sm text-white tracking-[0.2em] hidden sm:inline">
              MIRROR
            </span>

            <div className="ml-auto flex items-center gap-2">
              {/* Avatar (face) picker */}
              <div className="relative">
                <button
                  onClick={() => setShowAvatars((s) => !s)}
                  className="flex items-center gap-2 rounded-lg border border-ink-line bg-ink-soft/70 px-3 h-8 text-xs text-gray-200 hover:border-accent-violet transition"
                  title="Choose your face"
                >
                  <span>{currentAvatar?.emoji || '🪞'}</span>
                  <span className="hidden sm:inline">{currentAvatar?.label || 'Real'}</span>
                  <span className="text-gray-500">▾</span>
                </button>
                {showAvatars && (
                  <div className="absolute right-0 top-10 z-30 w-52 rounded-xl bg-ink-soft border border-ink-line shadow-xl p-1.5 animate-fade-in max-h-[70vh] overflow-y-auto">
                    <div className="text-[9px] uppercase tracking-[0.2em] text-gray-600 px-2 pt-1 pb-0.5">Faces</div>
                    {FACE_AVATARS.map((a) => <AvatarButton key={a.id} a={a} />)}
                    <div className="text-[9px] uppercase tracking-[0.2em] text-gray-600 px-2 pt-2 pb-0.5">Characters</div>
                    {CHAR_AVATARS.map((a) => <AvatarButton key={a.id} a={a} />)}
                    <div className="border-t border-ink-line my-1.5" />
                    {customAvatar && <AvatarButton a={customAvatar} id="custom" />}
                    <button
                      onClick={() => { setShowAvatars(false); setShowCustom(true); }}
                      className="flex items-center gap-2 w-full text-left px-2.5 py-1.5 rounded-lg text-xs text-accent-cyan hover:bg-ink-line/50 transition"
                    >
                      ＋ {customAvatar ? 'Edit custom' : 'Create custom'}
                    </button>
                  </div>
                )}
              </div>

              {/* Emotion color toggle */}
              <button
                onClick={() => setEmotionColor((v) => !v)}
                title="Color the avatar by your current emotion"
                className={`rounded-lg border px-2.5 h-8 text-xs transition ${
                  emotionColor ? 'border-accent-violet/50 bg-accent-violet/15 text-white' : 'border-ink-line bg-ink-soft/70 text-gray-500'
                }`}
              >
                🎭 <span className="hidden md:inline">Emotion color</span>
              </button>

              {/* Mic toggle (moved into header) */}
              <button
                onClick={() => setMicOn((m) => !m)}
                title="Include microphone in recordings"
                className={`rounded-lg border px-2.5 h-8 text-xs transition ${
                  micOn ? 'border-accent-cyan/50 bg-accent-cyan/10 text-accent-cyan' : 'border-ink-line bg-ink-soft/70 text-gray-500'
                }`}
              >
                {micOn ? '🎙' : '🔇'}
              </button>

              {/* Present */}
              <button
                onClick={togglePresent}
                className="rounded-lg border border-ink-line bg-ink-soft/70 px-2.5 h-8 text-xs text-gray-200 hover:border-accent-cyan transition"
                title="Fullscreen avatar — share this window into Zoom / Meet"
              >
                ⛶
              </button>

              {/* Record */}
              {recorder.supported &&
                (recorder.recording ? (
                  <button onClick={recorder.stop} className="rounded-lg bg-red-600 px-3 h-8 text-xs text-white hover:bg-red-500 transition flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
                    {fmtTime(recorder.elapsed)}
                  </button>
                ) : (
                  <button onClick={() => recorder.start({ withMic: micOn })} className="rounded-lg border border-red-800 bg-red-950/40 px-2.5 h-8 text-xs text-red-300 hover:bg-red-900/40 transition" title="Record a clip">
                    ● Rec
                  </button>
                ))}

              <button onClick={() => setShowSaveModal(true)} className="rounded-lg bg-violet-600 px-2.5 h-8 text-xs text-white hover:bg-violet-500 transition">
                📷
              </button>
            </div>
          </header>

          {/* ── MOOD JOURNAL PANEL ── */}
          <div className="absolute left-4 bottom-4 z-20 flex items-end gap-3">
            <MirroredPreview videoRef={videoRef} />
            <div className="rounded-xl bg-ink-soft/80 border border-ink-line backdrop-blur px-4 py-2.5 min-w-[220px]">
              <div className="flex items-center gap-3">
                <span className="text-3xl leading-none">{config.emoji}</span>
                <div className="flex-1">
                  <div className="text-sm font-display font-bold" style={{ color: EMOTION_HEX[emotion] }}>
                    {config.label}
                  </div>
                  <div className="text-[10px] text-gray-500">{ready ? 'live emotion' : 'loading models…'}</div>
                </div>
              </div>
              {moodStats && (
                <div className="mt-2 pt-2 border-t border-ink-line">
                  <div className="flex items-end gap-[2px] h-6">
                    {moodStats.recent.map((e, i) => (
                      <span key={i} className="flex-1 rounded-sm" style={{
                        height: '100%',
                        background: EMOTION_HEX[e.emotion] || EMOTION_HEX.neutral,
                        opacity: 0.35 + (i / moodStats.recent.length) * 0.65,
                      }} title={e.emotion} />
                    ))}
                  </div>
                  <div className="mt-1.5 text-[10px] text-gray-500">
                    Mostly <span style={{ color: EMOTION_HEX[moodStats.dominant.emotion] }}>{EMOTION_CONFIGS[moodStats.dominant.emotion]?.label}</span> ({moodStats.dominant.pct}%) · {emotionHistory.length}s
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 text-[11px] text-gray-500 bg-ink-soft/70 border border-ink-line rounded-full px-4 py-1.5 backdrop-blur hidden lg:block">
            Pick a face, toggle emotion color, present it in a call, or record a clip
          </div>

          {error && (
            <div className="absolute top-16 left-1/2 -translate-x-1/2 z-30 rounded-full bg-red-950/70 border border-red-800 px-5 py-2 text-sm text-red-200 backdrop-blur">
              {error}
            </div>
          )}
        </>
      )}

      {/* ── Post-record ── */}
      {recorder.result && !presenting && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/70 backdrop-blur-sm animate-fade-in">
          <div className="max-w-lg w-full mx-4 rounded-2xl bg-ink-soft border border-ink-line p-5 animate-slide-up">
            <h2 className="font-display font-bold text-white mb-3">Your avatar clip</h2>
            <video src={recorder.result.url} controls autoPlay loop className="w-full rounded-lg border border-ink-line bg-black" />
            <div className="flex gap-2 mt-4">
              <button onClick={recorder.clearResult} className="rounded-lg border border-ink-line px-3 py-2 text-xs text-gray-400 hover:text-white transition">Discard</button>
              <button onClick={downloadClip} className="flex-1 rounded-lg border border-ink-line py-2 text-sm text-gray-200 hover:bg-ink-line/50 transition">⬇ Download .webm</button>
              <button onClick={handleSaveVideo} disabled={savingVideo} className="flex-1 rounded-lg bg-accent-violet/85 py-2 text-sm font-bold text-ink hover:bg-accent-violet transition disabled:opacity-50">
                {savingVideo ? 'Saving…' : '💾 Save to archive'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Custom avatar modal ── */}
      {showCustom && (
        <CustomAvatarModal
          initial={customAvatar}
          saving={savingAvatar}
          onPreview={applyAvatar}
          onSave={saveCustom}
          onCancel={() => {
            setShowCustom(false);
            selectAvatar(avatarId); // върни предишния аватар
          }}
          aiGenerate={aiGenerate}
          getSelfie={getSelfie}
        />
      )}

      {showSaveModal && (
        <SaveModal
          defaultTitle={`Mood Check — ${new Date().toLocaleDateString()}`}
          mode="moodcheck"
          onSave={handleSaveImage}
          onCancel={() => setShowSaveModal(false)}
          saving={saving}
        />
      )}

      {toast && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 z-40 rounded-full bg-ink-soft border border-ink-line px-5 py-2 text-sm text-white backdrop-blur animate-fade-in">
          {toast}
        </div>
      )}
    </div>
  );
}

function MirroredPreview({ videoRef }) {
  const canvasRef = useRef(null);
  useEffect(() => {
    let raf;
    const draw = () => {
      const video = videoRef?.current;
      const canvas = canvasRef.current;
      if (video && canvas && video.readyState >= 2) {
        const ctx = canvas.getContext('2d');
        ctx.save();
        ctx.scale(-1, 1);
        ctx.drawImage(video, -canvas.width, 0, canvas.width, canvas.height);
        ctx.restore();
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [videoRef]);
  return <canvas ref={canvasRef} width={160} height={120} className="w-28 rounded-lg border border-ink-line bg-black" />;
}
