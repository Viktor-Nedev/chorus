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

async function callJson(parts, retryHint) {
  let lastErr;
  for (const modelName of MODELS) {
    const model = getClient().getGenerativeModel({
      model: modelName,
      generationConfig: { responseMimeType: 'application/json' },
    });
    // До 2 опита на модел: transient (503/429) → backoff и втори опит на
    // същия модел; невалиден JSON → втори опит с изрична инструкция.
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
        const transient = /503|429|Service Unavailable|high demand|overloaded|fetch/i.test(String(err.message));
        if (transient && attempt === 0) await sleep(1500);
      }
    }
  }
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
  "summary": "one sentence describing the overall site"
}`,
    },
  ];
  return callJson(parts);
}

// ── ГЕНЕРАЦИЯ: компоненти + обекти → пълен проект (файлове)
async function generateProject({ projectName, objects, components, image, stylePreset }) {
  const parts = [];
  if (image) parts.push(dataUrlToInlinePart(image));
  parts.push({
    text: `You are a senior full-stack developer. Generate a COMPLETE, WORKING website
from this hand-drawn layout. Project name: "${projectName || 'My Website'}".

Recognized components:
${compactJson(components, 8000)}

Raw drawn objects — positions/sizes as CANVAS PERCENTAGES (xPct/yPct/wPct/hPct),
plus colors, text and user annotations:
${compactJson(objects, 8000)}

LAYOUT FIDELITY — NON-NEGOTIABLE:
- The generated page MUST reproduce the sketch's spatial arrangement. Use the
  percentage coordinates: preserve the top-to-bottom order of blocks, side-by-side
  blocks stay side by side (same row → flex/grid columns), relative widths/heights
  stay proportional (a block with wPct 100 is full-width; wPct ~30 is a third).
- EVERY drawn object must have a visible counterpart in the HTML. Do not invent
  major sections the user did not draw; small tasteful embellishments are OK.
- Reuse the sketch's text content verbatim as real copy (headlines, labels, nav items).
- Match the sketch's colors where they look intentional (fills/strokes the user chose).
- Look at the attached image to resolve anything ambiguous — it is the ground truth.
${stylePreset ? `\nVISUAL STYLE: "${stylePreset}" — apply this aesthetic consistently (typography, colors, spacing, shadows) while keeping the drawn layout intact.\n` : ''}
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
