// AI генератор на avatar параметри за MIRROR — от описание (+ опц. селфи)
// Gemini връща JSON със същата схема като slider панела. При липса на
// ключ/квота хвърля → routes-ът връща 429/500 и клиентът остава на slider-ите.
const { getClient } = require('./geminiService');

const MODELS = ['gemini-flash-latest', 'gemini-2.5-flash', 'gemini-2.5-flash-lite'];
const ACCESSORIES = ['none', 'catEars', 'horns', 'antenna', 'halo', 'whiskers', 'tongue'];
const CHARACTERS = ['cat', 'alien', 'skull', 'robot', 'devil', 'ghost'];

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
    text: `You design a PARTICLE FACE AVATAR for a user. It always mimics the user's
real expressions and head pose. Choose EITHER a full distinct character face OR a
deformation of the user's own face.

${img ? 'An image of the desired avatar is attached — match the closest character base and colors. Also consider: ' : ''}User request: "${(prompt || 'a cool avatar').slice(0, 300)}"

Return ONLY JSON:
{
  "label": "short 1-3 word name",
  "emoji": "one emoji",
  "type": "character" | "live",
  "character": one of ${JSON.stringify(CHARACTERS)}   // REQUIRED if type=character
  "deform": {                                         // used if type=live (multipliers, 1=unchanged)
    "eye": 0.4..2.2, "faceLength": 0.6..1.6, "jaw": 0.5..1.6,
    "cheek": 0.3..2.2, "nose": 0.4..2.0, "eyeDepth": 0.5..2.2
  },
  "accessory": one of ${JSON.stringify(ACCESSORIES)}, // used if type=live
  "particleSize": 0.6..1.8,
  "glow": 0..1,
  "fixedColor": "#RRGGBB"
}
Prefer type="character" when the request clearly matches one (cat, alien, skull,
robot, demon→devil, ghost). Otherwise type="live" with deformation + accessory
(e.g. big anime eyes → live, eye 1.8; vampire → live with fangs? use tongue/none).
No prose.`,
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
