import { useState, useRef, useEffect, useMemo } from 'react';
import { Icon, IconText } from '../Icon';
import Editor from '@monaco-editor/react';
import { FRAME_TYPES } from './tools';
import { VisualInspector, useVisualEditorMessages } from './VisualEditor';
import { annotate, EDITOR_SCRIPT } from '../../engine/htmlEdit';
import { PALETTE_KEYS, contrastRatio } from '../../engine/sitePalette';

// Дясната половина на WebForge: всичко освен рисуването.
const TABS = ['Preview', 'Design', 'HTML', 'CSS', 'React', 'Backend', 'Recognized', 'Chat', 'Props', 'Deploy'];

const PALETTE_LABELS = {
  primary: 'Primary — buttons & links',
  accent: 'Accent — highlights',
  bg: 'Background',
  surface: 'Surface — cards',
  text: 'Text',
  muted: 'Muted — captions',
};

const DEVICES = [
  { id: 'mobile', label: '📱', title: 'Mobile 390px', width: 390 },
  { id: 'tablet', label: '💻', title: 'Tablet 768px', width: 768 },
  { id: 'desktop', label: '🖥', title: 'Desktop', width: null },
];

const TAB_FILE = {
  HTML: 'frontend/index.html',
  CSS: 'frontend/styles.css',
  React: 'react/App.jsx',
};
const TAB_LANG = { HTML: 'html', CSS: 'css', React: 'javascript', Backend: 'javascript' };

const TYPE_ICONS = {
  navbar: '☰', hero: '🏔', section: '▭', card: '▢', footer: '▁',
  sidebar: '▮', form: '📝', button: '⏺', image: '🖼', text: 'T', nav: '☰', component: '◈',
};

// В sandbox iframe без allow-same-origin достъпът до localStorage хвърля —
// подменяме го с in-memory реализация, за да работят генерираните сайтове.
const STORAGE_SHIM = `<script>try{window.localStorage.length}catch(e){(function(){var m={};var shim={getItem:function(k){return k in m?m[k]:null},setItem:function(k,v){m[k]=String(v)},removeItem:function(k){delete m[k]},clear:function(){m={}},key:function(i){return Object.keys(m)[i]||null}};Object.defineProperty(shim,'length',{get:function(){return Object.keys(m).length}});Object.defineProperty(window,'localStorage',{value:shim});Object.defineProperty(window,'sessionStorage',{value:shim});})()}</script>`;

// Сглобява self-contained HTML за iframe srcdoc: инлайнва styles.css и app.js.
// `pagePath` избира кой HTML файл да се покаже (multi-page).
function buildPreviewHtml(files, pagePath = 'frontend/index.html', editMode = false) {
  const get = (p) => files.find((f) => f.path === p)?.content ?? '';
  let html = get(pagePath);
  if (!html) return null;
  if (editMode) html = annotate(html);
  const css = get('frontend/styles.css');
  const js = get('frontend/app.js');
  html = html.replace(/<link[^>]*styles\.css[^>]*\/?>(<\/link>)?/i, `<style>\n${css}\n</style>`);
  html = html.replace(/<script[^>]*src=["'][^"']*app\.js["'][^>]*>\s*<\/script>/i, `<script>\n${js}\n</script>`);
  // Shim-ът трябва да е ПРЕДИ кода на сайта
  const head = STORAGE_SHIM + (editMode ? EDITOR_SCRIPT : '');
  if (/<head[^>]*>/i.test(html)) html = html.replace(/<head[^>]*>/i, (m) => m + head);
  else html = head + html;
  return html;
}

export function RightPanel({
  wireframeHtml,
  files,
  onFileChange,
  hasBackend,
  projectId,
  dockerAvailable,
  deployment,
  onDeployDocker,
  onStopDocker,
  onDownload,
  deployBusy,
  onPublish,
  publishing,
  publishAvailable,
  publishedUrl,
  showGuides,
  onToggleGuides,
  palette,
  paletteAuto,
  onPaletteChange,
  onRereadPalette,
  htmlPages,
  onTextEdit,
  onStyleEdit,
  onDeleteElement,
  components,
  summary,
  analyzing,
  onAnalyze,
  autoAnalyze,
  onToggleAutoAnalyze,
  chatMessages,
  chatBusy,
  onSendChat,
  onApplyFiles,
  selected,
  selectedTick,
  onUpdateSelected,
  onDeleteSelected,
}) {
  const [tab, setTab] = useState('Preview');
  const [device, setDevice] = useState('desktop');
  const [previewMode, setPreviewMode] = useState('wireframe'); // 'wireframe' | 'generated'
  const [previewKey, setPreviewKey] = useState(0);
  const [backendFile, setBackendFile] = useState('backend/server.js');
  const [chatInput, setChatInput] = useState('');
  const chatEndRef = useRef(null);

  // Визуално редактиране + избор на страница за preview
  const [editMode, setEditMode] = useState(false);
  const [selection, setSelection] = useState(null);
  const [previewPage, setPreviewPage] = useState('frontend/index.html');

  // Кои HTML страници има проектът
  const pageFiles = useMemo(
    () => (htmlPages?.length ? htmlPages : files.filter((f) => /^frontend\/.+\.html$/.test(f.path)).map((f) => f.path)),
    [htmlPages, files]
  );
  useEffect(() => {
    if (pageFiles.length && !pageFiles.includes(previewPage)) setPreviewPage(pageFiles[0]);
  }, [pageFiles, previewPage]);

  const generatedHtml = useMemo(
    () => buildPreviewHtml(files, previewPage, editMode),
    [files, previewPage, editMode]
  );

  useVisualEditorMessages({
    active: editMode,
    onSelect: setSelection,
    onText: (id, text) => onTextEdit?.(previewPage, id, text),
  });

  // Изход от Edit режим при смяна на таба/режима
  useEffect(() => {
    if (previewMode !== 'generated' || tab !== 'Preview') {
      setEditMode(false);
      setSelection(null);
    }
  }, [previewMode, tab]);

  // Първата генерация превключва на Generated + Preview таба
  const hadFiles = useRef(false);
  useEffect(() => {
    if (files.length > 0 && !hadFiles.current) {
      hadFiles.current = true;
      setPreviewMode('generated');
      setTab('Preview');
    }
    if (files.length === 0) {
      hadFiles.current = false;
      setPreviewMode('wireframe');
    }
  }, [files.length]);

  useEffect(() => {
    if (tab === 'Chat') chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages, tab]);

  const sendChat = () => {
    const text = chatInput.trim();
    if (!text || chatBusy) return;
    setChatInput('');
    onSendChat(text);
  };

  const activePreviewHtml = previewMode === 'generated' ? generatedHtml : wireframeHtml;
  const deviceDef = DEVICES.find((d) => d.id === device);

  const openInNewTab = () => {
    if (!activePreviewHtml) return;
    const blob = new Blob([activePreviewHtml], { type: 'text/html' });
    window.open(URL.createObjectURL(blob), '_blank');
  };

  const editorFile =
    tab === 'Backend'
      ? files.find((f) => f.path === backendFile)
      : files.find((f) => f.path === TAB_FILE[tab]);
  const backendFiles = files.filter((f) => f.path.startsWith('backend/'));

  return (
    <div className="h-full flex flex-col bg-ink-soft/40 border-l border-ink-line overflow-hidden">
      {/* ── Tab bar ── */}
      <div className="flex items-center border-b border-ink-line shrink-0 overflow-x-auto">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`relative px-2.5 py-2 text-[10px] uppercase tracking-[0.12em] whitespace-nowrap transition ${
              tab === t ? 'text-white border-b-2 border-accent-cyan' : 'text-gray-500 hover:text-gray-300'
            }`}
          >
            {t}
            {t === 'Backend' && hasBackend && <span className="ml-0.5 text-yellow-400"><Icon glyph="⚡" /></span>}
            {t === 'Props' && selected && (
              <span className="absolute top-1.5 right-0.5 w-1.5 h-1.5 rounded-full bg-accent-violet" />
            )}
          </button>
        ))}
      </div>

      {/* ── PREVIEW ── */}
      {tab === 'Preview' && (
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="flex items-center gap-1 px-2 py-1.5 border-b border-ink-line shrink-0">
            {/* Wireframe / Generated toggle */}
            <button
              onClick={() => setPreviewMode('wireframe')}
              className={`px-2 py-1 text-[10px] rounded transition ${
                previewMode === 'wireframe' ? 'bg-ink-line text-white' : 'text-gray-500 hover:text-gray-300'
              }`}
              title="Live wireframe of your sketch — updates as you draw"
            >
              <Icon glyph="✏" /> Wireframe
            </button>
            <button
              onClick={() => generatedHtml && setPreviewMode('generated')}
              disabled={!generatedHtml}
              className={`px-2 py-1 text-[10px] rounded transition disabled:opacity-40 ${
                previewMode === 'generated' ? 'bg-ink-line text-white' : 'text-gray-500 hover:text-gray-300'
              }`}
              title="The AI-generated website"
            >
              <Icon glyph="⚡" /> Generated
            </button>
            {/* Страница за preview (multi-page) */}
            {previewMode === 'generated' && pageFiles.length > 1 && (
              <select
                value={previewPage}
                onChange={(e) => setPreviewPage(e.target.value)}
                title="Which page to preview / edit"
                className="ml-1 h-6 rounded bg-ink border border-ink-line px-1 text-[10px] text-gray-300 focus:outline-none"
              >
                {pageFiles.map((p) => (
                  <option key={p} value={p}>{p.replace('frontend/', '')}</option>
                ))}
              </select>
            )}
            {/* Визуално редактиране */}
            {previewMode === 'generated' && (
              <button
                onClick={() => { setEditMode((v) => !v); setSelection(null); }}
                title="Edit mode — click elements in the page to change text, colours and size"
                className={`ml-1 px-2 py-1 text-[10px] rounded transition ${
                  editMode ? 'bg-accent-violet/25 text-white border border-accent-violet/60' : 'text-gray-500 hover:text-gray-300'
                }`}
              >
                <Icon glyph="✎" /> Edit
              </button>
            )}
            <span className="w-px h-4 bg-ink-line mx-1" />
            {DEVICES.map((d) => (
              <button
                key={d.id}
                onClick={() => setDevice(d.id)}
                title={d.title}
                className={`px-1.5 py-1 text-[11px] rounded transition ${
                  device === d.id ? 'bg-ink-line text-white' : 'text-gray-500 hover:text-gray-300'
                }`}
              >
                <Icon glyph={d.label} size={15} />
              </button>
            ))}
            <div className="ml-auto flex items-center">
              {previewMode === 'wireframe' && (
                <button
                  onClick={onToggleGuides}
                  title="Show the drafting guides (frame outlines + labels). They never appear in the generated site."
                  className={`px-1.5 py-1 text-[10px] rounded transition ${
                    showGuides ? 'bg-ink-line text-white' : 'text-gray-500 hover:text-gray-300'
                  }`}
                >
                  <Icon glyph="⧉" /> Guides
                </button>
              )}
              <button
                onClick={() => setPreviewKey((k) => k + 1)}
                className="px-1.5 py-1 text-[11px] text-gray-500 hover:text-white transition"
                title="Refresh preview"
              ><Icon glyph="🔄" /></button>
              <button
                onClick={openInNewTab}
                className="px-1.5 py-1 text-[11px] text-gray-500 hover:text-white transition"
                title="Open in new tab"
              ><Icon glyph="↗" /></button>
            </div>
          </div>

          <div className="flex-1 overflow-auto bg-[#16161c] flex items-start justify-center p-3">
            {!activePreviewHtml ? (
              <p className="text-xs text-gray-600 self-center text-center leading-relaxed">
                Start drawing on the left —<br />the preview appears here instantly.
              </p>
            ) : (
              <div
                className={
                  device !== 'desktop'
                    ? 'rounded-[20px] border-4 border-ink-line overflow-hidden shadow-2xl shrink-0'
                    : 'w-full h-full'
                }
                style={deviceDef.width ? { width: deviceDef.width, height: '100%' } : {}}
              >
                <iframe
                  key={`${previewMode}-${previewKey}-${previewPage}-${editMode}`}
                  title="preview"
                  srcDoc={activePreviewHtml}
                  sandbox="allow-scripts allow-forms"
                  className="w-full h-full bg-white"
                />
              </div>
            )}
          </div>

          {/* Инспектор за визуалното редактиране */}
          {editMode && (
            <VisualInspector
              selection={selection}
              onText={(id, text) => onTextEdit?.(previewPage, id, text)}
              onStyle={(id, style) => onStyleEdit?.(previewPage, id, style)}
              onDelete={(id) => { onDeleteElement?.(previewPage, id); setSelection(null); }}
              onClose={() => { setEditMode(false); setSelection(null); }}
            />
          )}
        </div>
      )}

      {/* ── DESIGN (палитра на сайта) ── */}
      {tab === 'Design' && (
        <div className="flex-1 overflow-y-auto p-5">
          <div className="max-w-md mx-auto space-y-4">
            <div>
              <h3 className="font-display font-bold text-white text-lg"><Icon glyph="🎨" /> Site palette</h3>
              <p className="text-[11px] text-gray-500 mt-1">
                These exact colours are injected into the generated CSS as
                <code className="mx-1 text-accent-cyan">var(--wf-*)</code>, so the site matches
                what you drew. {paletteAuto ? 'Read automatically from your sketch.' : 'Manually set.'}
              </p>
            </div>

            <button
              onClick={onRereadPalette}
              className="w-full rounded-lg border border-accent-cyan/50 bg-accent-cyan/10 py-2 text-xs text-accent-cyan hover:bg-accent-cyan/20 transition"
            >
              <Icon glyph="↻" /> Re-read colours from my sketch
            </button>

            <div className="space-y-2">
              {PALETTE_KEYS.map((k) => (
                <div key={k} className="flex items-center gap-3 rounded-lg border border-ink-line bg-ink p-2.5">
                  <input
                    type="color"
                    value={palette?.[k] || '#000000'}
                    onChange={(e) => onPaletteChange?.({ [k]: e.target.value })}
                    className="w-9 h-9 bg-transparent cursor-pointer shrink-0"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="text-xs text-white">{PALETTE_LABELS[k]}</div>
                    <div className="text-[10px] text-gray-500 font-mono">{palette?.[k]}</div>
                  </div>
                  <input
                    value={palette?.[k] || ''}
                    onChange={(e) => onPaletteChange?.({ [k]: e.target.value })}
                    className="w-20 rounded bg-ink-soft border border-ink-line px-2 py-1 text-[11px] text-gray-300 font-mono focus:outline-none focus:border-accent-violet"
                  />
                </div>
              ))}
            </div>

            {/* Контрастна проверка */}
            {palette && (
              <div className="rounded-lg border border-ink-line bg-ink p-3 space-y-1.5">
                <div className="text-[10px] uppercase tracking-[0.15em] text-gray-500">Readability</div>
                {[['text', 'bg', 4.5], ['muted', 'bg', 3]].map(([fg, bg, min]) => {
                  const ratio = contrastRatio(palette[fg], palette[bg]);
                  const ok = ratio >= min;
                  return (
                    <div key={fg} className="flex items-center justify-between text-[11px]">
                      <span className="text-gray-400">{fg} on {bg}</span>
                      <span className={ok ? 'text-emerald-400' : 'text-yellow-400'}>
                        {ratio.toFixed(1)}:1 {ok ? '✓' : `· below ${min}:1`}
                      </span>
                    </div>
                  );
                })}
                <div
                  className="mt-2 rounded p-2.5 text-xs"
                  style={{ background: palette.bg, color: palette.text }}
                >
                  Sample heading
                  <span className="ml-2" style={{ color: palette.muted }}>and a caption</span>
                  <span
                    className="ml-2 inline-block rounded px-2 py-0.5"
                    style={{ background: palette.primary, color: palette.bg }}
                  >
                    Button
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── CODE TABS ── */}
      {(tab === 'HTML' || tab === 'CSS' || tab === 'React' || tab === 'Backend') && (
        <div className="flex-1 flex overflow-hidden">
          {tab === 'Backend' && (
            <div className="w-40 shrink-0 border-r border-ink-line overflow-y-auto py-2">
              {backendFiles.length === 0 && (
                <p className="text-[10px] text-gray-600 px-3 pt-2">No backend — static site.</p>
              )}
              {backendFiles.map((f) => (
                <button
                  key={f.path}
                  onClick={() => setBackendFile(f.path)}
                  className={`block w-full text-left px-3 py-1.5 text-[11px] truncate transition ${
                    backendFile === f.path ? 'text-white bg-ink-line/50' : 'text-gray-500 hover:text-gray-300'
                  }`}
                >
                  {f.path.replace('backend/', '')}
                </button>
              ))}
            </div>
          )}
          <div className="flex-1">
            {editorFile ? (
              <Editor
                height="100%"
                theme="vs-dark"
                language={TAB_LANG[tab]}
                value={editorFile.content}
                onChange={(val) => onFileChange(editorFile.path, val ?? '')}
                options={{ fontSize: 12, minimap: { enabled: false }, wordWrap: 'on' }}
              />
            ) : (
              <p className="text-xs text-gray-600 p-6">Generate the site first.</p>
            )}
          </div>
        </div>
      )}

      {/* ── RECOGNIZED ── */}
      {tab === 'Recognized' && (
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          <button
            onClick={onAnalyze}
            disabled={analyzing}
            className="w-full rounded-lg border border-accent-cyan/50 bg-accent-cyan/10 py-2 text-xs text-accent-cyan hover:bg-accent-cyan/20 transition disabled:opacity-50"
          >
            <IconText size={14}>{analyzing ? '🔍 Analyzing…' : '🔍 Analyze sketch'}</IconText>
          </button>

          <label className="flex items-center gap-2 px-1 text-[10px] text-gray-500 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={!!autoAnalyze}
              onChange={onToggleAutoAnalyze}
              className="accent-accent-cyan"
            />
            Auto-analyze while drawing
            <span className="text-gray-600">(uses Gemini quota)</span>
          </label>

          {summary && <p className="text-[11px] text-gray-400 italic leading-snug px-1">{summary}</p>}

          {components.length === 0 && !analyzing && (
            <p className="text-[11px] text-gray-600 text-center pt-8">
              Draw your layout, then hit Analyze.
            </p>
          )}

          {components.map((c, i) => (
            <div key={i} className="rounded-lg border border-ink-line bg-ink p-3">
              <div className="flex items-center gap-2">
                <span className="text-sm"><Icon glyph={TYPE_ICONS[c.type] || '▭'} size={16} /></span>
                <span className="text-xs font-display font-bold text-white">{c.label || c.type}</span>
                {c.backendRequired && (
                  <span className="ml-auto text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-yellow-950 text-yellow-400">
                    <Icon glyph="⚡" /> backend
                  </span>
                )}
              </div>
              {c.details && <p className="mt-1.5 text-[11px] text-gray-400 leading-snug">{c.details}</p>}
              {c.backendNote && (
                <p className="mt-1 text-[10px] text-yellow-500/80 leading-snug">{c.backendNote}</p>
              )}
              {c.suggestion && (
                <p className="mt-1 text-[10px] text-accent-cyan/70 leading-snug"><Icon glyph="💡" /> {c.suggestion}</p>
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
                <span className="text-gray-500">"Make the navbar sticky", "Add dark mode", …</span>
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
                    <Icon glyph="✓" /> Apply changes ({m.updatedFiles.map((f) => f.path.split('/').pop()).join(', ')})
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
            ><Icon glyph="→" /></button>
          </div>
        </div>
      )}

      {/* ── PROPS ── */}
      {tab === 'Props' && (
        <div className="flex-1 overflow-y-auto p-3 space-y-3">
          {!selected ? (
            <p className="text-[11px] text-gray-600 text-center pt-8">Select an object on the canvas.</p>
          ) : (
            <PropertiesEditor
              selected={selected}
              selectedTick={selectedTick}
              onUpdate={onUpdateSelected}
              onDelete={onDeleteSelected}
            />
          )}
        </div>
      )}

      {/* ── DEPLOY ── */}
      {tab === 'Deploy' && (
        <div className="flex-1 overflow-y-auto p-5">
          <div className="max-w-lg mx-auto space-y-4">
            <h3 className="font-display font-bold text-white text-lg"><Icon glyph="🚀" /> Deploy Your Website</h3>

            {!files?.length ? (
              <p className="text-xs text-gray-500">Generate the site first.</p>
            ) : (
              <>
                {/* ── 1. Публикуване: истински споделим адрес, без сървър ── */}
                {publishedUrl ? (
                  <div className="rounded-lg border border-green-900 bg-green-950/30 p-4">
                    <div className="text-xs text-green-400 mb-2"><Icon glyph="✓" /> Published — anyone can open this</div>
                    <a
                      href={publishedUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-sm text-accent-cyan underline break-all"
                    >
                      {publishedUrl}
                    </a>
                    <div className="mt-3 flex gap-2">
                      <button
                        onClick={() => navigator.clipboard?.writeText(publishedUrl)}
                        className="flex-1 rounded border border-ink-line py-1.5 text-xs text-gray-300 hover:bg-ink-line/40 transition"
                      >
                        Copy link
                      </button>
                      <button
                        onClick={onPublish}
                        disabled={publishing}
                        className="flex-1 rounded border border-ink-line py-1.5 text-xs text-gray-300 hover:bg-ink-line/40 transition disabled:opacity-50"
                      >
                        {publishing ? 'Updating…' : 'Re-publish'}
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={onPublish}
                    disabled={publishing || !publishAvailable}
                    title={publishAvailable ? 'Upload the site to public hosting' : 'Sign in (and configure Supabase) to publish'}
                    className="w-full rounded-lg border border-accent-violet/50 bg-accent-violet/10 py-3 text-sm text-accent-violet hover:bg-accent-violet/20 transition text-left px-4 disabled:opacity-50"
                  ><Icon glyph="🌍" /><span className="font-bold">{publishing ? 'Publishing…' : 'Publish website'}</span>
                    <span className="block text-[11px] text-gray-500 mt-0.5">
                      {publishAvailable
                        ? 'Uploads to public hosting and gives you a shareable link'
                        : 'Sign in to publish (needs Supabase configured)'}
                    </span>
                  </button>
                )}

                {/* ── 2. Сваляне: сглобява се в браузъра, работи винаги ── */}
                <button
                  onClick={onDownload}
                  className="w-full rounded-lg border border-ink-line bg-ink-soft py-3 text-sm text-gray-200 hover:bg-ink-line/40 transition text-left px-4"
                ><Icon glyph="📥" /><span className="font-bold">Download ZIP</span>
                  <span className="block text-[11px] text-gray-500 mt-0.5">
                    Full project + README — works offline, no server needed
                  </span>
                </button>

                {hasBackend && (
                  <div className="rounded-lg border border-ink-line bg-ink p-4 text-[11px] text-gray-400">
                    This project includes a <b className="text-gray-200">backend</b> (Express API). Publishing
                    puts the frontend online; run the API from the ZIP with
                    <code className="mx-1 text-accent-cyan">cd backend &amp;&amp; npm i &amp;&amp; npm start</code>
                    or host it anywhere that runs Node.
                  </div>
                )}

                {/* ── 3. Docker: само ако наистина е наличен (local dev) ── */}
                {dockerAvailable && (
                  deployment ? (
                    <div className="rounded-lg border border-green-900 bg-green-950/30 p-4">
                      <div className="text-xs text-green-400 mb-2">
                        <Icon glyph="✓" /> Running locally ({deployment.type === 'docker' ? 'container' : 'static'})
                      </div>
                      <a href={deployment.url} target="_blank" rel="noreferrer" className="text-sm text-accent-cyan underline break-all">
                        {deployment.url}
                      </a>
                      {deployment.type === 'docker' && (
                        <button
                          onClick={onStopDocker}
                          className="mt-3 block w-full rounded border border-red-900 bg-red-950/40 py-1.5 text-xs text-red-400 hover:bg-red-900/40 transition"
                        >
                          <Icon glyph="⏹" /> Stop container
                        </button>
                      )}
                    </div>
                  ) : (
                    <button
                      onClick={onDeployDocker}
                      disabled={deployBusy || !projectId}
                      className="w-full rounded-lg border border-ink-line py-3 text-sm text-gray-300 hover:bg-ink-line/40 transition text-left px-4 disabled:opacity-50"
                    ><Icon glyph="🐳" /><span className="font-bold">{deployBusy ? 'Starting…' : 'Run locally in Docker'}</span>
                      <span className="block text-[11px] text-gray-500 mt-0.5">
                        Optional — runs the full stack on your own machine
                      </span>
                    </button>
                  )
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
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

// eslint-disable-next-line no-unused-vars -- selectedTick форсира re-render при мутирали props
function PropertiesEditor({ selected, selectedTick, onUpdate, onDelete }) {
  const ct = selected.customType || selected.type;

  return (
    <div className="space-y-3">
      <div className="text-xs font-display font-bold text-white uppercase tracking-wider">{ct}</div>

      {/* Frame type */}
      {(ct === 'frame' || FRAME_TYPES.includes(ct)) && selected.type === 'rect' && (
        <Field label="Frame type">
          <select
            value={FRAME_TYPES.includes(ct) ? ct : 'auto'}
            onChange={(e) => onUpdate({ frameType: e.target.value })}
            className={inputCls}
          >
            {FRAME_TYPES.map((t) => (
              <option key={t} value={t}>
                <IconText size={14}>{t === 'auto' ? 'Auto-detect' : t === 'backend' ? '⚡ backend zone' : t}</IconText>
              </option>
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
        <>
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
          <div className="flex gap-3">
            <Field label="Button colour">
              <input
                type="color"
                value={selected.buttonColor || '#8B7BFA'}
                onChange={(e) => onUpdate({ buttonColor: e.target.value })}
                className="w-9 h-9 bg-transparent cursor-pointer"
              />
            </Field>
            <Field label="Text colour">
              <input
                type="color"
                value={selected.buttonTextColor || '#0a0a0f'}
                onChange={(e) => onUpdate({ buttonTextColor: e.target.value })}
                className="w-9 h-9 bg-transparent cursor-pointer"
              />
            </Field>
          </div>
        </>
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
