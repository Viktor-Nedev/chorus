import { useState, useRef, useCallback, useEffect } from 'react';
import { P5Canvas } from '../components/P5Canvas';
import { VideoProcessor } from '../components/VideoProcessor';
import { EmotionSidebar } from '../components/HUD';
import { SaveModal } from '../components/SaveModal';
import { PoemOverlay } from '../components/PoemOverlay';
import { InstructionsBook } from '../components/solo/InstructionsBook';
import { EMOTION_HEX } from '../constants/emotions';
import { useMediaPipe } from '../hooks/useMediaPipe';
import { useAuth } from '../hooks/useAuth';
import { useAudio } from '../hooks/useAudio';
import { useArtworkStore } from '../hooks/useArtworkStore';
import { useVoiceCommands } from '../hooks/useVoiceCommands';
import { useDictation } from '../hooks/useDictation';

// Основен тулбар. LINES / SHAPES са категории — водят flyout с варианти
// (като PEN_STYLES при HAND) и показват иконата на активния вариант.
const TOOLS = [
  { id: 'CHORUS', icon: '🎆', label: 'Chorus — particle brush (emotion-driven)' },
  { id: 'HAND', icon: '🖐️', label: 'Hand Draw — draw with your gesture (open palm = pause)' },
  { id: 'BRUSH', icon: '✏️', label: 'Brush — freehand line (persists)' },
  { id: 'LINES', icon: '／', label: 'Lines — straight, wave, dashed, arrow, zigzag', category: 'lines' },
  { id: 'SHAPES', icon: '◇', label: 'Shapes — circle, rect, triangle, star, heart…', category: 'shapes' },
  { id: 'BURST', icon: '✦', label: 'Burst — click to explode' },
  { id: 'FILL', icon: '🪣', label: 'Fill — flood fill an enclosed area' },
  { id: 'TEXT', icon: '✍️', label: 'Text — click to place, or dictate' },
  { id: 'EYEDROPPER', icon: '💧', label: 'Eyedropper — pick a color from the canvas' },
  { id: 'ERASER', icon: '⌫', label: 'Eraser' },
];

const LINE_TOOLS = [
  { id: 'LINE', icon: '／', label: 'Straight line' },
  { id: 'WAVE', icon: '🌊', label: 'Wavy line' },
  { id: 'DASHED', icon: '┄', label: 'Dashed line' },
  { id: 'ARROWLINE', icon: '➔', label: 'Arrow line' },
  { id: 'ZIGZAG', icon: '↯', label: 'Zigzag line' },
];

const SHAPE_TOOLS = [
  { id: 'CIRCLE', icon: '○', label: 'Circle' },
  { id: 'RECT', icon: '□', label: 'Rectangle' },
  { id: 'TRIANGLE', icon: '△', label: 'Triangle' },
  { id: 'STAR', icon: '★', label: 'Star' },
  { id: 'HEXAGON', icon: '⬡', label: 'Hexagon' },
  { id: 'PENTAGON', icon: '⬠', label: 'Pentagon' },
  { id: 'DIAMOND', icon: '◇', label: 'Diamond' },
  { id: 'HEART', icon: '♥', label: 'Heart' },
  { id: 'ARROW', icon: '➤', label: 'Arrow' },
];

const LINE_IDS = new Set(LINE_TOOLS.map((t) => t.id));
const SHAPE_IDS = new Set(SHAPE_TOOLS.map((t) => t.id));

const PEN_STYLES = [
  { id: 'BRUSH', icon: '🖌️', label: 'Brush — soft round stroke' },
  { id: 'PEN', icon: '🖊️', label: 'Pen — thin, crisp, solid ink' },
  { id: 'PENCIL', icon: '✏️', label: 'Pencil — grainy graphite texture' },
  { id: 'MARKER', icon: '🖍️', label: 'Marker — thick flat ink, overlaps darker' },
  { id: 'CALLIGRAPHY', icon: '🖋️', label: 'Calligraphy — width follows direction' },
  { id: 'SPRAY', icon: '💨', label: 'Spray — scattered paint particles' },
  { id: 'NEON', icon: '✨', label: 'Neon — glowing tube of light' },
];

const CANVAS_PRESETS = [
  { label: '1280 × 720', w: 1280, h: 720 },
  { label: '1920 × 1080', w: 1920, h: 1080 },
  { label: '1080 × 1080', w: 1080, h: 1080 },
  { label: '720 × 1280', w: 720, h: 1280 },
  { label: 'Fit to window', w: 'fit', h: 'fit' },
];

// Всичко ползва избрания цвят освен тези три (CHORUS = емоция, EYEDROPPER/ERASER — без цвят).
const NON_COLOR_TOOLS = new Set(['CHORUS', 'EYEDROPPER', 'ERASER']);
const MIN_SIZE = 1;
const MAX_SIZE = 50;
const MIN_ZOOM = 0.5;
const MAX_ZOOM = 3;

const headerIconBtn =
  'flex items-center justify-center rounded-lg border border-ink-line bg-ink-soft/70 backdrop-blur w-8 h-8 text-sm text-gray-300 hover:text-white hover:border-gray-500 transition';

export function SoloCanvas({ navigate, artworkToEdit, onArtworkConsumed }) {
  const [title, setTitle] = useState(`Untitled — ${new Date().toLocaleDateString()}`);
  const [authorDefault, setAuthorDefault] = useState('');
  const [editingTitle, setEditingTitle] = useState(false);

  // Tool state — държим и в state (за UI) и в ref (за p5 loop)
  const [tool, setTool] = useState('CHORUS');
  const [color, setColor] = useState('#a78bfa');
  const [size, setSize] = useState(10);
  const [opacity, setOpacity] = useState(100);
  const [penStyle, setPenStyle] = useState('BRUSH');
  const [handPaused, setHandPaused] = useState(false);
  const [handSmooth, setHandSmooth] = useState(true); // изглаждане на ръката (анти-трепет)
  const [symmetryEnabled, setSymmetryEnabled] = useState(false);
  const [lineVariant, setLineVariant] = useState('LINE'); // активен вариант в Lines категорията
  const [shapeVariant, setShapeVariant] = useState('CIRCLE'); // активен вариант в Shapes категорията
  const toolRef = useRef({
    tool: 'CHORUS', color: '#a78bfa', size: 10, opacity: 100, penStyle: 'BRUSH',
    handPaused: false, symmetry: false, handSmoothing: 0.6,
  });
  toolRef.current = {
    tool, color, size, opacity, penStyle, handPaused,
    symmetry: symmetryEnabled, handSmoothing: handSmooth ? 0.6 : 0,
  };
  const previousToolRef = useRef('CHORUS');

  const colorEnabled = !NON_COLOR_TOOLS.has(tool) && tool !== 'LINES' && tool !== 'SHAPES';

  const [cameraPulse, setCameraPulse] = useState(false);
  const pulseCamera = () => {
    setCameraPulse(true);
    setTimeout(() => setCameraPulse(false), 2800);
  };

  const selectTool = (id) => {
    if (id === 'EYEDROPPER' && tool !== 'EYEDROPPER') previousToolRef.current = tool;
    if (LINE_IDS.has(id)) setLineVariant(id);
    if (SHAPE_IDS.has(id)) setShapeVariant(id);
    // Hand Draw иска включена камера — подскажи и „светни" бутона.
    if (id === 'HAND' && !liveEnabled) {
      showToast('Enable the camera (👁) first to draw with your hand');
      pulseCamera();
    }
    setTool(id);
  };

  // Live входове
  const [liveEnabled, setLiveEnabled] = useState(false);
  const [handsEnabled, setHandsEnabled] = useState(true);
  const liveRef = useRef({ camera: false, hands: true });
  liveRef.current = { camera: liveEnabled, hands: handsEnabled };

  const [sidebarVisible, setSidebarVisible] = useState(true);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [poemState, setPoemState] = useState(null); // { loading, poem }
  const [toast, setToast] = useState(null);

  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const [showInstructions, setShowInstructions] = useState(false);
  const [sizeMenuOpen, setSizeMenuOpen] = useState(false);

  // Zoom (view-only CSS scale — не пипа резолюцията на canvas-а)
  const [zoom, setZoom] = useState(1);
  const clampZoom = (z) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));

  // Размер на артборда — център на екрана с видима рамка. canvasSizeRef се
  // чете от P5Canvas при създаване, за да съвпадат канвасът и рамката.
  const [canvasSize, setCanvasSize] = useState(() => ({
    w: typeof window !== 'undefined' ? window.innerWidth : 1280,
    h: typeof window !== 'undefined' ? window.innerHeight : 720,
  }));
  const canvasSizeRef = useRef(canvasSize);
  canvasSizeRef.current = canvasSize;
  const userPickedSizeRef = useRef(false); // true = фиксиран preset (не авто-fit)

  // Export
  const [exportFormat, setExportFormat] = useState('png');

  // Text tool popover
  const [textPopover, setTextPopover] = useState(null); // {x,y,screenX,screenY,value}
  const [dictating, setDictating] = useState(false);
  const dictation = useDictation();
  const dictationRecRef = useRef(null);

  const videoRef = useRef(null);
  const systemRef = useRef(null); // ParticleSystem
  const p5InstanceRef = useRef(null);
  const clearAllRef = useRef(null);
  const undoRef = useRef(null);
  const redoRef = useRef(null);
  const rotateRef = useRef(null);
  const resizeCanvasToRef = useRef(null);
  const loadArtworkRef = useRef(null);
  const commitTextRef = useRef(null);
  const [systemReadyTick, setSystemReadyTick] = useState(0);

  const { emotion, gesture, emotionRef, gestureRef, handPositionRef, landmarksBufRef, landmarkStampRef, detect, ready } =
    useMediaPipe(videoRef, liveEnabled);
  const { initAudio, stopAudio, getAudioData, getWaveform } = useAudio();
  const { saveArtwork, generatePoem, saving } = useArtworkStore();
  const { authFetch } = useAuth();

  // Particle аватар вместо реалната камера (по избор от профила)
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

  const onSystemReady = useCallback((system, p, api) => {
    systemRef.current = system;
    p5InstanceRef.current = p;
    clearAllRef.current = api?.clearAll ?? null;
    undoRef.current = api?.undo ?? null;
    redoRef.current = api?.redo ?? null;
    rotateRef.current = api?.rotate90 ?? null;
    resizeCanvasToRef.current = api?.resizeCanvasTo ?? null;
    loadArtworkRef.current = api?.loadArtworkImage ?? null;
    commitTextRef.current = api?.commitText ?? null;
    setSystemReadyTick((t) => t + 1);
  }, []);

  const handleClear = useCallback(() => {
    clearAllRef.current?.();
  }, []);

  // ── Undo/Redo — бутони + Ctrl+Z / Ctrl+Y (пропуска се, ако фокусът е в текстово поле)
  useEffect(() => {
    const handler = (e) => {
      const tag = document.activeElement?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      const ctrl = e.ctrlKey || e.metaKey;
      if (!ctrl) return;
      const k = e.key.toLowerCase();
      if (k === 'z' && !e.shiftKey) {
        e.preventDefault();
        undoRef.current?.();
      } else if (k === 'y' || (k === 'z' && e.shiftKey)) {
        e.preventDefault();
        redoRef.current?.();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // ── Зареждане на запазена картина от галерията за редакция
  useEffect(() => {
    if (!artworkToEdit || !loadArtworkRef.current) return;
    loadArtworkRef.current(artworkToEdit.imageData);
    if (artworkToEdit.title) setTitle(artworkToEdit.title);
    if (artworkToEdit.author) setAuthorDefault(artworkToEdit.author);
    onArtworkConsumed?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [artworkToEdit, systemReadyTick]);

  // ── Цвят според текущата емоция
  const applyEmotionColor = useCallback(() => {
    const hex = EMOTION_HEX[emotionRef.current] || EMOTION_HEX.neutral;
    setColor(hex);
    showToast(`🎨 Emotion color → ${hex}`);
  }, [emotionRef]);

  // ── Постави текст в центъра на платното (от гласовата команда „текст …")
  const placeVoiceText = useCallback((str) => {
    const trimmed = (str || '').trim();
    if (!trimmed) return;
    const cx = Math.max(16, canvasSize.w / 2 - trimmed.length * (size * 0.55));
    const cy = canvasSize.h / 2;
    commitTextRef.current?.(cx, cy, trimmed, color, size);
    setTool('TEXT');
  }, [canvasSize, color, size]);

  // ── Гласови команди — инструмент/писец/фигура/цвят/размер, clear, save,
  // пауза/продължаване на ръката, цвят-по-емоция и текст
  const { supported: voiceSupported } = useVoiceCommands({
    enabled: voiceEnabled,
    onColor: setColor,
    onTool: selectTool,
    onPenStyle: (style) => {
      setPenStyle(style);
      if (toolRef.current.tool !== 'HAND') selectTool('HAND');
    },
    onEmotionColor: applyEmotionColor,
    onText: placeVoiceText,
    onClear: handleClear,
    onSave: () => setShowSaveModal(true),
    onSizeChange: (delta) => setSize((s) => Math.min(MAX_SIZE, Math.max(MIN_SIZE, s + delta))),
    onPause: () => setHandPaused(true),
    onResume: () => setHandPaused(false),
    onFeedback: (msg) => showToast(msg),
  });

  const handleVoiceToggle = () => {
    if (!voiceEnabled && !voiceSupported) {
      showToast('Voice commands need Chrome/Edge — not supported in this browser');
      return;
    }
    setVoiceEnabled((v) => !v);
  };

  // ── Eyedropper
  const handleColorPicked = useCallback((hex) => {
    setColor(hex);
    setTool(previousToolRef.current || 'BRUSH');
    showToast(`💧 Picked ${hex}`);
  }, []);

  // ── Text tool
  const handleTextPlace = useCallback((px, py, screenX, screenY) => {
    setTextPopover({ x: px, y: py, screenX, screenY, value: '' });
  }, []);

  const commitTextPopover = () => {
    if (textPopover?.value?.trim()) {
      commitTextRef.current?.(textPopover.x, textPopover.y, textPopover.value, color, size);
    }
    setTextPopover(null);
  };

  const cancelTextPopover = () => {
    dictationRecRef.current?.abort?.();
    setDictating(false);
    setTextPopover(null);
  };

  const startDictation = () => {
    if (!dictation.supported) {
      showToast('Dictation needs Chrome/Edge — not supported in this browser');
      return;
    }
    setDictating(true);
    dictationRecRef.current = dictation.start(
      (transcript) => {
        setTextPopover((prev) => (prev ? { ...prev, value: (prev.value ? prev.value + ' ' : '') + transcript } : prev));
      },
      () => setDictating(false)
    );
  };

  // ── Zoom
  const zoomIn = () => setZoom((z) => clampZoom(+(z + 0.2).toFixed(2)));
  const zoomOut = () => setZoom((z) => clampZoom(+(z - 0.2).toFixed(2)));
  const zoomReset = () => setZoom(1);

  // Ctrl + колелце → zoom около центъра (platното е центрирано в overflow-auto).
  useEffect(() => {
    const el = document.getElementById('chorus-canvas-viewport');
    if (!el) return;
    const onWheel = (e) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      e.preventDefault();
      setZoom((z) => clampZoom(+(z + (e.deltaY < 0 ? 0.12 : -0.12)).toFixed(2)));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  // ── Rotate — сменя размерите на артборда; центрираният фрейм остава центриран.
  const handleRotate = (direction) => {
    rotateRef.current?.(direction);
    setCanvasSize((s) => ({ w: s.h, h: s.w }));
    setZoom(1);
  };

  // ── Canvas size preset
  const applyCanvasPreset = (preset) => {
    setSizeMenuOpen(false);
    let w;
    let h;
    if (preset.w === 'fit') {
      userPickedSizeRef.current = false;
      const el = document.getElementById('chorus-canvas-viewport');
      w = el?.clientWidth || window.innerWidth;
      h = el?.clientHeight || window.innerHeight;
    } else {
      userPickedSizeRef.current = true;
      w = preset.w;
      h = preset.h;
    }
    setCanvasSize({ w, h });
    resizeCanvasToRef.current?.(w, h);
    setZoom(1);
  };

  // ── Авто-fit при първо зареждане: изравни артборда с реалния viewport,
  // докато потребителят не избере фиксиран размер.
  useEffect(() => {
    if (userPickedSizeRef.current) return;
    const el = document.getElementById('chorus-canvas-viewport');
    if (!el) return;
    const w = el.clientWidth;
    const h = el.clientHeight;
    if (w && h && (w !== canvasSize.w || h !== canvasSize.h)) {
      setCanvasSize({ w, h });
      resizeCanvasToRef.current?.(w, h);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [systemReadyTick]);

  // ── Изход: изключи микрофона (камерата/ръката спират с unmount на
  // VideoProcessor/useMediaPipe; гласът — с useVoiceCommands).
  useEffect(() => () => stopAudio(), [stopAudio]);

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

  // ── Export — PNG/JPG/WEBP, рисува поемата и заглавието върху canvas-а
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

    const canvas = p.canvas ?? p.drawingContext.canvas;
    const mime = { png: 'image/png', jpeg: 'image/jpeg', webp: 'image/webp' }[exportFormat];
    const dataURL = canvas.toDataURL(mime, exportFormat === 'png' ? undefined : 0.92);
    const filename = title.replace(/[^a-zA-Z0-9а-яА-Я ]/g, '').trim() || 'artwork';
    const ext = exportFormat === 'jpeg' ? 'jpg' : exportFormat;
    const a = document.createElement('a');
    a.href = dataURL;
    a.download = `${filename}_chorus.${ext}`;
    a.click();
    showToast(`✓ Exported ${ext.toUpperCase()}`);
  };

  return (
    <div className="relative h-full w-full bg-ink overflow-hidden">
      <div id="chorus-canvas-viewport" className="absolute inset-0 overflow-auto flex">
        {/* m-auto центрира; при overflow margin-ите стават 0 и остава напълно
            скролируем (без flexbox clipping на горния/левия ръб). */}
        <div
          className="m-auto shrink-0"
          style={{ width: canvasSize.w * zoom, height: canvasSize.h * zoom }}
        >
          <div
            className="relative border border-white/15 shadow-[0_0_60px_rgba(0,0,0,0.7)]"
            style={{
              width: canvasSize.w,
              height: canvasSize.h,
              transform: `scale(${zoom})`,
              transformOrigin: 'top left',
            }}
          >
            <P5Canvas
              mode="solo"
              emotionRef={emotionRef}
              gestureRef={gestureRef}
              handPositionRef={handPositionRef}
              getAudioData={getAudioData}
              toolRef={toolRef}
              liveRef={liveRef}
              canvasSizeRef={canvasSizeRef}
              onSystemReady={onSystemReady}
              onTextPlace={handleTextPlace}
              onColorPicked={handleColorPicked}
            />
          </div>
        </div>
      </div>

      <VideoProcessor ref={videoRef} detect={detect} active={liveEnabled} />

      {/* ── HEADER ── */}
      <header className="absolute top-0 inset-x-0 z-20 flex items-center gap-2 px-4 h-14 bg-gradient-to-b from-ink/90 to-transparent">
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
            className="bg-ink-soft border border-ink-line rounded px-2 py-1 text-sm text-white focus:outline-none focus:border-violet-400 min-w-0 flex-1 max-w-xs"
          />
        ) : (
          <button
            onClick={() => setEditingTitle(true)}
            className="font-display text-sm text-gray-200 hover:text-white truncate max-w-xs shrink-0"
            title="Click to edit title"
          >
            {title}
          </button>
        )}

        <div className="ml-auto flex items-center gap-1.5 flex-wrap justify-end overflow-x-auto">
          {/* History */}
          <button onClick={() => undoRef.current?.()} title="Undo (Ctrl+Z)" className={headerIconBtn}>↶</button>
          <button onClick={() => redoRef.current?.()} title="Redo (Ctrl+Y)" className={headerIconBtn}>↷</button>
          <span className="w-px h-5 bg-ink-line mx-0.5" />

          {/* View */}
          <button onClick={zoomOut} title="Zoom out" className={headerIconBtn}>🔍−</button>
          <button onClick={zoomReset} title={`Reset zoom (${Math.round(zoom * 100)}%)`} className={`${headerIconBtn} w-12 text-[11px]`}>
            {Math.round(zoom * 100)}%
          </button>
          <button onClick={zoomIn} title="Zoom in" className={headerIconBtn}>🔍+</button>
          <span className="w-px h-5 bg-ink-line mx-0.5" />

          {/* Transform */}
          <button onClick={() => handleRotate(-1)} title="Rotate canvas 90° counter-clockwise" className={headerIconBtn}>⟲</button>
          <button onClick={() => handleRotate(1)} title="Rotate canvas 90° clockwise" className={headerIconBtn}>⟳</button>
          <div className="relative">
            <button
              onClick={() => setSizeMenuOpen((v) => !v)}
              title="Canvas size — centred artboard with a visible frame"
              className="flex items-center gap-1 rounded-lg border border-ink-line bg-ink-soft/70 backdrop-blur h-8 px-2 text-[11px] hover:border-gray-500 transition"
            >
              <span className="text-gray-400">⬚</span>
              <span className="tabular-nums text-gray-100">{Math.round(canvasSize.w)}×{Math.round(canvasSize.h)}</span>
            </button>
            {sizeMenuOpen && (
              <>
                <div className="fixed inset-0 z-20" onClick={() => setSizeMenuOpen(false)} />
                <div className="absolute right-0 top-9 z-30 w-40 rounded-lg border border-ink-line bg-ink-soft/95 backdrop-blur py-1 shadow-xl animate-fade-in">
                  {CANVAS_PRESETS.map((preset) => (
                    <button
                      key={preset.label}
                      onClick={() => applyCanvasPreset(preset)}
                      className="block w-full text-left px-3 py-1.5 text-xs text-gray-200 hover:bg-ink-line/60 transition"
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
          <span className="w-px h-5 bg-ink-line mx-0.5" />

          {/* Mode */}
          <button
            onClick={() => setSymmetryEnabled((v) => !v)}
            title="Symmetry / Mirror mode — mirrors every stroke across the vertical center"
            className={`relative ${headerIconBtn} ${symmetryEnabled ? 'border-cyan-400 bg-cyan-950/50 text-cyan-200 mode-glow-cyan' : ''}`}
          >
            🪞
            {symmetryEnabled && (
              <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-cyan-400 glow-pulse" />
            )}
          </button>
          <button
            onClick={applyEmotionColor}
            title="Emotion color — set the brush color from your current emotion"
            className={headerIconBtn}
          >
            🎨
          </button>
          <button
            onClick={() => setShowInstructions(true)}
            title="Instructions — how to draw, voice commands, shortcuts"
            className={headerIconBtn}
          >
            📖
          </button>
          <span className="w-px h-5 bg-ink-line mx-0.5" />

          {/* Voice + theme */}
          <button
            onClick={handleVoiceToggle}
            title="Toggle voice commands (say a color or tool name)"
            className={`rounded-lg border px-2.5 h-8 text-xs transition ${
              voiceEnabled
                ? 'border-red-500 bg-red-950/40 text-red-300'
                : 'border-ink-line text-gray-300 hover:bg-ink-line/50 bg-ink-soft/70'
            }`}
          >
            {voiceEnabled ? '🎙 Listening…' : '🎙 Voice'}
          </button>
          <span className="w-px h-5 bg-ink-line mx-0.5" />

          {/* Destructive / export */}
          <button
            onClick={handleClear}
            className="rounded-lg border border-ink-line px-2.5 h-8 text-xs text-gray-300 hover:bg-ink-line/50 transition bg-ink-soft/70"
          >
            Clear
          </button>
          <button
            onClick={() => setShowSaveModal(true)}
            className="rounded-lg bg-violet-600 px-2.5 h-8 text-xs text-white hover:bg-violet-500 transition"
          >
            Save
          </button>
          <select
            value={exportFormat}
            onChange={(e) => setExportFormat(e.target.value)}
            title="Export format"
            className="rounded-lg border border-ink-line bg-ink-soft/70 backdrop-blur h-8 text-[11px] text-gray-300 px-1"
          >
            <option value="png">PNG</option>
            <option value="jpeg">JPG</option>
            <option value="webp">WEBP</option>
          </select>
          <button
            onClick={handleExport}
            className="rounded-lg border border-ink-line px-2.5 h-8 text-xs text-gray-300 hover:bg-ink-line/50 transition bg-ink-soft/70"
          >
            Export
          </button>
        </div>
      </header>

      {/* ── TOOLBAR (вляво, 2 колони) ── */}
      <aside className="absolute left-3 top-1/2 -translate-y-1/2 z-20 w-[104px] max-h-[88vh] overflow-y-auto rounded-xl bg-ink-soft/80 border border-ink-line backdrop-blur flex flex-col items-center py-2 gap-2">
        <div className="grid grid-cols-2 gap-1">
          {TOOLS.map((t) => {
            const isLines = t.category === 'lines';
            const isShapes = t.category === 'shapes';
            const active = isLines ? LINE_IDS.has(tool) : isShapes ? SHAPE_IDS.has(tool) : tool === t.id;
            const icon = isLines
              ? LINE_TOOLS.find((l) => l.id === lineVariant)?.icon || t.icon
              : isShapes
                ? SHAPE_TOOLS.find((s) => s.id === shapeVariant)?.icon || t.icon
                : t.icon;
            const onClick = isLines
              ? () => selectTool(lineVariant)
              : isShapes
                ? () => selectTool(shapeVariant)
                : () => selectTool(t.id);
            return (
              <button
                key={t.id}
                onClick={onClick}
                title={t.label}
                className={`relative w-11 h-11 rounded-lg flex items-center justify-center text-lg transition ${
                  active
                    ? 'bg-violet-600/30 border border-violet-500 text-white'
                    : 'text-gray-400 hover:bg-ink-line/50 hover:text-white border border-transparent'
                }`}
              >
                {icon}
                {(isLines || isShapes) && (
                  <span className="absolute bottom-0.5 right-1 text-[8px] text-gray-500 leading-none">▸</span>
                )}
              </button>
            );
          })}
        </div>

        <div className="w-16 border-t border-ink-line" />

        {/* Color — само за инструментите с цвят */}
        <input
          type="color"
          value={color}
          onChange={(e) => setColor(e.target.value)}
          disabled={!colorEnabled}
          title="Color"
          className={`w-9 h-9 ${colorEnabled ? '' : 'opacity-30 pointer-events-none'}`}
        />

        <div className="flex flex-col items-center gap-0.5" title={`Size: ${size}px`}>
          <input
            type="range"
            min={1}
            max={50}
            value={size}
            onChange={(e) => setSize(Number(e.target.value))}
            className="w-16"
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
            className="w-16"
          />
          <span className="text-[9px] text-gray-500">{opacity}%</span>
        </div>

        <div className="w-16 border-t border-ink-line" />

        <div className="flex gap-1">
          <button
            onClick={handleLiveToggle}
            title="Toggle camera + microphone"
            className={`w-9 h-9 rounded-lg flex items-center justify-center text-base transition ${cameraPulse ? 'attention-pulse' : ''} ${
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
            className={`w-9 h-9 rounded-lg flex items-center justify-center text-base transition ${
              handsEnabled && liveEnabled
                ? 'bg-cyan-600/30 border border-cyan-500 text-white'
                : 'text-gray-400 hover:bg-ink-line/50 border border-transparent'
            }`}
          >
            🖐
          </button>
        </div>

        {/* Hand Draw контроли — на отделни редове, за да не се режат */}
        {tool === 'HAND' && (
          <div className="flex flex-col items-stretch gap-1 w-[88px] animate-fade-in">
            <button
              onClick={() => setHandPaused((v) => !v)}
              title={handPaused ? 'Resume hand drawing' : 'Pause hand drawing (or open palm / say "stop")'}
              className={`h-8 rounded-lg text-xs font-medium flex items-center justify-center gap-1 transition ${
                handPaused
                  ? 'bg-red-600/30 border border-red-500 text-red-200'
                  : 'bg-green-600/20 border border-green-600/60 text-green-300'
              }`}
            >
              {handPaused ? '▶ Resume' : '⏸ Pause'}
            </button>
            <button
              onClick={() => setHandSmooth((v) => !v)}
              title="Smoothing — reduces hand tremble for a steadier line"
              className={`h-8 rounded-lg text-xs font-medium flex items-center justify-center gap-1 transition ${
                handSmooth
                  ? 'bg-cyan-600/25 border border-cyan-500/70 text-cyan-200'
                  : 'text-gray-400 border border-ink-line hover:bg-ink-line/50'
              }`}
            >
              {handSmooth ? '⚡ Smooth' : '〜 Raw'}
            </button>
          </div>
        )}
      </aside>

      {/* ── FLYOUT: PEN STYLES / LINES / SHAPES (вдясно от тулбара) ── */}
      {tool === 'HAND' && (
        <aside className="absolute left-[116px] top-1/2 -translate-y-1/2 z-20 w-[52px] max-h-[80vh] overflow-y-auto rounded-xl bg-ink-soft/80 border border-ink-line backdrop-blur flex flex-col items-center py-2 gap-1 animate-fade-in">
          {PEN_STYLES.map((s) => (
            <button
              key={s.id}
              onClick={() => setPenStyle(s.id)}
              title={s.label}
              className={`w-9 h-9 rounded-lg flex items-center justify-center text-base transition ${
                penStyle === s.id
                  ? 'bg-cyan-600/30 border border-cyan-500 text-white'
                  : 'text-gray-400 hover:bg-ink-line/50 hover:text-white border border-transparent'
              }`}
            >
              {s.icon}
            </button>
          ))}
        </aside>
      )}

      {LINE_IDS.has(tool) && (
        <aside className="absolute left-[116px] top-1/2 -translate-y-1/2 z-20 w-[52px] max-h-[80vh] overflow-y-auto rounded-xl bg-ink-soft/80 border border-ink-line backdrop-blur flex flex-col items-center py-2 gap-1 animate-fade-in">
          {LINE_TOOLS.map((s) => (
            <button
              key={s.id}
              onClick={() => selectTool(s.id)}
              title={s.label}
              className={`w-9 h-9 rounded-lg flex items-center justify-center text-base transition ${
                tool === s.id
                  ? 'bg-violet-600/30 border border-violet-500 text-white'
                  : 'text-gray-400 hover:bg-ink-line/50 hover:text-white border border-transparent'
              }`}
            >
              {s.icon}
            </button>
          ))}
        </aside>
      )}

      {SHAPE_IDS.has(tool) && (
        <aside className="absolute left-[116px] top-1/2 -translate-y-1/2 z-20 w-[52px] max-h-[80vh] overflow-y-auto rounded-xl bg-ink-soft/80 border border-ink-line backdrop-blur flex flex-col items-center py-2 gap-1 animate-fade-in">
          {SHAPE_TOOLS.map((s) => (
            <button
              key={s.id}
              onClick={() => selectTool(s.id)}
              title={s.label}
              className={`w-9 h-9 rounded-lg flex items-center justify-center text-base transition ${
                tool === s.id
                  ? 'bg-violet-600/30 border border-violet-500 text-white'
                  : 'text-gray-400 hover:bg-ink-line/50 hover:text-white border border-transparent'
              }`}
            >
              {s.icon}
            </button>
          ))}
        </aside>
      )}

      {/* ── TEXT POPOVER ── */}
      {textPopover && (
        <div
          className="absolute z-30 w-64 rounded-xl bg-ink-soft border border-ink-line backdrop-blur p-3 shadow-xl animate-fade-in"
          style={{
            left: Math.min(textPopover.screenX, window.innerWidth - 270),
            top: Math.min(textPopover.screenY, window.innerHeight - 160),
          }}
        >
          <div className="flex items-center gap-2 mb-2">
            <input
              autoFocus
              value={textPopover.value}
              onChange={(e) => setTextPopover((prev) => ({ ...prev, value: e.target.value }))}
              onKeyDown={(e) => e.key === 'Enter' && commitTextPopover()}
              placeholder="Type or dictate…"
              maxLength={120}
              className="flex-1 rounded-lg bg-ink border border-ink-line px-2 py-1.5 text-sm text-white focus:outline-none focus:border-violet-400"
            />
            <button
              onClick={startDictation}
              title="Dictate this text"
              className={`w-8 h-8 shrink-0 rounded-lg border flex items-center justify-center transition ${
                dictating ? 'border-red-500 bg-red-950/40 text-red-300' : 'border-ink-line text-gray-300 hover:text-white'
              }`}
            >
              🎙
            </button>
          </div>
          <div className="flex gap-2">
            <button
              onClick={cancelTextPopover}
              className="flex-1 rounded-lg border border-ink-line py-1.5 text-xs text-gray-300 hover:bg-ink-line/50 transition"
            >
              Cancel
            </button>
            <button
              onClick={commitTextPopover}
              className="flex-1 rounded-lg bg-violet-600 py-1.5 text-xs text-white hover:bg-violet-500 transition"
            >
              Add text
            </button>
          </div>
        </div>
      )}

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
          camAvatar={camAvatar}
          landmarksBufRef={landmarksBufRef}
          landmarkStampRef={landmarkStampRef}
        />
      )}

      {/* Подсказка при изключен live */}
      {!liveEnabled && !voiceEnabled && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 text-[11px] text-gray-500 bg-ink-soft/70 border border-ink-line rounded-full px-4 py-1.5 backdrop-blur">
          Press 👁 to paint with your face and voice · {ready ? 'models ready' : 'models load on first use'}
        </div>
      )}

      {/* Подсказка специално за Hand Draw, ако камерата/ръката са изключени */}
      {tool === 'HAND' && (!liveEnabled || !handsEnabled) && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 text-[11px] text-cyan-300 bg-ink-soft/70 border border-cyan-900/50 rounded-full px-4 py-1.5 backdrop-blur animate-fade-in">
          Enable 👁 and 🖐 to draw with your hand
        </div>
      )}

      {/* Подсказка за Hand Draw, докато е активен и live-ready */}
      {tool === 'HAND' && liveEnabled && handsEnabled && !voiceEnabled && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 text-[11px] text-cyan-300 bg-ink-soft/70 border border-cyan-900/50 rounded-full px-4 py-1.5 backdrop-blur animate-fade-in">
          Move your hand to paint · open palm (✋) or "stop" to lift the pen · close it again to resume
        </div>
      )}

      {/* Подсказка за гласови команди */}
      {voiceEnabled && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 text-[11px] text-red-300 bg-ink-soft/70 border border-red-900/50 rounded-full px-4 py-1.5 backdrop-blur animate-fade-in">
          Say a color, a tool, "bigger", "clear", "save" — or "stop"/"draw" to pause hand drawing
        </div>
      )}

      {/* ── MODALS ── */}
      {showInstructions && <InstructionsBook onClose={() => setShowInstructions(false)} />}

      {showSaveModal && (
        <SaveModal
          defaultTitle={title}
          defaultAuthor={authorDefault}
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
