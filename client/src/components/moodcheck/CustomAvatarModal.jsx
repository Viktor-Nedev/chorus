import { useState, useRef, useEffect } from 'react';
import { clampAvatar, toRuntime, ACCESSORY_TYPES } from './avatars';

// Създаване на собствен аватар — два таба: Sliders (ръчно) и AI (описание +
// опц. селфи). Live preview: всяка промяна веднага се прилага на живата сцена
// през onPreview. Записва се в профила при Save.
const SLIDERS = [
  { key: 'eye', label: 'Eye size', min: 0.4, max: 2.2, path: 'deform' },
  { key: 'faceLength', label: 'Face length', min: 0.6, max: 1.6, path: 'deform' },
  { key: 'jaw', label: 'Jaw width', min: 0.5, max: 1.6, path: 'deform' },
  { key: 'cheek', label: 'Cheeks', min: 0.3, max: 2.2, path: 'deform' },
  { key: 'nose', label: 'Nose', min: 0.4, max: 2.0, path: 'deform' },
  { key: 'eyeDepth', label: 'Eye depth', min: 0.5, max: 2.2, path: 'deform' },
  { key: 'particleSize', label: 'Particle size', min: 0.6, max: 1.8, path: 'root' },
  { key: 'glow', label: 'Glow', min: 0, max: 1, path: 'root' },
];

const DEFAULT_PARAMS = {
  label: 'My Custom',
  deform: { eye: 1, faceLength: 1, jaw: 1, cheek: 1, nose: 1, eyeDepth: 1 },
  accessory: 'none',
  particleSize: 1,
  glow: 0.4,
  fixedColor: '#8B7BFA',
};

export function CustomAvatarModal({ initial, onPreview, onSave, onCancel, aiGenerate, getSelfie, saving }) {
  const [tab, setTab] = useState('sliders');
  const [params, setParams] = useState(() => ({ ...DEFAULT_PARAMS, ...(initial || {}), deform: { ...DEFAULT_PARAMS.deform, ...(initial?.deform || {}) } }));
  const [prompt, setPrompt] = useState('');
  const [useSelfie, setUseSelfie] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiError, setAiError] = useState(null);
  const paramsRef = useRef(params);
  paramsRef.current = params;

  // Live preview при всяка промяна
  useEffect(() => {
    onPreview(toRuntime(clampAvatar(params)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  const setVal = (slider, value) => {
    setParams((p) => {
      if (slider.path === 'deform') return { ...p, deform: { ...p.deform, [slider.key]: value } };
      return { ...p, [slider.key]: value };
    });
  };

  const runAi = async () => {
    setAiBusy(true);
    setAiError(null);
    try {
      const image = useSelfie ? await getSelfie?.() : undefined;
      const generated = await aiGenerate(prompt, image);
      setParams((p) => ({ ...DEFAULT_PARAMS, ...generated, deform: { ...DEFAULT_PARAMS.deform, ...(generated.deform || {}) } }));
      setTab('sliders');
    } catch (e) {
      setAiError(e.message === 'quota_exceeded' ? 'Gemini quota reached — try the sliders instead.' : 'AI generation failed — try again.');
    } finally {
      setAiBusy(false);
    }
  };

  const val = (slider) => (slider.path === 'deform' ? params.deform[slider.key] : params[slider.key]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm animate-fade-in">
      <div className="max-w-md w-full mx-4 rounded-2xl bg-ink-soft border border-ink-line p-5 animate-slide-up max-h-[88vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-display font-bold text-lg text-white">Create your avatar</h2>
          <div className="flex rounded-lg border border-ink-line p-0.5">
            {['sliders', 'ai'].map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`px-3 py-1 text-[11px] uppercase tracking-[0.12em] rounded transition ${
                  tab === t ? 'bg-accent-violet/25 text-white' : 'text-gray-500 hover:text-gray-300'
                }`}
              >
                {t === 'sliders' ? 'Sliders' : '✨ AI'}
              </button>
            ))}
          </div>
        </div>

        {tab === 'sliders' ? (
          <div className="space-y-3">
            <label className="block">
              <span className="text-[10px] uppercase tracking-[0.15em] text-gray-500">Name</span>
              <input
                value={params.label}
                onChange={(e) => setParams((p) => ({ ...p, label: e.target.value }))}
                maxLength={24}
                className="w-full rounded-lg bg-ink border border-ink-line px-2.5 py-1.5 text-sm text-white focus:outline-none focus:border-accent-violet"
              />
            </label>

            {SLIDERS.map((sl) => (
              <label key={sl.key} className="block">
                <span className="flex justify-between text-[10px] text-gray-500">
                  <span>{sl.label}</span>
                  <span className="text-gray-400">{val(sl).toFixed(2)}</span>
                </span>
                <input
                  type="range"
                  min={sl.min}
                  max={sl.max}
                  step={0.02}
                  value={val(sl)}
                  onChange={(e) => setVal(sl, Number(e.target.value))}
                  className="w-full accent-accent-violet h-1"
                />
              </label>
            ))}

            <div className="flex items-center gap-3">
              <label className="flex-1">
                <span className="text-[10px] uppercase tracking-[0.15em] text-gray-500 block mb-1">Accessory</span>
                <select
                  value={params.accessory}
                  onChange={(e) => setParams((p) => ({ ...p, accessory: e.target.value }))}
                  className="w-full rounded-lg bg-ink border border-ink-line px-2 py-1.5 text-xs text-white focus:outline-none"
                >
                  {ACCESSORY_TYPES.map((a) => (
                    <option key={a} value={a}>{a}</option>
                  ))}
                </select>
              </label>
              <label>
                <span className="text-[10px] uppercase tracking-[0.15em] text-gray-500 block mb-1">Color</span>
                <input
                  type="color"
                  value={params.fixedColor}
                  onChange={(e) => setParams((p) => ({ ...p, fixedColor: e.target.value }))}
                  className="w-9 h-9"
                />
              </label>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-xs text-gray-400">
              Describe your avatar and AI will shape it (it still tracks your real face).
            </p>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={3}
              placeholder='e.g. "a wise old alien with huge eyes" or "a fierce red demon"'
              className="w-full rounded-lg bg-ink border border-ink-line px-3 py-2 text-sm text-white focus:outline-none focus:border-accent-violet resize-none"
            />
            <label className="flex items-center gap-2 text-xs text-gray-400 cursor-pointer">
              <input type="checkbox" checked={useSelfie} onChange={(e) => setUseSelfie(e.target.checked)} className="accent-accent-violet" />
              Use my selfie for inspiration
            </label>
            {aiError && <p className="text-xs text-red-400">{aiError}</p>}
            <button
              onClick={runAi}
              disabled={aiBusy || !prompt.trim()}
              className="w-full rounded-lg bg-accent-cyan/20 border border-accent-cyan/50 py-2 text-sm text-accent-cyan hover:bg-accent-cyan/30 transition disabled:opacity-50"
            >
              {aiBusy ? 'Generating…' : '✨ Generate avatar'}
            </button>
            <p className="text-[10px] text-gray-600">After generating, fine-tune on the Sliders tab.</p>
          </div>
        )}

        <div className="flex gap-2 mt-5">
          <button
            onClick={onCancel}
            className="flex-1 rounded-lg border border-ink-line py-2 text-sm text-gray-300 hover:bg-ink-line/50 transition"
          >
            Cancel
          </button>
          <button
            onClick={() => onSave(clampAvatar(paramsRef.current))}
            disabled={saving}
            className="flex-1 rounded-lg bg-accent-violet/85 py-2 text-sm font-bold text-ink hover:bg-accent-violet transition disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save avatar'}
          </button>
        </div>
      </div>
    </div>
  );
}
