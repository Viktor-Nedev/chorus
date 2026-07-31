// POST /api/webforge  { action: 'analyze' | 'generate' | 'chat', … }
// Порт на server/services/webforgeAi.js. Живее на Vercel до самия сайт, така
// че няма CORS и не иска Supabase CLI.
const { callGemini, imagePart, compactJson, withCommon } = require('./_gemini');

const BLUEPRINT_RULE = `THE SKETCH IS A BLUEPRINT, NOT A DESIGN — MOST IMPORTANT RULE:
Frame outlines, type labels ("hero", "footer"), freehand strokes and spray marks are
DRAFTING ANNOTATIONS marking WHERE things go. They must NEVER appear in the output — no
outlined boxes around sections, no visible sketch strokes, no "IMG" placeholder tiles with
crosses. Image placeholders become real visual treatments.

COLOUR — MATCH WHAT THE USER DREW: colours chosen explicitly (buttonColor /
buttonTextColor, fills set on a block) ARE intentional and must be honoured. Only the
DEFAULT per-type frame outline colours are meaningless drafting hints.`;

function paletteBlock(p) {
  if (!p) return '';
  return `SITE PALETTE — USE THESE EXACT HEX VALUES, DO NOT INVENT OTHER BRAND COLOURS:
  --wf-primary: ${p.primary}   (buttons, links, key accents)
  --wf-accent:  ${p.accent}    (secondary highlights)
  --wf-bg:      ${p.bg}        (page background)
  --wf-surface: ${p.surface}   (cards, raised panels)
  --wf-text:    ${p.text}      (body copy)
  --wf-muted:   ${p.muted}     (captions, borders)
Declare them in :root as CSS custom properties and reference them via var(--wf-*).
They come from the user's own drawing — matching them is REQUIRED.

`;
}

function analyzePrompt(p) {
  const size = p.canvasSize || {};
  return `You are a senior UI engineer analyzing a hand-drawn website layout sketch.
The image is a screenshot of a design canvas (${size.width}x${size.height}px).
Below is the JSON of the drawn objects, with px and percentage coordinates.

${compactJson(p.objects, 12000)}

${BLUEPRINT_RULE}

Identify the website components the user intends (position/size conventions: wide bar on
top = navbar, large block near top = hero, similar blocks in a row = cards, bottom strip =
footer, tall side block = sidebar). A frame with customType "form" is a FORM whose fields
are the objects inside it. A frame with customType "backend" needs server functionality.
Explicit customType values and user annotations OVERRIDE your guesses.

Return ONLY JSON:
{
  "components": [{ "type": "navbar|hero|section|card|footer|sidebar|form|button|image|text|nav|component",
    "label": "short name", "position": "top|left|right|center|bottom",
    "details": "1-2 sentences", "backendRequired": boolean, "backendNote": "…", "suggestion": "…" }],
  "summary": "one sentence describing the overall site",
  "improvements": ["3-6 concrete upgrades you will apply when generating"]
}`;
}

function generatePrompt(p) {
  const pages = p.pages;
  const multi = Array.isArray(pages) && pages.length > 1;
  return `You are a senior product designer AND full-stack developer. Turn this hand-drawn
blueprint into a COMPLETE, POLISHED, PRODUCTION-QUALITY website.
Project name: "${p.projectName || 'My Website'}".

Recognized components:
${compactJson(p.components, 8000)}

${multi
  ? `PAGES — generate ONE html file per page, all sharing styles.css and app.js:
${pages.map((pg) => `• "${pg.name}" -> frontend/${pg.path}${pg.objects ? ` — objects: ${compactJson(pg.objects, 4000)}` : ''}`).join('\n')}
Every page must include the SAME navigation, linking to the real file names above
(href="about.html"), with the current page marked active.`
  : `Raw drawn objects — positions as canvas percentages (xPct/yPct/wPct/hPct):
${compactJson(p.objects, 8000)}`}

${paletteBlock(p.palette)}${BLUEPRINT_RULE}

FOLLOW THE STRUCTURE, THEN IMPROVE IT:
- Preserve the blueprint's block order, side-by-side relationships and rough proportions,
  and keep the user's text as the basis for real copy.
- Then elevate it to what a professional studio would ship: real typographic scale,
  consistent spacing rhythm, sensible max-widths, hover/focus states, subtle transitions,
  fully responsive (mobile-first media queries), accessible (semantic landmarks, aria,
  alt text, WCAG-AA contrast).
- Fill obvious gaps the sketch implies (microcopy, secondary CTA, footer links) but do not
  invent whole major sections the user never drew.
${p.stylePreset ? `\nVISUAL STYLE: "${p.stylePreset}" — apply consistently while keeping the structure.\n` : ''}
REQUIREMENTS:
- Production-quality code, no TODOs, no lorem-only content.
- frontend/index.html (semantic HTML5), frontend/styles.css (modern CSS, no frameworks),
  frontend/app.js (vanilla JS: nav, forms, loading/error states).
- react/App.jsx — the same UI as one self-contained React component.
- If a backend is required: backend/server.js (Express, also serves ../frontend, PORT env,
  JSON-file persistence via fs) and backend/package.json (only express, cors, jsonwebtoken,
  with "start": "node server.js"). Otherwise omit and set hasBackend=false.

Return ONLY JSON: { "hasBackend": boolean, "files": [ { "path": "...", "content": "..." } ] }`;
}

function chatPrompt(p) {
  const files = p.files || [];
  const messages = p.messages || [];
  const fileContext = files
    .map((f) => `--- ${f.path} ---\n${(f.content || '').slice(0, 6000)}`)
    .join('\n\n');
  const history = messages.map((m) => `${m.role === 'user' ? 'USER' : 'AI'}: ${m.text}`).join('\n');
  return `You are the AI assistant inside a website builder. The user has a generated project
and asks for changes in natural language (possibly Bulgarian — reply in their language).

CURRENT PROJECT FILES:
${fileContext.slice(0, 30000)}

CONVERSATION:
${history}

If the latest message requests a code change, apply it and return the COMPLETE updated
content of every file you modified. If it's a question, answer it.

Return ONLY JSON: { "reply": "…", "updatedFiles": [ { "path": "…", "content": "FULL new content" } ] }`;
}

const rid = () => Math.random().toString(36).slice(2, 12);

module.exports = withCommon(async (body, res) => {
  const action = body?.action;
  const parts = [];

  if (action === 'analyze') {
    const img = imagePart(body.image);
    if (!img) return res.status(400).json({ error: 'image dataURL required' });
    parts.push(img, { text: analyzePrompt(body) });
  } else if (action === 'generate') {
    const img = imagePart(body.image);
    if (img) parts.push(img);
    parts.push({ text: generatePrompt(body) });
  } else if (action === 'chat') {
    parts.push({ text: chatPrompt(body) });
  } else {
    return res.status(400).json({ error: 'Unknown action' });
  }

  const result = await callGemini(parts, { json: true });

  if (action === 'generate') {
    if (!Array.isArray(result?.files) || !result.files.length) {
      return res.status(500).json({ error: 'AI returned no files' });
    }
    return res.status(200).json({
      projectId: body.projectId || rid(),
      hasBackend: !!result.hasBackend,
      files: result.files,
    });
  }
  return res.status(200).json(result);
});
