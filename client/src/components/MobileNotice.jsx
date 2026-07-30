import { useState } from 'react';
import { Icon, IconText } from './Icon';

// Ненатрапчив банер само на тесни екрани — тежките редактори (Sculpt/WebForge/
// Collective) са проектирани за desktop и мишка/клавиатура.
export function MobileNotice({ label = 'This mode works best on a larger screen' }) {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;
  return (
    <div className="sm:hidden fixed top-2 inset-x-2 z-[60] flex items-center gap-2 rounded-lg bg-ink-soft/95 border border-amber-500/40 px-3 py-2 backdrop-blur animate-fade-in">
      <span className="text-base"><Icon glyph="🖥" /></span>
      <span className="flex-1 text-[11px] text-amber-200/90 leading-snug"><IconText size={13}>{label}</IconText></span>
      <button
        onClick={() => setDismissed(true)}
        className="text-gray-400 hover:text-white text-sm px-1"
        title="Dismiss"
      ><Icon glyph="✕" /></button>
    </div>
  );
}
