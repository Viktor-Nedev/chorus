import { useState } from 'react';
import { SCATTER_KINDS, DEFAULT_TERRAIN_PARAMS } from '../../engine/sculpt/terrain';
import { ENV_PRESETS } from '../../engine/sculpt/SculptEngine';

const KIND_ICONS = { primitive: '▧', tube: '〰', lathe: '🏺', extrude: '⬒' };

function Section({ title, children, defaultOpen = true }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-b border-ink-line">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-3 py-2 text-[10px] uppercase tracking-[0.18em] text-gray-500 hover:text-gray-300 transition"
      >
        {title}
        <span className="text-gray-600">{open ? '−' : '+'}</span>
      </button>
      {open && <div className="px-3 pb-3 space-y-2.5">{children}</div>}
    </div>
  );
}

function Slider({ label, value, min, max, step, onChange, fmt = (v) => v }) {
  return (
    <label className="block">
      <span className="flex justify-between text-[10px] text-gray-500 mb-0.5">
        <span>{label}</span>
        <span className="text-gray-400">{fmt(value)}</span>
      </span>
      <input
        type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-accent-violet h-1"
      />
    </label>
  );
}

function Num({ label, value, onChange, step = 0.1 }) {
  return (
    <label className="flex-1 min-w-0">
      <span className="block text-[9px] text-gray-600 uppercase">{label}</span>
      <input
        type="number" step={step} value={Number(value).toFixed(2)}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full rounded bg-ink border border-ink-line px-1.5 py-1 text-[11px] text-white focus:outline-none focus:border-accent-violet"
      />
    </label>
  );
}

export function ScenePanel({
  objects,
  selection,
  tool,
  onSelectObject,
  onToggleVisible,
  onRename,
  onDelete,
  onDuplicate,
  onTransformChange,
  onMaterialChange,
  hasTerrain,
  terrainParams,
  onAddTerrain,
  onRemoveTerrain,
  onTerrainParam,
  brush,
  onBrushChange,
  scatterOpts,
  onScatterChange,
  env,
  onEnvChange,
}) {
  const [renaming, setRenaming] = useState(null);

  return (
    <aside className="w-[300px] shrink-0 border-l border-ink-line bg-ink-soft/50 overflow-y-auto">
      {/* ── OBJECTS ── */}
      <Section title={`Objects (${objects.length})`}>
        {objects.length === 0 && (
          <p className="text-[11px] text-gray-600">
            Add a primitive, draw with the 3D pen, or generate terrain.
          </p>
        )}
        {objects.map((o) => (
          <div
            key={o.id}
            className={`flex items-center gap-1.5 rounded-lg px-2 py-1 cursor-pointer transition ${
              selection?.id === o.id ? 'bg-accent-violet/20 border border-accent-violet/50' : 'hover:bg-ink-line/40 border border-transparent'
            }`}
            onClick={() => onSelectObject(o.id)}
          >
            <span className="text-xs w-4">{KIND_ICONS[o.kind] || '▪'}</span>
            {renaming === o.id ? (
              <input
                autoFocus
                defaultValue={o.name}
                onBlur={(e) => { onRename(o.id, e.target.value); setRenaming(null); }}
                onKeyDown={(e) => e.key === 'Enter' && e.target.blur()}
                onClick={(e) => e.stopPropagation()}
                className="flex-1 min-w-0 rounded bg-ink border border-ink-line px-1 text-[11px] text-white focus:outline-none"
              />
            ) : (
              <span
                className="flex-1 truncate text-[11px] text-gray-300"
                onDoubleClick={(e) => { e.stopPropagation(); setRenaming(o.id); }}
                title="Double-click to rename"
              >
                {o.name}
              </span>
            )}
            <button
              onClick={(e) => { e.stopPropagation(); onToggleVisible(o.id, !o.visible); }}
              className="text-[11px] text-gray-500 hover:text-white"
              title="Toggle visibility"
            >
              {o.visible ? '👁' : '─'}
            </button>
          </div>
        ))}
      </Section>

      {/* ── PROPERTIES ── */}
      {selection && (
        <Section title="Properties">
          <div className="flex gap-1.5">
            <Num label="X" value={selection.position[0]} onChange={(v) => onTransformChange({ position: [v, selection.position[1], selection.position[2]] })} />
            <Num label="Y" value={selection.position[1]} onChange={(v) => onTransformChange({ position: [selection.position[0], v, selection.position[2]] })} />
            <Num label="Z" value={selection.position[2]} onChange={(v) => onTransformChange({ position: [selection.position[0], selection.position[1], v] })} />
          </div>
          <div className="flex gap-1.5">
            <Num label="Rot X°" step={5} value={(selection.rotation[0] * 180) / Math.PI} onChange={(v) => onTransformChange({ rotation: [(v * Math.PI) / 180, selection.rotation[1], selection.rotation[2]] })} />
            <Num label="Rot Y°" step={5} value={(selection.rotation[1] * 180) / Math.PI} onChange={(v) => onTransformChange({ rotation: [selection.rotation[0], (v * Math.PI) / 180, selection.rotation[2]] })} />
            <Num label="Rot Z°" step={5} value={(selection.rotation[2] * 180) / Math.PI} onChange={(v) => onTransformChange({ rotation: [selection.rotation[0], selection.rotation[1], (v * Math.PI) / 180] })} />
          </div>
          <div className="flex gap-1.5">
            <Num label="Scale X" value={selection.scale[0]} onChange={(v) => onTransformChange({ scale: [v, selection.scale[1], selection.scale[2]] })} />
            <Num label="Y" value={selection.scale[1]} onChange={(v) => onTransformChange({ scale: [selection.scale[0], v, selection.scale[2]] })} />
            <Num label="Z" value={selection.scale[2]} onChange={(v) => onTransformChange({ scale: [selection.scale[0], selection.scale[1], v] })} />
          </div>

          <div className="flex items-center gap-2 pt-1">
            <span className="text-[10px] text-gray-500 uppercase">Color</span>
            <input
              type="color"
              value={selection.material.color}
              onChange={(e) => onMaterialChange({ color: e.target.value })}
              className="w-7 h-7 bg-transparent cursor-pointer"
            />
            <span className="text-[10px] text-gray-500 uppercase ml-2">Glow</span>
            <input
              type="color"
              value={selection.material.emissive}
              onChange={(e) => onMaterialChange({ emissive: e.target.value })}
              className="w-7 h-7 bg-transparent cursor-pointer"
            />
          </div>
          <Slider label="Metalness" value={selection.material.metalness} min={0} max={1} step={0.05} onChange={(v) => onMaterialChange({ metalness: v })} fmt={(v) => v.toFixed(2)} />
          <Slider label="Roughness" value={selection.material.roughness} min={0} max={1} step={0.05} onChange={(v) => onMaterialChange({ roughness: v })} fmt={(v) => v.toFixed(2)} />
          <Slider label="Opacity" value={selection.material.opacity} min={0.1} max={1} step={0.05} onChange={(v) => onMaterialChange({ opacity: v })} fmt={(v) => v.toFixed(2)} />
          <div className="flex gap-3 text-[11px] text-gray-400">
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input type="checkbox" checked={selection.material.flatShading} onChange={(e) => onMaterialChange({ flatShading: e.target.checked })} className="accent-accent-violet" />
              Flat
            </label>
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input type="checkbox" checked={selection.material.wireframe} onChange={(e) => onMaterialChange({ wireframe: e.target.checked })} className="accent-accent-violet" />
              Wireframe
            </label>
          </div>
          <div className="flex gap-2 pt-1">
            <button onClick={onDuplicate} className="flex-1 rounded border border-ink-line py-1.5 text-[11px] text-gray-300 hover:bg-ink-line/50 transition">
              ⧉ Duplicate
            </button>
            <button onClick={onDelete} className="flex-1 rounded border border-red-900 bg-red-950/40 py-1.5 text-[11px] text-red-400 hover:bg-red-900/40 transition">
              Delete
            </button>
          </div>
        </Section>
      )}

      {/* ── TERRAIN ── */}
      <Section key={`terrain-${hasTerrain}`} title="Terrain" defaultOpen={hasTerrain || tool === 'sculpt'}>
        {!hasTerrain ? (
          <button
            onClick={onAddTerrain}
            className="w-full rounded-lg border border-accent-cyan/50 bg-accent-cyan/10 py-2 text-xs text-accent-cyan hover:bg-accent-cyan/20 transition"
          >
            ⛰ Generate terrain
          </button>
        ) : (
          <>
            <Slider label="Seed" value={terrainParams.seed} min={1} max={99} step={1} onChange={(v) => onTerrainParam({ seed: v })} />
            <Slider label="Noise scale" value={terrainParams.scale} min={0.3} max={2.5} step={0.05} onChange={(v) => onTerrainParam({ scale: v })} fmt={(v) => v.toFixed(2)} />
            <Slider label="Height" value={terrainParams.height} min={1} max={10} step={0.2} onChange={(v) => onTerrainParam({ height: v })} fmt={(v) => v.toFixed(1)} />
            <Slider label="Detail (octaves)" value={terrainParams.octaves} min={1} max={6} step={1} onChange={(v) => onTerrainParam({ octaves: v })} />
            <Slider label="Sea level" value={terrainParams.seaLevel} min={0} max={0.9} step={0.02} onChange={(v) => onTerrainParam({ seaLevel: v })} fmt={(v) => v.toFixed(2)} />
            <p className="text-[10px] text-gray-600">Changing params regenerates — hand-sculpting is kept until then.</p>
            <button onClick={onRemoveTerrain} className="w-full rounded border border-red-900/60 py-1.5 text-[11px] text-red-400/80 hover:bg-red-950/40 transition">
              Remove terrain
            </button>
          </>
        )}
      </Section>

      {/* ── BRUSH (контекстно) ── */}
      {(tool === 'sculpt' || tool === 'scatter') && (
        <Section title={tool === 'sculpt' ? 'Sculpt brush' : 'Scatter brush'}>
          {tool === 'sculpt' ? (
            <>
              <div className="grid grid-cols-2 gap-1.5">
                {['raise', 'lower', 'smooth', 'flatten'].map((m) => (
                  <button
                    key={m}
                    onClick={() => onBrushChange({ mode: m })}
                    className={`rounded py-1.5 text-[11px] capitalize transition border ${
                      brush.mode === m
                        ? 'bg-accent-violet/25 border-accent-violet text-white'
                        : 'border-ink-line text-gray-400 hover:text-white'
                    }`}
                  >
                    {m}
                  </button>
                ))}
              </div>
              <Slider label="Radius" value={brush.radius} min={0.5} max={8} step={0.25} onChange={(v) => onBrushChange({ radius: v })} fmt={(v) => v.toFixed(1)} />
              <Slider label="Strength" value={brush.strength} min={0.2} max={4} step={0.1} onChange={(v) => onBrushChange({ strength: v })} fmt={(v) => v.toFixed(1)} />
              <p className="text-[10px] text-gray-600">Hold Shift to lower while in raise mode.</p>
            </>
          ) : (
            <>
              <div className="grid grid-cols-3 gap-1.5">
                {Object.entries(SCATTER_KINDS).map(([k, def]) => (
                  <button
                    key={k}
                    onClick={() => onScatterChange({ kind: k, erase: false })}
                    className={`rounded py-1.5 text-[11px] transition border ${
                      scatterOpts.kind === k && !scatterOpts.erase
                        ? 'bg-accent-violet/25 border-accent-violet text-white'
                        : 'border-ink-line text-gray-400 hover:text-white'
                    }`}
                  >
                    {def.icon} {def.label}
                  </button>
                ))}
              </div>
              <button
                onClick={() => onScatterChange({ erase: !scatterOpts.erase })}
                className={`w-full rounded py-1.5 text-[11px] transition border ${
                  scatterOpts.erase ? 'bg-red-950/60 border-red-800 text-red-300' : 'border-ink-line text-gray-400 hover:text-white'
                }`}
              >
                🧹 Eraser {scatterOpts.erase ? 'ON' : ''}
              </button>
              <Slider label="Radius" value={scatterOpts.radius} min={0.5} max={6} step={0.25} onChange={(v) => onScatterChange({ radius: v })} fmt={(v) => v.toFixed(1)} />
              <Slider label="Density" value={scatterOpts.density} min={1} max={10} step={1} onChange={(v) => onScatterChange({ density: v })} />
              <p className="text-[10px] text-gray-600">Alt-drag erases. Paints on terrain or ground.</p>
            </>
          )}
        </Section>
      )}

      {/* ── ENVIRONMENT ── */}
      <Section title="Environment" defaultOpen={false}>
        <div className="grid grid-cols-2 gap-1.5">
          {Object.keys(ENV_PRESETS).map((p) => (
            <button
              key={p}
              onClick={() => onEnvChange({ preset: p })}
              className={`rounded py-1.5 text-[11px] capitalize transition border ${
                env.preset === p
                  ? 'bg-accent-cyan/20 border-accent-cyan/60 text-white'
                  : 'border-ink-line text-gray-400 hover:text-white'
              }`}
            >
              {p}
            </button>
          ))}
        </div>
        <Slider label="Sun elevation" value={env.elevation} min={2} max={88} step={1} onChange={(v) => onEnvChange({ elevation: v })} fmt={(v) => v + '°'} />
        <Slider label="Sun azimuth" value={env.azimuth} min={-180} max={180} step={2} onChange={(v) => onEnvChange({ azimuth: v })} fmt={(v) => v + '°'} />
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-gray-400">
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input type="checkbox" checked={env.water} onChange={(e) => onEnvChange({ water: e.target.checked })} className="accent-accent-cyan" />
            Water
          </label>
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input type="checkbox" checked={env.grid} onChange={(e) => onEnvChange({ grid: e.target.checked })} className="accent-accent-cyan" />
            Grid
          </label>
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input type="checkbox" checked={env.turntable} onChange={(e) => onEnvChange({ turntable: e.target.checked })} className="accent-accent-cyan" />
            Turntable
          </label>
        </div>
      </Section>

      {/* ── SHORTCUTS ── */}
      <Section title="Shortcuts" defaultOpen={false}>
        <div className="text-[10px] text-gray-500 space-y-1">
          <p><b className="text-gray-400">G / R / S</b> — move / rotate / scale gizmo</p>
          <p><b className="text-gray-400">Del</b> — delete · <b className="text-gray-400">Ctrl+D</b> — duplicate</p>
          <p><b className="text-gray-400">Ctrl+Z / Y</b> — undo / redo</p>
          <p><b className="text-gray-400">F</b> — focus selected · <b className="text-gray-400">Esc</b> — deselect</p>
          <p><b className="text-gray-400">Drag</b> — orbit · <b className="text-gray-400">Right-drag</b> — pan · <b className="text-gray-400">Wheel</b> — zoom</p>
        </div>
      </Section>
    </aside>
  );
}

export { DEFAULT_TERRAIN_PARAMS };
