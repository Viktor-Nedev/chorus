import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import Split from 'split.js';
import { ForgeCanvas, DEFAULT_PAGE_HEIGHT } from '../components/webforge/ForgeCanvas';
import { RightPanel } from '../components/webforge/RightPanel';
import { ForgeLoader } from '../components/webforge/ForgeLoader';
import { PageTabs } from '../components/webforge/PageTabs';
import { TEMPLATES } from '../components/webforge/templates';
import { BRUSH_TYPES } from '../components/webforge/brushes';
import {
  makeText, makeImagePlaceholder, makeButton, makeNav, applyButtonColors,
  makeComponentPlaceholder, FRAME_TYPES, FRAME_COLORS, COMPONENT_KINDS, CUSTOM_PROPS,
} from '../components/webforge/tools';
import { analyzeCanvas, serializeObjects } from '../engine/sketchAnalyzer';
import { buildWireframeHtml } from '../engine/wireframePreview';
import { buildSiteMap } from '../engine/pageLinks';
import { downloadProjectZip } from '../engine/projectZip';
import {
  DEFAULT_PALETTE, harmonizePalette, paletteFromSketch, injectPaletteVars,
} from '../engine/sitePalette';
import { annotate, stripAnnotations, applyTextEdit, applyStyleEdit, applyDelete } from '../engine/htmlEdit';
import { parseWebforgeCommand, VOICE_EXAMPLES } from '../engine/webforgeVoice';
import { useWebforge } from '../hooks/useWebforge';
import { useSitePublish } from '../hooks/useSitePublish';
import { useMediaPipe } from '../hooks/useMediaPipe';
import { useAudio } from '../hooks/useAudio';
import { useSpeechRecognition } from '../hooks/useSpeechRecognition';
import { VideoProcessor } from '../components/VideoProcessor';
import { EmotionSidebar } from '../components/HUD';
import { EMOTION_HEX } from '../constants/emotions';
import { MobileNotice } from '../components/MobileNotice';
import { InstructionsBook } from '../components/solo/InstructionsBook';
import { WEBFORGE_PAGES } from '../components/help/manuals';

const TOOLS = [
  { id: 'SELECT', icon: '⬚', label: 'Select (V) — click/move/resize · Del removes' },
  { id: 'FRAME', icon: '▭', label: 'Frame (F) — drag a block; pick its type (incl. Form/Backend) on release' },
  { id: 'TEXT', icon: 'T', label: 'Text (T) — double-click to edit' },
  { id: 'IMAGE', icon: '🖼', label: 'Image placeholder (I)' },
  { id: 'BUTTON', icon: '⏺', label: 'Button (B)' },
  { id: 'NAV', icon: '☰', label: 'Navbar' },
  { id: 'COMPONENT', icon: '◈', label: 'Component library' },
  { id: 'DRAW', icon: '✏', label: 'Draw (D) — freehand with the selected brush' },
  { id: 'ERASER', icon: '⌫', label: 'Eraser (E) — rubs out freehand strokes' },
  { id: 'FILL', icon: '🪣', label: 'Fill (G) — click a block to colour it, empty space for the page background' },
  { id: 'HAND', icon: '🖐', label: 'Hand draw — point with your finger; close your hand to draw, open palm to pause' },
  { id: 'VOICE', icon: '🗣', label: 'Voice paint — aim with your finger and speak; louder = thicker' },
];

// Инструменти, при които платното е в режим "рисуване"
const DRAW_TOOLS = new Set(['DRAW', 'ERASER']);
// Инструменти, които изискват камера/микрофон
const LIVE_TOOLS = new Set(['HAND', 'VOICE']);
// Инструменти, които веднага поставят обект и се връщат към SELECT
const PLACE_TOOLS = new Set(['TEXT', 'IMAGE', 'BUTTON', 'NAV']);

const SHORTCUTS = { v: 'SELECT', f: 'FRAME', t: 'TEXT', i: 'IMAGE', b: 'BUTTON', d: 'DRAW', e: 'ERASER', g: 'FILL' };

const SWATCHES = [
  '#F5F5F5', '#8B7BFA', '#67E8F9', '#3DDC97', '#FFD27F', '#FF8FC7',
  '#FF5555', '#FF8A3D', '#4A9EFF', '#D9D9D9', '#8a8a92', '#1a1a24',
];

const STYLE_PRESETS = ['Minimal', 'Corporate', 'Playful', 'Dark', 'Glassmorphism', 'Brutalist'];

const newPageId = () => 'pg' + Math.random().toString(36).slice(2, 9);
const blankPage = (name) => ({ id: newPageId(), name, canvasJson: null, height: DEFAULT_PAGE_HEIGHT });

// Auto-analyze е ИЗКЛЮЧЕН по подразбиране — free tier квотата на Gemini е
// ~20 заявки/ден на модел и автоматичните анализи я изгарят за минути.
const AUTO_ANALYZE_DEBOUNCE = 2500;
const AUTO_ANALYZE_MIN_INTERVAL = 30000;
const STORAGE_KEY = 'webforge-project';

function aiErrorMessage(e, what) {
  if (e.data?.error === 'quota_exceeded') {
    return e.data.retryIn
      ? `Gemini free-tier quota reached. Try again in ~${e.data.retryIn}s.`
      : 'Gemini free-tier daily quota reached. Try again later today (or add billing to the API key).';
  }
  return `${what} failed (${e.message}). Gemini may be overloaded — try again.`;
}

export function WebForge({ navigate }) {
  const [projectName, setProjectName] = useState('My Website');
  const [editingName, setEditingName] = useState(false);
  const [stylePreset, setStylePreset] = useState('Minimal');
  const [tool, setTool] = useState('SELECT');

  const canvasApiRef = useRef(null);
  const [selected, setSelected] = useState(null);
  const [selectedTick, setSelectedTick] = useState(0);

  // AI състояние
  const [components, setComponents] = useState([]);
  const [summary, setSummary] = useState('');
  const [chatMessages, setChatMessages] = useState([]);
  const [chatBusy, setChatBusy] = useState(false);

  // Проект/файлове
  const [projectId, setProjectId] = useState(null);
  const [files, setFiles] = useState([]);
  const [hasBackend, setHasBackend] = useState(false);
  const [wireframeHtml, setWireframeHtml] = useState(null);

  // Deploy
  const [dockerAvailable, setDockerAvailable] = useState(false);
  const [deployment, setDeployment] = useState(null);
  const [deployBusy, setDeployBusy] = useState(false);

  // Четка/цвят
  const [brushType, setBrushType] = useState('pen');
  const [brushWidth, setBrushWidth] = useState(3);
  const [brushColor, setBrushColor] = useState('#F5F5F5');
  const [showBrushPopover, setShowBrushPopover] = useState(false);
  const [showColorPopover, setShowColorPopover] = useState(false);
  const [showComponentPopover, setShowComponentPopover] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  // Тулбарът може да се свие, за да не яде място от платното
  const [toolbarOpen, setToolbarOpen] = useState(() => {
    try { return localStorage.getItem('webforge-toolbar') !== 'closed'; } catch { return true; }
  });
  const closePopovers = useCallback(() => {
    setShowBrushPopover(false);
    setShowColorPopover(false);
    setShowComponentPopover(false);
  }, []);

  // Страници — всяка е отделен канвас и отделен HTML файл
  const [pages, setPages] = useState(() => [blankPage('Home')]);
  const [activePageId, setActivePageId] = useState(null);
  const activePageIdRef = useRef(null);
  activePageIdRef.current = activePageId;
  const [pageHeight, setPageHeight] = useState(DEFAULT_PAGE_HEIGHT);
  const siteMap = useMemo(() => buildSiteMap(pages), [pages]);

  // Палитра на сайта — свързва нарисуваното с генерирания CSS
  const [palette, setPalette] = useState(DEFAULT_PALETTE);
  const paletteRef = useRef(DEFAULT_PALETTE);
  paletteRef.current = palette;
  const [paletteAuto, setPaletteAuto] = useState(true); // докато е true, следва скицата

  // Публикуване / рисуване с ръка
  const publisher = useSitePublish();
  const [publishedUrl, setPublishedUrl] = useState(null);
  const videoRef = useRef(null);
  const [isEmpty, setIsEmpty] = useState(true);

  // Камера/микрофон, емоция, глас (както в Solo)
  const [liveEnabled, setLiveEnabled] = useState(false);
  const [emotionColor, setEmotionColor] = useState(false);
  const [voiceCommandsOn, setVoiceCommandsOn] = useState(false);
  const [handSmooth, setHandSmooth] = useState(true);
  const [handDrawing, setHandDrawing] = useState(false);
  const [sidebarVisible, setSidebarVisible] = useState(true);
  const [sidebarPos, setSidebarPos] = useState(null); // null = докиран; {x,y} = преместен

  // Мостове към функции, дефинирани по-надолу (гласовите команди се създават
  // веднъж, но трябва да викат актуалните handler-и)
  const handleToolClickRef = useRef(null);
  const pickBrushRef = useRef(null);
  const placeAtCenterRef = useRef(null);
  const addPageRef = useRef(null);
  const stepPageRef = useRef(null);
  const generateRef = useRef(null);
  const analyzeRef = useRef(null);
  const publishRef = useRef(null);
  const downloadRef = useRef(null);

  // Инструментът се чете от canvas handler-ите без re-mount
  const toolRef = useRef({ tool: 'SELECT', color: '#F5F5F5', brushType: 'pen' });
  toolRef.current = { tool, color: brushColor, brushType: tool === 'ERASER' ? 'eraser' : brushType };

  const [framePopover, setFramePopover] = useState(null); // {rect, x, y}
  const [toast, setToast] = useState(null);
  const [errorBanner, setErrorBanner] = useState(null); // {msg, retry}
  const [showBook, setShowBook] = useState(false);

  const wf = useWebforge();

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3500);
  };

  // ── Split.js: лява (canvas) / дясна (панел) половина
  const leftPaneRef = useRef(null);
  const rightPaneRef = useRef(null);
  useEffect(() => {
    if (!leftPaneRef.current || !rightPaneRef.current) return;
    const split = Split([leftPaneRef.current, rightPaneRef.current], {
      direction: 'horizontal',
      sizes: [52, 48],
      minSize: [360, 380],
      gutterSize: 6,
    });
    return () => split.destroy();
  }, []);

  // ── Docker status при mount
  useEffect(() => {
    wf.dockerStatus().then(setDockerAvailable);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Wireframe preview: rebuild ~300ms след промяна по платното
  const wireframeTimer = useRef(null);
  const [showGuides, setShowGuides] = useState(false);
  const showGuidesRef = useRef(false);
  showGuidesRef.current = showGuides;

  const rebuildWireframe = useCallback(() => {
    clearTimeout(wireframeTimer.current);
    wireframeTimer.current = setTimeout(() => {
      const canvas = canvasApiRef.current?.getCanvas();
      if (!canvas) return;
      const objects = serializeObjects(canvas);
      setIsEmpty(objects.length === 0);

      // Палитрата се чете от скицата, докато потребителят не я е пипал ръчно
      let pal = paletteRef.current;
      if (paletteAutoRef.current && objects.length) {
        pal = paletteFromSketch(objects, canvas.getElement?.());
        paletteRef.current = pal;
        setPalette(pal);
      }

      setWireframeHtml(
        objects.length
          ? buildWireframeHtml(
              objects,
              { width: canvas.width, height: canvas.height },
              { guides: showGuidesRef.current, palette: pal }
            )
          : null
      );
    }, 300);
  }, []);

  const paletteAutoRef = useRef(true);
  paletteAutoRef.current = paletteAuto;

  // Ръчна промяна на палитрата → спира авто-четенето и пречертава
  const updatePalette = useCallback((patch) => {
    setPaletteAuto(false);
    setPalette((p) => {
      const next = harmonizePalette({ ...p, ...patch });
      paletteRef.current = next;
      return next;
    });
    rebuildWireframe();
  }, [rebuildWireframe]);

  const rereadPalette = useCallback(() => {
    const canvas = canvasApiRef.current?.getCanvas();
    if (!canvas) return;
    const pal = paletteFromSketch(serializeObjects(canvas), canvas.getElement?.());
    paletteRef.current = pal;
    setPalette(pal);
    setPaletteAuto(true);
    rebuildWireframe();
    showToast('✓ Palette read from your sketch');
  }, [rebuildWireframe]);

  // Превключването на Guides веднага пречертава preview-то
  useEffect(() => { rebuildWireframe(); }, [showGuides, rebuildWireframe]);

  // ── Персистенция в localStorage (възстановява се при връщане в режима)
  const persistTimer = useRef(null);
  const persistState = useRef({});
  persistState.current = { projectName, projectId, files, hasBackend, components, summary, stylePreset, pages, activePageId, palette, paletteAuto };

  // Текущият канвас → в масива със страници (без setState — за persist/generate)
  const snapshotPages = useCallback(() => {
    const api = canvasApiRef.current;
    const canvas = api?.getCanvas();
    const { pages: ps, activePageId: aid } = persistState.current;
    if (!canvas || !aid) return ps;
    return ps.map((p) =>
      p.id === aid
        ? { ...p, canvasJson: canvas.toJSON(CUSTOM_PROPS), height: api.getPageHeight() }
        : p
    );
  }, []);

  const schedulePersist = useCallback(() => {
    clearTimeout(persistTimer.current);
    persistTimer.current = setTimeout(() => {
      if (!canvasApiRef.current?.getCanvas()) return;
      try {
        localStorage.setItem(
          STORAGE_KEY,
          JSON.stringify({ ...persistState.current, pages: snapshotPages(), savedAt: Date.now() })
        );
      } catch {
        /* quota — пропусни */
      }
    }, 1000);
  }, [snapshotPages]);

  useEffect(() => {
    schedulePersist();
  }, [projectName, projectId, files, hasBackend, components, stylePreset, pages, activePageId, schedulePersist]);

  // ── Анализ (ръчен + автоматичен)
  const lastAnalyzeAt = useRef(0);
  const analyzeTimer = useRef(null);

  const [autoAnalyze, setAutoAnalyze] = useState(false);
  const autoAnalyzeRef = useRef(false);
  autoAnalyzeRef.current = autoAnalyze;

  const runAnalyze = useCallback(async () => {
    const canvas = canvasApiRef.current?.getCanvas();
    if (!canvas || canvas.getObjects().length === 0) {
      showToast('Draw something first');
      return;
    }
    lastAnalyzeAt.current = Date.now();
    setErrorBanner(null);
    try {
      const payload = analyzeCanvas(canvas);
      const result = await wf.analyze(payload);
      setComponents(result.components || []);
      setSummary(result.summary || '');
    } catch (e) {
      // При изчерпана квота спри автоматичните анализи — само горят заявки
      if (e.data?.error === 'quota_exceeded') setAutoAnalyze(false);
      setErrorBanner({ msg: aiErrorMessage(e, 'Analysis'), retry: 'analyze' });
    }
  }, [wf]);

  const scheduleAutoAnalyze = useCallback(() => {
    if (!autoAnalyzeRef.current) return;
    clearTimeout(analyzeTimer.current);
    analyzeTimer.current = setTimeout(() => {
      if (Date.now() - lastAnalyzeAt.current >= AUTO_ANALYZE_MIN_INTERVAL) {
        runAnalyze();
      }
    }, AUTO_ANALYZE_DEBOUNCE);
  }, [runAnalyze]);

  useEffect(
    () => () => {
      clearTimeout(analyzeTimer.current);
      clearTimeout(wireframeTimer.current);
      clearTimeout(persistTimer.current);
    },
    []
  );

  const handleObjectsChanged = useCallback(() => {
    rebuildWireframe();
    scheduleAutoAnalyze();
    schedulePersist();
  }, [rebuildWireframe, scheduleAutoAnalyze, schedulePersist]);

  // ── Canvas api ready → възстанови проекта от localStorage
  const handleCanvasReady = useCallback((api) => {
    canvasApiRef.current = api;
    let restored = null;
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
      if (saved) {
        setProjectName(saved.projectName || 'My Website');
        setProjectId(saved.projectId || null);
        setFiles(saved.files || []);
        setHasBackend(!!saved.hasBackend);
        setComponents(saved.components || []);
        setSummary(saved.summary || '');
        setStylePreset(saved.stylePreset || 'Minimal');
        if (saved.palette) {
          const pal = harmonizePalette(saved.palette);
          setPalette(pal);
          paletteRef.current = pal;
        }
        if (saved.paletteAuto === false) setPaletteAuto(false);
        // Миграция от стария едно-канвасов формат
        const savedPages = saved.pages?.length
          ? saved.pages
          : saved.canvasJson
            ? [{ ...blankPage('Home'), canvasJson: saved.canvasJson }]
            : null;
        if (savedPages) {
          setPages(savedPages);
          const aid = savedPages.find((p) => p.id === saved.activePageId)?.id || savedPages[0].id;
          setActivePageId(aid);
          restored = savedPages.find((p) => p.id === aid);
        }
      }
    } catch {
      /* повреден запис — игнорирай */
    }
    if (restored?.canvasJson?.objects?.length) {
      lastAnalyzeAt.current = Date.now(); // не пали auto-analyze веднага след restore
      api.loadJSON(restored.canvasJson, restored.height);
    } else {
      // Първо стартиране: една празна начална страница
      setActivePageId((cur) => cur ?? pagesInitRef.current);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // id-то на първата страница (създадена в useState initializer-а)
  const pagesInitRef = useRef(null);
  if (pagesInitRef.current === null) pagesInitRef.current = pages[0].id;

  // ── Смяна/добавяне/триене на страници
  const switchPage = useCallback((id) => {
    const api = canvasApiRef.current;
    if (!api || id === activePageIdRef.current) return;
    const snapped = snapshotPages();
    const target = snapped.find((p) => p.id === id);
    setPages(snapped);
    setActivePageId(id);
    if (target?.canvasJson) api.loadJSON(target.canvasJson, target.height);
    else api.reset(target?.height || DEFAULT_PAGE_HEIGHT);
  }, [snapshotPages]);

  const addPage = useCallback(() => {
    const snapped = snapshotPages();
    const page = blankPage(`Page ${snapped.length + 1}`);
    setPages([...snapped, page]);
    setActivePageId(page.id);
    canvasApiRef.current?.reset(DEFAULT_PAGE_HEIGHT);
  }, [snapshotPages]);

  const renamePage = useCallback((id, name) => {
    setPages((ps) => ps.map((p) => (p.id === id ? { ...p, name } : p)));
  }, []);

  // Следваща/предишна страница (за гласовите команди)
  const stepPage = useCallback((delta) => {
    const ps = persistState.current.pages || [];
    const i = ps.findIndex((p) => p.id === activePageIdRef.current);
    const next = ps[(i + delta + ps.length) % ps.length];
    if (next && next.id !== activePageIdRef.current) {
      switchPage(next.id);
      showToast(`🎙 ${next.name}`);
    }
  }, [switchPage]);
  addPageRef.current = addPage;
  stepPageRef.current = stepPage;

  const deletePage = useCallback((id) => {
    const snapped = snapshotPages().filter((p) => p.id !== id);
    if (!snapped.length) return;
    setPages(snapped);
    if (id === activePageIdRef.current) {
      setActivePageId(snapped[0].id);
      const first = snapped[0];
      if (first.canvasJson) canvasApiRef.current?.loadJSON(first.canvasJson, first.height);
      else canvasApiRef.current?.reset(first.height);
    }
  }, [snapshotPages]);

  // ── Шаблон → попълва текущата страница
  const applyTemplate = (tpl) => {
    const api = canvasApiRef.current;
    const canvas = api?.getCanvas();
    if (!canvas) return;
    api.addObjects(tpl.build(canvas.width, canvas.height));
    setShowTemplates(false);
    setTool('SELECT');
    showToast(`✓ ${tpl.name} added — adjust it, then Generate`);
  };

  // ── Камера/микрофон (както в Solo): жест, емоция, звук
  const {
    emotion, gesture, gestureRef, handPositionRef, handLandmarksBufRef, handStampRef,
    landmarksBufRef, landmarkStampRef, detect,
  } = useMediaPipe(videoRef, liveEnabled);
  const { initAudio, stopAudio, getAudioData, getWaveform } = useAudio();

  const toggleLive = useCallback(async () => {
    if (liveEnabled) {
      stopAudio();
      setLiveEnabled(false);
      return;
    }
    setLiveEnabled(true);
    try { await initAudio(); } catch { showToast('Microphone unavailable — camera only'); }
  }, [liveEnabled, initAudio, stopAudio]);

  // Цветът следва емоцията, докато режимът е включен
  useEffect(() => {
    if (emotionColor) setBrushColor(EMOTION_HEX[emotion] || EMOTION_HEX.neutral);
  }, [emotion, emotionColor]);

  // ── Рисуване с ПРЪСТ (връхчето на показалеца, landmark 8) — както в Solo.
  // Затворена длан/щипка = пише, отворена длан = пауза.
  const strokeRef = useRef([]);
  const smoothRef = useRef(null);

  const canvasPointFromNorm = useCallback((nx, ny) => {
    const canvas = canvasApiRef.current?.getCanvas();
    if (!canvas) return null;
    const host = canvas.getElement()?.parentElement?.parentElement;
    const scrollTop = host?.scrollTop || 0;
    const viewH = host?.clientHeight || canvas.height;
    return { x: (1 - nx) * canvas.width, y: ny * viewH + scrollTop }; // огледално
  }, []);

  useEffect(() => {
    if (!liveEnabled || (tool !== 'HAND' && tool !== 'VOICE')) return undefined;
    const id = setInterval(() => {
      const api = canvasApiRef.current;
      if (!api?.getCanvas()) return;

      // Позиция: връхче на показалеца, ако е свежо; иначе центърът на ръката
      let nx = handPositionRef.current.x;
      let ny = handPositionRef.current.y;
      if (performance.now() - (handStampRef.current || 0) < 250) {
        const buf = handLandmarksBufRef.current;
        nx = buf[8 * 3];
        ny = buf[8 * 3 + 1];
      }

      // Кога пишем: HAND → жест; VOICE → сила на гласа
      let drawing;
      let width = brushWidth;
      if (tool === 'VOICE') {
        const level = getAudioData()?.totalLevel || 0;
        drawing = level > 0.06; // праг срещу фонов шум
        width = Math.max(2, Math.min(40, brushWidth + level * 60));
      } else {
        drawing = gestureRef.current === 'CLOSED_FIST' || gestureRef.current === 'PINCH';
      }
      setHandDrawing(drawing);

      if (!drawing) {
        if (strokeRef.current.length > 1) {
          api.strokeFromPoints(strokeRef.current, {
            color: brushColor, width: strokeWidthRef.current || brushWidth, type: brushType,
          });
        }
        strokeRef.current = [];
        smoothRef.current = null;
        return;
      }
      const raw = canvasPointFromNorm(nx, ny);
      if (!raw) return;
      const s = smoothRef.current;
      const pt = s && handSmooth ? { x: s.x + (raw.x - s.x) * 0.35, y: s.y + (raw.y - s.y) * 0.35 } : raw;
      smoothRef.current = pt;
      strokeWidthRef.current = width;
      strokeRef.current.push([Math.round(pt.x), Math.round(pt.y)]);
    }, 40);
    return () => clearInterval(id);
  }, [
    liveEnabled, tool, brushColor, brushWidth, brushType, handSmooth,
    gestureRef, handPositionRef, handLandmarksBufRef, handStampRef,
    getAudioData, canvasPointFromNorm,
  ]);
  const strokeWidthRef = useRef(brushWidth);

  // ── Гласови команди
  const handleVoiceCommand = useCallback((transcript) => {
    const cmd = parseWebforgeCommand(transcript);
    if (!cmd) return;
    switch (cmd.type) {
      case 'tool': handleToolClickRef.current?.(cmd.value); showToast(`🎙 ${cmd.value}`); break;
      case 'brush': pickBrushRef.current?.(cmd.value); showToast(`🎙 ${cmd.value}`); break;
      case 'color': setBrushColor(cmd.value); setEmotionColor(false); showToast(`🎙 ${cmd.name}`); break;
      case 'emotionColor': setEmotionColor((v) => !v); showToast('🎙 Emotion colour'); break;
      case 'text': placeAtCenterRef.current?.((x, y) => makeText(x, y, cmd.value, 'body')); showToast(`🎙 “${cmd.value}”`); break;
      case 'addPage': addPageRef.current?.(); showToast('🎙 New page'); break;
      case 'nextPage': stepPageRef.current?.(1); break;
      case 'prevPage': stepPageRef.current?.(-1); break;
      case 'generate': generateRef.current?.(); showToast('🎙 Generating…'); break;
      case 'analyze': analyzeRef.current?.(); break;
      case 'publish': publishRef.current?.(); break;
      case 'download': downloadRef.current?.(); break;
      case 'clear': canvasApiRef.current?.clear(); showToast('🎙 Cleared'); break;
      case 'undo': canvasApiRef.current?.undo(); break;
      case 'redo': canvasApiRef.current?.redo(); break;
      case 'extend': canvasApiRef.current?.growPage(); showToast('🎙 Page extended'); break;
      case 'size': setBrushWidth((w) => Math.max(1, Math.min(40, w + cmd.value))); break;
      default: break;
    }
  }, []);
  const { supported: voiceSupported } = useSpeechRecognition(voiceCommandsOn, handleVoiceCommand);

  // ── New project
  const handleNewProject = () => {
    if (!window.confirm('Start fresh? The current project will be cleared.')) return;
    const first = blankPage('Home');
    setPages([first]);
    setActivePageId(first.id);
    canvasApiRef.current?.reset(DEFAULT_PAGE_HEIGHT);
    setProjectName('My Website');
    setProjectId(null);
    setFiles([]);
    setHasBackend(false);
    setComponents([]);
    setSummary('');
    setChatMessages([]);
    setDeployment(null);
    setPublishedUrl(null);
    setWireframeHtml(null);
    setErrorBanner(null);
    localStorage.removeItem(STORAGE_KEY);
  };

  // ── Инструменти
  const placeAtCenter = (factory) => {
    const api = canvasApiRef.current;
    const canvas = api?.getCanvas();
    if (!canvas) return;
    const cx = canvas.width / 2 - 80 + (Math.random() - 0.5) * 60;
    const cy = canvas.height / 2 - 40 + (Math.random() - 0.5) * 60;
    api.addObject(factory(cx, cy));
    setTool('SELECT');
  };

  const handleToolClick = (id) => {
    if (id !== 'COMPONENT') setShowComponentPopover(false);
    if (!DRAW_TOOLS.has(id)) setShowBrushPopover(false);

    switch (id) {
      case 'TEXT':
        placeAtCenter((x, y) => makeText(x, y, 'Edit me', 'body'));
        return;
      case 'IMAGE':
        placeAtCenter((x, y) => makeImagePlaceholder(x, y));
        return;
      case 'BUTTON':
        placeAtCenter((x, y) => makeButton(x, y, 'Click Me', 'primary'));
        return;
      case 'NAV':
        placeAtCenter((x, y) => makeNav(x, Math.min(y, 40)));
        return;
      case 'COMPONENT':
        setShowComponentPopover((s) => !s);
        return;
      case 'DRAW':
        setShowBrushPopover(true);
        setTool('DRAW');
        return;
      case 'HAND':
      case 'VOICE':
        if (!liveEnabled) toggleLive();
        setTool(id);
        return;
      default:
        setTool(id);
    }
  };

  // Гласовите команди викат актуалните handler-и през тези мостове
  handleToolClickRef.current = handleToolClick;

  // ── ЕДИН източник на истина за режима на платното. Преди това drawing mode
  // се включваше само в handleToolClick, а бутонът 🖌 само отваряше popover-а
  // → четката изглеждаше активна, но нищо не се рисуваше.
  useEffect(() => {
    const api = canvasApiRef.current;
    if (!api) return;
    api.setDrawingMode(DRAW_TOOLS.has(tool));
    if (DRAW_TOOLS.has(tool)) {
      api.setBrush({
        type: tool === 'ERASER' ? 'eraser' : brushType,
        color: brushColor,
        width: brushWidth,
      });
    }
  }, [tool, brushType, brushColor, brushWidth]);

  // Избор на четка (или отваряне на 🖌) винаги активира рисуването
  const pickBrush = (id) => {
    setBrushType(id);
    setTool(id === 'eraser' ? 'ERASER' : 'DRAW');
  };
  pickBrushRef.current = pickBrush;
  placeAtCenterRef.current = placeAtCenter;

  // ── Клавишни комбинации + скриване на панелите
  useEffect(() => {
    const onKey = (e) => {
      const ae = document.activeElement;
      if (ae && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA' || ae.isContentEditable)) return;
      if (e.key === 'Escape') { closePopovers(); return; }
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === '[') {
        e.preventDefault();
        setToolbarOpen((v) => {
          try { localStorage.setItem('webforge-toolbar', v ? 'closed' : 'open'); } catch { /* ignore */ }
          return !v;
        });
        return;
      }
      if (e.key === 'Tab') { e.preventDefault(); closePopovers(); return; }
      const next = SHORTCUTS[e.key.toLowerCase()];
      if (next) {
        e.preventDefault();
        handleToolClick(next);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [brushType, brushColor, brushWidth, closePopovers]);

  const applyColor = (color) => {
    setBrushColor(color);
    // Ако има селекция — оцвети я (fill за фигури/текст)
    const canvas = canvasApiRef.current?.getCanvas();
    const obj = canvas?.getActiveObject();
    if (obj) {
      obj.set({ fill: color });
      canvas.renderAll();
      setSelectedTick((t) => t + 1);
      handleObjectsChanged();
    }
  };

  // ── Frame type popover след drag-create
  const handleFrameCreated = useCallback((rect, screenPos) => {
    setFramePopover({ rect, x: screenPos.x, y: screenPos.y });
  }, []);

  const applyFrameType = (type) => {
    if (framePopover?.rect) {
      framePopover.rect.set({
        customType: type === 'auto' ? 'frame' : type,
        stroke: FRAME_COLORS[type] || FRAME_COLORS.auto,
        strokeDashArray: type === 'form' || type === 'backend' ? [8, 5] : null,
      });
      canvasApiRef.current?.getCanvas()?.renderAll();
    }
    setFramePopover(null);
    setTool('SELECT');
    handleObjectsChanged();
  };

  // ── Properties панел
  const handleUpdateSelected = (patch) => {
    const canvas = canvasApiRef.current?.getCanvas();
    const obj = canvas?.getActiveObject();
    if (!obj) return;
    if (patch.frameType) {
      obj.set({
        customType: patch.frameType === 'auto' ? 'frame' : patch.frameType,
        stroke: FRAME_COLORS[patch.frameType] || FRAME_COLORS.auto,
        strokeDashArray: patch.frameType === 'form' || patch.frameType === 'backend' ? [8, 5] : null,
      });
    } else if (patch.buttonColor || patch.buttonTextColor || (patch.buttonStyle && obj.customType === 'button')) {
      // Цветът на бутона се прилага и върху групата (rect + label)
      applyButtonColors(obj, patch);
    } else {
      obj.set(patch);
    }
    canvas.renderAll();
    setSelectedTick((t) => t + 1);
    handleObjectsChanged();
  };

  // ── Генерация
  const handleGenerate = async () => {
    const canvas = canvasApiRef.current?.getCanvas();
    if (!canvas || canvas.getObjects().length === 0) {
      showToast('Draw a layout first');
      return;
    }
    setErrorBanner(null);
    try {
      const payload = analyzeCanvas(canvas);
      // Всички страници (текущата — прясно сериализирана) + техните пътища
      const snapped = snapshotPages();
      const map = buildSiteMap(snapped);
      const pagePayload = snapped.map((p, i) => ({
        name: map[i].name,
        path: map[i].path,
        objects:
          p.id === activePageIdRef.current
            ? payload.objects
            : (p.canvasJson?.objects || []).map((o) => ({
                type: o.type, customType: o.customType, text: o.text,
                xPct: o.left != null ? Math.round((o.left / canvas.width) * 1000) / 10 : undefined,
                yPct: o.top != null ? Math.round((o.top / (p.height || canvas.height)) * 1000) / 10 : undefined,
                buttonStyle: o.buttonStyle, buttonColor: o.buttonColor,
                navItems: o.navItems, annotation: o.annotation,
              })),
      }));

      const result = await wf.generate({
        projectId,
        projectName,
        objects: payload.objects,
        components,
        image: payload.image,
        stylePreset,
        pages: pagePayload,
        palette,
      });
      // Детерминистична гаранция: точните hex стойности влизат в CSS-а, дори
      // ако моделът се е отклонил от палитрата.
      const withPalette = (result.files || []).map((f) =>
        f.path === 'frontend/styles.css'
          ? { ...f, content: injectPaletteVars(f.content, palette) }
          : f
      );
      setProjectId(result.projectId);
      setFiles(withPalette);
      setHasBackend(result.hasBackend);
      setDeployment(null);
      setPublishedUrl(null);
      showToast(`✓ Website generated — ${withPalette.length} files`);
    } catch (e) {
      setErrorBanner({ msg: aiErrorMessage(e, 'Generation'), retry: 'generate' });
    }
  };

  // ── Chat
  const handleSendChat = async (text) => {
    setChatMessages((m) => [...m, { role: 'user', text }]);
    setChatBusy(true);
    try {
      const result = await wf.chat({
        projectId,
        messages: [...chatMessages, { role: 'user', text }].slice(-10),
        files: files.length ? files : undefined,
      });
      setChatMessages((m) => [
        ...m,
        { role: 'ai', text: result.reply, updatedFiles: result.updatedFiles || [] },
      ]);
    } catch (e) {
      setChatMessages((m) => [...m, { role: 'ai', text: 'Error: ' + e.message }]);
    } finally {
      setChatBusy(false);
    }
  };

  const handleApplyFiles = (updatedFiles) => {
    setFiles((prev) => {
      const next = [...prev];
      for (const uf of updatedFiles) {
        const i = next.findIndex((f) => f.path === uf.path);
        if (i >= 0) next[i] = uf;
        else next.push(uf);
      }
      return next;
    });
    showToast('✓ Changes applied');
  };

  const handleFileChange = (path, content) => {
    setFiles((prev) => prev.map((f) => (f.path === path ? { ...f, content } : f)));
  };

  // ── Визуално редактиране на генерирания сайт.
  // Preview-то е annotate-нат (data-wf-id) вариант на файла; тук прилагаме
  // промяната върху ИСТИНСКИЯ файл, като първо го маркираме с тези же id-та.
  const editHtmlFile = useCallback((path, fn) => {
    setFiles((prev) =>
      prev.map((f) => {
        if (f.path !== path) return f;
        const annotated = f.content.includes('data-wf-id') ? f.content : annotate(f.content);
        return { ...f, content: fn(annotated) };
      })
    );
  }, []);

  const handleTextEdit = useCallback(
    (path, id, text) => editHtmlFile(path, (html) => applyTextEdit(html, id, text)),
    [editHtmlFile]
  );
  const handleStyleEdit = useCallback(
    (path, id, style) => editHtmlFile(path, (html) => applyStyleEdit(html, id, style)),
    [editHtmlFile]
  );
  const handleDeleteElement = useCallback(
    (path, id) => editHtmlFile(path, (html) => applyDelete(html, id)),
    [editHtmlFile]
  );

  // ── Deploy
  const handleDeployDocker = async () => {
    setDeployBusy(true);
    try {
      await wf.save({ projectId, files });
      const result = await wf.deployDocker(projectId);
      setDeployment(result);
    } catch (e) {
      if (e.data?.error === 'docker_unavailable') {
        setDockerAvailable(false);
        showToast('Docker Desktop is not running');
      } else {
        showToast('Deploy failed — ' + e.message);
      }
    } finally {
      setDeployBusy(false);
    }
  };

  const handleStopDocker = async () => {
    await wf.stopDocker(projectId);
    setDeployment(null);
  };

  // Маркерите на визуалния редактор не бива да излизат навън
  const cleanFiles = useCallback(
    () => files.map((f) => (f.path.endsWith('.html') ? { ...f, content: stripAnnotations(f.content) } : f)),
    [files]
  );

  // ZIP-ът се сглобява в браузъра → работи и без Node сървър
  const handleDownload = async () => {
    if (!files.length) {
      showToast('Generate the website first');
      return;
    }
    try {
      await downloadProjectZip(cleanFiles(), projectName);
      showToast('✓ Project downloaded');
    } catch (e) {
      showToast('Download failed — ' + e.message);
    }
  };

  // Публикуване в Supabase Storage → истински споделим URL
  const handlePublish = async () => {
    try {
      const { url } = await publisher.publish(projectId || 'site', cleanFiles(), projectName);
      setPublishedUrl(url);
      showToast('✓ Published');
    } catch (e) {
      showToast(e.message);
    }
  };

  generateRef.current = handleGenerate;
  analyzeRef.current = runAnalyze;
  publishRef.current = handlePublish;
  downloadRef.current = handleDownload;

  return (
    // `relative` дава контекст на докирания Live State панел (absolute)
    <div className="relative h-full w-full bg-ink flex flex-col overflow-hidden">
      <MobileNotice label="WebForge is built for desktop — draw layouts with a mouse on a wide screen" />
      {/* ── HEADER ── */}
      <header className="h-12 shrink-0 flex items-center gap-3 px-4 border-b border-ink-line bg-ink-soft/50">
        <button
          onClick={() => navigate('landing')}
          className="text-sm text-gray-400 hover:text-white transition"
        >
          ← Back
        </button>
        <span className="font-display font-extrabold text-sm text-white tracking-[0.2em]">
          WEBFORGE
        </span>
        {editingName ? (
          <input
            autoFocus
            value={projectName}
            onChange={(e) => setProjectName(e.target.value)}
            onBlur={() => setEditingName(false)}
            onKeyDown={(e) => e.key === 'Enter' && setEditingName(false)}
            maxLength={60}
            className="bg-ink border border-ink-line rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-accent-violet"
          />
        ) : (
          <button
            onClick={() => setEditingName(true)}
            className="text-xs text-gray-400 hover:text-white transition"
            title="Click to rename"
          >
            {projectName} ✏
          </button>
        )}

        <div className="ml-auto flex items-center gap-2">
          {/* Камера + микрофон (за пръст/глас/емоция) */}
          <button
            onClick={toggleLive}
            title="Camera + microphone — draw with your finger, your voice and your mood"
            className={`w-8 h-8 rounded-lg border text-sm transition ${
              liveEnabled
                ? 'border-accent-cyan bg-accent-cyan/15 text-accent-cyan'
                : 'border-ink-line text-gray-400 hover:text-white hover:bg-ink-line/50'
            }`}
          >
            👁
          </button>
          <button
            onClick={() => {
              if (!voiceCommandsOn && !voiceSupported) {
                showToast('Voice commands need Chrome or Edge');
                return;
              }
              setVoiceCommandsOn((v) => !v);
            }}
            title={`Voice commands — try: ${VOICE_EXAMPLES.slice(0, 4).join(', ')}`}
            className={`w-8 h-8 rounded-lg border text-sm transition ${
              voiceCommandsOn
                ? 'border-accent-violet bg-accent-violet/15 text-accent-violet'
                : 'border-ink-line text-gray-400 hover:text-white hover:bg-ink-line/50'
            }`}
          >
            🎙
          </button>
          <button
            onClick={() => setEmotionColor((v) => !v)}
            title="Emotion colour — the brush colour follows your mood"
            className={`w-8 h-8 rounded-lg border text-sm transition ${
              emotionColor
                ? 'border-yellow-400 bg-yellow-400/15 text-yellow-300'
                : 'border-ink-line text-gray-400 hover:text-white hover:bg-ink-line/50'
            }`}
          >
            🎭
          </button>
          <button
            onClick={() => setShowBook(true)}
            title="Field guide"
            className="w-8 h-8 rounded-lg border border-ink-line text-gray-400 hover:text-white hover:bg-ink-line/50 transition text-sm"
          >
            📖
          </button>
          <select
            value={stylePreset}
            onChange={(e) => setStylePreset(e.target.value)}
            title="Visual style of the generated website"
            className="h-8 rounded-lg bg-ink border border-ink-line px-2 text-xs text-gray-300 focus:outline-none focus:border-accent-violet"
          >
            {STYLE_PRESETS.map((s) => (
              <option key={s} value={s}>🎨 {s}</option>
            ))}
          </select>
          <button
            onClick={handleNewProject}
            title="Start fresh — blank canvas"
            className="rounded-lg border border-ink-line px-3 h-8 text-xs text-gray-400 hover:text-white hover:bg-ink-line/40 transition"
          >
            + New
          </button>
          <button
            onClick={runAnalyze}
            disabled={wf.analyzing}
            className="rounded-lg border border-accent-cyan/50 bg-accent-cyan/10 px-3 h-8 text-xs text-accent-cyan hover:bg-accent-cyan/20 transition disabled:opacity-50"
          >
            {wf.analyzing ? '🔍 Analyzing…' : '🔍 Analyze'}
          </button>
          <button
            onClick={handleGenerate}
            disabled={wf.generating}
            className="rounded-lg bg-accent-violet/80 px-4 h-8 text-xs font-bold text-ink hover:bg-accent-violet transition disabled:opacity-50"
          >
            {wf.generating ? '⚙ Generating…' : '⚡ Generate Website'}
          </button>
        </div>
      </header>

      {/* ── ERROR BANNER ── */}
      {errorBanner && (
        <div className="shrink-0 flex items-center gap-3 px-4 py-2 bg-red-950/50 border-b border-red-900 text-xs text-red-300 animate-fade-in">
          <span className="flex-1">⚠ {errorBanner.msg}</span>
          <button
            onClick={() => (errorBanner.retry === 'generate' ? handleGenerate() : runAnalyze())}
            className="rounded border border-red-700 px-3 py-1 text-red-200 hover:bg-red-900/50 transition"
          >
            ↻ Retry
          </button>
          <button onClick={() => setErrorBanner(null)} className="text-red-400 hover:text-white px-1">
            ✕
          </button>
        </div>
      )}

      {/* ── SPLIT: лява (рисуване) / дясна (preview + AI) ── */}
      <div className="flex-1 flex overflow-hidden">
        {/* LEFT: toolbar + canvas */}
        <div ref={leftPaneRef} className="flex overflow-hidden">
          {/* Свит тулбар — само тънка лента, платното получава мястото */}
          {!toolbarOpen && (
            <aside className="w-[22px] shrink-0 border-r border-ink-line bg-ink-soft/50 flex flex-col items-center py-2">
              <button
                onClick={() => {
                  setToolbarOpen(true);
                  try { localStorage.setItem('webforge-toolbar', 'open'); } catch { /* ignore */ }
                }}
                title="Show tools ( [ )"
                className="text-gray-500 hover:text-white transition text-xs"
              >
                ›
              </button>
              <span className="mt-2 text-[9px] text-gray-600 [writing-mode:vertical-rl]">tools</span>
            </aside>
          )}
          <aside
            className={`${toolbarOpen ? 'w-[56px]' : 'hidden'} shrink-0 border-r border-ink-line bg-ink-soft/50 flex flex-col items-center py-2 gap-1 overflow-y-auto`}
          >
            <button
              onClick={() => {
                setToolbarOpen(false);
                closePopovers();
                try { localStorage.setItem('webforge-toolbar', 'closed'); } catch { /* ignore */ }
              }}
              title="Hide tools ( [ ) — frees up canvas space"
              className="w-10 h-6 rounded text-gray-500 hover:text-white hover:bg-ink-line/50 transition text-xs"
            >
              ‹
            </button>
            {TOOLS.map((t) => (
              <button
                key={t.id}
                onClick={() => handleToolClick(t.id)}
                title={t.label}
                className={`w-10 h-10 rounded-lg flex items-center justify-center text-base transition ${
                  tool === t.id
                    ? 'bg-accent-violet/25 border border-accent-violet text-white'
                    : 'text-gray-400 hover:bg-ink-line/50 hover:text-white border border-transparent'
                }`}
              >
                {t.icon}
              </button>
            ))}

            <div className="w-8 border-t border-ink-line my-1" />

            {/* Цвят */}
            <button
              onClick={() => {
                setShowColorPopover((s) => !s);
                setShowBrushPopover(false);
              }}
              title="Color — brush & selected object"
              className="w-10 h-10 rounded-lg flex items-center justify-center border border-transparent hover:bg-ink-line/50 transition"
            >
              <span
                className="w-5 h-5 rounded-full border-2 border-white/30"
                style={{ background: brushColor }}
              />
            </button>
            {/* Четка */}
            <button
              onClick={() => {
                // Отварянето на четката ВИНАГИ активира рисуването — иначе
                // четката изглежда избрана, но платното е още в Select.
                setShowColorPopover(false);
                setShowBrushPopover((s) => !s);
                setTool((t) => (DRAW_TOOLS.has(t) ? t : 'DRAW'));
              }}
              title="Brush — type & width (D)"
              className={`w-10 h-10 rounded-lg flex items-center justify-center text-base transition border ${
                showBrushPopover
                  ? 'bg-accent-violet/25 border-accent-violet text-white'
                  : 'text-gray-400 hover:bg-ink-line/50 hover:text-white border-transparent'
              }`}
            >
              🖌
            </button>

            <div className="w-8 border-t border-ink-line my-1" />
            <button
              onClick={() => canvasApiRef.current?.undo()}
              title="Undo"
              className="w-10 h-8 rounded-lg text-gray-400 hover:text-white hover:bg-ink-line/50 transition text-sm"
            >
              ↶
            </button>
            <button
              onClick={() => canvasApiRef.current?.redo()}
              title="Redo"
              className="w-10 h-8 rounded-lg text-gray-400 hover:text-white hover:bg-ink-line/50 transition text-sm"
            >
              ↷
            </button>
            <button
              onClick={() => canvasApiRef.current?.clear()}
              title="Clear canvas"
              className="w-10 h-8 rounded-lg text-gray-400 hover:text-red-400 hover:bg-ink-line/50 transition text-sm"
            >
              🗑
            </button>
          </aside>

          <div className="flex-1 flex flex-col overflow-hidden">
            <PageTabs
              pages={pages}
              activeId={activePageId}
              siteMap={siteMap}
              onSelect={switchPage}
              onAdd={addPage}
              onRename={renamePage}
              onDelete={deletePage}
            />
            <div className="flex-1 relative overflow-hidden">
            <ForgeCanvas
              toolRef={toolRef}
              onReady={handleCanvasReady}
              onSelection={setSelected}
              onObjectsChanged={handleObjectsChanged}
              onFrameCreated={handleFrameCreated}
              onHeightChange={setPageHeight}
            />

            {/* Празно състояние: шаблони вместо бял лист */}
            {isEmpty && (
              <div className="absolute inset-x-0 top-10 flex flex-col items-center pointer-events-none">
                <p className="text-xs text-gray-600 pointer-events-none">
                  Draw a block with <b className="text-gray-400">F</b>, or start from a template
                </p>
                <div className="mt-3 flex flex-wrap justify-center gap-2 pointer-events-auto">
                  {TEMPLATES.map((t) => (
                    <button
                      key={t.id}
                      onClick={() => applyTemplate(t)}
                      title={t.hint}
                      className="rounded-lg border border-ink-line bg-ink-soft/80 px-3 py-1.5 text-xs text-gray-300 hover:text-white hover:border-accent-violet transition"
                    >
                      {t.name}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Височина на страницата */}
            <div className="absolute right-3 bottom-3 z-20 flex items-center gap-2">
              <span className="rounded-full bg-ink-soft/85 border border-ink-line px-2.5 py-1 text-[10px] text-gray-500">
                page {pageHeight}px
              </span>
              <button
                onClick={() => canvasApiRef.current?.growPage()}
                title="Make the page longer — the site continues below"
                className="rounded-full bg-ink-soft/85 border border-ink-line px-3 py-1 text-[11px] text-gray-300 hover:text-white hover:border-accent-violet transition"
              >
                ＋ Extend
              </button>
            </div>

            {/* HUD за рисуване с пръст / глас */}
            {liveEnabled && LIVE_TOOLS.has(tool) && (
              <div className="absolute left-3 bottom-3 z-20 flex items-center gap-2 rounded-full bg-ink-soft/85 border border-ink-line px-3 py-1 text-[11px] text-gray-300">
                {tool === 'VOICE' ? (
                  <span>{handDrawing ? '🗣 painting — louder = thicker' : '🤫 speak to paint'}</span>
                ) : (
                  <span>{handDrawing ? '✊ drawing' : '✋ paused — close your hand'}</span>
                )}
                <button
                  onClick={() => setHandSmooth((s) => !s)}
                  title="Smoothing — removes hand tremble"
                  className={handSmooth ? 'text-accent-cyan' : 'text-gray-600 hover:text-gray-300'}
                >
                  ⚡
                </button>
                <button onClick={() => setTool('SELECT')} className="text-gray-500 hover:text-red-400">✕</button>
              </div>
            )}

            {/* Клик навън затваря popover-ите (не пречи на рисуването) */}
            {(showColorPopover || showBrushPopover || showComponentPopover) && (
              <div className="absolute inset-0 z-20" onClick={closePopovers} />
            )}

            {/* Color popover */}
            {showColorPopover && (
              <div className="absolute left-2 bottom-2 z-30 rounded-xl bg-ink-soft border border-ink-line shadow-xl p-3 animate-fade-in">
                <div className="text-[10px] uppercase tracking-[0.15em] text-gray-500 pb-2">Color</div>
                <div className="grid grid-cols-4 gap-1.5">
                  {SWATCHES.map((c) => (
                    <button
                      key={c}
                      onClick={() => applyColor(c)}
                      className={`w-7 h-7 rounded-lg border-2 transition hover:scale-110 ${
                        brushColor === c ? 'border-white' : 'border-white/10'
                      }`}
                      style={{ background: c }}
                    />
                  ))}
                </div>
                <label className="mt-2 flex items-center gap-2 text-[10px] text-gray-500 cursor-pointer">
                  <input
                    type="color"
                    value={brushColor}
                    onChange={(e) => applyColor(e.target.value)}
                    className="w-7 h-7 bg-transparent cursor-pointer"
                  />
                  Custom…
                </label>
              </div>
            )}

            {/* Brush popover */}
            {showBrushPopover && (
              <div className="absolute left-2 bottom-2 z-30 rounded-xl bg-ink-soft border border-ink-line shadow-xl p-3 w-52 animate-fade-in">
                <div className="text-[10px] uppercase tracking-[0.15em] text-gray-500 pb-2">Brush</div>
                {BRUSH_TYPES.map((b) => (
                  <button
                    key={b.id}
                    onClick={() => pickBrush(b.id)}
                    className={`block w-full text-left px-2.5 py-1.5 text-xs rounded-lg transition mb-1 ${
                      (b.id === 'eraser' ? tool === 'ERASER' : brushType === b.id && tool === 'DRAW')
                        ? 'bg-accent-violet/20 text-white border border-accent-violet/50'
                        : 'text-gray-400 hover:bg-ink-line/50 border border-transparent'
                    }`}
                  >
                    {b.label}
                    <span className="block text-[9px] text-gray-500">{b.hint}</span>
                  </button>
                ))}
                <div className="mt-2">
                  <div className="flex justify-between text-[10px] text-gray-500 mb-1">
                    <span>Width</span>
                    <span>{brushWidth}px</span>
                  </div>
                  <input
                    type="range"
                    min={1}
                    max={24}
                    value={brushWidth}
                    onChange={(e) => setBrushWidth(Number(e.target.value))}
                    className="w-full accent-accent-violet"
                  />
                </div>
              </div>
            )}

            {/* Component popover */}
            {showComponentPopover && (
              <div className="absolute left-2 bottom-2 z-30 rounded-xl bg-ink-soft border border-ink-line shadow-xl p-2 animate-fade-in max-h-72 overflow-y-auto">
                <div className="text-[10px] uppercase tracking-[0.15em] text-gray-500 px-2 pb-1.5">
                  Component
                </div>
                {COMPONENT_KINDS.map((k) => (
                  <button
                    key={k}
                    onClick={() => {
                      setShowComponentPopover(false);
                      placeAtCenter((x, y) => makeComponentPlaceholder(x, y, k));
                    }}
                    className="block w-full text-left px-3 py-1.5 text-xs text-gray-300 hover:bg-ink-line/50 hover:text-white rounded-lg transition"
                  >
                    ◈ {k}
                  </button>
                ))}
              </div>
            )}
            </div>
          </div>
        </div>

        {/* RIGHT: preview + code + AI */}
        <div ref={rightPaneRef} className="overflow-hidden">
          <RightPanel
            wireframeHtml={wireframeHtml}
            files={files}
            onFileChange={handleFileChange}
            hasBackend={hasBackend}
            projectId={projectId}
            dockerAvailable={dockerAvailable}
            deployment={deployment}
            onDeployDocker={handleDeployDocker}
            onStopDocker={handleStopDocker}
            onDownload={handleDownload}
            deployBusy={deployBusy}
            onPublish={handlePublish}
            publishing={publisher.publishing}
            publishAvailable={publisher.available}
            publishedUrl={publishedUrl}
            showGuides={showGuides}
            onToggleGuides={() => setShowGuides((g) => !g)}
            palette={palette}
            paletteAuto={paletteAuto}
            onPaletteChange={updatePalette}
            onRereadPalette={rereadPalette}
            onTextEdit={handleTextEdit}
            onStyleEdit={handleStyleEdit}
            onDeleteElement={handleDeleteElement}
            components={components}
            summary={summary}
            analyzing={wf.analyzing}
            onAnalyze={runAnalyze}
            autoAnalyze={autoAnalyze}
            onToggleAutoAnalyze={() => setAutoAnalyze((v) => !v)}
            chatMessages={chatMessages}
            chatBusy={chatBusy}
            onSendChat={handleSendChat}
            onApplyFiles={handleApplyFiles}
            selected={selected}
            selectedTick={selectedTick}
            onUpdateSelected={handleUpdateSelected}
            onDeleteSelected={() => canvasApiRef.current?.deleteSelected()}
          />
        </div>
      </div>

      {/* ── Frame type popover ── */}
      {framePopover && (
        <div
          className="fixed z-40 rounded-xl bg-ink-soft border border-ink-line shadow-xl p-2 animate-fade-in"
          style={{
            left: Math.min(framePopover.x, window.innerWidth - 180),
            top: Math.min(framePopover.y, window.innerHeight - 320),
          }}
        >
          <div className="text-[10px] uppercase tracking-[0.15em] text-gray-500 px-2 pb-1.5">
            Frame type
          </div>
          {FRAME_TYPES.map((t) => (
            <button
              key={t}
              onClick={() => applyFrameType(t)}
              className="block w-full text-left px-3 py-1.5 text-xs text-gray-300 hover:bg-ink-line/50 hover:text-white rounded-lg transition"
            >
              <span
                className="inline-block w-2 h-2 rounded-full mr-2"
                style={{ background: FRAME_COLORS[t] }}
              />
              {t === 'auto'
                ? 'Auto-detect'
                : t === 'form'
                  ? 'Form (draw the fields inside)'
                  : t === 'backend'
                    ? '⚡ Backend zone'
                    : t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>
      )}

      {/* ── Камера/микрофон + подвижен HUD с емоция и waveform ── */}
      <VideoProcessor ref={videoRef} detect={detect} active={liveEnabled} />
      {liveEnabled && (
        <EmotionSidebar
          emotion={emotion}
          gesture={gesture}
          videoRef={videoRef}
          emotionHistory={[]}
          getWaveform={getWaveform}
          visible={sidebarVisible}
          onToggle={() => setSidebarVisible((v) => !v)}
          landmarksBufRef={landmarksBufRef}
          landmarkStampRef={landmarkStampRef}
          position={sidebarPos}
          onDragTo={setSidebarPos}
          onDock={() => setSidebarPos(null)}
        />
      )}

      {/* Подсказка за гласовите команди */}
      {voiceCommandsOn && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-30 rounded-full bg-ink-soft/85 border border-accent-violet/40 px-4 py-1.5 text-[11px] text-gray-300 backdrop-blur">
          🎙 Listening — try “{VOICE_EXAMPLES[0]}”, “{VOICE_EXAMPLES[7]}”, “new page”, “generate”
        </div>
      )}

      {/* ── Particle loader при генерация ── */}
      {wf.generating && <ForgeLoader projectName={projectName} />}

      {toast && (
        <div className="fixed top-14 left-1/2 -translate-x-1/2 z-50 rounded-full bg-ink-soft border border-ink-line px-5 py-2 text-sm text-white backdrop-blur animate-fade-in">
          {toast}
        </div>
      )}

      {showBook && <InstructionsBook pages={WEBFORGE_PAGES} onClose={() => setShowBook(false)} />}
    </div>
  );
}
