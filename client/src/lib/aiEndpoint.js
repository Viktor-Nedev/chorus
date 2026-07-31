// Къде живее AI-то (поема, WebForge генерация):
//
//  · На хостнат домейн → Vercel serverless функции на СЪЩИЯ домейн (`/api/…`).
//    Няма CORS, ключът стои на сървъра, деплойва се заедно със сайта.
//  · Локално (localhost) → Express сървърът, ако VITE_SERVER_URL сочи към него.
//
// Така не се налага нито Supabase CLI, нито отделен хостинг.

const SERVER_URL = import.meta.env.VITE_SERVER_URL || '';

const isLocalHost =
  typeof window !== 'undefined' &&
  /^(localhost|127\.0\.0\.1|\[::1\])$/.test(window.location.hostname);

// Локално предпочитаме Express (там е и Docker/hosting частта на WebForge);
// навсякъде другаде — Vercel функциите.
export const USE_VERCEL_API = !isLocalHost || !SERVER_URL;

export const poemUrl = () => (USE_VERCEL_API ? '/api/poem' : `${SERVER_URL}/api/poem`);

// Express има отделни маршрути (/analyze, /generate, /chat); Vercel функцията е
// една и приема { action }.
export function webforgeRequest(action, payload) {
  return USE_VERCEL_API
    ? { url: '/api/webforge', body: { action, ...payload } }
    : { url: `${SERVER_URL}/api/webforge/${action}`, body: payload };
}

// Съобщение, когато AI-то е недостъпно — казва точно какво липсва.
export const AI_UNAVAILABLE = USE_VERCEL_API
  ? 'AI is unavailable — add GEMINI_API_KEY in Vercel → Settings → Environment Variables, then redeploy.'
  : "AI is unavailable — the CHORUS server isn't running. Start it with `node server/index.js`.";
