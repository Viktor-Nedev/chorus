// Профилни статистики: творби, получени гласове, спечелени състезания,
// спечелени draw battles (пази се от collective сокетите в battleWins.json).
const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const { requireAuth } = require('../middleware/auth');
const { loadAll: loadCompetitions } = require('./competitions');

const router = express.Router();
const GALLERY_DIR = path.join(__dirname, '../gallery');
const BATTLE_WINS_FILE = path.join(__dirname, '../users/battleWins.json');
const POINTS_FILE = path.join(__dirname, '../users/points.json');

async function loadBattleWins() {
  try {
    return JSON.parse(await fs.readFile(BATTLE_WINS_FILE, 'utf8'));
  } catch {
    return {};
  }
}

async function recordBattleWin(userId) {
  if (!userId) return;
  const wins = await loadBattleWins();
  wins[userId] = (wins[userId] || 0) + 1;
  await fs.mkdir(path.dirname(BATTLE_WINS_FILE), { recursive: true }).catch(() => {});
  await fs.writeFile(BATTLE_WINS_FILE, JSON.stringify(wins, null, 2));
}

// ── Arena точки: { accountId: { points, roundsPlayed, roundWins, aiWins } }
async function loadPoints() {
  try {
    return JSON.parse(await fs.readFile(POINTS_FILE, 'utf8'));
  } catch {
    return {};
  }
}

// Всички записи минават през една опашка — конкурентни read-modify-write
// цикли иначе се затриват взаимно и могат да корумпират файла.
let pointsWriteChain = Promise.resolve();

// updates: [{ accountId, points, won, aiJudged }] — целият рунд наведнъж
function recordArenaRounds(updates) {
  const valid = (updates || []).filter((u) => u?.accountId);
  if (!valid.length) return Promise.resolve();
  pointsWriteChain = pointsWriteChain.then(async () => {
    const all = await loadPoints();
    for (const u of valid) {
      const p = (all[u.accountId] ??= { points: 0, roundsPlayed: 0, roundWins: 0, aiWins: 0 });
      p.points += u.points || 0;
      p.roundsPlayed += 1;
      if (u.won) p.roundWins += 1;
      if (u.won && u.aiJudged) p.aiWins += 1;
    }
    await fs.mkdir(path.dirname(POINTS_FILE), { recursive: true }).catch(() => {});
    const tmp = POINTS_FILE + '.tmp';
    await fs.writeFile(tmp, JSON.stringify(all, null, 2));
    await fs.rename(tmp, POINTS_FILE); // атомарна подмяна
  }).catch((err) => console.error('Points write error:', err.message));
  return pointsWriteChain;
}

router.get('/stats', requireAuth, async (req, res) => {
  try {
    const uid = req.user.id;

    // Творби
    const files = await fs.readdir(GALLERY_DIR).catch(() => []);
    let artworks = 0;
    for (const f of files) {
      if (!f.endsWith('.json')) continue;
      try {
        const a = JSON.parse(await fs.readFile(path.join(GALLERY_DIR, f), 'utf8'));
        if (a.userId === uid) artworks++;
      } catch { /* skip */ }
    }

    // Състезания
    const comps = await loadCompetitions();
    let votesReceived = 0;
    let competitionsWon = 0;
    let competitionsEntered = 0;
    for (const c of comps) {
      const entered = c.entries.some((e) => e.userId === uid);
      if (entered) competitionsEntered++;
      const tally = {};
      for (const t of Object.values(c.votes || {})) tally[t] = (tally[t] || 0) + 1;
      votesReceived += tally[uid] || 0;
      if (entered && Date.now() > new Date(c.endsAt).getTime() && c.entries.length) {
        const best = [...c.entries].sort(
          (a, b) => (tally[b.userId] || 0) - (tally[a.userId] || 0) || new Date(a.at) - new Date(b.at)
        )[0];
        if (best?.userId === uid) competitionsWon++;
      }
    }

    const battleWins = (await loadBattleWins())[uid] || 0;
    const arena = (await loadPoints())[uid] || { points: 0, roundsPlayed: 0, roundWins: 0, aiWins: 0 };

    res.json({
      artworks,
      votesReceived,
      competitionsWon,
      competitionsEntered,
      battleWins,
      points: arena.points,
      roundsPlayed: arena.roundsPlayed,
      roundWins: arena.roundWins,
      aiWins: arena.aiWins,
    });
  } catch (err) {
    console.error('Stats error:', err.message);
    res.status(500).json({ error: 'Could not load stats' });
  }
});

module.exports = { router, recordBattleWin, recordArenaRounds };
