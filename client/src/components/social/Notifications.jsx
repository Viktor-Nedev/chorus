import { useEffect, useRef } from 'react';

const ICON = { like: '♥', comment: '💬', follow: '👤', remix: '♻', badge: '🏆' };

function timeAgo(iso) {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60); if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60); if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

// Панел за нотификации. `items` + `onMarkRead` идват от Social (централно, за
// да може NavOrb да ползва същия unread брояч).
export function NotificationsPanel({ items = [], onClose, onMarkRead }) {
  const marked = useRef(false);
  useEffect(() => {
    if (!marked.current && items.some((n) => !n.read)) {
      marked.current = true;
      onMarkRead?.();
    }
  }, [items, onMarkRead]);

  return (
    <div className="absolute right-0 top-12 z-40 w-80 max-h-[70vh] overflow-y-auto rounded-xl bg-ink-soft border border-ink-line shadow-2xl animate-slide-up" onClick={(e) => e.stopPropagation()}>
      <div className="flex items-center justify-between px-4 py-3 border-b border-ink-line sticky top-0 bg-ink-soft">
        <span className="text-sm font-bold text-white">Notifications</span>
        <button onClick={onClose} className="text-gray-500 hover:text-white transition text-xs">✕</button>
      </div>
      {items.length === 0 ? (
        <p className="text-xs text-gray-600 text-center py-10">Nothing yet.</p>
      ) : (
        <ul className="divide-y divide-ink-line">
          {items.map((n) => (
            <li key={n.id} className={`flex items-start gap-3 px-4 py-3 ${n.read ? '' : 'bg-accent-violet/[0.06]'}`}>
              <span className="text-base leading-none mt-0.5">{ICON[n.type] || '✦'}</span>
              <div className="min-w-0 flex-1">
                <p className="text-[13px] text-gray-200 leading-snug">{n.text}</p>
                <span className="text-[10px] text-gray-600">{timeAgo(n.at)}</span>
              </div>
              {!n.read && <span className="w-2 h-2 rounded-full bg-accent-violet mt-1.5 shrink-0" />}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
