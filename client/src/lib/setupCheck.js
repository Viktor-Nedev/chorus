// Превежда грешките от Supabase в разбираемо съобщение и проверява дали
// базата изобщо е настроена.
//
// PostgREST различава ясно:
//   404 / PGRST205 / "does not exist"  → таблицата липсва (не е пуснат setup.sql)
//   401 / 42501 / "JWT"                → не си влязъл или RLS не позволява
//   200 + []                           → всичко е наред, просто няма данни
import { supabase } from './supabase';

export const SETUP_HINT =
  'The database is not set up yet — open Supabase → SQL Editor and run supabase/setup.sql.';

export function describeSupabaseError(err, what = 'Action') {
  if (!err) return `${what} failed`;
  const code = String(err.code || '');
  const msg = String(err.message || err);

  if (code === 'PGRST205' || code === '42P01' || /does not exist|schema cache|not find the table/i.test(msg)) {
    return SETUP_HINT;
  }
  if (code === '42501' || /row-level security|violates row-level/i.test(msg)) {
    return 'Not allowed — sign in with your account first.';
  }
  if (code === 'PGRST301' || /jwt|invalid token|not authenticated/i.test(msg)) {
    return 'Your session expired — sign in again.';
  }
  if (/failed to fetch|networkerror/i.test(msg)) {
    return 'No connection to the server. Check your internet and try again.';
  }
  return `${what} failed — ${msg}`;
}

// Таблиците, без които съответният режим не работи
const REQUIRED = [
  ['artworks', 'saving artwork, the Archive and Profile'],
  ['posts', 'Social'],
  ['competitions', 'Compete'],
  ['sessions', 'Collective rooms'],
];

/**
 * Проверява кои таблици липсват. Връща `null`, ако Supabase не е конфигуриран
 * (тогава приложението и без това е на Express) или ако всичко е налице.
 */
export async function checkSetup() {
  if (!supabase) return null;
  const missing = [];
  for (const [table, used] of REQUIRED) {
    const { error } = await supabase.from(table).select('*', { head: true, count: 'exact' }).limit(1);
    if (error && (error.code === 'PGRST205' || error.code === '42P01' ||
                  /does not exist|not find the table/i.test(error.message || ''))) {
      missing.push({ table, used });
    }
  }
  return missing.length ? missing : null;
}
