// Локален auth fallback — ползва се когато Supabase anon key липсва.
// Пази потребителите в server/users/users.json (bcrypt хешове).
const express = require('express');
const rateLimit = require('express-rate-limit');
const fs = require('fs').promises;
const path = require('path');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { nanoid } = require('nanoid');
const { requireAuth, JWT_SECRET } = require('../middleware/auth');

const router = express.Router();
router.use(rateLimit({ windowMs: 60 * 1000, max: 30, standardHeaders: true }));

const USERS_DIR = path.join(__dirname, '../users');
const USERS_FILE = path.join(USERS_DIR, 'users.json');
fs.mkdir(USERS_DIR, { recursive: true }).catch(() => {});

async function loadUsers() {
  try {
    return JSON.parse(await fs.readFile(USERS_FILE, 'utf8'));
  } catch {
    return [];
  }
}
async function saveUsers(users) {
  await fs.writeFile(USERS_FILE, JSON.stringify(users, null, 2));
}

const signToken = (u) =>
  jwt.sign({ sub: u.id, email: u.email, username: u.username }, JWT_SECRET, { expiresIn: '30d' });

const publicUser = (u) => ({ id: u.id, email: u.email, username: u.username, createdAt: u.createdAt });

router.post('/register', async (req, res) => {
  try {
    const { email, username, password } = req.body || {};
    const em = String(email || '').trim().toLowerCase();
    const un = String(username || '').trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) return res.status(400).json({ error: 'Valid email required' });
    if (!/^[a-zA-Z0-9_\-. ]{3,24}$/.test(un)) return res.status(400).json({ error: 'Username: 3–24 chars (letters, digits, _-. )' });
    if (String(password || '').length < 6) return res.status(400).json({ error: 'Password: at least 6 characters' });

    const users = await loadUsers();
    if (users.some((u) => u.email === em)) return res.status(409).json({ error: 'Email already registered' });
    if (users.some((u) => u.username.toLowerCase() === un.toLowerCase())) return res.status(409).json({ error: 'Username taken' });

    const user = {
      id: nanoid(12),
      email: em,
      username: un,
      passwordHash: await bcrypt.hash(String(password), 10),
      createdAt: new Date().toISOString(),
    };
    users.push(user);
    await saveUsers(users);
    res.json({ token: signToken(user), user: publicUser(user) });
  } catch (err) {
    console.error('Register error:', err.message);
    res.status(500).json({ error: 'Registration failed' });
  }
});

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body || {};
    const users = await loadUsers();
    const user = users.find((u) => u.email === String(email || '').trim().toLowerCase());
    if (!user || !(await bcrypt.compare(String(password || ''), user.passwordHash))) {
      return res.status(401).json({ error: 'Wrong email or password' });
    }
    res.json({ token: signToken(user), user: publicUser(user) });
  } catch (err) {
    console.error('Login error:', err.message);
    res.status(500).json({ error: 'Login failed' });
  }
});

// Работи и за двата backend-а (middleware-ът верифицира и Supabase токени)
router.get('/me', requireAuth, (req, res) => {
  res.json({ user: req.user });
});

module.exports = router;
