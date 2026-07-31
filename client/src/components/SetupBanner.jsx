import { useEffect, useState } from 'react';
import { checkSetup } from '../lib/setupCheck';

// Ако базата не е настроена, показва точно какво липсва и какво да се направи —
// вместо режимите да се чупят с неясни грешки.
export function SetupBanner() {
  const [missing, setMissing] = useState(null);
  const [dismissed, setDismissed] = useState(
    () => { try { return sessionStorage.getItem('chorus-setup-dismissed') === '1'; } catch { return false; } }
  );

  useEffect(() => {
    checkSetup().then(setMissing).catch(() => {});
  }, []);

  if (!missing?.length || dismissed) return null;

  return (
    <div className="fixed bottom-0 inset-x-0 z-[90] border-t border-amber-700/60 bg-amber-950/95 backdrop-blur px-4 py-3 text-amber-100 animate-slide-up">
      <div className="max-w-3xl mx-auto flex items-start gap-3 text-xs leading-relaxed">
        <span className="text-base leading-none">⚠</span>
        <div className="flex-1">
          <b className="text-amber-200">The database isn’t set up yet.</b>{' '}
          Missing {missing.length === 1 ? 'table' : 'tables'}:{' '}
          {missing.map((m) => <code key={m.table} className="mx-0.5 text-amber-300">{m.table}</code>)}
          <div className="mt-1 text-amber-200/80">
            Open <b>Supabase → SQL Editor</b>, paste <code className="text-amber-300">supabase/setup.sql</code> and press
            Run. Until then {missing.map((m) => m.used).join(', ')} won’t work.
          </div>
        </div>
        <button
          onClick={() => {
            setDismissed(true);
            try { sessionStorage.setItem('chorus-setup-dismissed', '1'); } catch { /* ignore */ }
          }}
          className="shrink-0 rounded border border-amber-700 px-2 py-1 text-[11px] text-amber-200 hover:bg-amber-900/60 transition"
        >
          Hide
        </button>
      </div>
    </div>
  );
}
