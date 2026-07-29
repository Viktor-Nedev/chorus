// CHORUS · WebForge AI — Supabase Edge Function (Deno)
//
// Прокси към Gemini, за да работят Analyze/Generate/Chat от хостнатия сайт,
// без Node сървър. GEMINI_API_KEY се пази като Supabase secret.
//
// Deploy:
//   supabase functions deploy webforge-ai
//   supabase secrets set GEMINI_API_KEY=<key>
//
// Body: { action: 'analyze' | 'generate' | 'chat', ...payload }

const MODELS = ['gemini-flash-latest', 'gemini-2.5-flash', 'gemini-2.5-flash-lite'];
const API = 'https://generativelanguage.googleapis.com/v1beta/models';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });

function extractJson(text: string) {
  let t = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
  try {
    return JSON.parse(t);
  } catch {
    const s = t.indexOf('{');
    const e = t.lastIndexOf('}');
    if (s >= 0 && e > s) return JSON.parse(t.slice(s, e + 1));
    throw new Error('No valid JSON in AI response');
  }
}

function imagePart(dataURL: string) {
  const m = /^data:(image\/\w+);base64,(.+)$/.exec(dataURL || '');
  if (!m) return null;
  return { inlineData: { mimeType: m[1], data: m[2] } };
}

// Сериализира до budget символа, режейки на граница на цял обект
function compact(items: unknown, budget: number) {
  if (!Array.isArray(items)) return JSON.stringify(items ?? null);
  const parts: string[] = [];
  let size = 2;
  for (const item of items) {
    const s = JSON.stringify(item);
    if (size + s.length + 1 > budget) break;
    parts.push(s);
    size += s.length + 1;
  }
  return `[${parts.join(',')}]`;
}

async function callGemini(parts: unknown[], key: string) {
  let lastErr = 'AI request failed';
  let quota = false;
  let retryIn: number | null = null;

  for (const model of MODELS) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const res = await fetch(`${API}/${model}:generateContent?key=${key}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ role: 'user', parts }],
            generationConfig: { responseMimeType: 'application/json' },
          }),
        });
        if (res.ok) {
          const data = await res.json();
          const text = data?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text).join('') ?? '';
          return extractJson(text);
        }
        const errText = await res.text();
        lastErr = errText.slice(0, 300);
        if (res.status === 429 || /quota/i.test(errText)) {
          quota = true;
          const m = /retry in ([\d.]+)s|"retryDelay":\s*"(\d+)/i.exec(errText);
          if (m) {
            const r = Math.ceil(parseFloat(m[1] || m[2]));
            if (retryIn === null || r < retryIn) retryIn = r;
          }
          break; // per-model квота → следващия модел
        }
        if (res.status >= 500 && attempt === 0) {
          await new Promise((r) => setTimeout(r, 1500));
          continue;
        }
        break;
      } catch (e) {
        lastErr = String(e);
        if (attempt === 0) await new Promise((r) => setTimeout(r, 1000));
      }
    }
  }
  if (quota) {
    const err = new Error('quota_exceeded') as Error & { code: string; retryIn: number | null };
    err.code = 'quota_exceeded';
    err.retryIn = retryIn;
    throw err;
  }
  throw new Error(lastErr);
}

const BLUEPRINT_RULE = `THE SKETCH IS A BLUEPRINT, NOT A DESIGN — MOST IMPORTANT RULE:
Frame outlines, their colors, type labels ("hero", "footer"), freehand strokes and spray
marks are DRAFTING ANNOTATIONS marking WHERE things go. They must NEVER appear in the
output — no colored borders around sections, no outlined boxes, no visible sketch strokes,
no "IMG" placeholder tiles with crosses. Image placeholders become real visual treatments.
Button colors the user explicitly chose (buttonColor/buttonTextColor) ARE intentional.`;

function analyzePrompt(p: Record<string, unknown>) {
  const size = p.canvasSize as { width?: number; height?: number } | undefined;
  return `You are a senior UI engineer analyzing a hand-drawn website layout sketch.
The image is a screenshot of a design canvas (${size?.width}x${size?.height}px).
Below is the JSON of the drawn objects, with px and percentage coordinates.

${compact(p.objects, 12000)}

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

function generatePrompt(p: Record<string, unknown>) {
  const pages = p.pages as Array<Record<string, unknown>> | undefined;
  const multi = Array.isArray(pages) && pages.length > 1;
  return `You are a senior product designer AND full-stack developer. Turn this hand-drawn
blueprint into a COMPLETE, POLISHED, PRODUCTION-QUALITY website.
Project name: "${p.projectName || 'My Website'}".

Recognized components:
${compact(p.components, 8000)}

${multi
  ? `PAGES — generate ONE html file per page, all sharing styles.css and app.js:
${pages!.map((pg) => `• "${pg.name}" -> frontend/${pg.path}${pg.objects ? ` — objects: ${compact(pg.objects, 4000)}` : ''}`).join('\n')}
Every page must include the SAME navigation, linking to the real file names above
(href="about.html"), with the current page marked active.`
  : `Raw drawn objects — positions as canvas percentages (xPct/yPct/wPct/hPct):
${compact(p.objects, 8000)}`}

${BLUEPRINT_RULE}

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

function chatPrompt(p: Record<string, unknown>) {
  const files = (p.files as Array<{ path: string; content: string }>) || [];
  const messages = (p.messages as Array<{ role: string; text: string }>) || [];
  const fileContext = files.map((f) => `--- ${f.path} ---\n${(f.content || '').slice(0, 6000)}`).join('\n\n');
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

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);

  const key = Deno.env.get('GEMINI_API_KEY');
  if (!key) return json({ error: 'GEMINI_API_KEY is not set on the function' }, 500);

  try {
    const payload = await req.json();
    const action = payload?.action;
    const parts: unknown[] = [];

    if (action === 'analyze') {
      const img = imagePart(payload.image);
      if (!img) return json({ error: 'image dataURL required' }, 400);
      parts.push(img, { text: analyzePrompt(payload) });
    } else if (action === 'generate') {
      const img = imagePart(payload.image);
      if (img) parts.push(img);
      parts.push({ text: generatePrompt(payload) });
    } else if (action === 'chat') {
      parts.push({ text: chatPrompt(payload) });
    } else {
      return json({ error: 'Unknown action' }, 400);
    }

    const result = await callGemini(parts, key);

    if (action === 'generate') {
      if (!Array.isArray(result?.files) || !result.files.length) {
        return json({ error: 'AI returned no files' }, 500);
      }
      return json({
        projectId: payload.projectId || crypto.randomUUID().slice(0, 10),
        hasBackend: !!result.hasBackend,
        files: result.files,
      });
    }
    return json(result);
  } catch (e) {
    const err = e as Error & { code?: string; retryIn?: number };
    if (err.code === 'quota_exceeded') {
      return json({ error: 'quota_exceeded', retryIn: err.retryIn ?? null }, 429);
    }
    return json({ error: err.message || 'AI request failed' }, 500);
  }
});
