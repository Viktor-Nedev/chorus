import { EMOTION_CONFIGS } from '../../constants/emotions';

// Blender-подобни overlay HUD-ове върху 3D viewport-а: transform toolbar,
// render mode, view navigation, статистики и Live (audio+emotion) панел.
// Чист presentational компонент — цялото състояние идва през props.

const seg = 'flex items-center rounded-lg bg-ink-soft/85 border border-ink-line backdrop-blur overflow-hidden';
const btn = 'px-2.5 h-8 text-xs flex items-center justify-center gap-1 transition select-none';
const on = 'bg-accent-violet/25 text-white';
const off = 'text-gray-400 hover:text-white hover:bg-ink-line/50';

function Group({ children, className = '' }) {
  return <div className={`${seg} ${className}`}>{children}</div>;
}

export function ViewportHud({
  transformMode, transformSpace, snap, onMode, onSpace, onSnap,
  renderMode, onRenderMode,
  ortho, onView, onFrameAll, onToggleOrtho,
  stats,
  liveOn, onToggleLive, liveIntensity, onIntensity, emotion, recorder,
  onSaveClip, onDiscardClip,
}) {
  const liveLocked = liveOn; // при Live редакцията е спряна

  return (
    <>
      {/* ── Top-left: Transform ── */}
      {!liveLocked && (
        <div className="absolute left-2 top-2 z-30 flex gap-1.5 animate-fade-in">
          <Group>
            {[['translate', '↔', 'Move (G)'], ['rotate', '⟳', 'Rotate (R)'], ['scale', '⤢', 'Scale (S)']].map(([m, ic, t]) => (
              <button key={m} title={t} onClick={() => onMode(m)} className={`${btn} ${transformMode === m ? on : off}`}>{ic}</button>
            ))}
          </Group>
          <Group>
            <button
              title="Transform space (Local / World)"
              onClick={() => onSpace(transformSpace === 'local' ? 'world' : 'local')}
              className={`${btn} ${off} capitalize`}
            >
              {transformSpace}
            </button>
            <button title="Snap to grid / angle" onClick={() => onSnap(!snap)} className={`${btn} ${snap ? on : off}`}>
              ⊹ Snap
            </button>
          </Group>
        </div>
      )}

      {/* ── Top-center: Render mode ── */}
      <div className="absolute left-1/2 -translate-x-1/2 top-2 z-30 animate-fade-in">
        <Group>
          {[['solid', '◐ Solid'], ['rendered', '✦ Rendered'], ['wireframe', '△ Wire']].map(([m, label]) => (
            <button key={m} onClick={() => onRenderMode(m)} className={`${btn} ${renderMode === m ? on : off}`}>{label}</button>
          ))}
        </Group>
      </div>

      {/* ── Top-right: View navigation ── */}
      {!liveLocked && (
        <div className="absolute right-2 top-2 z-30 flex gap-1.5 animate-fade-in">
          <Group>
            {[['front', 'F'], ['right', 'R'], ['top', 'T'], ['persp', '◳']].map(([v, label]) => (
              <button key={v} title={`View ${v}`} onClick={() => onView(v)} className={`${btn} ${off}`}>{label}</button>
            ))}
          </Group>
          <Group>
            <button title="Frame all (Home)" onClick={onFrameAll} className={`${btn} ${off}`}>⌂</button>
            <button title="Orthographic / Perspective" onClick={onToggleOrtho} className={`${btn} ${ortho ? on : off}`}>◱</button>
          </Group>
        </div>
      )}

      {/* ── Bottom-right: Stats ── */}
      {stats && (
        <div className="absolute right-2 bottom-2 z-20 rounded-lg bg-ink-soft/80 border border-ink-line backdrop-blur px-3 py-1.5 text-[10px] text-gray-400 font-mono leading-relaxed pointer-events-none">
          <div>Objects <span className="text-gray-200">{stats.objects}</span></div>
          <div>Verts <span className="text-gray-200">{stats.vertices.toLocaleString()}</span></div>
          <div>Tris <span className="text-gray-200">{stats.triangles.toLocaleString()}</span></div>
          {stats.scatter > 0 && <div>Scatter <span className="text-gray-200">{stats.scatter}</span></div>}
        </div>
      )}

      {/* ── Bottom-center: Live panel ── */}
      {liveOn && (
        <div className="absolute left-1/2 -translate-x-1/2 bottom-3 z-30 w-[420px] max-w-[92vw] rounded-xl bg-ink-soft/90 border border-accent-cyan/40 backdrop-blur px-4 py-3 shadow-2xl animate-fade-in">
          <div className="flex items-center gap-2 mb-2">
            <span className="w-2 h-2 rounded-full bg-red-500 glow-pulse" />
            <span className="text-xs font-bold text-white tracking-wide">LIVE · reacting to sound & emotion</span>
            <span className="ml-auto flex items-center gap-1 text-[11px] text-gray-400">
              <span className="text-base leading-none">{(EMOTION_CONFIGS[emotion] || EMOTION_CONFIGS.neutral).emoji}</span>
              {(EMOTION_CONFIGS[emotion] || EMOTION_CONFIGS.neutral).label}
            </span>
          </div>

          <label className="flex items-center gap-2 text-[11px] text-gray-400 mb-2.5">
            <span className="w-16">Intensity</span>
            <input
              type="range" min={0.3} max={2} step={0.05} value={liveIntensity}
              onChange={(e) => onIntensity(Number(e.target.value))}
              className="flex-1 accent-accent-cyan h-1"
            />
            <span className="w-8 text-right text-gray-300">{liveIntensity.toFixed(2)}</span>
          </label>

          <div className="flex items-center gap-2">
            {!recorder.result ? (
              recorder.recording ? (
                <button onClick={recorder.stop} className="flex-1 rounded-lg bg-red-600/80 hover:bg-red-500 text-white text-xs py-2 transition">
                  ■ Stop · {Math.floor(recorder.elapsed)}s
                </button>
              ) : (
                <button
                  onClick={() => recorder.start({ withMic: true })}
                  disabled={!recorder.supported}
                  className="flex-1 rounded-lg bg-accent-cyan/20 border border-accent-cyan/50 text-accent-cyan text-xs py-2 hover:bg-accent-cyan/30 disabled:opacity-40 transition"
                >
                  ● Record performance
                </button>
              )
            ) : (
              <>
                <button onClick={onSaveClip} className="flex-1 rounded-lg bg-accent-violet/80 hover:bg-accent-violet text-ink font-bold text-xs py-2 transition">
                  💾 Save clip to gallery
                </button>
                <button onClick={onDiscardClip} className="rounded-lg border border-ink-line text-gray-300 hover:bg-ink-line/50 text-xs px-3 py-2 transition">
                  Discard
                </button>
              </>
            )}
            <button onClick={onToggleLive} className="rounded-lg border border-ink-line text-gray-300 hover:bg-ink-line/50 text-xs px-3 py-2 transition">
              Exit Live
            </button>
          </div>
          {!recorder.supported && (
            <p className="mt-1.5 text-[10px] text-amber-400/80">Recording isn’t supported in this browser.</p>
          )}
        </div>
      )}
    </>
  );
}
