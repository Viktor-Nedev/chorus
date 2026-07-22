import { useState, useRef, useCallback, useEffect } from 'react';
import { SculptCanvas } from '../components/sculpt/SculptCanvas';
import { ScenePanel } from '../components/sculpt/ScenePanel';
import { ProfileModal } from '../components/sculpt/ProfileModal';
import { ViewportHud } from '../components/sculpt/ViewportHud';
import { VideoProcessor } from '../components/VideoProcessor';
import { SaveModal } from '../components/SaveModal';
import { PRIMITIVE_LIST } from '../engine/sculpt/drawTools';
import { DEFAULT_TERRAIN_PARAMS } from '../engine/sculpt/terrain';
import { EXPORT_FORMATS, exportScene, bakeGroupForExport, downloadBlob } from '../engine/sculpt/exporters';
import { useArtworkStore } from '../hooks/useArtworkStore';
import { useAudio } from '../hooks/useAudio';
import { useMediaPipe } from '../hooks/useMediaPipe';
import { useRecorder } from '../hooks/useRecorder';
import { MobileNotice } from '../components/MobileNotice';

const TOOLS = [
  { id: 'select', icon: '⬚', label: 'Select / transform (G move · R rotate · S scale)' },
  { id: 'add', icon: '✚', label: 'Add primitive' },
  { id: 'pen', icon: '✒', label: '3D Pen — drag to draw a tube in space' },
  { id: 'lathe', icon: '🏺', label: 'Lathe — draw a profile, revolve it into a 3D body' },
  { id: 'extrude', icon: '⬒', label: 'Extrude — draw a shape, pull it into a solid' },
  { id: 'sculpt', icon: '⛰', label: 'Terrain sculpt — raise / lower / smooth / flatten' },
  { id: 'scatter', icon: '🌲', label: 'Scatter — paint trees, rocks and grass' },
];

const STORAGE_KEY = 'sculpt-project';

export function Sculpt({ navigate, artworkToEdit, onArtworkConsumed }) {
  const engineRef = useRef(null);
  const [projectName, setProjectName] = useState('Untitled Sculpt');
  const [editingName, setEditingName] = useState(false);
  const [tool, setTool] = useState('select');
  const [objects, setObjects] = useState([]);
  const [selection, setSelection] = useState(null);
  const [hasTerrain, setHasTerrain] = useState(false);
  const [terrainParams, setTerrainParams] = useState(DEFAULT_TERRAIN_PARAMS);
  const [brush, setBrush] = useState({ mode: 'raise', radius: 3, strength: 1.2 });
  const [scatterOpts, setScatterOpts] = useState({ kind: 'tree', radius: 2, density: 3, erase: false });
  const [env, setEnv] = useState({ preset: 'studio', elevation: 50, azimuth: 35, water: false, grid: true, turntable: false });
  const [penOpts, setPenOpts] = useState({ radius: 0.12, surface: 'ground' });

  const [addOpen, setAddOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [profileMode, setProfileMode] = useState(null); // 'lathe' | 'extrude'
  const [showSave, setShowSave] = useState(false);
  const [toast, setToast] = useState(null);

  // ── Blender-подобни viewport контроли
  const [transformMode, setTransformMode] = useState('translate');
  const [transformSpace, setTransformSpace] = useState('world');
  const [snap, setSnap] = useState(false);
  const [renderMode, setRenderMode] = useState('solid');
  const [ortho, setOrtho] = useState(false);
  const [stats, setStats] = useState(null);

  // ── Live (audio + emotion) performance
  const [liveOn, setLiveOn] = useState(false);
  const [liveIntensity, setLiveIntensity] = useState(1);
  const videoRef = useRef(null);

  const { saveArtwork, uploadVideo, saving } = useArtworkStore();
  const { initAudio, stopAudio, getAudioData } = useAudio();
  const { emotion, emotionRef, detect } = useMediaPipe(videoRef, liveOn);
  const recorder = useRecorder(() => engineRef.current?.renderer?.domElement);

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3200);
  };

  // ── Sync от engine-а към панелите
  const syncScene = useCallback(() => {
    const e = engineRef.current;
    if (!e) return;
    setObjects(e.getObjectList());
    setHasTerrain(!!e.terrain);
    if (e.terrain) setTerrainParams({ ...e.terrain.userData.params });
    setEnv({ ...e.env });
    setStats(e.getStats());
  }, []);

  // ── Autosave (localStorage) на всеки 4s
  useEffect(() => {
    const id = setInterval(() => {
      const e = engineRef.current;
      if (!e || e.live) return; // при Live обектите са в performGroup — не сериализирай
      try {
        localStorage.setItem(
          STORAGE_KEY,
          JSON.stringify({ projectName, scene: e.serialize(), savedAt: Date.now() })
        );
      } catch { /* quota */ }
    }, 4000);
    return () => clearInterval(id);
  }, [projectName]);

  const handleReady = useCallback((engine) => {
    engineRef.current = engine;
    // Приоритет: артуърк от галерията → localStorage
    if (artworkToEdit?.sceneJson) {
      engine.loadScene(artworkToEdit.sceneJson);
      setProjectName(artworkToEdit.title || 'Untitled Sculpt');
      onArtworkConsumed?.();
    } else {
      try {
        const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
        if (saved?.scene) {
          engine.loadScene(saved.scene);
          setProjectName(saved.projectName || 'Untitled Sculpt');
        }
      } catch { /* игнорирай повреден запис */ }
    }
    syncScene();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Инструменти
  const handleTool = (id) => {
    const e = engineRef.current;
    if (!e) return;
    setAddOpen(false);
    if (id === 'add') {
      setAddOpen((o) => !o);
      return;
    }
    if (id === 'lathe' || id === 'extrude') {
      setProfileMode(id);
      return;
    }
    if (id === 'sculpt' && !e.terrain) {
      e.addTerrain(terrainParams);
      showToast('Terrain generated — sculpt away');
    }
    setTool(id);
    e.setTool(id === 'pen' || id === 'sculpt' || id === 'scatter' ? id : 'select');
    if (id === 'pen') e.penOptions = { ...e.penOptions, ...penOpts };
  };

  const handleAddPrimitive = (prim) => {
    setAddOpen(false);
    engineRef.current?.addPrimitive(prim);
    setTool('select');
  };

  const handleProfileConfirm = ({ points, opts }) => {
    const e = engineRef.current;
    if (profileMode === 'lathe') e?.addLathe(points);
    else e?.addExtrude(points, opts);
    setProfileMode(null);
    setTool('select');
  };

  // ── Export
  const handleExport = async (format) => {
    setExportOpen(false);
    const e = engineRef.current;
    if (!e) return;
    if (e.objects.length === 0 && !e.terrain) {
      showToast('Nothing to export — create something first');
      return;
    }
    try {
      const name = projectName.replace(/[^a-z0-9-_ ]/gi, '').trim().replace(/\s+/g, '-').toLowerCase() || 'chorus-sculpt';
      if (format === 'png') {
        const dataURL = e.snapshotPng(2);
        const blob = await (await fetch(dataURL)).blob();
        downloadBlob(blob, `${name}.png`);
      } else {
        const group = bakeGroupForExport(e.objects, e.terrain, e.scatterMeshes);
        await exportScene(group, format, name);
      }
      showToast(`✓ Exported ${format.toUpperCase()}`);
    } catch (err) {
      console.error(err);
      showToast('Export failed — ' + err.message);
    }
  };

  // ── Save to gallery
  const handleSave = async ({ title, author, description }) => {
    const e = engineRef.current;
    if (!e) return;
    try {
      await saveArtwork({
        title,
        author,
        description,
        imageData: e.snapshotPng(1.5),
        sceneJson: e.serialize(),
        mode: 'sculpt',
      });
      setShowSave(false);
      setProjectName(title);
      showToast('✓ Saved to gallery');
    } catch {
      showToast('Save failed — is the server running?');
    }
  };

  const handleNew = () => {
    if (!window.confirm('Start fresh? The current scene will be cleared.')) return;
    engineRef.current?.clearAll();
    setProjectName('Untitled Sculpt');
    localStorage.removeItem(STORAGE_KEY);
    syncScene();
  };

  // ── Viewport controls
  const handleTransformMode = (m) => { setTransformMode(m); engineRef.current?.setTransformMode(m); };
  const handleTransformSpace = (s) => { setTransformSpace(s); engineRef.current?.setTransformSpace(s); };
  const handleSnap = (v) => { setSnap(v); engineRef.current?.setSnapping(v); };
  const handleRenderMode = (m) => { setRenderMode(m); engineRef.current?.setRenderMode(m); };
  const handleView = (v) => engineRef.current?.setView(v);
  const handleFrameAll = () => engineRef.current?.frameAll();
  const handleToggleOrtho = () => setOrtho(!!engineRef.current?.toggleOrtho());

  useEffect(() => {
    if (engineRef.current) engineRef.current.liveIntensity = liveIntensity;
  }, [liveIntensity]);

  // ── Live (audio + emotion) performance
  const toggleLive = async () => {
    const e = engineRef.current;
    if (!e) return;
    if (liveOn) {
      if (recorder.recording) recorder.stop();
      e.setLive(false);
      stopAudio();
      setLiveOn(false);
      showToast('Live off');
    } else {
      try {
        await initAudio();
      } catch {
        showToast('Microphone denied — Live needs the mic');
        return;
      }
      e.audioGetter = getAudioData;
      e.emotionGetter = () => emotionRef.current;
      e.liveIntensity = liveIntensity;
      e.setLive(true);
      setRenderMode('rendered');
      setLiveOn(true);
      showToast('🔴 Live — move to sound, palette follows your emotion');
    }
  };

  const handleSaveClip = async () => {
    if (!recorder.result) return;
    try {
      const { url } = await uploadVideo(recorder.result.blob);
      await saveArtwork({
        title: `${projectName} — live`,
        imageData: engineRef.current?.snapshotPng(1.2),
        videoUrl: url,
        duration: Math.round(recorder.elapsed || 0),
        mode: 'sculpt',
      });
      recorder.clearResult();
      showToast('✓ Live clip saved to gallery');
    } catch {
      showToast('Save failed — is the server running?');
    }
  };

  // ── Изход: спри микрофона (камерата спира с unmount на VideoProcessor)
  useEffect(() => () => stopAudio(), [stopAudio]);

  return (
    <div className="h-full w-full bg-ink flex flex-col overflow-hidden">
      <MobileNotice label="The 3D sculpt editor needs a mouse and a larger screen" />
      {/* ── HEADER ── */}
      <header className="h-12 shrink-0 flex items-center gap-3 px-4 border-b border-ink-line bg-ink-soft/50">
        <button onClick={() => navigate('landing')} className="text-sm text-gray-400 hover:text-white transition">
          ← Back
        </button>
        <span className="font-display font-extrabold text-sm text-white tracking-[0.2em]">SCULPT</span>
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
          <button onClick={() => setEditingName(true)} className="text-xs text-gray-400 hover:text-white transition" title="Click to rename">
            {projectName} ✏
          </button>
        )}

        <div className="ml-auto flex items-center gap-2">
          <button onClick={() => engineRef.current?.undo()} title="Undo (Ctrl+Z)" className="w-8 h-8 rounded-lg text-gray-400 hover:text-white hover:bg-ink-line/50 transition text-sm">↶</button>
          <button onClick={() => engineRef.current?.redo()} title="Redo (Ctrl+Y)" className="w-8 h-8 rounded-lg text-gray-400 hover:text-white hover:bg-ink-line/50 transition text-sm">↷</button>
          <button onClick={handleNew} className="rounded-lg border border-ink-line px-3 h-8 text-xs text-gray-400 hover:text-white hover:bg-ink-line/40 transition">
            + New
          </button>

          {/* Export dropdown */}
          <div className="relative">
            <button
              onClick={() => setExportOpen((o) => !o)}
              className="rounded-lg border border-accent-cyan/50 bg-accent-cyan/10 px-3 h-8 text-xs text-accent-cyan hover:bg-accent-cyan/20 transition"
            >
              ⬇ Export
            </button>
            {exportOpen && (
              <div className="absolute right-0 top-10 z-40 w-64 rounded-xl bg-ink-soft border border-ink-line shadow-xl p-1.5 animate-fade-in">
                {EXPORT_FORMATS.map((f) => (
                  <button
                    key={f.id}
                    onClick={() => handleExport(f.id)}
                    className="block w-full text-left px-3 py-2 rounded-lg hover:bg-ink-line/50 transition"
                  >
                    <span className="text-xs text-white">{f.label}</span>
                    <span className="block text-[10px] text-gray-500">{f.hint}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <button
            onClick={toggleLive}
            title="Live — the sculpture reacts to sound and your emotion; record it"
            className={`rounded-lg px-3 h-8 text-xs font-bold transition border ${
              liveOn
                ? 'border-red-500 bg-red-600/25 text-red-200'
                : 'border-accent-cyan/50 bg-accent-cyan/10 text-accent-cyan hover:bg-accent-cyan/20'
            }`}
          >
            {liveOn ? '🔴 Live' : '◉ Live'}
          </button>

          <button
            onClick={() => setShowSave(true)}
            disabled={liveOn}
            className="rounded-lg bg-accent-violet/80 px-4 h-8 text-xs font-bold text-ink hover:bg-accent-violet disabled:opacity-40 transition"
          >
            💾 Save to Gallery
          </button>
        </div>
      </header>

      <VideoProcessor ref={videoRef} detect={detect} active={liveOn} />

      {/* ── BODY ── */}
      <div className="flex-1 flex overflow-hidden">
        {/* TOOLBAR */}
        <aside className="w-[56px] shrink-0 border-r border-ink-line bg-ink-soft/50 flex flex-col items-center py-2 gap-1">
          {TOOLS.map((t) => (
            <button
              key={t.id}
              onClick={() => handleTool(t.id)}
              title={t.label}
              className={`w-10 h-10 rounded-lg flex items-center justify-center text-base transition border ${
                tool === t.id || (t.id === 'add' && addOpen)
                  ? 'bg-accent-violet/25 border-accent-violet text-white'
                  : 'text-gray-400 hover:bg-ink-line/50 hover:text-white border-transparent'
              }`}
            >
              {t.icon}
            </button>
          ))}
        </aside>

        {/* VIEWPORT */}
        <div className="flex-1 relative overflow-hidden">
          <SculptCanvas
            onReady={handleReady}
            onSelectionChanged={setSelection}
            onSceneChanged={syncScene}
            onToolDone={() => {}}
          />

          <ViewportHud
            transformMode={transformMode}
            transformSpace={transformSpace}
            snap={snap}
            onMode={handleTransformMode}
            onSpace={handleTransformSpace}
            onSnap={handleSnap}
            renderMode={renderMode}
            onRenderMode={handleRenderMode}
            ortho={ortho}
            onView={handleView}
            onFrameAll={handleFrameAll}
            onToggleOrtho={handleToggleOrtho}
            stats={stats}
            liveOn={liveOn}
            onToggleLive={toggleLive}
            liveIntensity={liveIntensity}
            onIntensity={setLiveIntensity}
            emotion={emotion}
            recorder={recorder}
            onSaveClip={handleSaveClip}
            onDiscardClip={recorder.clearResult}
          />

          {/* Add primitive popover */}
          {addOpen && (
            <div className="absolute left-2 top-12 z-40 rounded-xl bg-ink-soft border border-ink-line shadow-xl p-2 animate-fade-in grid grid-cols-2 gap-1 w-56">
              {PRIMITIVE_LIST.map((p) => (
                <button
                  key={p.id}
                  onClick={() => handleAddPrimitive(p.id)}
                  className="flex items-center gap-2 px-2.5 py-2 rounded-lg text-xs text-gray-300 hover:bg-ink-line/50 hover:text-white transition"
                >
                  <span className="text-sm">{p.icon}</span> {p.label}
                </button>
              ))}
            </div>
          )}

          {/* Pen options */}
          {tool === 'pen' && (
            <div className="absolute left-2 bottom-2 z-30 rounded-xl bg-ink-soft border border-ink-line shadow-xl p-3 w-52 animate-fade-in space-y-2">
              <div className="text-[10px] uppercase tracking-[0.15em] text-gray-500">3D Pen</div>
              <label className="block text-[10px] text-gray-500">
                <span className="flex justify-between mb-0.5">
                  <span>Thickness</span>
                  <span>{penOpts.radius.toFixed(2)}</span>
                </span>
                <input
                  type="range" min={0.03} max={0.5} step={0.01} value={penOpts.radius}
                  onChange={(e) => {
                    const radius = Number(e.target.value);
                    setPenOpts((o) => ({ ...o, radius }));
                    if (engineRef.current) engineRef.current.penOptions.radius = radius;
                  }}
                  className="w-full accent-accent-violet h-1"
                />
              </label>
              <div className="flex gap-1.5">
                {['ground', 'view'].map((s) => (
                  <button
                    key={s}
                    onClick={() => {
                      setPenOpts((o) => ({ ...o, surface: s }));
                      if (engineRef.current) engineRef.current.penOptions.surface = s;
                    }}
                    className={`flex-1 rounded py-1.5 text-[11px] capitalize transition border ${
                      penOpts.surface === s
                        ? 'bg-accent-violet/25 border-accent-violet text-white'
                        : 'border-ink-line text-gray-400 hover:text-white'
                    }`}
                  >
                    {s === 'ground' ? '⬇ Ground' : '👁 In air'}
                  </button>
                ))}
              </div>
              <p className="text-[10px] text-gray-600">
                Drag in the viewport to draw. "In air" draws on a plane facing the camera.
              </p>
            </div>
          )}
        </div>

        {/* SCENE PANEL */}
        <ScenePanel
          objects={objects}
          selection={selection}
          tool={tool}
          onSelectObject={(id) => engineRef.current?.selectById(id)}
          onToggleVisible={(id, v) => engineRef.current?.setObjectVisible(id, v)}
          onRename={(id, name) => engineRef.current?.renameObject(id, name)}
          onDelete={() => engineRef.current?.deleteSelected()}
          onDuplicate={() => engineRef.current?.duplicateSelected()}
          onTransformChange={(patch) => {
            engineRef.current?.updateSelectedTransform(patch);
            setSelection(engineRef.current?.getSelectedInfo());
          }}
          onMaterialChange={(patch) => {
            engineRef.current?.updateSelectedMaterial(patch);
            setSelection(engineRef.current?.getSelectedInfo());
          }}
          hasTerrain={hasTerrain}
          terrainParams={terrainParams}
          onAddTerrain={() => engineRef.current?.addTerrain(terrainParams)}
          onRemoveTerrain={() => engineRef.current?.removeTerrain()}
          onTerrainParam={(patch) => {
            setTerrainParams((p) => ({ ...p, ...patch }));
            engineRef.current?.updateTerrain(patch);
          }}
          brush={brush}
          onBrushChange={(patch) => {
            setBrush((b) => {
              const next = { ...b, ...patch };
              if (engineRef.current) engineRef.current.brush = next;
              return next;
            });
          }}
          scatterOpts={scatterOpts}
          onScatterChange={(patch) => {
            setScatterOpts((s) => {
              const next = { ...s, ...patch };
              if (engineRef.current) engineRef.current.scatterOptions = next;
              return next;
            });
          }}
          env={env}
          onEnvChange={(patch) => {
            engineRef.current?.setEnv(patch);
            setEnv({ ...engineRef.current.env });
          }}
        />
      </div>

      {/* ── MODALS ── */}
      {profileMode && (
        <ProfileModal
          mode={profileMode}
          onConfirm={handleProfileConfirm}
          onCancel={() => setProfileMode(null)}
        />
      )}

      {showSave && (
        <SaveModal
          defaultTitle={projectName}
          mode="sculpt"
          saving={saving}
          onSave={handleSave}
          onCancel={() => setShowSave(false)}
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
