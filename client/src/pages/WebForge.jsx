import { useState, useRef, useCallback, useEffect } from 'react';
import Split from 'split.js';
import { ForgeCanvas } from '../components/webforge/ForgeCanvas';
import { AiPanel } from '../components/webforge/AiPanel';
import { BottomPanel } from '../components/webforge/BottomPanel';
import { FormBuilderModal } from '../components/webforge/FormBuilderModal';
import {
  makeText, makeImagePlaceholder, makeButton, makeForm, makeNav,
  makeComponentPlaceholder, FRAME_TYPES, FRAME_COLORS, COMPONENT_KINDS,
} from '../components/webforge/tools';
import { analyzeCanvas } from '../engine/sketchAnalyzer';
import { useWebforge } from '../hooks/useWebforge';

const TOOLS = [
  { id: 'SELECT', icon: '⬚', label: 'Select (V) — click/move/resize' },
  { id: 'FRAME', icon: '▭', label: 'Frame (F) — drag a layout block' },
  { id: 'TEXT', icon: 'T', label: 'Text (T) — click to place' },
  { id: 'IMAGE', icon: '🖼', label: 'Image placeholder (I)' },
  { id: 'BUTTON', icon: '⏺', label: 'Button (B)' },
  { id: 'FORM', icon: '📝', label: 'Form — open Form Builder' },
  { id: 'NAV', icon: '☰', label: 'Navbar' },
  { id: 'COMPONENT', icon: '◈', label: 'Component library' },
  { id: 'DRAW', icon: '✏', label: 'Free draw — AI ще познае какво е' },
];

const AUTO_ANALYZE_DEBOUNCE = 2000;
const AUTO_ANALYZE_MIN_INTERVAL = 10000;

export function WebForge({ navigate }) {
  const [projectName, setProjectName] = useState('My Website');
  const [editingName, setEditingName] = useState(false);
  const [tool, setTool] = useState('SELECT');
  const toolRef = useRef({ tool: 'SELECT' });
  toolRef.current = { tool };

  const canvasApiRef = useRef(null);
  const [selected, setSelected] = useState(null);
  const [selectedTick, setSelectedTick] = useState(0); // re-render при промяна на props

  // AI състояние
  const [components, setComponents] = useState([]);
  const [summary, setSummary] = useState('');
  const [chatMessages, setChatMessages] = useState([]);
  const [chatBusy, setChatBusy] = useState(false);

  // Проект/файлове
  const [projectId, setProjectId] = useState(null);
  const [files, setFiles] = useState([]);
  const [hasBackend, setHasBackend] = useState(false);

  // Deploy
  const [dockerAvailable, setDockerAvailable] = useState(false);
  const [deployment, setDeployment] = useState(null);
  const [deployBusy, setDeployBusy] = useState(false);

  const [showFormBuilder, setShowFormBuilder] = useState(false);
  const [framePopover, setFramePopover] = useState(null); // {rect, x, y}
  const [toast, setToast] = useState(null);

  const wf = useWebforge();

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3500);
  };

  // ── Split.js: горна зона / долен панел
  const topPaneRef = useRef(null);
  const bottomPaneRef = useRef(null);
  useEffect(() => {
    if (!topPaneRef.current || !bottomPaneRef.current) return;
    const split = Split([topPaneRef.current, bottomPaneRef.current], {
      direction: 'vertical',
      sizes: [60, 40],
      minSize: [200, 120],
      gutterSize: 6,
    });
    return () => split.destroy();
  }, []);

  // ── Docker status при mount
  useEffect(() => {
    wf.dockerStatus().then(setDockerAvailable);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    try {
      const payload = analyzeCanvas(canvas);
      const result = await wf.analyze(payload);
      setComponents(result.components || []);
      setSummary(result.summary || '');
    } catch (e) {
      showToast('Analysis failed — ' + e.message);
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

  useEffect(() => () => clearTimeout(analyzeTimer.current), []);

  // ── Canvas api ready
  const handleCanvasReady = useCallback((api) => {
    canvasApiRef.current = api;
  }, []);

  // ── Инструменти: click-to-place
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
      case 'FORM':
        setShowFormBuilder(true);
        setTool('SELECT');
        return;
      case 'COMPONENT': {
        const kind = window.prompt(`Component:\n${COMPONENT_KINDS.join(', ')}`, 'Table');
        if (kind && COMPONENT_KINDS.some((k) => k.toLowerCase() === kind.toLowerCase())) {
          placeAtCenter((x, y) => makeComponentPlaceholder(x, y, kind));
        }
        return;
      }
      default:
        setTool(id);
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
      });
      canvasApiRef.current?.getCanvas()?.renderAll();
    }
    setFramePopover(null);
    setTool('SELECT');
    scheduleAutoAnalyze();
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
      });
    } else {
      obj.set(patch);
    }
    canvas.renderAll();
    setSelectedTick((t) => t + 1);
  };

  // ── Генерация
  const handleGenerate = async () => {
    const canvas = canvasApiRef.current?.getCanvas();
    if (!canvas || canvas.getObjects().length === 0) {
      showToast('Нарисувай layout първо');
      return;
    }
    try {
      const payload = analyzeCanvas(canvas);
      const result = await wf.generate({
        projectId,
        projectName,
        objects: payload.objects,
        components,
        image: payload.image,
      });
      setProjectId(result.projectId);
      setFiles(result.files);
      setHasBackend(result.hasBackend);
      setDeployment(null);
      showToast('✓ Сайтът е генериран — виж Preview долу');
    } catch (e) {
      showToast('Generation failed — ' + e.message);
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

  // ── Monaco редакции
  const handleFileChange = (path, content) => {
    setFiles((prev) => prev.map((f) => (f.path === path ? { ...f, content } : f)));
  };

  // ── Deploy
  const handleDeployDocker = async () => {
    setDeployBusy(true);
    try {
      await wf.save({ projectId, files }); // включи ръчните редакции
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

      {/* ── SPLIT: горна работна зона / долен панел ── */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <div ref={topPaneRef} className="flex overflow-hidden">
          {/* TOOLBAR */}
          <aside className="w-[60px] shrink-0 border-r border-ink-line bg-ink-soft/50 flex flex-col items-center py-2 gap-1 overflow-y-auto">
            {TOOLS.map((t) => (
              <button
                key={t.id}
                onClick={() => handleToolClick(t.id)}
                title={t.label}
                className={`w-11 h-11 rounded-lg flex items-center justify-center text-base transition ${
                  tool === t.id
                    ? 'bg-accent-violet/25 border border-accent-violet text-white'
                    : 'text-gray-400 hover:bg-ink-line/50 hover:text-white border border-transparent'
                }`}
              >
                {t.icon}
              </button>
            ))}
            <div className="w-8 border-t border-ink-line my-1" />
            <button
              onClick={() => canvasApiRef.current?.undo()}
              title="Undo"
              className="w-11 h-9 rounded-lg text-gray-400 hover:text-white hover:bg-ink-line/50 transition text-sm"
            >
              ↶
            </button>
            <button
              onClick={() => canvasApiRef.current?.redo()}
              title="Redo"
              className="w-11 h-9 rounded-lg text-gray-400 hover:text-white hover:bg-ink-line/50 transition text-sm"
            >
              ↷
            </button>
            <button
              onClick={() => canvasApiRef.current?.clear()}
              title="Clear canvas"
              className="w-11 h-9 rounded-lg text-gray-400 hover:text-red-400 hover:bg-ink-line/50 transition text-sm"
            >
              🗑
            </button>
          </aside>

          {/* CANVAS */}
          <div className="flex-1 relative overflow-hidden">
            <ForgeCanvas
              toolRef={toolRef}
              onReady={handleCanvasReady}
              onSelection={setSelected}
              onObjectsChanged={scheduleAutoAnalyze}
              onFrameCreated={handleFrameCreated}
            />
          </div>

          {/* AI PANEL */}
          <AiPanel
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

        {/* BOTTOM PANEL */}
        <div ref={bottomPaneRef} className="overflow-hidden">
          <BottomPanel
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
          />
        </div>
      </div>

      {/* ── Frame type popover ── */}
      {framePopover && (
        <div
          className="fixed z-40 rounded-xl bg-ink-soft border border-ink-line shadow-xl p-2 animate-fade-in"
          style={{
            left: Math.min(framePopover.x, window.innerWidth - 180),
            top: Math.min(framePopover.y, window.innerHeight - 260),
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
              {t === 'auto' ? 'Auto-detect' : t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>
      )}

      {/* ── Form Builder ── */}
      {showFormBuilder && (
        <FormBuilderModal
          onCreate={(fields) => {
            setShowFormBuilder(false);
            const api = canvasApiRef.current;
            const canvas = api?.getCanvas();
            if (canvas) {
              api.addObject(makeForm(canvas.width / 2 - 160, canvas.height / 2 - 120, fields));
            }
          }}
          onCancel={() => setShowFormBuilder(false)}
        />
      )}

      {toast && (
        <div className="fixed top-14 left-1/2 -translate-x-1/2 z-50 rounded-full bg-ink-soft border border-ink-line px-5 py-2 text-sm text-white backdrop-blur animate-fade-in">
          {toast}
        </div>
      )}
    </div>
  );
}
