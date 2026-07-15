import { useState, useMemo, useRef, useEffect } from 'react';
import Editor from '@monaco-editor/react';

const TABS = ['Preview', 'HTML', 'CSS', 'React', 'Backend', 'Deploy'];
const DEVICES = [
  { id: 'mobile', label: '📱 Mobile', width: 390 },
  { id: 'tablet', label: '💻 Tablet', width: 768 },
  { id: 'desktop', label: '🖥 Desktop', width: null },
];

// Сглобява self-contained HTML за iframe srcdoc: инлайнва styles.css и app.js
function buildPreviewHtml(files) {
  const get = (p) => files.find((f) => f.path === p)?.content ?? '';
  let html = get('frontend/index.html');
  if (!html) return null;
  const css = get('frontend/styles.css');
  const js = get('frontend/app.js');
  html = html.replace(/<link[^>]*styles\.css[^>]*\/?>(<\/link>)?/i, `<style>\n${css}\n</style>`);
  html = html.replace(/<script[^>]*src=["'][^"']*app\.js["'][^>]*>\s*<\/script>/i, `<script>\n${js}\n</script>`);
  return html;
}

const TAB_FILE = {
  HTML: 'frontend/index.html',
  CSS: 'frontend/styles.css',
  React: 'react/App.jsx',
};
const TAB_LANG = { HTML: 'html', CSS: 'css', React: 'javascript', Backend: 'javascript' };

export function BottomPanel({
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
}) {
  const [tab, setTab] = useState('Preview');
  const [device, setDevice] = useState('desktop');
  const [previewKey, setPreviewKey] = useState(0);
  const [backendFile, setBackendFile] = useState('backend/server.js');

  const previewHtml = useMemo(() => buildPreviewHtml(files), [files, previewKey]);
  const backendFiles = files.filter((f) => f.path.startsWith('backend/'));
  const deviceDef = DEVICES.find((d) => d.id === device);

  const openInNewTab = () => {
    if (!previewHtml) return;
    const blob = new Blob([previewHtml], { type: 'text/html' });
    window.open(URL.createObjectURL(blob), '_blank');
  };

  const editorFile =
    tab === 'Backend'
      ? files.find((f) => f.path === backendFile)
      : files.find((f) => f.path === TAB_FILE[tab]);

  return (
    <div className="h-full flex flex-col bg-ink-soft/40 border-t border-ink-line overflow-hidden">
      {/* Tab bar */}
      <div className="flex items-center border-b border-ink-line shrink-0">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-[11px] uppercase tracking-[0.15em] transition ${
              tab === t ? 'text-white border-b-2 border-accent-cyan' : 'text-gray-500 hover:text-gray-300'
            }`}
          >
            {t}
            {t === 'Backend' && hasBackend && <span className="ml-1 text-yellow-400">⚡</span>}
          </button>
        ))}

        {tab === 'Preview' && (
          <div className="ml-auto flex items-center gap-1 pr-3">
            {DEVICES.map((d) => (
              <button
                key={d.id}
                onClick={() => setDevice(d.id)}
                className={`px-2 py-1 text-[10px] rounded transition ${
                  device === d.id ? 'bg-ink-line text-white' : 'text-gray-500 hover:text-gray-300'
                }`}
              >
                {d.label}
              </button>
            ))}
            <span className="w-px h-4 bg-ink-line mx-1" />
            <button
              onClick={() => setPreviewKey((k) => k + 1)}
              className="px-2 py-1 text-[10px] text-gray-500 hover:text-white transition"
              title="Refresh preview"
            >
              🔄
            </button>
            <button
              onClick={openInNewTab}
              className="px-2 py-1 text-[10px] text-gray-500 hover:text-white transition"
              title="Open in new tab"
            >
              ↗
            </button>
          </div>
        )}
      </div>

      {/* ── PREVIEW ── */}
      {tab === 'Preview' && (
        <div className="flex-1 overflow-auto bg-[#16161c] flex items-start justify-center p-4">
          {!previewHtml ? (
            <p className="text-xs text-gray-600 self-center">
              Generate the site first — the live preview appears here.
            </p>
          ) : (
            <div
              className={device !== 'desktop' ? 'rounded-[20px] border-4 border-ink-line overflow-hidden shadow-2xl' : 'w-full h-full'}
              style={deviceDef.width ? { width: deviceDef.width, height: '100%' } : {}}
            >
              <iframe
                key={previewKey}
                title="preview"
                srcDoc={previewHtml}
                sandbox="allow-scripts allow-forms"
                className="w-full h-full bg-white"
              />
            </div>
          )}
        </div>
      )}

      {/* ── CODE TABS ── */}
      {(tab === 'HTML' || tab === 'CSS' || tab === 'React' || tab === 'Backend') && (
        <div className="flex-1 flex overflow-hidden">
          {tab === 'Backend' && (
            <div className="w-44 shrink-0 border-r border-ink-line overflow-y-auto py-2">
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

      {/* ── DEPLOY ── */}
      {tab === 'Deploy' && (
        <div className="flex-1 overflow-y-auto p-6">
          <div className="max-w-lg mx-auto space-y-4">
            <h3 className="font-display font-bold text-white text-lg">🚀 Deploy Your Website</h3>

            {!projectId ? (
              <p className="text-xs text-gray-500">Generate the site first.</p>
            ) : (
              <>
                <div className="rounded-lg border border-ink-line bg-ink p-4 text-xs text-gray-400">
                  Project type:{' '}
                  {hasBackend ? (
                    <span className="text-yellow-400">Full Stack (Frontend + Backend) — needs Docker</span>
                  ) : (
                    <span className="text-accent-cyan">Static Only — hosted directly by CHORUS server</span>
                  )}
                </div>

                {/* ZIP */}
                <button
                  onClick={onDownload}
                  className="w-full rounded-lg border border-ink-line bg-ink-soft py-3 text-sm text-gray-200 hover:bg-ink-line/40 transition text-left px-4"
                >
                  📥 <span className="font-bold">Download ZIP</span>
                  <span className="block text-[11px] text-gray-500 mt-0.5">
                    Целият проект + README с инструкции за стартиране
                  </span>
                </button>

                {/* Docker / static hosting */}
                {hasBackend && !dockerAvailable ? (
                  <div className="rounded-lg border border-yellow-900 bg-yellow-950/30 p-4 text-xs text-yellow-400">
                    ⚠ Docker Desktop не е стартиран. Пусни го и презареди, за да deploy-неш
                    backend-а в изолиран контейнер.
                  </div>
                ) : deployment ? (
                  <div className="rounded-lg border border-green-900 bg-green-950/30 p-4">
                    <div className="text-xs text-green-400 mb-2">
                      ✓ Deployed ({deployment.type === 'docker' ? 'Docker container' : 'static hosting'})
                    </div>
                    <a
                      href={deployment.url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-sm text-accent-cyan underline break-all"
                    >
                      {deployment.url}
                    </a>
                    {deployment.type === 'docker' && (
                      <button
                        onClick={onStopDocker}
                        className="mt-3 block w-full rounded border border-red-900 bg-red-950/40 py-1.5 text-xs text-red-400 hover:bg-red-900/40 transition"
                      >
                        ⏹ Stop container
                      </button>
                    )}
                  </div>
                ) : (
                  <button
                    onClick={onDeployDocker}
                    disabled={deployBusy}
                    className="w-full rounded-lg border border-accent-cyan/50 bg-accent-cyan/10 py-3 text-sm text-accent-cyan hover:bg-accent-cyan/20 transition text-left px-4 disabled:opacity-50"
                  >
                    🐳 <span className="font-bold">{deployBusy ? 'Deploying…' : hasBackend ? 'Deploy to Local Docker' : 'Host on CHORUS server'}</span>
                    <span className="block text-[11px] text-gray-500 mt-0.5">
                      {hasBackend
                        ? 'Изолиран контейнер (node:20-alpine, 256MB) на localhost порт'
                        : 'Мигновен статичен хостинг на /hosted/… URL'}
                    </span>
                  </button>
                )}

                {/* Vercel stub */}
                <button
                  disabled
                  className="w-full rounded-lg border border-ink-line py-3 text-sm text-gray-600 text-left px-4 cursor-not-allowed"
                  title="Изисква Vercel API token"
                >
                  ▲ <span className="font-bold">Deploy to Vercel</span>
                  <span className="block text-[11px] text-gray-700 mt-0.5">
                    Изисква Vercel API token — coming soon
                  </span>
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
