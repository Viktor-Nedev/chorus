// Единичен споделен Supabase клиент. Когато anon key липсва, `supabase` е null
// и приложението пада към локалния Express backend (auth JWT + /api/social).
import { createClient } from '@supabase/supabase-js';

const SUPA_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPA_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = SUPA_URL && SUPA_KEY ? createClient(SUPA_URL, SUPA_KEY) : null;

// Кой backend обслужва социалния слой: реалният Supabase или Express fallback-ът.
export const SOCIAL_BACKEND = supabase ? 'supabase' : 'express';
