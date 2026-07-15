const express = require('express');
const rateLimit = require('express-rate-limit');
const path = require('path');
const fs = require('fs').promises;
const fsSync = require('fs');
const archiver = require('archiver');
const { nanoid } = require('nanoid');
const { analyzeSketch, generateProject, chatEdit } = require('../services/webforgeAi');
const hosting = require('../services/hostingService');

const router = express.Router();
const limiter = rateLimit({ windowMs: 60 * 1000, max: 20, standardHeaders: true });
router.use(limiter);

const GENERATED_DIR = path.join(__dirname, '../generated');
fs.mkdir(GENERATED_DIR, { recursive: true }).catch(() => {});

const SAFE_ID = /^[A-Za-z0-9_-]{1,32}$/;

// TTL cleanup: генерираните проекти по-стари от 7 дни се трият (при старт
// и на всеки 6 часа). Проекти с работещ container се пропускат.
const PROJECT_TTL_MS = 7 * 24 * 60 * 60 * 1000;
async function cleanupOldProjects() {
  try {
    const entries = await fs.readdir(GENERATED_DIR, { withFileTypes: true });
    for (const e of entries) {
      if (!e.isDirectory() || !SAFE_ID.test(e.name)) continue;
      if (hosting.isRunning?.(e.name)) continue;
      const stat = await fs.stat(path.join(GENERATED_DIR, e.name)).catch(() => null);
      if (stat && Date.now() - stat.mtimeMs > PROJECT_TTL_MS) {
        await fs.rm(path.join(GENERATED_DIR, e.name), { recursive: true, force: true });
        console.log(`WebForge: cleaned up old project ${e.name}`);
      }
    }
  } catch (err) {
    console.error('WebForge cleanup error:', err.message);
  }
}
cleanupOldProjects();
setInterval(cleanupOldProjects, 6 * 60 * 60 * 1000).unref();

// Файловите пътища от AI/клиента минават през тази проверка —
// само relative, без .. и без абсолютни пътища.
function safeRelPath(p) {
  if (typeof p !== 'string' || !p.length) return null;
  const norm = path.normalize(p).replace(/\\/g, '/');
  if (norm.startsWith('..') || path.isAbsolute(norm) || norm.includes('../')) return null;
  return norm;
}

async function writeProjectFiles(projectId, files) {
  const dir = path.join(GENERATED_DIR, projectId);
  for (const f of files) {
    const rel = safeRelPath(f.path);
    if (!rel || typeof f.content !== 'string') continue;
    const full = path.join(dir, rel);
    await fs.mkdir(path.dirname(full), { recursive: true });
    await fs.writeFile(full, f.content, 'utf8');
  }
}

// Quota грешките отиват към клиента като 429 с retryIn — не като общо 500
function sendAiError(res, err, fallbackMsg) {
  if (err.code === 'quota_exceeded') {
    return res.status(429).json({ error: 'quota_exceeded', retryIn: err.retryIn });
  }
  console.error('WebForge AI error:', err.message);
  res.status(500).json({ error: fallbackMsg + ': ' + err.message });
}

// Кеш на анализите: същата скица → същият отговор, без нов Gemini call.
// (PNG dataURL-ът е детерминистичен за непроменено платно.)
const analyzeCache = new Map(); // hash → { result, at }
const ANALYZE_CACHE_TTL = 10 * 60 * 1000;
function quickHash(s) {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return h;
}

// ── POST /analyze — Gemini vision анализ на скицата
router.post('/analyze', async (req, res) => {
  try {
    const { image, objects, canvasSize } = req.body || {};
    if (!image?.startsWith('data:image/')) {
      return res.status(400).json({ error: 'image dataURL required' });
    }
    const key = quickHash(image + JSON.stringify(objects || []));
    const cached = analyzeCache.get(key);
    if (cached && Date.now() - cached.at < ANALYZE_CACHE_TTL) {
      return res.json(cached.result);
    }
    const result = await analyzeSketch({ image, objects, canvasSize });
    analyzeCache.set(key, { result, at: Date.now() });
    if (analyzeCache.size > 40) analyzeCache.delete(analyzeCache.keys().next().value);
    res.json(result);
  } catch (err) {
    sendAiError(res, err, 'Analysis failed');
  }
});

// ── POST /generate — пълна генерация на проект
router.post('/generate', async (req, res) => {
  try {
    const { projectId: incoming, projectName, objects, components, image, stylePreset } = req.body || {};
    const projectId = SAFE_ID.test(incoming || '') ? incoming : nanoid(10);

    const result = await generateProject({ projectName, objects, components, image, stylePreset });
    if (!Array.isArray(result.files) || result.files.length === 0) {
      return res.status(500).json({ error: 'AI returned no files' });
    }

    await writeProjectFiles(projectId, result.files);
    // Метаданни за deploy
    await fs.writeFile(
      path.join(GENERATED_DIR, projectId, '.meta.json'),
      JSON.stringify({ projectName, hasBackend: !!result.hasBackend, createdAt: Date.now() })
    );

    res.json({ projectId, hasBackend: !!result.hasBackend, files: result.files });
  } catch (err) {
    sendAiError(res, err, 'Generation failed');
  }
});

// ── POST /chat — AI промени по проекта
router.post('/chat', async (req, res) => {
  try {
    const { projectId, messages, files } = req.body || {};
    const result = await chatEdit({ messages, files });
    // Персистирай промените, ако има валиден проект
    if (SAFE_ID.test(projectId || '') && Array.isArray(result.updatedFiles) && result.updatedFiles.length) {
      await writeProjectFiles(projectId, result.updatedFiles);
    }
    res.json(result);
  } catch (err) {
    sendAiError(res, err, 'Chat failed');
  }
});

// ── POST /save — записва ръчните Monaco редакции
router.post('/save', async (req, res) => {
  try {
    const { projectId, files } = req.body || {};
    if (!SAFE_ID.test(projectId || '')) return res.status(400).json({ error: 'Bad projectId' });
    if (!Array.isArray(files)) return res.status(400).json({ error: 'files required' });
    await writeProjectFiles(projectId, files);
    res.json({ success: true });
  } catch (err) {
    console.error('WebForge save error:', err.message);
    res.status(500).json({ error: 'Save failed' });
  }
});

// ── GET /download/:projectId — ZIP на целия проект
router.get('/download/:projectId', async (req, res) => {
  const { projectId } = req.params;
  if (!SAFE_ID.test(projectId)) return res.status(400).json({ error: 'Bad id' });
  const dir = path.join(GENERATED_DIR, projectId);
  if (!fsSync.existsSync(dir)) return res.status(404).json({ error: 'Not found' });

  res.attachment(`webforge-${projectId}.zip`);
  const archive = archiver('zip', { zlib: { level: 9 } });
  archive.on('error', (err) => res.status(500).end(String(err)));
  archive.pipe(res);
  archive.directory(dir, false);
  archive.append(
    `# WebForge Project\n\nGenerated by CHORUS WebForge.\n\n## Run\n\n### Static frontend only\nOpen frontend/index.html in a browser.\n\n### With backend\n\`\`\`\ncd backend\nnpm install\nnpm start\n\`\`\`\nThen open http://localhost:3000\n`,
    { name: 'README.md' }
  );
  archive.finalize();
});

// ── Docker deploy
router.get('/docker/status', async (req, res) => {
  res.json({ available: await hosting.isAvailable() });
});

router.post('/deploy/docker', async (req, res) => {
  try {
    const { projectId } = req.body || {};
    if (!SAFE_ID.test(projectId || '')) return res.status(400).json({ error: 'Bad projectId' });
    const result = await hosting.deploy(projectId);
    res.json(result);
  } catch (err) {
    if (err.code === 'docker_unavailable') {
      return res.status(503).json({ error: 'docker_unavailable' });
    }
    console.error('WebForge deploy error:', err.message);
    res.status(500).json({ error: 'Deploy failed: ' + err.message });
  }
});

router.delete('/deploy/docker/:projectId', async (req, res) => {
  const { projectId } = req.params;
  if (!SAFE_ID.test(projectId)) return res.status(400).json({ error: 'Bad id' });
  try {
    res.json(await hosting.stop(projectId));
  } catch (err) {
    res.status(500).json({ error: 'Stop failed' });
  }
});

module.exports = router;
