import { useState, useRef, useCallback, useEffect } from 'react';
import Split from 'split.js';
import { ForgeCanvas } from '../components/webforge/ForgeCanvas';
import { RightPanel } from '../components/webforge/RightPanel';
import { ForgeLoader } from '../components/webforge/ForgeLoader';
import {
  makeText, makeImagePlaceholder, makeButton, makeNav,
  makeComponentPlaceholder, FRAME_TYPES, FRAME_COLORS, COMPONENT_KINDS, CUSTOM_PROPS,
} from '../components/webforge/tools';
import { analyzeCanvas, serializeObjects } from '../engine/sketchAnalyzer';
import { buildWireframeHtml } from '../engine/wireframePreview';
import { useWebforge } from '../hooks/useWebforge';

const TOOLS = [
  { id: 'SELECT', icon: '⬚', label: 'Select (V) — click/move/resize · Del трие' },
  { id: 'FRAME', icon: '▭', label: 'Frame (F) — drag блок; типът (вкл. Form/Backend) се избира след пускане' },
  { id: 'TEXT', icon: 'T', label: 'Text (T) — двоен клик за редакция' },
  { id: 'IMAGE', icon: '🖼', label: 'Image placeholder (I)' },
  { id: 'BUTTON', icon: '⏺', label: 'Button (B)' },
  { id: 'NAV', icon: '☰', label: 'Navbar' },
  { id: 'COMPONENT', icon: '◈', label: 'Component library' },
  { id: 'DRAW', icon: '✏', label: 'Free draw — четка/цвят от бутоните долу' },
];

const SWATCHES = [
  '#F5F5F5', '#8B7BFA', '#67E8F9', '#3DDC97', '#FFD27F', '#FF8FC7',
  '#FF5555', '#FF8A3D', '#4A9EFF', '#D9D9D9', '#8a8a92', '#1a1a24',
];

const BRUSH_TYPES = [
  { id: 'pencil', label: '✏ Молив', hint: 'тънка прецизна линия' },
  { id: 'marker', label: '🖊 Маркер', hint: 'мек плътен щрих' },
  { id: 'spray', label: '💨 Спрей', hint: 'разпръснати точки' },
];

const STYLE_PRESETS = ['Minimal', 'Corporate', 'Playful', 'Dark', 'Glassmorphism', 'Brutalist'];

const AUTO_ANALYZE_DEBOUNCE = 2000;
const AUTO_ANALYZE_MIN_INTERVAL = 10000;
const STORAGE_KEY = 'webforge-project';

export function WebForge({ navigate }) {
  const [projectName, setProjectName] = useState('My Website');
  const [editingName, setEditingName] = useState(false);
  const [stylePreset, setStylePreset] = useState('Minimal');
  const [tool, setTool] = useState('SELECT');
  const toolRef = useRef({ tool: 'SELECT' });
  toolRef.current = { tool };

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
  const [brushType, setBrushType] = useState('pencil');
  const [brushWidth, setBrushWidth] = useState(3);
  const [brushColor, setBrushColor] = useState('#F5F5F5');
  const [showBrushPopover, setShowBrushPopover] = useState(false);
  const [showColorPopover, setShowColorPopover] = useState(false);
  const [showComponentPopover, setShowComponentPopover] = useState(false);

  const [framePopover, setFramePopover] = useState(null); // {rect, x, y}
  const [toast, setToast] = useState(null);
  const [errorBanner, setErrorBanner] = useState(null); // {msg, retry}

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
  const rebuildWireframe = useCallback(() => {
    clearTimeout(wireframeTimer.current);
    wireframeTimer.current = setTimeout(() => {
      const canvas = canvasApiRef.current?.getCanvas();
      if (!canvas) return;
      const objects = serializeObjects(canvas);
      setWireframeHtml(
        objects.length
          ? buildWireframeHtml(objects, { width: canvas.width, height: canvas.height })
          : null
      );
    }, 300);
  }, []);

  // ── Персистенция в localStorage (възстановява се при връщане в режима)
  const persistTimer = useRef(null);
  const persistState = useRef({});
  persistState.current = { projectName, projectId, files, hasBackend, components, summary, stylePreset };
  const schedulePersist = useCallback(() => {
    clearTimeout(persistTimer.current);
    persistTimer.current = setTimeout(() => {
      const canvas = canvasApiRef.current?.getCanvas();
      if (!canvas) return;
      try {
        localStorage.setItem(
          STORAGE_KEY,
          JSON.stringify({
            canvasJson: canvas.toJSON(CUSTOM_PROPS),
            ...persistState.current,
            savedAt: Date.now(),
          })
        );
      } catch {
        /* quota — пропусни */
      }
    }, 1000);
  }, []);

  useEffect(() => {
    schedulePersist();
  }, [projectName, projectId, files, hasBackend, components, stylePreset, schedulePersist]);

  // ── Анализ (ръчен + автоматичен)
  const lastAnalyzeAt = useRef(0);
  const analyzeTimer = useRef(null);

  const runAnalyze = useCallback(async () => {
    const canvas = canvasApiRef.current?.getCanvas();
    if (!canvas || canvas.getObjects().length === 0) {
      showToast('Нарисувай нещо първо');
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
      setErrorBanner({
        msg: 'Анализът се провали (' + e.message + '). Gemini може да е претоварен в момента.',
        retry: 'analyze',
      });
    }
  }, [wf]);

  const scheduleAutoAnalyze = useCallback(() => {
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
        if (saved.canvasJson?.objects?.length) {
          // Не пускай auto-analyze веднага след restore — компонентите са запазени
          lastAnalyzeAt.current = Date.now();
          api.loadJSON(saved.canvasJson);
        }
      }
    } catch {
      /* повреден запис — игнорирай */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── New project
  const handleNewProject = () => {
    if (!window.confirm('Ново начало? Текущият проект ще бъде изчистен.')) return;
    canvasApiRef.current?.clear();
    setProjectName('My Website');
    setProjectId(null);
    setFiles([]);
    setHasBackend(false);
    setComponents([]);
    setSummary('');
    setChatMessages([]);
    setDeployment(null);
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
    const api = canvasApiRef.current;
    api?.setDrawingMode(id === 'DRAW');
    if (id === 'DRAW') {
      api?.setBrush({ type: brushType, color: brushColor, width: brushWidth });
      setShowBrushPopover(true);
    } else {
      setShowBrushPopover(false);
    }
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
      default:
        setTool(id);
    }
  };

  // Промяна на четката → приложи веднага
  useEffect(() => {
    canvasApiRef.current?.setBrush({ type: brushType, color: brushColor, width: brushWidth });
  }, [brushType, brushColor, brushWidth]);

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
      showToast('Нарисувай layout първо');
      return;
    }
    setErrorBanner(null);
    try {
      const payload = analyzeCanvas(canvas);
      const result = await wf.generate({
        projectId,
        projectName,
        objects: payload.objects,
        components,
        image: payload.image,
        stylePreset,
      });
      setProjectId(result.projectId);
      setFiles(result.files);
      setHasBackend(result.hasBackend);
      setDeployment(null);
      showToast('✓ Сайтът е генериран');
    } catch (e) {
      setErrorBanner({
        msg: 'Генерацията се провали (' + e.message + '). Опитай пак — Gemini понякога е претоварен.',
        retry: 'generate',
      });
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
      setChatMessages((m) => [...m, { role: 'ai', text: 'Грешка: ' + e.message }]);
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
    showToast('✓ Промените са приложени');
  };

  const handleFileChange = (path, content) => {
    setFiles((prev) => prev.map((f) => (f.path === path ? { ...f, content } : f)));
  };

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
        showToast('Docker Desktop не е стартиран');
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

  const handleDownload = async () => {
    try {
      await wf.save({ projectId, files });
      window.open(wf.downloadUrl(projectId), '_blank');
    } catch (e) {
      showToast('Download failed — ' + e.message);
    }
  };

  return (
    <div className="h-full w-full bg-ink flex flex-col overflow-hidden">
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
          <select
            value={stylePreset}
            onChange={(e) => setStylePreset(e.target.value)}
            title="Визуален стил на генерирания сайт"
            className="h-8 rounded-lg bg-ink border border-ink-line px-2 text-xs text-gray-300 focus:outline-none focus:border-accent-violet"
          >
            {STYLE_PRESETS.map((s) => (
              <option key={s} value={s}>🎨 {s}</option>
            ))}
          </select>
          <button
            onClick={handleNewProject}
            title="Ново начало — чисто платно"
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
            ↻ Опитай пак
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
          <aside className="w-[56px] shrink-0 border-r border-ink-line bg-ink-soft/50 flex flex-col items-center py-2 gap-1 overflow-y-auto">
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
              title="Цвят — за четката и селектирания обект"
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
                setShowBrushPopover((s) => !s);
                setShowColorPopover(false);
              }}
              title="Четка — тип и дебелина"
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

          <div className="flex-1 relative overflow-hidden">
            <ForgeCanvas
              toolRef={toolRef}
              onReady={handleCanvasReady}
              onSelection={setSelected}
              onObjectsChanged={handleObjectsChanged}
              onFrameCreated={handleFrameCreated}
            />

            {/* Color popover */}
            {showColorPopover && (
              <div className="absolute left-2 top-2 z-30 rounded-xl bg-ink-soft border border-ink-line shadow-xl p-3 animate-fade-in">
                <div className="text-[10px] uppercase tracking-[0.15em] text-gray-500 pb-2">Цвят</div>
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
              <div className="absolute left-2 top-2 z-30 rounded-xl bg-ink-soft border border-ink-line shadow-xl p-3 w-52 animate-fade-in">
                <div className="text-[10px] uppercase tracking-[0.15em] text-gray-500 pb-2">Четка</div>
                {BRUSH_TYPES.map((b) => (
                  <button
                    key={b.id}
                    onClick={() => setBrushType(b.id)}
                    className={`block w-full text-left px-2.5 py-1.5 text-xs rounded-lg transition mb-1 ${
                      brushType === b.id
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
                    <span>Дебелина</span>
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
              <div className="absolute left-2 top-2 z-30 rounded-xl bg-ink-soft border border-ink-line shadow-xl p-2 animate-fade-in max-h-72 overflow-y-auto">
                <div className="text-[10px] uppercase tracking-[0.15em] text-gray-500 px-2 pb-1.5">
                  Компонент
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
            components={components}
            summary={summary}
            analyzing={wf.analyzing}
            onAnalyze={runAnalyze}
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
                  ? 'Form (полетата рисуваш вътре)'
                  : t === 'backend'
                    ? '⚡ Backend zone'
                    : t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>
      )}

      {/* ── Particle loader при генерация ── */}
      {wf.generating && <ForgeLoader projectName={projectName} />}

      {toast && (
        <div className="fixed top-14 left-1/2 -translate-x-1/2 z-50 rounded-full bg-ink-soft border border-ink-line px-5 py-2 text-sm text-white backdrop-blur animate-fade-in">
          {toast}
        </div>
      )}
    </div>
  );
}
