const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const { nanoid } = require('nanoid');

const router = express.Router();
const GALLERY_DIR = path.join(__dirname, '../gallery');

// Увери се, че папката съществува
fs.mkdir(GALLERY_DIR, { recursive: true }).catch(() => {});

const SAFE_ID = /^[A-Za-z0-9_-]{1,32}$/;

// GET всички творби — с thumbnail, без пълните тежки полета
router.get('/', async (req, res) => {
  try {
    const files = await fs.readdir(GALLERY_DIR);
    const artworks = await Promise.all(
      files
        .filter((f) => f.endsWith('.json'))
        .map(async (f) => {
          try {
            const data = JSON.parse(await fs.readFile(path.join(GALLERY_DIR, f), 'utf8'));
            const { emotionHistory, ...rest } = data;
            return rest; // imageData остава като thumbnail източник
          } catch {
            return null;
          }
        })
    );
    res.json(
      artworks
        .filter(Boolean)
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    );
  } catch (err) {
    console.error('Gallery read error:', err.message);
    res.status(500).json({ error: 'Could not load gallery' });
  }
});

// GET конкретна творба (пълни данни)
router.get('/:id', async (req, res) => {
  if (!SAFE_ID.test(req.params.id)) return res.status(400).json({ error: 'Bad id' });
  try {
    const data = await fs.readFile(path.join(GALLERY_DIR, `${req.params.id}.json`), 'utf8');
    res.json(JSON.parse(data));
  } catch {
    res.status(404).json({ error: 'Not found' });
  }
});

// POST запази нова творба
router.post('/', async (req, res) => {
  try {
    const { title, author, description, imageData, emotionHistory, poem, duration, mode, totalUsers } =
      req.body || {};

    if (!imageData || typeof imageData !== 'string' || !imageData.startsWith('data:image/')) {
      return res.status(400).json({ error: 'imageData is required' });
    }

    const id = nanoid(10);
    const artwork = {
      id,
      title: String(title || 'Untitled').slice(0, 100),
      author: String(author || 'Anonymous').slice(0, 50),
      description: String(description || '').slice(0, 500),
      imageData,
      emotionHistory: Array.isArray(emotionHistory) ? emotionHistory.slice(0, 600) : [],
      poem: String(poem || '').slice(0, 2000),
      duration: Number(duration) || 0,
      totalUsers: Number(totalUsers) || undefined,
      mode: ['collective', 'moodcheck'].includes(mode) ? mode : 'solo',
      createdAt: new Date().toISOString(),
    };

    await fs.writeFile(path.join(GALLERY_DIR, `${id}.json`), JSON.stringify(artwork, null, 2));
    res.json({ id, success: true });
  } catch (err) {
    console.error('Gallery save error:', err.message);
    res.status(500).json({ error: 'Could not save' });
  }
});

// DELETE
router.delete('/:id', async (req, res) => {
  if (!SAFE_ID.test(req.params.id)) return res.status(400).json({ error: 'Bad id' });
  try {
    await fs.unlink(path.join(GALLERY_DIR, `${req.params.id}.json`));
    res.json({ success: true });
  } catch {
    res.status(404).json({ error: 'Not found' });
  }
});

module.exports = router;
