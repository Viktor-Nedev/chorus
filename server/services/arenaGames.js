// Чисти помощни функции + думи за Pictionary и Impostor (Fake Artist).
// Изнесени тук, за да са unit-тестваеми без сокети.

const PICTIONARY_WORDS = [
  'cat', 'dog', 'house', 'tree', 'sun', 'car', 'boat', 'fish', 'star', 'flower',
  'apple', 'banana', 'rocket', 'robot', 'ghost', 'pizza', 'guitar', 'crown', 'snake', 'butterfly',
  'mountain', 'rainbow', 'umbrella', 'clock', 'key', 'heart', 'moon', 'cloud', 'snowman', 'castle',
  'dragon', 'octopus', 'penguin', 'elephant', 'bicycle', 'lighthouse', 'cactus', 'mushroom', 'ladder', 'anchor',
];

const IMPOSTOR_WORDS = [
  'beach', 'forest', 'kitchen', 'birthday', 'space', 'ocean', 'farm', 'circus', 'winter', 'garden',
  'airport', 'library', 'concert', 'desert', 'volcano', 'carnival', 'museum', 'playground', 'harbor', 'jungle',
];

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

function normalizeGuess(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9а-я\s]/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Познаване: точно съвпадение ИЛИ тайната дума присъства като отделна дума
// (или като под-фраза, ако е многодумна). „a cat!" → познава „cat".
function isCorrectGuess(text, secret) {
  const t = normalizeGuess(text);
  const s = normalizeGuess(secret);
  if (!t || !s) return false;
  if (t === s) return true;
  if (s.includes(' ')) return t.includes(s);
  return t.split(' ').includes(s);
}

// Точки за познал по ред (0-базиран): по-рано = повече, но не под 40.
function pictionaryScore(order) {
  return Math.max(40, 100 - order * 20);
}

// Точки за рисуващия: пропорционално на дела познали (0..100).
function pictionaryDrawerScore(guessedCount, guessers) {
  if (guessers <= 0) return 0;
  return Math.round((guessedCount / guessers) * 100);
}

// Impostor точкуване. votes: { voterId: suspectId }; impostorId; players: [ids].
// Връща { scores, caught, suspectId }.
function impostorScores(votes, impostorId, players) {
  const tally = {};
  for (const suspect of Object.values(votes || {})) {
    if (suspect) tally[suspect] = (tally[suspect] || 0) + 1;
  }
  let suspectId = null;
  let best = -1;
  for (const [id, c] of Object.entries(tally)) {
    if (c > best) { best = c; suspectId = id; }
  }
  const caught = best > 0 && suspectId === impostorId;
  const scores = {};
  for (const id of players) scores[id] = 0;

  if (caught) {
    // Всеки не-импостор, гласувал правилно за импостора → +100. Импосторът: 0.
    for (const [voter, suspect] of Object.entries(votes || {})) {
      if (voter !== impostorId && suspect === impostorId) scores[voter] = (scores[voter] || 0) + 100;
    }
  } else if (players.includes(impostorId)) {
    // Импосторът оцеля → голям бонус.
    scores[impostorId] = 150;
  }
  return { scores, caught, suspectId };
}

module.exports = {
  PICTIONARY_WORDS, IMPOSTOR_WORDS, pick,
  normalizeGuess, isCorrectGuess, pictionaryScore, pictionaryDrawerScore, impostorScores,
};
