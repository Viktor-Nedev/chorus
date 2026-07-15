// WebForge AI pipeline — Gemini vision анализ на скицата + генерация на код.
const { getClient } = require('./geminiService');

// Основен + fallback модел (503 при пикове на latest alias-а са нормални)
const MODELS = ['gemini-flash-latest', 'gemini-2.5-flash'];

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

async function callJson(parts, retryHint) {
  let lastErr;
  for (const modelName of MODELS) {
    const model = getClient().getGenerativeModel({
      model: modelName,
      generationConfig: { responseMimeType: 'application/json' },
    });
    try {
      const result = await model.generateContent(parts);
      return extractJson(result.response.text());
    } catch (err) {
      lastErr = err;
      // При невалиден JSON (не мрежов проблем) — един retry със същия модел
      // и изрична инструкция; при 503/мрежова грешка — премини към fallback
      const transient = /503|429|Service Unavailable|high demand|fetch/i.test(String(err.message));
      if (!transient) {
        try {
          const result = await model.generateContent([
            ...parts,
            { text: `\n\nIMPORTANT: ${retryHint || 'Return ONLY valid JSON, no prose, no markdown fences.'}` },
          ]);
          return extractJson(result.response.text());
        } catch (err2) {
          lastErr = err2;
        }
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
Below is the JSON of the drawn objects with their positions, sizes, colors, text content,
user-assigned types ("customType"), and user annotations:

${JSON.stringify(objects, null, 1).slice(0, 12000)}

Identify the website components the user intends. Consider:
- position/size conventions (dark bar at top = navbar; large block near top = hero;
  3 similar blocks in a row = cards; bottom strip = footer; tall narrow side block = sidebar)
- text content semantics (short top text = logo/nav items, big text = headline)
- forms and their fields (login/register/contact/checkout/search) — decide if a backend
  is required and which auth approach fits
- explicit customType values and annotations OVERRIDE your guesses

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
async function generateProject({ projectName, objects, components, image }) {
  const parts = [];
  if (image) parts.push(dataUrlToInlinePart(image));
  parts.push({
    text: `You are a senior full-stack developer. Generate a COMPLETE, WORKING website
from this hand-drawn layout analysis. Project name: "${projectName || 'My Website'}".

Recognized components:
${JSON.stringify(components, null, 1).slice(0, 8000)}

Raw drawn objects (positions/sizes/colors/text/annotations):
${JSON.stringify(objects, null, 1).slice(0, 8000)}

REQUIREMENTS:
- Real, production-quality code. NO placeholders like "TODO" or lorem-only content —
  write sensible real copy based on the sketch's text content.
- frontend/index.html — semantic HTML5, links styles.css and app.js relatively.
- frontend/styles.css — modern CSS (flex/grid, CSS variables, responsive with media
  queries, smooth hover states). Match colors from the sketch where meaningful.
  No external CSS frameworks. Google Fonts via <link> is allowed.
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
