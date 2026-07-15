import { useState } from 'react';

const FIELD_TYPES = [
  'text', 'email', 'password', 'number', 'checkbox', 'radio',
  'select', 'textarea', 'file', 'date',
];

// Прост form builder — списък с полета (тип + label), добавяне/местене/триене.
export function FormBuilderModal({ onCreate, onCancel }) {
  const [fields, setFields] = useState([
    { type: 'email', label: 'Email' },
    { type: 'password', label: 'Password' },
  ]);
  const [newType, setNewType] = useState('text');
  const [newLabel, setNewLabel] = useState('');

  const addField = () => {
    const label = newLabel.trim() || newType.charAt(0).toUpperCase() + newType.slice(1);
    setFields((f) => [...f, { type: newType, label }]);
    setNewLabel('');
  };

  const move = (i, dir) => {
    setFields((f) => {
      const next = [...f];
      const j = i + dir;
      if (j < 0 || j >= next.length) return f;
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  };

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/70 backdrop-blur-sm animate-fade-in">
      <div className="max-w-sm w-full mx-4 rounded-2xl bg-ink-soft border border-ink-line p-6 animate-slide-up">
        <h2 className="font-display font-bold text-lg text-white mb-4">Form Builder</h2>

        <div className="space-y-1.5 mb-4 max-h-56 overflow-y-auto">
          {fields.map((f, i) => (
            <div key={i} className="flex items-center gap-2 bg-ink rounded-lg px-3 py-2">
              <span className="text-xs text-white flex-1 truncate">{f.label}</span>
              <span className="text-[10px] text-gray-500">{f.type}</span>
              <button onClick={() => move(i, -1)} className="text-gray-500 hover:text-white text-xs">↑</button>
              <button onClick={() => move(i, 1)} className="text-gray-500 hover:text-white text-xs">↓</button>
              <button
                onClick={() => setFields((fs) => fs.filter((_, j) => j !== i))}
                className="text-gray-500 hover:text-red-400 text-xs"
              >
                ✕
              </button>
            </div>
          ))}
          {fields.length === 0 && (
            <p className="text-[11px] text-gray-600 text-center py-3">No fields yet.</p>
          )}
        </div>

        <div className="flex gap-2 mb-5">
          <select
            value={newType}
            onChange={(e) => setNewType(e.target.value)}
            className="rounded-lg bg-ink border border-ink-line px-2 py-1.5 text-xs text-white focus:outline-none"
          >
            {FIELD_TYPES.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
          <input
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addField()}
            placeholder="Label"
            className="flex-1 rounded-lg bg-ink border border-ink-line px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-accent-violet"
          />
          <button
            onClick={addField}
            className="rounded-lg border border-ink-line px-3 text-xs text-gray-300 hover:bg-ink-line/50 transition"
          >
            + Add
          </button>
        </div>

        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 rounded-lg border border-ink-line py-2 text-sm text-gray-300 hover:bg-ink-line/50 transition"
          >
            Cancel
          </button>
          <button
            onClick={() => fields.length && onCreate(fields)}
            disabled={!fields.length}
            className="flex-1 rounded-lg bg-accent-violet/80 py-2 text-sm text-ink hover:bg-accent-violet transition disabled:opacity-40"
          >
            Place on canvas
          </button>
        </div>
      </div>
    </div>
  );
}
