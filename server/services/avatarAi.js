// AI генератор на avatar параметри за MIRROR — от описание (+ опц. селфи)
// Gemini връща JSON със същата схема като slider панела. При липса на
// ключ/квота хвърля → routes-ът връща 429/500 и клиентът остава на slider-ите.
const { getClient } = require('./geminiService');

const MODELS = ['gemini-flash-latest', 'gemini-2.5-flash', 'gemini-2.5-flash-lite'];
const ACCESSORIES = ['none', 'catEars', 'horns', 'antenna', 'halo', 'whiskers'];

function extractJson(text) {
  let t = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
  try {
    return JSON.parse(t);
  } catch {
    const a = t.indexOf('{'), b = t.lastIndexOf('}');
    if (a >= 0 && b > a) return JSON.parse(t.slice(a, b + 1));
    throw new Error('No JSON in AI response');
  }
}

function inlineImage(dataURL) {
  const m = /^data:(image\/\w+);base64,(.+)$/.exec(dataURL || '');
  return m ? { inlineData: { mimeType: m[1], data: m[2] } } : null;
}

async function generateAvatarParams({ prompt, image }) {
  const parts = [];
  const img = image && inlineImage(image);
  if (img) parts.push(img);
  parts.push({
    text: `You design a stylized PARTICLE FACE AVATAR that is applied on top of a
user's LIVE tracked face (it always mimics their real expressions and head pose).
You only choose deformation + accessory parameters — never geometry.

${img ? 'Look at the attached selfie for inspiration, and also consider this text: ' : ''}User request: "${(prompt || 'a cool avatar').slice(0, 300)}"

Return ONLY JSON with this exact shape (numbers are multipliers, 1 = unchanged):
{
  "label": "short 1-3 word name",
  "deform": {
    "eye": 0.4..2.2,        // eye size
    "faceLength": 0.6..1.6, // skull elongation
    "jaw": 0.5..1.6,        // jaw width
    "cheek": 0.3..2.2,      // cheek puff(>1)/hollow(<1)
    "nose": 0.4..2.0,
    "eyeDepth": 0.5..2.2    // sunken eyes(>1)
  },
  "accessory": one of ${JSON.stringify(ACCESSORIES)},
  "particleSize": 0.6..1.8,
  "glow": 0..1,
  "fixedColor": "#RRGGBB"
}
Pick values that match the request (e.g. "alien" → big eyes, long face, narrow jaw,
antenna; "demon" → horns, red; "cat" → catEars, whiskers). No prose.`,
  });

  let lastErr;
  for (const modelName of MODELS) {
    try {
      const model = getClient().getGenerativeModel({
        model: modelName,
        generationConfig: { responseMimeType: 'application/json' },
      });
      const result = await model.generateContent(parts);
      return extractJson(result.response.text());
    } catch (err) {
      lastErr = err;
      if (/429|quota|Too Many Requests/i.test(String(err.message))) {
        const e = new Error('quota_exceeded');
        e.code = 'quota_exceeded';
        throw e;
      }
    }
  }
  throw lastErr || new Error('AI generation failed');
}

module.exports = { generateAvatarParams };
