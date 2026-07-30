import { useState } from 'react';
import { Icon } from '../Icon';

// Лента със страниците на сайта. Всяка страница е отделен канвас и отделен
// HTML файл при генерация; навигацията между тях се свързва автоматично.
export function PageTabs({ pages, activeId, siteMap, onSelect, onAdd, onRename, onDelete }) {
  const [editingId, setEditingId] = useState(null);
  const [draft, setDraft] = useState('');

  const startRename = (p) => {
    setEditingId(p.id);
    setDraft(p.name);
  };
  const commit = () => {
    const name = draft.trim();
    if (name) onRename(editingId, name);
    setEditingId(null);
  };

  return (
    <div className="h-9 shrink-0 flex items-center gap-1 px-2 border-b border-ink-line bg-ink-soft/40 overflow-x-auto">
      {pages.map((p, i) => {
        const path = siteMap?.find((s) => s.id === p.id)?.path;
        const active = p.id === activeId;
        return (
          <div
            key={p.id}
            className={`group shrink-0 flex items-center gap-1.5 rounded-t-lg px-2.5 h-7 text-xs border-b-2 transition ${
              active
                ? 'bg-ink-line/40 text-white border-accent-violet'
                : 'text-gray-500 hover:text-gray-200 border-transparent'
            }`}
          >
            {editingId === p.id ? (
              <input
                autoFocus
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onBlur={commit}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') commit();
                  if (e.key === 'Escape') setEditingId(null);
                }}
                maxLength={24}
                className="w-24 bg-ink border border-ink-line rounded px-1 text-xs text-white focus:outline-none"
              />
            ) : (
              <button
                onClick={() => (active ? startRename(p) : onSelect(p.id))}
                title={path ? `${p.name} → ${path}` : p.name}
                className="whitespace-nowrap"
              >
                {i === 0 && <span className="text-[9px] text-gray-600 mr-1"><Icon glyph="⌂" /></span>}
                {p.name}
              </button>
            )}
            {pages.length > 1 && i > 0 && (
              <button
                onClick={() => onDelete(p.id)}
                title="Delete page"
                className="opacity-0 group-hover:opacity-100 text-gray-600 hover:text-red-400 transition text-[10px]"
              ><Icon glyph="✕" /></button>
            )}
          </div>
        );
      })}
      <button
        onClick={onAdd}
        title="Add a page — it gets its own canvas and its own HTML file"
        className="shrink-0 rounded-lg px-2 h-7 text-xs text-gray-500 hover:text-white hover:bg-ink-line/50 transition"
      >
        <Icon glyph="＋" /> Page
      </button>
    </div>
  );
}
