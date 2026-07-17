// AI съдия за Game Arena: когато играчите са < 3, Gemini vision класира
// рисунките по prompt-а. При липса на ключ/квота — детерминистичен
// fallback по ред на предаване (играта никога не блокира).
const { getClient } = require('./geminiService');

const MODELS = ['gemini-flash-latest', 'gemini-2.5-flash'];

function dataUrlToPart(dataURL) {
  const m = /^data:(image\/\w+);base64,(.+)$/.exec(dataURL);
  if (!m) return null;
  return { inlineData: { mimeType: m[1], data: m[2] } };
}

// entries: [{ userId, nickname, png }]
async function judgeRound(prompt, entries) {
  const parts = [];
  for (const e of entries) {
    const img = dataUrlToPart(e.png);
    if (!img) continue;
    parts.push({ text: `Entry "${e.userId}":` });
    parts.push(img);
  }
  parts.push({
    text: `You are the playful art judge of a drawing party game. The prompt was: "${prompt}".
Rank ALL entries from best to worst by how well they depict the prompt (recognizability
first, then charm/effort). Be generous — these are quick doodles.

Return ONLY JSON:
{ "ranking": ["entryId best", "entryId second", ...], "comment": "one fun sentence about the winner (mention what you liked)" }`,
  });

  let lastErr;
  for (const modelName of MODELS) {
    try {
      const model = getClient().getGenerativeModel({
        model: modelName,
        generationConfig: { responseMimeType: 'application/json' },
      });
      const result = await model.generateContent(parts);
      let text = result.response.text().trim();
      text = text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
      const data = JSON.parse(text);
      if (!Array.isArray(data.ranking)) throw new Error('bad ranking');
      // Валидирай: само реални id-та, допълни липсващите по ред на предаване
      const valid = data.ranking.filter((id) => entries.some((e) => e.userId === id));
      for (const e of entries) if (!valid.includes(e.userId)) valid.push(e.userId);
      return { ranking: valid, comment: String(data.comment || '').slice(0, 200), ai: true };
    } catch (err) {
      lastErr = err;
    }
  }
  console.error('Arena AI judge failed:', lastErr?.message);
  return {
    ranking: entries.map((e) => e.userId),
    comment: 'The AI judge is napping — ranked by who finished first!',
    ai: false,
  };
}

module.exports = { judgeRound };
