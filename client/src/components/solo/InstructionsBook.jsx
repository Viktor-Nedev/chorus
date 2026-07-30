import { useState, useEffect, useCallback } from 'react';
import { Icon, IconText } from '../Icon';
import { SOLO_PAGES } from '../help/manuals';

// Flippable booklet used as the in-mode handbook. Navigate with Prev/Next,
// arrow keys, or the page dots; Esc closes. Each page re-mounts with key={page}
// so the CSS flip animation replays. Pass `pages` (defaults to the Solo guide).

export function InstructionsBook({ pages = SOLO_PAGES, onClose }) {
  const PAGES = pages;
  const [page, setPage] = useState(0);
  const [dir, setDir] = useState('next');
  const last = PAGES.length - 1;

  const go = useCallback((delta) => {
    setDir(delta > 0 ? 'next' : 'prev');
    setPage((pg) => Math.min(last, Math.max(0, pg + delta)));
  }, [last]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowRight') go(1);
      else if (e.key === 'ArrowLeft') go(-1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [go, onClose]);

  const pg = PAGES[page];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-lg h-[580px] max-h-[90vh] rounded-2xl overflow-hidden shadow-2xl ring-1 ring-white/10"
        onClick={(e) => e.stopPropagation()}
        style={{ perspective: '1600px' }}
      >
        {/* Spiral binding */}
        <div className="absolute left-0 inset-y-0 w-8 bg-gradient-to-r from-black/60 to-ink-soft border-r border-ink-line z-10 flex flex-col items-center justify-center gap-3">
          {Array.from({ length: 12 }).map((_, i) => (
            <span key={i} className="w-2.5 h-2.5 rounded-full bg-ink border border-white/10 shadow-inner" />
          ))}
        </div>

        <div className="absolute inset-0 pl-8 bg-ink-soft border border-ink-line flex flex-col">
          <button
            onClick={onClose}
            title="Close (Esc)"
            className="absolute top-3 right-3 z-20 w-8 h-8 rounded-lg border border-ink-line text-gray-400 hover:text-white hover:border-gray-500 bg-ink/40 transition"
          ><Icon glyph="✕" /></button>

          {/* Page (re-mount with key → flip animation) */}
          <div
            key={page}
            className={`flex-1 overflow-y-auto ${dir === 'next' ? 'book-flip-next' : 'book-flip-prev'}`}
            style={{ transformOrigin: 'left center' }}
          >
            {pg.kind === 'cover' ? (
              <div className="relative h-full flex flex-col items-center justify-center text-center gap-4 px-8 overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-br from-violet-600/25 via-transparent to-cyan-500/20 pointer-events-none" />
                <div className="absolute -top-24 -right-16 w-64 h-64 rounded-full bg-violet-500/20 blur-3xl pointer-events-none" />
                <div className="absolute -bottom-24 -left-10 w-56 h-56 rounded-full bg-cyan-500/15 blur-3xl pointer-events-none" />
                <div className="relative text-5xl mb-1"><Icon glyph="📖" /></div>
                <h2 className="relative font-display text-5xl font-extrabold tracking-tight bg-gradient-to-r from-violet-300 via-white to-cyan-300 bg-clip-text text-transparent">
                  <IconText size={30}>{pg.title}</IconText>
                </h2>
                <p className="relative text-cyan-300/80 text-xs uppercase tracking-[0.4em]">{pg.subtitle}</p>
                <div className="relative mt-4 space-y-2 max-w-xs">
                  {pg.body.map((b, i) => (
                    <p key={i} className="text-gray-300 text-sm leading-relaxed"><IconText size={14}>{b}</IconText></p>
                  ))}
                </div>
              </div>
            ) : (
              <div className="px-7 py-7">
                <div className="flex items-center gap-3 mb-6">
                  <span className="flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-br from-violet-600/40 to-cyan-500/30 border border-white/10 text-lg shadow-lg">
                    <Icon glyph={pg.icon} size={22} />
                  </span>
                  <div>
                    <div className="text-[10px] uppercase tracking-[0.3em] text-cyan-300/70">Section {pg.n}</div>
                    <h2 className="font-display text-2xl text-white leading-tight"><IconText size={22}>{pg.title}</IconText></h2>
                  </div>
                </div>
                <ul className="space-y-3.5">
                  {pg.items.map(([k, v], i) => (
                    <li key={i} className="flex flex-col gap-0.5 border-l-2 border-violet-500/30 pl-3">
                      <span className="text-sm text-cyan-100 font-medium"><IconText size={15}>{k}</IconText></span>
                      <span className="text-[13px] text-gray-400 leading-snug"><IconText size={13}>{v}</IconText></span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {/* Footer: navigation + page dots */}
          <div className="flex items-center justify-between px-6 py-3 border-t border-ink-line bg-ink/40">
            <button
              onClick={() => go(-1)}
              disabled={page === 0}
              className="rounded-lg border border-ink-line px-3 py-1.5 text-xs text-gray-300 enabled:hover:bg-ink-line/50 disabled:opacity-30 transition"
            >
              <Icon glyph="←" /> Prev
            </button>
            <div className="flex items-center gap-1.5">
              {PAGES.map((_, i) => (
                <button
                  key={i}
                  onClick={() => { setDir(i > page ? 'next' : 'prev'); setPage(i); }}
                  className={`h-2 rounded-full transition-all ${i === page ? 'w-5 bg-gradient-to-r from-violet-400 to-cyan-400' : 'w-2 bg-ink-line hover:bg-gray-600'}`}
                  aria-label={`Page ${i + 1}`}
                />
              ))}
            </div>
            <button
              onClick={() => go(1)}
              disabled={page === last}
              className="rounded-lg border border-ink-line px-3 py-1.5 text-xs text-gray-300 enabled:hover:bg-ink-line/50 disabled:opacity-30 transition"
            >
              Next <Icon glyph="→" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
