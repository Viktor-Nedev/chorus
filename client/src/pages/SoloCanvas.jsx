import { useState, useRef, useCallback, useEffect } from 'react';
import { P5Canvas } from '../components/P5Canvas';
import { VideoProcessor } from '../components/VideoProcessor';
import { EmotionSidebar } from '../components/HUD';
import { SaveModal } from '../components/SaveModal';
import { PoemOverlay } from '../components/PoemOverlay';
import { useMediaPipe } from '../hooks/useMediaPipe';
import { useAudio } from '../hooks/useAudio';
import { useArtworkStore } from '../hooks/useArtworkStore';

const TOOLS = [
  { id: 'CHORUS', icon: '🎆', label: 'Chorus — particle brush' },
  { id: 'BRUSH', icon: '✏️', label: 'Brush — classic line' },
  { id: 'CIRCLE', icon: '○', label: 'Circle — click + drag' },
  { id: 'RECT', icon: '□', label: 'Rect — click + drag' },
  { id: 'BURST', icon: '✦', label: 'Burst — click to explode' },
  { id: 'WAVE', icon: '🌊', label: 'Wave — wavy line' },
  { id: 'ERASER', icon: '⌫', label: 'Eraser' },
];

const COLOR_TOOLS = new Set(['BRUSH', 'CIRCLE', 'RECT', 'BURST', 'WAVE']);

export function SoloCanvas({ navigate }) {
  const [title, setTitle] = useState(`Untitled — ${new Date().toLocaleDateString()}`);
  const [editingTitle, setEditingTitle] = useState(false);

  // Tool state — държим и в state (за UI) и в ref (за p5 loop)
  const [tool, setTool] = useState('CHORUS');
  const [color, setColor] = useState('#a78bfa');
  const [size, setSize] = useState(10);
  const [opacity, setOpacity] = useState(100);
  const toolRef = useRef({ tool: 'CHORUS', color: '#a78bfa', size: 10, opacity: 100 });
  toolRef.current = { tool, color, size, opacity };

  // Live входове
  const [liveEnabled, setLiveEnabled] = useState(false);
  const [handsEnabled, setHandsEnabled] = useState(true);
  const liveRef = useRef({ camera: false, hands: true });
  liveRef.current = { camera: liveEnabled, hands: handsEnabled };

  const [sidebarVisible, setSidebarVisible] = useState(true);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [poemState, setPoemState] = useState(null); // { loading, poem }
  const [toast, setToast] = useState(null);

  const videoRef = useRef(null);
  const systemRef = useRef(null); // ParticleSystem
  const p5InstanceRef = useRef(null);

  const { emotion, gesture, emotionRef, gestureRef, handPositionRef, detect, ready } =
    useMediaPipe(videoRef, liveEnabled);
  const { initAudio, stopAudio, getAudioData, getWaveform } = useAudio();
  const { saveArtwork, generatePoem, saving } = useArtworkStore();

  // Emotion history — по 1 запис в секунда
  const [emotionHistory, setEmotionHistory] = useState([]);
  const startTimeRef = useRef(Date.now());
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

  // LIVE toggle — камера + микрофон
  const handleLiveToggle = useCallback(async () => {
    if (liveEnabled) {
      stopAudio();
      setLiveEnabled(false);
    } else {
      try {
        await initAudio();
        setLiveEnabled(true);
      } catch {
        showToast('Microphone access denied');
      }
    }
  }, [liveEnabled, initAudio, stopAudio]);

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  const onSystemReady = useCallback((system, p) => {
    systemRef.current = system;
    p5InstanceRef.current = p;
  }, []);

  const handleClear = () => {
    const p = p5InstanceRef.current;
    if (p) p.background(10, 10, 15);
  };

  // ── Save flow
  const handleSave = async ({ title: t, author, description, generatePoem: wantPoem }) => {
    const p = p5InstanceRef.current;
    if (!p) return;

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
      const canvas = p.canvas ?? p.drawingContext.canvas;
      await saveArtwork({
        title: t,
        author,
        description,
        imageData: canvas.toDataURL('image/png'),
        emotionHistory,
        poem,
        duration: Math.floor((Date.now() - startTimeRef.current) / 1000),
        mode: 'solo',
      });
      setTitle(t);
      setShowSaveModal(false);
      showToast('✓ Saved to gallery');
    } catch {
      showToast('Save failed — is the server running?');
    }
  };

  // ── Export PNG — рисува поемата и заглавието върху canvas-а
  const handleExport = () => {
    const p = p5InstanceRef.current;
    if (!p) return;
    const poem = poemState?.poem;

    if (poem) {
      const lines = poem.split('\n').filter((l) => l.trim());
      const boxH = lines.length * 20 + 40;
      p.push();
      p.noStroke();
      p.fill(0, 0, 0, 170);
      p.rect(0, p.height - boxH, p.width, boxH);
      p.fill(255);
      p.textFont('Inter');
      p.textSize(14);
      p.textAlign(p.LEFT, p.TOP);
      lines.forEach((line, i) => {
        p.text(line, 24, p.height - boxH + 20 + i * 20);
      });
      p.pop();
    }

    // Заглавие + дата горе вдясно
    p.push();
    p.fill(255, 255, 255, 180);
    p.textFont('Inter');
    p.textSize(12);
    p.textAlign(p.RIGHT, p.TOP);
    p.text(title, p.width - 20, 20);
    p.pop();

    p.saveCanvas(`${title.replace(/[^a-zA-Z0-9а-яА-Я ]/g, '').trim() || 'artwork'}_chorus`, 'png');
    showToast('✓ Exported PNG');
  };

  return (
    <div className="relative h-full w-full bg-ink overflow-hidden">
      <P5Canvas
        mode="solo"
        emotionRef={emotionRef}
        gestureRef={gestureRef}
        handPositionRef={handPositionRef}
        getAudioData={getAudioData}
        toolRef={toolRef}
        liveRef={liveRef}
        onSystemReady={onSystemReady}
      />

      <VideoProcessor ref={videoRef} detect={detect} active={liveEnabled} />

      {/* ── HEADER ── */}
      <header className="absolute top-0 inset-x-0 z-20 flex items-center gap-3 px-4 h-14 bg-gradient-to-b from-ink/90 to-transparent">
        <button
          onClick={() => navigate('landing')}
          className="text-sm text-gray-400 hover:text-white transition shrink-0"
        >
          ← Back
        </button>

        {editingTitle ? (
          <input
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={() => setEditingTitle(false)}
            onKeyDown={(e) => e.key === 'Enter' && setEditingTitle(false)}
            maxLength={80}
            className="bg-ink-soft border border-ink-line rounded px-2 py-1 text-sm text-white focus:outline-none focus:border-violet-400 min-w-0 flex-1 max-w-sm"
          />
        ) : (
          <button
            onClick={() => setEditingTitle(true)}
            className="font-display text-sm text-gray-200 hover:text-white truncate max-w-sm"
            title="Click to edit title"
          >
            {title}
          </button>
        )}

        <div className="ml-auto flex items-center gap-2 shrink-0">
          <button
            onClick={handleClear}
            className="rounded-lg border border-ink-line px-3 py-1.5 text-xs text-gray-300 hover:bg-ink-line/50 transition"
          >
            Clear
          </button>
          <button
            onClick={() => setShowSaveModal(true)}
            className="rounded-lg bg-violet-600 px-3 py-1.5 text-xs text-white hover:bg-violet-500 transition"
          >
            Save
          </button>
          <button
            onClick={handleExport}
            className="rounded-lg border border-ink-line px-3 py-1.5 text-xs text-gray-300 hover:bg-ink-line/50 transition"
          >
            Export PNG
          </button>
        </div>
      </header>

      {/* ── TOOLBAR (вляво) ── */}
      <aside className="absolute left-3 top-1/2 -translate-y-1/2 z-20 w-[60px] rounded-xl bg-ink-soft/80 border border-ink-line backdrop-blur flex flex-col items-center py-2 gap-1">
        {TOOLS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTool(t.id)}
            title={t.label}
            className={`w-11 h-11 rounded-lg flex items-center justify-center text-lg transition ${
              tool === t.id
                ? 'bg-violet-600/30 border border-violet-500 text-white'
                : 'text-gray-400 hover:bg-ink-line/50 hover:text-white border border-transparent'
            }`}
          >
            {t.icon}
          </button>
        ))}

        <div className="w-8 border-t border-ink-line my-1" />

        {/* Color — само за инструментите с цвят */}
        <input
          type="color"
          value={color}
          onChange={(e) => setColor(e.target.value)}
          disabled={!COLOR_TOOLS.has(tool)}
          title="Color"
          className={`w-9 h-9 ${COLOR_TOOLS.has(tool) ? '' : 'opacity-30 pointer-events-none'}`}
        />

        <div className="flex flex-col items-center gap-0.5 mt-1" title={`Size: ${size}px`}>
          <input
            type="range"
            min={1}
            max={50}
            value={size}
            onChange={(e) => setSize(Number(e.target.value))}
            className="w-11 rotate-0"
          />
          <span className="text-[9px] text-gray-500">{size}px</span>
        </div>

        <div className="flex flex-col items-center gap-0.5" title={`Opacity: ${opacity}%`}>
          <input
            type="range"
            min={0}
            max={100}
            value={opacity}
            onChange={(e) => setOpacity(Number(e.target.value))}
            className="w-11"
          />
          <span className="text-[9px] text-gray-500">{opacity}%</span>
        </div>

        <div className="w-8 border-t border-ink-line my-1" />

        <button
          onClick={handleLiveToggle}
          title="Toggle camera + microphone"
          className={`w-11 h-11 rounded-lg flex items-center justify-center text-lg transition ${
            liveEnabled
              ? 'bg-green-600/30 border border-green-500 text-white'
              : 'text-gray-400 hover:bg-ink-line/50 border border-transparent'
          }`}
        >
          👁
        </button>
        <button
          onClick={() => setHandsEnabled((v) => !v)}
          title="Toggle hand tracking"
          className={`w-11 h-11 rounded-lg flex items-center justify-center text-lg transition ${
            handsEnabled && liveEnabled
              ? 'bg-cyan-600/30 border border-cyan-500 text-white'
              : 'text-gray-400 hover:bg-ink-line/50 border border-transparent'
          }`}
        >
          🖐
        </button>
      </aside>

      {/* ── EMOTION SIDEBAR (вдясно) ── */}
      {liveEnabled && (
        <EmotionSidebar
          emotion={emotion}
          gesture={handsEnabled ? gesture : 'NO_HAND'}
          videoRef={videoRef}
          emotionHistory={emotionHistory}
          getWaveform={getWaveform}
          visible={sidebarVisible}
          onToggle={() => setSidebarVisible((v) => !v)}
        />
      )}

      {/* Подсказка при изключен live */}
      {!liveEnabled && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 text-[11px] text-gray-500 bg-ink-soft/70 border border-ink-line rounded-full px-4 py-1.5 backdrop-blur">
          Press 👁 to paint with your face and voice · {ready ? 'models ready' : 'models load on first use'}
        </div>
      )}

      {/* ── MODALS ── */}
      {showSaveModal && (
        <SaveModal
          defaultTitle={title}
          mode="solo"
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
