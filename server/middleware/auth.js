// Верифицира Bearer токен: първо локален JWT (бърз, офлайн fallback),
// после Supabase (GET /auth/v1/user, кеширан 60s на токен).
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'chorus-dev-secret';
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

const supaCache = new Map(); // token → { user, at }
const SUPA_TTL = 60 * 1000;

async function verifySupabase(token) {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return null;
  const hit = supaCache.get(token);
  if (hit && Date.now() - hit.at < SUPA_TTL) return hit.user;
  try {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { Authorization: `Bearer ${token}`, apikey: SUPABASE_ANON_KEY },
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data?.id) return null;
    const user = {
      id: data.id,
      email: data.email,
      username: data.user_metadata?.username || data.email?.split('@')[0] || 'artist',
      backend: 'supabase',
    };
    supaCache.set(token, { user, at: Date.now() });
    if (supaCache.size > 200) supaCache.delete(supaCache.keys().next().value);
    return user;
  } catch {
    return null;
  }
}

async function verifyToken(token) {
  if (!token) return null;
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    return { id: payload.sub, email: payload.email, username: payload.username, backend: 'local' };
  } catch {
    return verifySupabase(token);
  }
}

async function requireAuth(req, res, next) {
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  const user = await verifyToken(token);
  if (!user) return res.status(401).json({ error: 'Not authenticated' });
  req.user = user;
  next();
}

module.exports = { requireAuth, verifyToken, JWT_SECRET };
