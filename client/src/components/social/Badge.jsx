import { Icon } from '../Icon';
// Бадж чип + ред от баджове до име. Server-ът връща наготово { icon, title }.

export function Badge({ badge, size = 'sm' }) {
  const px = size === 'lg' ? 'text-base px-2.5 py-1' : 'text-[11px] px-1.5 py-0.5';
  return (
    <span
      title={badge.title}
      className={`inline-flex items-center gap-1 rounded-full border border-yellow-500/40 bg-yellow-500/10 text-yellow-300 ${px}`}
    >
      <span className="leading-none"><Icon glyph={badge.icon} size={14} /></span>
      {size === 'lg' && <span className="font-medium truncate max-w-[16ch]">{badge.title}</span>}
    </span>
  );
}

// Компактен ред от баджове (икони) до автор — с +N препълване.
export function BadgeRow({ badges = [], max = 3 }) {
  if (!badges.length) return null;
  const shown = badges.slice(0, max);
  const extra = badges.length - shown.length;
  return (
    <span className="inline-flex items-center gap-1 align-middle">
      {shown.map((b) => (
        <span
          key={b.id}
          title={b.title}
          className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-yellow-500/40 bg-yellow-500/10 text-[11px] leading-none"
        >
          <Icon glyph={b.icon} size={13} />
        </span>
      ))}
      {extra > 0 && <span className="text-[10px] text-yellow-400/80">+{extra}</span>}
    </span>
  );
}
