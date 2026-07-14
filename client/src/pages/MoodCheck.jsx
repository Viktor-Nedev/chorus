import { useState, useRef, useEffect, useCallback } from 'react';
import { MoodParticleScene } from '../components/moodcheck/MoodParticleScene';
import { VideoProcessor } from '../components/VideoProcessor';
import { SaveModal } from '../components/SaveModal';
import { PoemOverlay } from '../components/PoemOverlay';
import { useMediaPipe } from '../hooks/useMediaPipe';
import { useArtworkStore } from '../hooks/useArtworkStore';
import { EMOTION_CONFIGS, EMOTION_HEX } from '../constants/emotions';

export function MoodCheck({ navigate }) {
  const [mode, setMode] = useState('aura'); // 'aura' | 'mirror'
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [poemState, setPoemState] = useState(null);
  const [toast, setToast] = useState(null);

  const videoRef = useRef(null);
  const snapshotFnRef = useRef(null);
  const startTimeRef = useRef(Date.now());

  const { emotion, emotionRef, landmarksBufRef, landmarkStampRef, detect, ready, error } =
    useMediaPipe(videoRef, true);
  const { saveArtwork, generatePoem, saving } = useArtworkStore();

  // Emotion history — по 1 запис в секунда (за поемата при запазване)
  const [emotionHistory, setEmotionHistory] = useState([]);
  useEffect(() => {
    const interval = setInterval(() => {
      setEmotionHistory((prev) => [
        ...prev.slice(-299),
        {
          timestamp: Math.floor((Date.now() - startTimeRef.current) / 1000),
          emotion: emotionRef.current,
        },
      ]);
    }, 1000);
    return () => clearInterval(interval);
  }, [emotionRef]);

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  const handleSnapshotReady = useCallback((fn) => {
    snapshotFnRef.current = fn;
  }, []);

  // ── Save flow (в галерията, mode: 'moodcheck')
  const handleSave = async ({ title, author, description, generatePoem: wantPoem }) => {
    const snapshot = snapshotFnRef.current?.();
    if (!snapshot) {
      showToast('Snapshot failed — scene not ready');
      setShowSaveModal(false);
      return;
    }

    let poem = '';
    if (wantPoem) {
      setShowSaveModal(false);
      setPoemState({ loading: true, poem: '' });
      try {
        poem = await generatePoem({
          duration: Math.floor((Date.now() - startTimeRef.current) / 1000),
          emotionHistory,
          mode: 'solo',
        });
        setPoemState({ loading: false, poem });
      } catch {
        setPoemState(null);
        showToast('Poem generation failed — saving without poem');
      }
    }

    try {
      await saveArtwork({
        title,
        author,
        description,
        imageData: snapshot,
        emotionHistory,
        poem,
        duration: Math.floor((Date.now() - startTimeRef.current) / 1000),
        mode: 'moodcheck',
      });
      setShowSaveModal(false);
      showToast('✓ Saved to gallery');
    } catch {
      showToast('Save failed — is the server running?');
    }
  };

  const config = EMOTION_CONFIGS[emotion] || EMOTION_CONFIGS.neutral;

  return (
    <div className="relative h-full w-full bg-ink overflow-hidden">
      {/* Частичната сцена */}
      <div className="absolute inset-0">
        <MoodParticleScene
          modeTarget={mode === 'mirror' ? 1 : 0}
          emotionRef={emotionRef}
          landmarksBufRef={landmarksBufRef}
          landmarkStampRef={landmarkStampRef}
          onSnapshotReady={handleSnapshotReady}
        />
      </div>

      <VideoProcessor ref={videoRef} detect={detect} active={true} />

      {/* ── HEADER ── */}
      <header className="absolute top-0 inset-x-0 z-20 flex items-center gap-3 px-4 h-14 bg-gradient-to-b from-ink/90 to-transparent">
        <button
          onClick={() => navigate('landing')}
          className="text-sm text-gray-400 hover:text-white transition shrink-0"
        >
          ← Back
        </button>
        <span className="font-display font-extrabold text-sm text-white tracking-[0.2em]">
          MOOD CHECK
        </span>

        <div className="ml-auto flex items-center gap-2">
          {/* Aura / Mirror toggle */}
          <div className="flex rounded-lg border border-ink-line overflow-hidden">
            <button
              onClick={() => setMode('aura')}
              className={`px-3 h-8 text-xs uppercase tracking-[0.15em] transition ${
                mode === 'aura'
                  ? 'bg-accent-violet/25 text-white'
                  : 'bg-ink-soft/70 text-gray-500 hover:text-gray-300'
              }`}
              title="Aura — stylized face for your detected mood"
            >
              Aura
            </button>
            <button
              onClick={() => setMode('mirror')}
              className={`px-3 h-8 text-xs uppercase tracking-[0.15em] transition ${
                mode === 'mirror'
                  ? 'bg-accent-cyan/25 text-white'
                  : 'bg-ink-soft/70 text-gray-500 hover:text-gray-300'
              }`}
              title="Mirror — your actual face rebuilt from particles, 1:1 live"
            >
              Mirror
            </button>
          </div>

          <button
            onClick={() => setShowSaveModal(true)}
            className="rounded-lg bg-violet-600 px-3 h-8 text-xs text-white hover:bg-violet-500 transition"
          >
            Save
          </button>
        </div>
      </header>

      {/* ── EMOTION CHIP + VIDEO PREVIEW (долу вляво) ── */}
      <div className="absolute left-4 bottom-4 z-20 flex items-end gap-3">
        <MirroredPreview videoRef={videoRef} />
        <div className="rounded-xl bg-ink-soft/80 border border-ink-line backdrop-blur px-4 py-2.5 flex items-center gap-3">
          <span className="text-3xl leading-none">{config.emoji}</span>
          <div>
            <div className="text-sm font-display font-bold" style={{ color: EMOTION_HEX[emotion] }}>
              {config.label}
            </div>
            <div className="text-[10px] text-gray-500">
              {ready ? 'live emotion' : 'loading models…'}
            </div>
          </div>
        </div>
      </div>

      {/* Подсказка */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 text-[11px] text-gray-500 bg-ink-soft/70 border border-ink-line rounded-full px-4 py-1.5 backdrop-blur">
        {mode === 'aura'
          ? 'Your mood shapes the face — try smiling, frowning, looking surprised'
          : 'Your face, rebuilt from light — move, talk, blink'}
      </div>

      {error && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 z-30 rounded-full bg-red-950/70 border border-red-800 px-5 py-2 text-sm text-red-200 backdrop-blur">
          {error}
        </div>
      )}

      {/* ── MODALS ── */}
      {showSaveModal && (
        <SaveModal
          defaultTitle={`Mood Check — ${new Date().toLocaleDateString()}`}
          mode="moodcheck"
          onSave={handleSave}
          onCancel={() => setShowSaveModal(false)}
          saving={saving}
        />
      )}

      {poemState && (
        <PoemOverlay
          poem={poemState.poem}
          loading={poemState.loading}
          onClose={() => setPoemState(null)}
        />
      )}

      {toast && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 z-30 rounded-full bg-ink-soft border border-ink-line px-5 py-2 text-sm text-white backdrop-blur animate-fade-in">
          {toast}
        </div>
      )}
    </div>
  );
}

// Малко огледално видео preview — canvas копие от скрития processing video.
// scaleX(-1) е ЗАДЪЛЖИТЕЛНО да съвпада с огледалния x-flip на частиците.
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

  return (
    <canvas
      ref={canvasRef}
      width={160}
      height={120}
      className="w-32 rounded-lg border border-ink-line bg-black"
    />
  );
}
