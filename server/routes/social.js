// Социален слой: постове (споделени творби), харесвания, коментари,
// последване, сезонни награди с баджове, leaderboard и нотификации.
// JSON-file store под server/social/ — като останалата част от проекта.
const express = require('express');
const rateLimit = require('express-rate-limit');
const fs = require('fs').promises;
const path = require('path');
const { nanoid } = require('nanoid');
const { requireAuth, verifyToken } = require('../middleware/auth');
const {
  CATEGORIES, CATEGORY_BY_KEY, currentSeason, seasonEndsAt, seasonLabel,
  isSeasonOver, rankEntries, computeWinner, badgeForWin, trendingScore, leaderboardSort,
} = require('../services/social');

const router = express.Router();
router.use(rateLimit({ windowMs: 60 * 1000, max: 120, standardHeaders: true }));

const SOCIAL_DIR = path.join(__dirname, '../social');
const POSTS_DIR = path.join(SOCIAL_DIR, 'posts');
const AWARDS_DIR = path.join(SOCIAL_DIR, 'awards');
const NOTIF_DIR = path.join(SOCIAL_DIR, 'notifications');
const FOLLOWS_FILE = path.join(SOCIAL_DIR, 'follows.json');
const BADGES_FILE = path.join(SOCIAL_DIR, 'badges.json');
const GALLERY_DIR = path.join(__dirname, '../gallery');
const POINTS_FILE = path.join(__dirname, '../users/points.json');

for (const d of [POSTS_DIR, AWARDS_DIR, NOTIF_DIR]) fs.mkdir(d, { recursive: true }).catch(() => {});

const SAFE_ID = /^[A-Za-z0-9_-]{1,32}$/;

// ── Сериализиран read-modify-write per файл (иначе конкурентни записи се трият) ──
const chains = new Map();
function updateJson(file, def, mutator) {
  const prev = chains.get(file) || Promise.resolve();
  const next = prev.then(async () => {
    let data;
    try { data = JSON.parse(await fs.readFile(file, 'utf8')); }
    catch { data = typeof def === 'function' ? def() : JSON.parse(JSON.stringify(def)); }
    const result = await mutator(data);
    await fs.mkdir(path.dirname(file), { recursive: true }).catch(() => {});
    const tmp = `${file}.${process.pid}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(data, null, 2));
    await fs.rename(tmp, file);
    return result;
  });
  chains.set(file, next.catch(() => {}));
  return next;
}
async function loadJson(file, def) {
  try { return JSON.parse(await fs.readFile(file, 'utf8')); }
  catch { return typeof def === 'function' ? def() : def; }
}

// ── Постове ──
const postFile = (id) => path.join(POSTS_DIR, `${id}.json`);
async function loadPost(id) {
  if (!SAFE_ID.test(id)) return null;
  return loadJson(postFile(id), null);
}
async function loadAllPosts() {
  const files = await fs.readdir(POSTS_DIR).catch(() => []);
  const posts = await Promise.all(
    files.filter((f) => f.endsWith('.json')).map((f) => loadJson(path.join(POSTS_DIR, f), null))
  );
  return posts.filter(Boolean);
}

const loadFollows = () => loadJson(FOLLOWS_FILE, {});      // { followerId: [followeeId] }
const loadBadges = () => loadJson(BADGES_FILE, {});        // { userId: [badge] }
const awardFile = (season) => path.join(AWARDS_DIR, `${season}.json`);
const loadAward = (season) =>
  loadJson(awardFile(season), () => ({ season, categories: {}, winners: null, finalizedAt: null }));

// ── Нотификации (per-user масив, cap 50) ──
const notifFile = (uid) => path.join(NOTIF_DIR, `${uid}.json`);
function pushNotification(uid, notif) {
  if (!uid) return Promise.resolve();
  return updateJson(notifFile(uid), [], (list) => {
    list.unshift({ id: nanoid(8), at: new Date().toISOString(), read: false, ...notif });
    if (list.length > 50) list.length = 50;
  });
}

// ── Опционален viewer (за likedByMe/following/myVote) ──
async function optionalAuth(req, _res, next) {
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  req.user = await verifyToken(token);
  next();
}

// ── Публичен изглед на пост ──
function publicPost(post, viewerId, followSet, badgesMap) {
  const likes = post.likes || {};
  return {
    id: post.id,
    userId: post.userId,
    author: post.author,
    artworkId: post.artworkId,
    imageData: post.imageData,
    title: post.title,
    mode: post.mode,
    caption: post.caption || '',
    tags: post.tags || [],
    remixOf: post.remixOf || null,
    createdAt: post.createdAt,
    likeCount: Object.keys(likes).length,
    commentCount: (post.comments || []).length,
    comments: post.comments || [],
    likedByMe: viewerId ? !!likes[viewerId] : false,
    followsAuthor: viewerId && followSet ? followSet.has(post.userId) : false,
    authorBadges: (badgesMap?.[post.userId] || []).slice(0, 3),
  };
}

// ════════════════════ FEED ════════════════════
router.get('/feed', optionalAuth, async (req, res) => {
  try {
    const viewerId = req.user?.id;
    const { scope = 'all', mode, tag, q, sort = 'new', limit, before } = req.query;
    let posts = await loadAllPosts();

    if (scope === 'following' && viewerId) {
      const follows = (await loadFollows())[viewerId] || [];
      const set = new Set([...follows, viewerId]); // включва и собствените постове
      posts = posts.filter((p) => set.has(p.userId));
    }
    if (mode && CATEGORY_BY_KEY[mode]) posts = posts.filter((p) => p.mode === mode);
    if (tag) posts = posts.filter((p) => (p.tags || []).includes(String(tag).toLowerCase()));
    if (q) {
      const needle = String(q).toLowerCase();
      posts = posts.filter((p) =>
        [p.caption, p.title, p.author, ...(p.tags || [])].join(' ').toLowerCase().includes(needle)
      );
    }

    if (sort === 'top') {
      const now = Date.now();
      posts.sort((a, b) => trendingScore(b, now) - trendingScore(a, now) || new Date(b.createdAt) - new Date(a.createdAt));
    } else {
      posts.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      if (before) posts = posts.filter((p) => new Date(p.createdAt) < new Date(before));
    }

    const n = Math.min(50, Math.max(1, Number(limit) || 20));
    const page = posts.slice(0, n);

    const followSet = viewerId ? new Set((await loadFollows())[viewerId] || []) : null;
    const badgesMap = await loadBadges();
    res.json(page.map((p) => publicPost(p, viewerId, followSet, badgesMap)));
  } catch (err) {
    console.error('Feed error:', err.message);
    res.status(500).json({ error: 'Could not load feed' });
  }
});

// ════════════════════ POSTS ════════════════════
router.post('/posts', requireAuth, async (req, res) => {
  try {
    const { artworkId, caption, tags, remixOfPostId } = req.body || {};
    if (!SAFE_ID.test(artworkId || '')) return res.status(400).json({ error: 'Bad artworkId' });

    let art;
    try { art = JSON.parse(await fs.readFile(path.join(GALLERY_DIR, `${artworkId}.json`), 'utf8')); }
    catch { return res.status(404).json({ error: 'Artwork not found' }); }
    if (art.userId && art.userId !== req.user.id) {
      return res.status(403).json({ error: 'You can only share your own artwork' });
    }

    let remixOf = null;
    if (remixOfPostId) {
      const src = await loadPost(remixOfPostId);
      if (src) remixOf = { postId: src.id, userId: src.userId, author: src.author };
    }

    const cleanTags = Array.isArray(tags)
      ? [...new Set(tags.map((t) => String(t).toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 24)).filter(Boolean))].slice(0, 6)
      : [];

    const id = nanoid(10);
    const post = {
      id,
      userId: req.user.id,
      author: req.user.username,
      artworkId,
      imageData: art.imageData,
      title: art.title || 'Untitled',
      mode: art.mode || 'solo',
      caption: String(caption || '').slice(0, 500),
      tags: cleanTags,
      remixOf,
      createdAt: new Date().toISOString(),
      likes: {},
      comments: [],
    };
    await fs.writeFile(postFile(id), JSON.stringify(post, null, 2));

    if (remixOf && remixOf.userId !== req.user.id) {
      await pushNotification(remixOf.userId, {
        type: 'remix', actorId: req.user.id, actorName: req.user.username, postId: id,
        text: `${req.user.username} remixed your artwork`,
      });
    }
    const badgesMap = await loadBadges();
    res.json(publicPost(post, req.user.id, new Set(), badgesMap));
  } catch (err) {
    console.error('Create post error:', err.message);
    res.status(500).json({ error: 'Could not publish' });
  }
});

router.delete('/posts/:id', requireAuth, async (req, res) => {
  const post = await loadPost(req.params.id);
  if (!post) return res.status(404).json({ error: 'Not found' });
  if (post.userId !== req.user.id) return res.status(403).json({ error: 'Not your post' });
  await fs.unlink(postFile(req.params.id)).catch(() => {});
  res.json({ success: true });
});

router.post('/posts/:id/like', requireAuth, async (req, res) => {
  const file = postFile(req.params.id);
  if (!SAFE_ID.test(req.params.id)) return res.status(400).json({ error: 'Bad id' });
  try {
    let liked = false; let ownerId = null;
    await updateJson(file, null, (post) => {
      if (!post) throw new Error('nf');
      post.likes = post.likes || {};
      ownerId = post.userId;
      if (post.likes[req.user.id]) delete post.likes[req.user.id];
      else { post.likes[req.user.id] = new Date().toISOString(); liked = true; }
    });
    if (liked && ownerId && ownerId !== req.user.id) {
      await pushNotification(ownerId, {
        type: 'like', actorId: req.user.id, actorName: req.user.username, postId: req.params.id,
        text: `${req.user.username} liked your post`,
      });
    }
    const post = await loadPost(req.params.id);
    res.json({ likeCount: Object.keys(post.likes || {}).length, likedByMe: liked });
  } catch {
    res.status(404).json({ error: 'Not found' });
  }
});

router.post('/posts/:id/comment', requireAuth, async (req, res) => {
  const text = String(req.body?.text || '').trim().slice(0, 400);
  if (!text) return res.status(400).json({ error: 'Empty comment' });
  const file = postFile(req.params.id);
  if (!SAFE_ID.test(req.params.id)) return res.status(400).json({ error: 'Bad id' });
  try {
    let comment = null; let ownerId = null;
    await updateJson(file, null, (post) => {
      if (!post) throw new Error('nf');
      post.comments = post.comments || [];
      ownerId = post.userId;
      comment = { id: nanoid(8), userId: req.user.id, author: req.user.username, text, at: new Date().toISOString() };
      post.comments.push(comment);
    });
    if (ownerId && ownerId !== req.user.id) {
      await pushNotification(ownerId, {
        type: 'comment', actorId: req.user.id, actorName: req.user.username, postId: req.params.id,
        text: `${req.user.username} commented: “${text.slice(0, 60)}”`,
      });
    }
    res.json(comment);
  } catch {
    res.status(404).json({ error: 'Not found' });
  }
});

router.delete('/posts/:id/comment/:cid', requireAuth, async (req, res) => {
  const file = postFile(req.params.id);
  if (!SAFE_ID.test(req.params.id)) return res.status(400).json({ error: 'Bad id' });
  try {
    let removed = false;
    await updateJson(file, null, (post) => {
      if (!post) throw new Error('nf');
      const c = (post.comments || []).find((x) => x.id === req.params.cid);
      if (!c) return;
      if (c.userId !== req.user.id && post.userId !== req.user.id) return; // own или собственик на поста
      post.comments = post.comments.filter((x) => x.id !== req.params.cid);
      removed = true;
    });
    res.json({ success: removed });
  } catch {
    res.status(404).json({ error: 'Not found' });
  }
});

// ════════════════════ FOLLOW ════════════════════
router.post('/follow/:userId', requireAuth, async (req, res) => {
  const target = req.params.userId;
  if (target === req.user.id) return res.status(400).json({ error: 'You cannot follow yourself' });
  let following = false;
  await updateJson(FOLLOWS_FILE, {}, (follows) => {
    const list = new Set(follows[req.user.id] || []);
    if (list.has(target)) list.delete(target);
    else { list.add(target); following = true; }
    follows[req.user.id] = [...list];
  });
  if (following) {
    await pushNotification(target, {
      type: 'follow', actorId: req.user.id, actorName: req.user.username,
      text: `${req.user.username} started following you`,
    });
  }
  res.json({ following });
});

// ════════════════════ LEADERBOARD ════════════════════
router.get('/creators/leaderboard', async (_req, res) => {
  try {
    const posts = await loadAllPosts();
    const badgesMap = await loadBadges();
    const points = await loadJson(POINTS_FILE, {});
    const byUser = new Map();
    for (const p of posts) {
      const u = byUser.get(p.userId) || { userId: p.userId, username: p.author, likes: 0, posts: 0 };
      u.likes += Object.keys(p.likes || {}).length;
      u.posts += 1;
      u.username = p.author;
      byUser.set(p.userId, u);
    }
    // включи и творци, спечелили баджове, дори без постове
    for (const [uid, list] of Object.entries(badgesMap)) {
      if (!byUser.has(uid) && list?.length) byUser.set(uid, { userId: uid, username: list[0]?.username || 'artist', likes: 0, posts: 0 });
    }
    const creators = [...byUser.values()].map((u) => ({
      ...u,
      badgeList: (badgesMap[u.userId] || []).slice(0, 4),
      badges: (badgesMap[u.userId] || []).length,
      points: points[u.userId]?.points || 0,
    }));
    res.json(leaderboardSort(creators).slice(0, 20));
  } catch (err) {
    console.error('Leaderboard error:', err.message);
    res.status(500).json({ error: 'Could not load leaderboard' });
  }
});

// ════════════════════ SEASONAL AWARDS ════════════════════
// Раздава баджове за всеки приключил, но нефинализиран сезон (идемпотентно).
async function finalizeDueSeasons() {
  const files = await fs.readdir(AWARDS_DIR).catch(() => []);
  for (const f of files) {
    if (!f.endsWith('.json')) continue;
    const season = f.replace(/\.json$/, '');
    if (!isSeasonOver(season)) continue;
    const award = await loadAward(season);
    if (award.finalizedAt) continue;

    const winners = {};
    for (const cat of CATEGORIES) {
      const bucket = award.categories?.[cat.key];
      if (!bucket?.entries?.length) continue;
      const winner = computeWinner(bucket.entries, bucket.votes || {});
      if (!winner || winner.votes === 0) continue; // без гласове → без шампион
      winners[cat.key] = { userId: winner.userId, username: winner.username, votes: winner.votes };

      const badge = { ...badgeForWin(season, cat), username: winner.username };
      await updateJson(BADGES_FILE, {}, (all) => {
        const list = (all[winner.userId] ||= []);
        if (!list.some((b) => b.id === badge.id)) list.push(badge);
      });
      await pushNotification(winner.userId, {
        type: 'badge', text: `🏆 You won ${cat.label} — ${seasonLabel(season)}!`,
      });
    }
    await updateJson(awardFile(season), () => award, (a) => {
      a.winners = winners;
      a.finalizedAt = new Date().toISOString();
    });
  }
}

router.get('/awards/current', optionalAuth, async (req, res) => {
  try {
    await finalizeDueSeasons();
    const viewerId = req.user?.id;
    const season = currentSeason();
    const award = await loadAward(season);
    const categories = CATEGORIES.map((cat) => {
      const bucket = award.categories?.[cat.key] || { entries: [], votes: {} };
      const ranked = rankEntries(bucket.entries, bucket.votes);
      return {
        ...cat,
        entries: ranked,
        myEntry: viewerId ? bucket.entries.find((e) => e.userId === viewerId) || null : null,
        myVote: viewerId ? bucket.votes?.[viewerId] || null : null,
      };
    });
    // Победители от предходния (последно финализиран) сезон
    const files = (await fs.readdir(AWARDS_DIR).catch(() => []))
      .filter((f) => f.endsWith('.json')).map((f) => f.replace(/\.json$/, '')).sort();
    const prev = files.filter((s) => s < season).pop();
    let pastWinners = null;
    if (prev) {
      const pa = await loadAward(prev);
      if (pa.winners) pastWinners = { season: prev, label: seasonLabel(prev), winners: pa.winners };
    }
    res.json({ season, label: seasonLabel(season), endsAt: seasonEndsAt(season), categories, pastWinners });
  } catch (err) {
    console.error('Awards error:', err.message);
    res.status(500).json({ error: 'Could not load awards' });
  }
});

router.post('/awards/enter', requireAuth, async (req, res) => {
  try {
    const { category, artworkId } = req.body || {};
    const cat = CATEGORY_BY_KEY[category];
    if (!cat) return res.status(400).json({ error: 'Unknown category' });
    if (!SAFE_ID.test(artworkId || '')) return res.status(400).json({ error: 'Bad artworkId' });
    const season = currentSeason();
    if (isSeasonOver(season)) return res.status(400).json({ error: 'Season has ended' });

    let art;
    try { art = JSON.parse(await fs.readFile(path.join(GALLERY_DIR, `${artworkId}.json`), 'utf8')); }
    catch { return res.status(404).json({ error: 'Artwork not found' }); }
    if (art.userId && art.userId !== req.user.id) return res.status(403).json({ error: 'Not your artwork' });
    if ((art.mode || 'solo') !== cat.mode) {
      return res.status(400).json({ error: `${cat.label} accepts ${cat.mode} artworks` });
    }

    const entry = {
      userId: req.user.id, username: req.user.username, artworkId,
      imageData: art.imageData, title: art.title || 'Untitled', at: new Date().toISOString(),
    };
    await updateJson(awardFile(season), () => ({ season, categories: {}, winners: null, finalizedAt: null }), (a) => {
      const bucket = (a.categories[cat.key] ||= { entries: [], votes: {} });
      const i = bucket.entries.findIndex((e) => e.userId === req.user.id);
      if (i >= 0) bucket.entries[i] = entry; // смяна на записа
      else bucket.entries.push(entry);
    });
    res.json({ success: true });
  } catch (err) {
    console.error('Award enter error:', err.message);
    res.status(500).json({ error: 'Could not enter' });
  }
});

router.post('/awards/vote', requireAuth, async (req, res) => {
  try {
    const { category, entryUserId } = req.body || {};
    const cat = CATEGORY_BY_KEY[category];
    if (!cat) return res.status(400).json({ error: 'Unknown category' });
    if (entryUserId === req.user.id) return res.status(400).json({ error: 'You cannot vote for yourself' });
    const season = currentSeason();
    if (isSeasonOver(season)) return res.status(400).json({ error: 'Voting has closed' });

    let ok = false;
    await updateJson(awardFile(season), () => ({ season, categories: {}, winners: null, finalizedAt: null }), (a) => {
      const bucket = a.categories?.[cat.key];
      if (!bucket || !bucket.entries.some((e) => e.userId === entryUserId)) return;
      bucket.votes[req.user.id] = entryUserId; // повторен вот = смяна
      ok = true;
    });
    if (!ok) return res.status(404).json({ error: 'Entry not found' });
    res.json({ success: true });
  } catch (err) {
    console.error('Award vote error:', err.message);
    res.status(500).json({ error: 'Could not vote' });
  }
});

// ════════════════════ BADGES ════════════════════
router.get('/badges/:userId', async (req, res) => {
  const all = await loadBadges();
  res.json(all[req.params.userId] || []);
});

// ════════════════════ NOTIFICATIONS ════════════════════
router.get('/notifications', requireAuth, async (req, res) => {
  const list = await loadJson(notifFile(req.user.id), []);
  res.json(list);
});
router.post('/notifications/read', requireAuth, async (req, res) => {
  await updateJson(notifFile(req.user.id), [], (list) => {
    for (const n of list) n.read = true;
  });
  res.json({ success: true });
});

module.exports = { router, finalizeDueSeasons };
