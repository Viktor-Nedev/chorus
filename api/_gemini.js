// Общ Gemini клиент за Vercel функциите. Чист fetch — без зависимости, за да
// не се налага root package.json (Vercel инсталира само client/).
//
// Ключът живее САМО на сървъра: Vercel → Settings → Environment Variables →
// GEMINI_API_KEY.

const MODELS = ['gemini-flash-latest', 'gemini-2.5-flash', 'gemini-2.5-flash-lite'];
const API = 'https://generativelanguage.googleapis.com/v1beta/models';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Устойчиво изваждане на JSON (маха ``` огради, търси балансирана структура)
function extractJson(text) {
  const t = String(text || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
  try {
    return JSON.parse(t);
  } catch {
    const s = t.indexOf('{');
    const e = t.lastIndexOf('}');
    if (s >= 0 && e > s) return JSON.parse(t.slice(s, e + 1));
    throw new Error('No valid JSON in AI response');
  }
}

function imagePart(dataURL) {
  const m = /^data:(image\/\w+);base64,(.+)$/.exec(dataURL || '');
  return m ? { inlineData: { mimeType: m[1], data: m[2] } } : null;
}

// Сериализира масив, режейки на граница на ЦЯЛ обект (сляп slice обърква модела)
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

class QuotaError extends Error {
  constructor(retryIn) {
    super('Gemini quota exceeded');
    this.code = 'quota_exceeded';
    this.retryIn = retryIn;
  }
}

/**
 * Вика Gemini с fallback през моделите.
 * @param {Array} parts - contents parts (text/inlineData)
 * @param {{ json?: boolean }} opts - json:true иска application/json отговор
 */
async function callGemini(parts, opts = {}) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    const e = new Error('GEMINI_API_KEY is not set on the server');
    e.code = 'no_key';
    throw e;
  }

  let lastErr = 'AI request failed';
  let quota = false;
  let retryIn = null;

  for (const model of MODELS) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const res = await fetch(`${API}/${model}:generateContent?key=${key}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ role: 'user', parts }],
            ...(opts.json ? { generationConfig: { responseMimeType: 'application/json' } } : {}),
          }),
        });

        if (res.ok) {
          const data = await res.json();
          const text = (data?.candidates?.[0]?.content?.parts || [])
            .map((p) => p.text || '')
            .join('');
          return opts.json ? extractJson(text) : text.trim();
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
          break; // квотата е per-model → направо следващия модел
        }
        if (res.status >= 500 && attempt === 0) {
          await sleep(1500);
          continue;
        }
        break;
      } catch (e) {
        lastErr = String(e.message || e);
        if (attempt === 0) await sleep(1000);
      }
    }
  }
  if (quota) throw new QuotaError(retryIn);
  throw new Error(lastErr);
}

// Еднакво поведение за всички функции: CORS + четене на JSON body
function withCommon(handler) {
  return async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'content-type, authorization');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    if (req.method === 'OPTIONS') return res.status(204).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

    try {
      // Vercel обикновено вече е парснал body-то; ако не — прочети потока
      let body = req.body;
      if (!body || typeof body === 'string') {
        const raw = typeof body === 'string' ? body : await new Promise((resolve) => {
          let d = '';
          req.on('data', (c) => (d += c));
          req.on('end', () => resolve(d));
        });
        body = raw ? JSON.parse(raw) : {};
      }
      return await handler(body, res);
    } catch (err) {
      if (err.code === 'quota_exceeded') {
        return res.status(429).json({ error: 'quota_exceeded', retryIn: err.retryIn ?? null });
      }
      if (err.code === 'no_key') {
        return res.status(500).json({
          error: 'GEMINI_API_KEY is not configured on Vercel — add it in Settings → Environment Variables and redeploy.',
        });
      }
      console.error('AI error:', err.message);
      return res.status(500).json({ error: err.message || 'AI request failed' });
    }
  };
}

module.exports = { callGemini, extractJson, imagePart, compactJson, withCommon, QuotaError };
