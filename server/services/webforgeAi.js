// WebForge AI pipeline — Gemini vision анализ на скицата + генерация на код.
const { getClient } = require('./geminiService');

// Основен + fallback модели (503 при пикове на latest alias-а са нормални)
const MODELS = ['gemini-flash-latest', 'gemini-2.5-flash', 'gemini-2.5-flash-lite'];

// Устойчиво извличане на JSON от Gemini отговор (маха ``` огради, търси
// първата { ... } балансирана структура при нужда).
function extractJson(text) {
  let t = text.trim();
  t = t.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
  try {
    return JSON.parse(t);
  } catch {
    const start = t.indexOf('{');
    const end = t.lastIndexOf('}');
    if (start >= 0 && end > start) {
      return JSON.parse(t.slice(start, end + 1));
    }
    throw new Error('No valid JSON in AI response');
  }
}

function dataUrlToInlinePart(dataURL) {
  const match = /^data:(image\/\w+);base64,(.+)$/.exec(dataURL);
  if (!match) throw new Error('Invalid image dataURL');
  return { inlineData: { mimeType: match[1], data: match[2] } };
}

// Сериализира масив от обекти до JSON, режейки на граница на ЦЯЛ обект
// (сляп slice() среже структурата по средата и обърква модела).
function compactJson(items, budget) {
  if (!Array.isArray(items)) return JSON.stringify(items ?? null);
  const parts = [];
  let size = 2;
  for (const item of items) {
    const s = JSON.stringify(item);
    if (size + s.length + 1 > budget) break;
    parts.push(s);
    size += s.length + 1;
  }
  return `[${parts.join(',')}]`;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Изважда препоръчаното време за изчакване от 429 отговор ("retryDelay":"44s")
function parseRetrySeconds(msg) {
  const m = /retry in ([\d.]+)s|"retryDelay":"(\d+)/i.exec(msg);
  return m ? Math.ceil(parseFloat(m[1] || m[2])) : null;
}

class QuotaError extends Error {
  constructor(retryIn) {
    super('Gemini quota exceeded');
    this.code = 'quota_exceeded';
    this.retryIn = retryIn;
  }
}

async function callJson(parts, retryHint) {
  let lastErr;
  let sawQuota = false;
  let minRetryIn = null;
  for (const modelName of MODELS) {
    const model = getClient().getGenerativeModel({
      model: modelName,
      generationConfig: { responseMimeType: 'application/json' },
    });
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const reqParts =
          attempt === 0
            ? parts
            : [
                ...parts,
                { text: `\n\nIMPORTANT: ${retryHint || 'Return ONLY valid JSON, no prose, no markdown fences.'}` },
              ];
        const result = await model.generateContent(reqParts);
        return extractJson(result.response.text());
      } catch (err) {
        lastErr = err;
        const msg = String(err.message);
        // 429 quota: retry на СЪЩИЯ модел е безсмислен (квотата е per-model,
        // per-day на free tier) — направо следващия модел, без да горим заявки.
        if (/429|Too Many Requests|quota/i.test(msg)) {
          sawQuota = true;
          const r = parseRetrySeconds(msg);
          if (r && (minRetryIn === null || r < minRetryIn)) minRetryIn = r;
          break;
        }
        const transient = /503|Service Unavailable|high demand|overloaded|fetch/i.test(msg);
        if (transient && attempt === 0) await sleep(1500);
      }
    }
  }
  if (sawQuota) throw new QuotaError(minRetryIn);
  throw lastErr;
}

// ── АНАЛИЗ: скица + обектен JSON → разпознати компоненти
async function analyzeSketch({ image, objects, canvasSize }) {
  const parts = [
    dataUrlToInlinePart(image),
    {
      text: `You are a senior UI engineer analyzing a hand-drawn website layout sketch.
The image is a screenshot of a design canvas (${canvasSize?.width}x${canvasSize?.height}px).
Below is the JSON of the drawn objects. Positions/sizes are given BOTH in canvas px
(left/top/width/height) and as percentages of the canvas (xPct/yPct/wPct/hPct).

${compactJson(objects, 12000)}

THE SKETCH IS A BLUEPRINT, NOT A DESIGN. Frame outlines, their colors, type labels,
freehand strokes and spray marks are DRAFTING ANNOTATIONS the user drew to mark where
things go — they are never part of the final visual design.

Identify the website components the user intends. Rules:
- position/size conventions (wide bar near the top = navbar; large block near top = hero;
  similar blocks in a row = cards; bottom strip = footer; tall narrow side block = sidebar)
- text content semantics (short top text = logo/nav items, big text = headline)
- a frame with customType "form" is a FORM. Objects spatially INSIDE its bounds are its
  fields: infer each field's type from its text/shape (e.g. "Email" text → email input,
  small rect rows → text inputs, a button inside → submit). Decide if a backend is
  required and which auth approach fits.
- a frame with customType "backend" marks a region that needs SERVER functionality —
  its annotation describes what (API, data storage, auth). Always set backendRequired
  true for it.
- freehand strokes (type "freehand") are rough drawings — interpret them from the IMAGE
  by their position and shape.
- explicit customType values and user annotations OVERRIDE your guesses.

Return ONLY JSON:
{
  "components": [
    {
      "type": "navbar|hero|section|card|footer|sidebar|form|button|image|text|nav|component",
      "label": "short human name",
      "position": "top|left|right|center|bottom",
      "details": "1-2 sentences: content, items, styling suggestions",
      "backendRequired": boolean,
      "backendNote": "if backendRequired: what the backend must do (e.g. JWT auth, store submissions)",
      "suggestion": "optional improvement suggestion"
    }
  ],
  "summary": "one sentence describing the overall site",
  "improvements": ["3-6 concrete upgrades you will apply when generating (hierarchy, spacing, copy, accessibility, responsiveness)"]
}`,
    },
  ];
  return callJson(parts);
}

// ── ГЕНЕРАЦИЯ: компоненти + обекти → пълен проект (файлове)
async function generateProject({ projectName, objects, components, image, stylePreset, pages }) {
  const multi = Array.isArray(pages) && pages.length > 1;
  const parts = [];
  if (image) parts.push(dataUrlToInlinePart(image));
  parts.push({
    text: `You are a senior product designer AND full-stack developer. Turn this hand-drawn
blueprint into a COMPLETE, POLISHED, PRODUCTION-QUALITY website.
Project name: "${projectName || 'My Website'}".

Recognized components:
${compactJson(components, 8000)}

${multi
  ? `PAGES — generate ONE html file per page, all sharing styles.css and app.js:
${pages.map((p) => `• "${p.name}" -> frontend/${p.path}${p.objects ? ` — objects: ${compactJson(p.objects, 4000)}` : ''}`).join('\n')}
Every page must include the SAME navigation, with links pointing at the real file
names above (href="about.html" etc.), and the current page marked as active.`
  : `Raw drawn objects — positions/sizes as CANVAS PERCENTAGES (xPct/yPct/wPct/hPct),
plus colors, text and user annotations:
${compactJson(objects, 8000)}`}

THE SKETCH IS A BLUEPRINT, NOT A DESIGN — THIS IS THE MOST IMPORTANT RULE:
- Frame outlines, their colors, type labels ("hero", "footer"), freehand strokes and
  spray marks are DRAFTING ANNOTATIONS marking WHERE things go. They must NEVER appear
  in the output — no colored borders around sections, no outlined boxes, no visible
  strokes, no "IMG" placeholder tiles with crosses.
- Image placeholders become real visual treatments (tasteful CSS gradient/solid blocks
  with proper aspect-ratio, or an <img> with a descriptive alt if a real source is implied).
- The button colors the user explicitly chose (buttonColor/buttonTextColor) ARE intentional
  — honour those. Frame stroke colors are NOT.

FOLLOW THE STRUCTURE, THEN IMPROVE IT:
- Preserve the blueprint's structure: top-to-bottom order of blocks, what sits side by
  side (same row → flex/grid columns), and rough proportions (wPct ~100 = full width,
  ~30 = a third). Keep the user's text content as the basis for the real copy.
- Then ELEVATE it into something a professional studio would ship: a real typographic
  scale, consistent spacing rhythm, sensible max-widths, hover/focus states, subtle
  transitions, fully responsive (mobile-first with media queries), and accessible
  (semantic landmarks, aria labels, alt text, WCAG-AA contrast).
- Fill obvious gaps the sketch implies but does not spell out: microcopy, a secondary
  CTA, footer links/columns, section intros. Do NOT invent whole major sections the
  user never drew.
- Use the attached image to resolve anything ambiguous — it is the ground truth for intent.
${stylePreset ? `\nVISUAL STYLE: "${stylePreset}" — apply this aesthetic consistently (typography, palette, spacing, shadows) while keeping the blueprint's structure intact.\n` : ''}
REQUIREMENTS:
- Real, production-quality code. NO placeholders like "TODO" or lorem-only content —
  write sensible real copy based on the sketch's text content.
- frontend/index.html — semantic HTML5, links styles.css and app.js relatively.
- frontend/styles.css — modern CSS (flex/grid, CSS variables, responsive with media
  queries, smooth hover states). No external CSS frameworks. Google Fonts via <link>
  is allowed.
- frontend/app.js — vanilla JS: nav interactions, form handling (fetch to /api/...),
  loading/error states. Must work when opened via file:// EXCEPT api calls.
- react/App.jsx — the SAME UI as a single-file React component (functional, hooks,
  inline styles or a styles object) for developers who prefer React. No imports
  beyond react itself.
- IF any component requires a backend (forms, auth, data):
  - backend/server.js — Express server that ALSO serves ../frontend statically,
    listens on process.env.PORT || 3000. Implements every needed API route
    (e.g. POST /api/login with JWT via jsonwebtoken, POST /api/contact storing
    submissions). Persistence: plain JSON files via fs (data/ folder) — NO native
    modules, NO external databases.
  - backend/package.json — deps ONLY from: express, cors, jsonwebtoken. Include
    "start": "node server.js".
- If NO backend is needed, omit backend files and set hasBackend=false.

Return ONLY JSON (no fences):
{
  "hasBackend": boolean,
  "files": [ { "path": "frontend/index.html", "content": "..." }, ... ]
}`,
  });
  return callJson(parts, 'Return ONLY the JSON object with hasBackend and files array.');
}

// ── CHAT: промени по съществуващия проект
async function chatEdit({ messages, files }) {
  const fileContext = (files || [])
    .map((f) => `--- ${f.path} ---\n${f.content.slice(0, 6000)}`)
    .join('\n\n');
  const history = (messages || [])
    .map((m) => `${m.role === 'user' ? 'USER' : 'AI'}: ${m.text}`)
    .join('\n');

  const parts = [
    {
      text: `You are the AI assistant inside a website builder. The user has a generated
project and asks for changes in natural language (possibly Bulgarian — reply in the
same language they use).

CURRENT PROJECT FILES:
${fileContext.slice(0, 30000)}

CONVERSATION:
${history}

If the latest user message requests a code change, apply it and return the COMPLETE
updated content of every file you modified. If it's just a question, answer it.

Return ONLY JSON:
{
  "reply": "short explanation of what you did / your answer",
  "updatedFiles": [ { "path": "frontend/styles.css", "content": "FULL new content" } ]
}
(updatedFiles may be an empty array if nothing changed)`,
    },
  ];
  return callJson(parts, 'Return ONLY the JSON with reply and updatedFiles.');
}

module.exports = { analyzeSketch, generateProject, chatEdit };
