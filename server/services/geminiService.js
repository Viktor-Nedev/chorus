const { GoogleGenerativeAI } = require('@google/generative-ai');

let genAI = null;
function getClient() {
  if (!genAI) {
    if (!process.env.GEMINI_API_KEY) throw new Error('GEMINI_API_KEY is not set');
    genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  }
  return genAI;
}

// Чиста функция — сглобява промпта. Изнесена за unit-тест (палитрата и
// емоционалната дъга трябва да присъстват).
function buildPoemPrompt({
  duration,
  totalUsers,
  emotionHistory = [],
  significantMoments,
  silenceMoments,
  colors = [],
  mode,
}) {
  const isCollective = mode === 'collective';

  const systemContext = isCollective
    ? `You are a minimalist poet writing about collective human experiences.
Write in second person plural. 8-12 lines, free verse, concrete imagery.
No clichés. No title. Only the poem.`
    : `You are a minimalist poet writing about a single person's creative moment.
Write in second person singular. 6-10 lines, free verse, concrete imagery.
Ground the images in the actual colours they painted with — let those colours
appear as concrete things (not colour words listed, but evoked).
No clichés. No title. Only the poem.`;

  const emotionSummary = emotionHistory
    .filter((_, i) => i % 5 === 0) // всеки 5-ти запис
    .slice(0, 60) // ограничи prompt размера
    .map((e) => {
      if (isCollective) {
        const dominant = Object.values(e.emotions || {}).reduce((acc, em) => {
          acc[em] = (acc[em] || 0) + 1;
          return acc;
        }, {});
        const top = Object.entries(dominant).sort((a, b) => b[1] - a[1])[0];
        return top ? `${e.timestamp}s: mostly ${top[0]}` : null;
      }
      return `${e.timestamp}s: ${e.emotion}`;
    })
    .filter(Boolean)
    .join('\n');

  const momentsText =
    significantMoments
      ?.map((m) => `at ${m.timestamp}s: mood shifted from ${m.from} to ${m.to}`)
      .join('\n') || '';

  const silenceText =
    silenceMoments?.map((s) => `at ${s.timestamp}s: silence for ${s.duration} seconds`).join('\n') ||
    '';

  // Палитра → четим списък имена (най-плътните цветове първи).
  const paletteText = (colors || [])
    .map((c) => (typeof c === 'string' ? c : c?.name || c?.hex))
    .filter(Boolean)
    .join(', ');

  if (isCollective) {
    return `${systemContext}

${totalUsers} people shared a digital canvas for ${duration} seconds.

Emotional arc:
${emotionSummary || 'mostly neutral, quietly present'}

${momentsText}

${silenceText}

Write a poem about this shared moment.`;
  }

  return `${systemContext}

One person created art for ${duration} seconds.

The colours they painted with, most present first:
${paletteText || 'muted, mostly shadow and a little light'}

Their emotional journey:
${emotionSummary || 'mostly neutral, quietly focused'}

${silenceText}

Write a poem about this creative moment, letting those colours live inside the images.`;
}

async function generatePoem(payload = {}) {
  const model = getClient().getGenerativeModel({ model: 'gemini-flash-latest' });
  const prompt = buildPoemPrompt(payload);
  const result = await model.generateContent(prompt);
  return result.response.text().trim();
}

module.exports = { generatePoem, buildPoemPrompt, getClient };
