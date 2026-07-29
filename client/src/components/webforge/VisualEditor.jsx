import { useState, useEffect, useCallback } from 'react';

// Инспектор за визуалното редактиране. Получава избрания елемент (от
// postMessage-а на iframe-а) и връща стилови/текстови промени нагоре.
export function VisualInspector({ selection, onText, onStyle, onDelete, onClose }) {
  const [text, setText] = useState('');

  useEffect(() => {
    setText(selection?.text ?? '');
  }, [selection]);

  if (!selection) {
    return (
      <div className="shrink-0 border-t border-ink-line bg-ink-soft/60 px-3 py-2 text-[11px] text-gray-500">
        ✎ Edit mode — click any element in the preview. Text becomes editable; use the
        inspector to recolour and resize it.
      </div>
    );
  }

  const cssColor = (v) => {
    // computed style идва като rgb(...) — превърни в hex за <input type=color>
    const m = /^rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(v || '');
    if (!m) return '#000000';
    const h = (n) => Number(n).toString(16).padStart(2, '0');
    return `#${h(m[1])}${h(m[2])}${h(m[3])}`;
  };
  const fontPx = parseFloat(selection.fontSize) || 16;

  return (
    <div className="shrink-0 border-t border-ink-line bg-ink-soft/70 p-3 space-y-2 max-h-56 overflow-y-auto">
      <div className="flex items-center gap-2">
        <span className="text-[10px] uppercase tracking-[0.15em] text-accent-violet">
          &lt;{selection.tag}&gt;
        </span>
        <button onClick={onClose} className="ml-auto text-[11px] text-gray-500 hover:text-white">
          ✕ Close editor
        </button>
      </div>

      {selection.text != null && (
        <label className="block">
          <span className="text-[10px] text-gray-500 block mb-1">Text</span>
          <div className="flex gap-2">
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && onText(selection.id, text)}
              className="flex-1 rounded bg-ink border border-ink-line px-2 py-1 text-xs text-white focus:outline-none focus:border-accent-violet"
            />
            <button
              onClick={() => onText(selection.id, text)}
              className="rounded border border-accent-violet/50 bg-accent-violet/10 px-2 text-xs text-accent-violet hover:bg-accent-violet/20 transition"
            >
              Apply
            </button>
          </div>
        </label>
      )}

      <div className="grid grid-cols-2 gap-2">
        <label className="block">
          <span className="text-[10px] text-gray-500 block mb-1">Text colour</span>
          <input
            type="color"
            value={cssColor(selection.color)}
            onChange={(e) => onStyle(selection.id, { color: e.target.value })}
            className="w-9 h-8 bg-transparent cursor-pointer"
          />
        </label>
        <label className="block">
          <span className="text-[10px] text-gray-500 block mb-1">Background</span>
          <input
            type="color"
            value={cssColor(selection.background)}
            onChange={(e) => onStyle(selection.id, { backgroundColor: e.target.value })}
            className="w-9 h-8 bg-transparent cursor-pointer"
          />
        </label>
      </div>

      <label className="block">
        <span className="flex justify-between text-[10px] text-gray-500 mb-1">
          <span>Font size</span>
          <span>{Math.round(fontPx)}px</span>
        </span>
        <input
          type="range"
          min={10}
          max={72}
          value={Math.round(fontPx)}
          onChange={(e) => onStyle(selection.id, { fontSize: `${e.target.value}px` })}
          className="w-full accent-accent-violet"
        />
      </label>

      <div className="grid grid-cols-2 gap-2">
        <label className="block">
          <span className="text-[10px] text-gray-500 block mb-1">Padding</span>
          <input
            defaultValue={selection.padding}
            onBlur={(e) => onStyle(selection.id, { padding: e.target.value })}
            placeholder="16px"
            className="w-full rounded bg-ink border border-ink-line px-2 py-1 text-xs text-white focus:outline-none"
          />
        </label>
        <label className="block">
          <span className="text-[10px] text-gray-500 block mb-1">Radius</span>
          <input
            defaultValue={selection.borderRadius}
            onBlur={(e) => onStyle(selection.id, { borderRadius: e.target.value })}
            placeholder="12px"
            className="w-full rounded bg-ink border border-ink-line px-2 py-1 text-xs text-white focus:outline-none"
          />
        </label>
      </div>

      <button
        onClick={() => onDelete(selection.id)}
        className="w-full rounded border border-red-900 bg-red-950/40 py-1.5 text-[11px] text-red-400 hover:bg-red-900/40 transition"
      >
        Remove this element
      </button>
    </div>
  );
}

// Слуша postMessage-ите от preview iframe-а в Edit режим.
export function useVisualEditorMessages({ active, onSelect, onText }) {
  const handler = useCallback(
    (e) => {
      const msg = e.data;
      if (!msg || typeof msg !== 'object') return;
      if (msg.type === 'wf-select') onSelect?.(msg.payload);
      else if (msg.type === 'wf-text') onText?.(msg.payload.id, msg.payload.text);
    },
    [onSelect, onText]
  );

  useEffect(() => {
    if (!active) return undefined;
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [active, handler]);
}
