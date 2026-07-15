import { useState, useRef, useEffect } from 'react';
import { FRAME_TYPES } from './tools';

const TABS = ['Recognized', 'Chat', 'Properties'];

// Икони по тип разпознат компонент
const TYPE_ICONS = {
  navbar: '☰', hero: '🏔', section: '▭', card: '▢', footer: '▁',
  sidebar: '▮', form: '📝', button: '⏺', image: '🖼', text: 'T', nav: '☰', component: '◈',
};

export function AiPanel({
  components,
  summary,
  analyzing,
  onAnalyze,
  chatMessages,
  chatBusy,
  onSendChat,
  onApplyFiles,
  selected,
  onUpdateSelected,
  onDeleteSelected,
}) {
  const [tab, setTab] = useState('Recognized');
  const [chatInput, setChatInput] = useState('');
  const chatEndRef = useRef(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  // Автоматично превключи към Properties при селекция
  useEffect(() => {
    if (selected) setTab('Properties');
  }, [selected]);

  const sendChat = () => {
    const text = chatInput.trim();
    if (!text || chatBusy) return;
    setChatInput('');
    onSendChat(text);
  };

  return (
    <aside className="w-[320px] shrink-0 border-l border-ink-line bg-ink-soft/50 flex flex-col overflow-hidden">
      {/* Tabs */}
      <div className="flex border-b border-ink-line shrink-0">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 py-2.5 text-[11px] uppercase tracking-[0.15em] transition ${
              tab === t ? 'text-white border-b-2 border-accent-violet' : 'text-gray-500 hover:text-gray-300'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {/* ── RECOGNIZED ── */}
      {tab === 'Recognized' && (
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          <button
            onClick={onAnalyze}
            disabled={analyzing}
            className="w-full rounded-lg border border-accent-cyan/50 bg-accent-cyan/10 py-2 text-xs text-accent-cyan hover:bg-accent-cyan/20 transition disabled:opacity-50"
          >
            {analyzing ? '🔍 Analyzing…' : '🔍 Analyze sketch'}
          </button>

          {summary && (
            <p className="text-[11px] text-gray-400 italic leading-snug px-1">{summary}</p>
          )}

          {components.length === 0 && !analyzing && (
            <p className="text-[11px] text-gray-600 text-center pt-8">
              Draw your layout, then analyze.
              <br />
              Auto-analysis runs after you pause.
            </p>
          )}

          {components.map((c, i) => (
            <div key={i} className="rounded-lg border border-ink-line bg-ink p-3">
              <div className="flex items-center gap-2">
                <span className="text-sm">{TYPE_ICONS[c.type] || '▭'}</span>
                <span className="text-xs font-display font-bold text-white">{c.label || c.type}</span>
                {c.backendRequired && (
                  <span className="ml-auto text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-yellow-950 text-yellow-400">
                    ⚡ backend
                  </span>
                )}
              </div>
              {c.details && <p className="mt-1.5 text-[11px] text-gray-400 leading-snug">{c.details}</p>}
              {c.backendNote && (
                <p className="mt-1 text-[10px] text-yellow-500/80 leading-snug">{c.backendNote}</p>
              )}
              {c.suggestion && (
                <p className="mt-1 text-[10px] text-accent-cyan/70 leading-snug">💡 {c.suggestion}</p>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ── CHAT ── */}
      {tab === 'Chat' && (
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto p-3 space-y-3">
            {chatMessages.length === 0 && (
              <p className="text-[11px] text-gray-600 text-center pt-8 px-4">
                Generate the site first, then ask for changes:
                <br />
                <span className="text-gray-500">"Направи navbar-а sticky", "Add dark mode", …</span>
              </p>
            )}
            {chatMessages.map((m, i) => (
              <div
                key={i}
                className={`rounded-lg p-2.5 text-xs leading-relaxed ${
                  m.role === 'user'
                    ? 'bg-accent-violet/15 text-gray-200 ml-6'
                    : 'bg-ink text-gray-300 mr-6 border border-ink-line'
                }`}
              >
                {m.text}
                {m.updatedFiles?.length > 0 && (
                  <button
                    onClick={() => onApplyFiles(m.updatedFiles)}
                    className="mt-2 block w-full rounded border border-accent-cyan/50 bg-accent-cyan/10 py-1 text-[10px] text-accent-cyan hover:bg-accent-cyan/20 transition"
                  >
                    ✓ Apply changes ({m.updatedFiles.map((f) => f.path.split('/').pop()).join(', ')})
                  </button>
                )}
              </div>
            ))}
            {chatBusy && <div className="text-[11px] text-gray-500 glow-pulse">AI is thinking…</div>}
            <div ref={chatEndRef} />
          </div>
          <div className="p-3 border-t border-ink-line flex gap-2 shrink-0">
            <input
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && sendChat()}
              placeholder="Ask for a change…"
              className="flex-1 rounded-lg bg-ink border border-ink-line px-3 py-2 text-xs text-white focus:outline-none focus:border-accent-violet"
            />
            <button
              onClick={sendChat}
              disabled={chatBusy}
              className="rounded-lg bg-accent-violet/80 px-3 text-xs text-ink hover:bg-accent-violet transition disabled:opacity-50"
            >
              →
            </button>
          </div>
        </div>
      )}

      {/* ── PROPERTIES ── */}
      {tab === 'Properties' && (
        <div className="flex-1 overflow-y-auto p-3 space-y-3">
          {!selected ? (
            <p className="text-[11px] text-gray-600 text-center pt-8">Select an object on the canvas.</p>
          ) : (
            <PropertiesEditor
              selected={selected}
              onUpdate={onUpdateSelected}
              onDelete={onDeleteSelected}
            />
          )}
        </div>
      )}
    </aside>
  );
}

function Field({ label, children }) {
  return (
    <label className="block">
      <span className="text-[10px] uppercase tracking-[0.15em] text-gray-500 block mb-1">{label}</span>
      {children}
    </label>
  );
}

const inputCls =
  'w-full rounded-lg bg-ink border border-ink-line px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-accent-violet';

function PropertiesEditor({ selected, onUpdate, onDelete }) {
  const ct = selected.customType || selected.type;

  return (
    <div className="space-y-3">
      <div className="text-xs font-display font-bold text-white uppercase tracking-wider">
        {ct}
      </div>

      {/* Frame type */}
      {(ct === 'frame' || FRAME_TYPES.includes(ct)) && selected.type === 'rect' && (
        <Field label="Frame type">
          <select
            value={FRAME_TYPES.includes(ct) ? ct : 'auto'}
            onChange={(e) => onUpdate({ frameType: e.target.value })}
            className={inputCls}
          >
            {FRAME_TYPES.map((t) => (
              <option key={t} value={t}>{t === 'auto' ? 'Auto-detect' : t}</option>
            ))}
          </select>
        </Field>
      )}

      {/* Text */}
      {ct === 'text' && (
        <Field label="Role">
          <select
            value={selected.textRole || 'body'}
            onChange={(e) => onUpdate({ textRole: e.target.value })}
            className={inputCls}
          >
            {['h1', 'h2', 'h3', 'body', 'caption', 'label'].map((r) => (
              <option key={r} value={r}>{r.toUpperCase()}</option>
            ))}
          </select>
        </Field>
      )}

      {/* Button */}
      {ct === 'button' && (
        <Field label="Style">
          <select
            value={selected.buttonStyle || 'primary'}
            onChange={(e) => onUpdate({ buttonStyle: e.target.value })}
            className={inputCls}
          >
            {['primary', 'secondary', 'danger', 'ghost', 'link'].map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </Field>
      )}

      {/* Form fields (read-only списък) */}
      {ct === 'form' && selected.formFields && (
        <Field label={`Fields (${selected.formFields.length})`}>
          <div className="space-y-1">
            {selected.formFields.map((f, i) => (
              <div key={i} className="text-[11px] text-gray-400 bg-ink rounded px-2 py-1">
                {f.label} <span className="text-gray-600">({f.type})</span>
              </div>
            ))}
          </div>
        </Field>
      )}

      {/* Fill color — за rect обекти */}
      {selected.type === 'rect' && (
        <Field label="Fill">
          <input
            type="color"
            value={typeof selected.fill === 'string' && selected.fill.startsWith('#') ? selected.fill : '#1a1a24'}
            onChange={(e) => onUpdate({ fill: e.target.value })}
            className="w-9 h-9"
          />
        </Field>
      )}

      {/* Annotation — за всичко */}
      <Field label="Annotation (AI reads this)">
        <textarea
          value={selected.annotation || ''}
          onChange={(e) => onUpdate({ annotation: e.target.value })}
          rows={3}
          placeholder='e.g. "sticky navbar", "carousel with 3 images"'
          className={`${inputCls} resize-none`}
        />
      </Field>

      <button
        onClick={onDelete}
        className="w-full rounded-lg border border-red-900 bg-red-950/40 py-1.5 text-xs text-red-400 hover:bg-red-900/40 transition"
      >
        Delete object
      </button>
    </div>
  );
}
