// Чисти helper-и за социалния слой (сезони, категории, tally/победители,
// баджове, trending и leaderboard подредба). Без I/O — лесно unit-тестируеми.

// ── Сезони: месечни, "YYYY-MM" ──
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function currentSeason(d = new Date()) {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

// Начало (00:00 UTC на 1-во число) на даден сезон
function seasonStartsAt(season) {
  const [y, m] = String(season).split('-').map(Number);
  return new Date(Date.UTC(y, (m || 1) - 1, 1)).toISOString();
}

// Край = началото на следващия месец (ексклузивно)
function seasonEndsAt(season) {
  const [y, m] = String(season).split('-').map(Number);
  return new Date(Date.UTC(y, m || 1, 1)).toISOString();
}

function isSeasonOver(season, now = new Date()) {
  return now.getTime() >= new Date(seasonEndsAt(season)).getTime();
}

function seasonLabel(season) {
  const [y, m] = String(season).split('-').map(Number);
  return `${MONTHS[(m || 1) - 1]} ${y}`;
}

// ── Категории (вързани за модовете на творбите) ──
const CATEGORIES = [
  { key: 'solo', mode: 'solo', label: '2D Painting', icon: '🎨' },
  { key: 'sculpt', mode: 'sculpt', label: '3D Sculpture', icon: '🧊' },
  { key: 'moodcheck', mode: 'moodcheck', label: 'Portrait & Mood', icon: '🪞' },
  { key: 'collective', mode: 'collective', label: 'Collective Canvas', icon: '🌈' },
];
const CATEGORY_BY_KEY = Object.fromEntries(CATEGORIES.map((c) => [c.key, c]));

// ── Гласуване ──
// votes: { voterId: entryUserId } → { entryUserId: count }
function tallyVotes(votes = {}) {
  const out = {};
  for (const target of Object.values(votes)) {
    if (target) out[target] = (out[target] || 0) + 1;
  }
  return out;
}

// entries: [{ userId, username, at, ... }], votes: { voterId: entryUserId }
// → сортиран списък с прибавен `votes`, най-много гласове първи;
// tie-break: по-ранното `at` печели.
function rankEntries(entries = [], votes = {}) {
  const tally = tallyVotes(votes);
  return [...entries]
    .map((e) => ({ ...e, votes: tally[e.userId] || 0 }))
    .sort((a, b) => b.votes - a.votes || new Date(a.at) - new Date(b.at));
}

// Победител (топ-1) или null при липса на записи
function computeWinner(entries = [], votes = {}) {
  const ranked = rankEntries(entries, votes);
  return ranked.length ? ranked[0] : null;
}

// ── Баджове ──
function badgeForWin(season, category, rank = 1) {
  const cat = typeof category === 'string' ? CATEGORY_BY_KEY[category] : category;
  const key = cat?.key || String(category);
  return {
    id: `${season}:${key}`,           // стабилен → идемпотентно раздаване
    season,
    categoryKey: key,
    title: `${cat?.label || key} Champion · ${seasonLabel(season)}`,
    icon: cat?.icon || '🏆',
    rank,
    awardedAt: new Date().toISOString(),
  };
}

// ── Trending: likeCount с време-затихване (скорошните likes тежат повече) ──
const WEEK_MS = 7 * 24 * 3600 * 1000;
function trendingScore(post, now = Date.now()) {
  const likes = post?.likes || {};
  let score = 0;
  for (const at of Object.values(likes)) {
    const age = now - new Date(at).getTime();
    score += age <= WEEK_MS ? 1 : 0.25; // старите likes все още се броят, но по-малко
  }
  // лек бонус за скорошни коментари/пресност
  const commentBoost = Math.min((post?.comments?.length || 0) * 0.5, 5);
  const ageHours = (now - new Date(post?.createdAt || now).getTime()) / 3600000;
  const freshness = ageHours < 48 ? 2 : 0;
  return score + commentBoost + freshness;
}

// ── Leaderboard: по (#баджове, общо likes, arena points) ──
function leaderboardSort(creators = []) {
  return [...creators].sort(
    (a, b) =>
      (b.badges || 0) - (a.badges || 0) ||
      (b.likes || 0) - (a.likes || 0) ||
      (b.points || 0) - (a.points || 0)
  );
}

module.exports = {
  MONTHS,
  currentSeason,
  seasonStartsAt,
  seasonEndsAt,
  isSeasonOver,
  seasonLabel,
  CATEGORIES,
  CATEGORY_BY_KEY,
  tallyVotes,
  rankEntries,
  computeWinner,
  badgeForWin,
  trendingScore,
  leaderboardSort,
};
