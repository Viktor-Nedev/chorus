// Видео запис от Mood Check (particle avatar clips). Съхраняват се като
// файлове (webm), не base64 в JSON — реферират се от gallery entry чрез videoUrl.
const express = require('express');
const rateLimit = require('express-rate-limit');
const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const { nanoid } = require('nanoid');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.use(rateLimit({ windowMs: 60 * 1000, max: 15, standardHeaders: true }));

const VIDEO_DIR = path.join(__dirname, '../videos');
fs.mkdir(VIDEO_DIR, { recursive: true }).catch(() => {});

const SAFE_ID = /^[A-Za-z0-9_-]{1,32}$/;
const TTL_MS = 7 * 24 * 60 * 60 * 1000;

// TTL cleanup при старт + на всеки 6h
async function cleanupOldVideos() {
  try {
    const files = await fs.readdir(VIDEO_DIR);
    for (const f of files) {
      if (!f.endsWith('.webm')) continue;
      const full = path.join(VIDEO_DIR, f);
      const stat = await fs.stat(full).catch(() => null);
      if (stat && Date.now() - stat.mtimeMs > TTL_MS) {
        await fs.rm(full, { force: true });
      }
    }
  } catch (err) {
    console.error('Video cleanup error:', err.message);
  }
}
cleanupOldVideos();
setInterval(cleanupOldVideos, 6 * 60 * 60 * 1000).unref();

// POST /api/videos — суров webm body (raw parser на mount-а в index.js)
router.post('/', requireAuth, async (req, res) => {
  try {
    if (!Buffer.isBuffer(req.body) || req.body.length < 100) {
      return res.status(400).json({ error: 'Empty or invalid video body' });
    }
    const id = nanoid(12);
    await fs.writeFile(path.join(VIDEO_DIR, `${id}.webm`), req.body);
    res.json({ url: `/videos/${id}.webm`, id });
  } catch (err) {
    console.error('Video upload error:', err.message);
    res.status(500).json({ error: 'Upload failed' });
  }
});

// Best-effort изтриване (вика се от gallery DELETE)
function deleteVideoByUrl(videoUrl) {
  const m = /^\/videos\/([A-Za-z0-9_-]{1,32})\.webm$/.exec(videoUrl || '');
  if (!m) return;
  fs.rm(path.join(VIDEO_DIR, `${m[1]}.webm`), { force: true }).catch(() => {});
}

// Static сервиране, guarded
function serveVideo(req, res, next) {
  if (!SAFE_ID.test(req.params.id)) return res.status(400).end();
  const file = path.join(VIDEO_DIR, `${req.params.id}.webm`);
  if (!fsSync.existsSync(file)) return res.status(404).end();
  res.type('video/webm');
  fsSync.createReadStream(file).pipe(res);
}

module.exports = { router, serveVideo, deleteVideoByUrl, VIDEO_URL_RE: /^\/videos\/[A-Za-z0-9_-]{1,32}\.webm$/ };
