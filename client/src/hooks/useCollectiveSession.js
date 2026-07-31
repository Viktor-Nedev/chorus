// Един вход за Collective, който избира транспорта:
//
//   · Supabase конфигуриран → Realtime канали (работи на Vercel, без сървър)
//   · иначе                 → Socket.io към локалния Express
//
// И двата hook-а излагат един и същ интерфейс, затова страницата не се променя.
import { supabase } from '../lib/supabase';
import { useRealtimeSession } from './useRealtimeSession';
import { useSocket } from './useSocket';

export const COLLECTIVE_BACKEND = supabase ? 'realtime' : 'socket';

export function useCollectiveSession() {
  // Hook-овете не може да се викат условно — викаме и двата, но ползваме само
  // избрания. Неизбраният не се свързва никъде, докато не му кажем.
  const realtime = useRealtimeSession();
  const socket = useSocket();
  return supabase ? realtime : socket;
}
