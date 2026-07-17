// Състезания по рисуване с гласуване. JSON store: server/competitions/{id}.json
// { id, theme, description, createdBy:{id,username}, createdAt, endsAt,
//   entries: [{userId, username, artworkId, imageData, at}], votes: {voterId: entryUserId} }
const express = require('express');
const rateLimit = require('express-rate-limit');
const fs = require('fs').promises;
const path = require('path');
const { nanoid } = require('nanoid');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.use(rateLimit({ windowMs: 60 * 1000, max: 60, standardHeaders: true }));

const COMP_DIR = path.join(__dirname, '../competitions');
const GALLERY_DIR = path.join(__dirname, '../gallery');
fs.mkdir(COMP_DIR, { recursive: true }).catch(() => {});

const SAFE_ID = /^[A-Za-z0-9_-]{1,32}$/;

async function loadAll() {
  const files = await fs.readdir(COMP_DIR).catch(() => []);
  const comps = await Promise.all(
    files
      .filter((f) => f.endsWith('.json'))
      .map(async (f) => {
        try {
          return JSON.parse(await fs.readFile(path.join(COMP_DIR, f), 'utf8'));
        } catch {
          return null;
        }
      })
  );
  return comps.filter(Boolean);
}

async function loadOne(id) {
  if (!SAFE_ID.test(id)) return null;
  try {
    return JSON.parse(await fs.readFile(path.join(COMP_DIR, `${id}.json`), 'utf8'));
  } catch {
    return null;
  }
}

async function save(comp) {
  await fs.writeFile(path.join(COMP_DIR, `${comp.id}.json`), JSON.stringify(comp, null, 2));
}

// Публичен изглед: без самоличности на гласувалите, с изчислени резултати
function publicView(comp, viewerId) {
  const tally = {};
  for (const target of Object.values(comp.votes || {})) {
    tally[target] = (tally[target] || 0) + 1;
  }
  const ended = Date.now() > new Date(comp.endsAt).getTime();
  let winner = null;
  if (ended && comp.entries.length) {
    const best = [...comp.entries].sort(
      (a, b) => (tally[b.userId] || 0) - (tally[a.userId] || 0) || new Date(a.at) - new Date(b.at)
    )[0];
    if (best) winner = { userId: best.userId, username: best.username, votes: tally[best.userId] || 0 };
  }
  return {
    id: comp.id,
    theme: comp.theme,
    description: comp.description,
    createdBy: comp.createdBy,
    createdAt: comp.createdAt,
    endsAt: comp.endsAt,
    ended,
    winner,
    totalVotes: Object.keys(comp.votes || {}).length,
    myVote: viewerId ? comp.votes?.[viewerId] || null : null,
    entries: comp.entries.map((e) => ({ ...e, votes: tally[e.userId] || 0 })),
  };
}

// Опционален viewer (за myVote) — без да изисква auth за четене
const { verifyToken } = require('../middleware/auth');
async function optionalAuth(req, _res, next) {
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  req.user = await verifyToken(token);
  next();
}

router.get('/', optionalAuth, async (req, res) => {
  try {
    const comps = await loadAll();
    comps.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    res.json(comps.map((c) => publicView(c, req.user?.id)));
  } catch (err) {
    console.error('Competitions list error:', err.message);
    res.status(500).json({ error: 'Could not load competitions' });
  }
});

router.post('/', requireAuth, async (req, res) => {
  try {
    const { theme, description, hours } = req.body || {};
    const t = String(theme || '').trim();
    if (t.length < 3 || t.length > 80) return res.status(400).json({ error: 'Theme: 3–80 characters' });
    const h = Math.min(24 * 14, Math.max(1, Number(hours) || 24));
    const comp = {
      id: nanoid(10),
      theme: t,
      description: String(description || '').slice(0, 300),
      createdBy: { id: req.user.id, username: req.user.username },
      createdAt: new Date().toISOString(),
      endsAt: new Date(Date.now() + h * 3600 * 1000).toISOString(),
      entries: [],
      votes: {},
    };
    await save(comp);
    res.json(publicView(comp, req.user.id));
  } catch (err) {
    console.error('Competition create error:', err.message);
    res.status(500).json({ error: 'Could not create competition' });
  }
});

router.post('/:id/enter', requireAuth, async (req, res) => {
  try {
    const comp = await loadOne(req.params.id);
    if (!comp) return res.status(404).json({ error: 'Not found' });
    if (Date.now() > new Date(comp.endsAt).getTime()) return res.status(400).json({ error: 'Competition has ended' });
    const { artworkId } = req.body || {};
    if (!SAFE_ID.test(artworkId || '')) return res.status(400).json({ error: 'Bad artworkId' });
    if (comp.entries.some((e) => e.userId === req.user.id)) {
      return res.status(409).json({ error: 'You already entered this competition' });
    }
    let artwork;
    try {
      artwork = JSON.parse(await fs.readFile(path.join(GALLERY_DIR, `${artworkId}.json`), 'utf8'));
    } catch {
      return res.status(404).json({ error: 'Artwork not found' });
    }
    if (artwork.userId && artwork.userId !== req.user.id) {
      return res.status(403).json({ error: 'You can only enter your own artwork' });
    }
    comp.entries.push({
      userId: req.user.id,
      username: req.user.username,
      artworkId,
      title: artwork.title,
      imageData: artwork.imageData,
      at: new Date().toISOString(),
    });
    await save(comp);
    res.json(publicView(comp, req.user.id));
  } catch (err) {
    console.error('Competition enter error:', err.message);
    res.status(500).json({ error: 'Could not enter' });
  }
});

router.post('/:id/vote', requireAuth, async (req, res) => {
  try {
    const comp = await loadOne(req.params.id);
    if (!comp) return res.status(404).json({ error: 'Not found' });
    if (Date.now() > new Date(comp.endsAt).getTime()) return res.status(400).json({ error: 'Voting has closed' });
    const { entryUserId } = req.body || {};
    if (entryUserId === req.user.id) return res.status(400).json({ error: 'You cannot vote for yourself' });
    if (!comp.entries.some((e) => e.userId === entryUserId)) {
      return res.status(404).json({ error: 'Entry not found' });
    }
    comp.votes[req.user.id] = entryUserId; // повторен вот = смяна
    await save(comp);
    res.json(publicView(comp, req.user.id));
  } catch (err) {
    console.error('Competition vote error:', err.message);
    res.status(500).json({ error: 'Could not vote' });
  }
});

module.exports = { router, loadAll };
