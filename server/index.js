require('dotenv').config();
const express = require('express');
const { createServer } = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');
const { nanoid } = require('nanoid');
const poemRouter = require('./routes/poem');
const galleryRouter = require('./routes/gallery');
const webforgeRouter = require('./routes/webforge');
const authRouter = require('./routes/auth');
const { router: competitionsRouter } = require('./routes/competitions');
const { router: usersRouter, recordBattleWin, recordArenaRounds } = require('./routes/users');
const { verifyToken } = require('./middleware/auth');
const { judgeRound } = require('./services/arenaJudge');

// ── Game Arena: prompt-ове за рундовете (локални — без API квота) ──
const DRAW_PROMPTS = [
  'a cat', 'an elephant', 'a rocket ship', 'a dragon', 'a bicycle', 'a lighthouse',
  'an octopus', 'a castle', 'a penguin', 'a butterfly', 'a robot', 'a pirate ship',
  'a snowman', 'a giraffe', 'a hot air balloon', 'a wizard', 'a dinosaur', 'a mermaid',
];
const MEMORY_PROMPTS = [
  { emoji: '🦊', label: 'the fox you just saw' },
  { emoji: '🚀', label: 'the rocket you just saw' },
  { emoji: '🏰', label: 'the castle you just saw' },
  { emoji: '🐙', label: 'the octopus you just saw' },
  { emoji: '⛵', label: 'the sailboat you just saw' },
  { emoji: '🌵', label: 'the cactus you just saw' },
  { emoji: '🎸', label: 'the guitar you just saw' },
  { emoji: '🐘', label: 'the elephant you just saw' },
];
const ROUND_KINDS = ['draw', 'memory', 'blind'];
const ROUND_POINTS = [100, 60, 40]; // 1-во/2-ро/3-то място; всички останали +20

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: process.env.CLIENT_URL || 'http://localhost:5173' },
});

app.use(cors());
app.use(express.json({ limit: '10mb' })); // за imageData (base64 PNG)
app.use('/api/poem', poemRouter);
app.use('/api/gallery', galleryRouter);
app.use('/api/webforge', webforgeRouter);
app.use('/api/auth', authRouter);
app.use('/api/competitions', competitionsRouter);
app.use('/api/users', usersRouter);
// Static хостинг за генерирани WebForge проекти без backend
app.use('/hosted/:id/', (req, res, next) => {
  if (!/^[A-Za-z0-9_-]{1,32}$/.test(req.params.id)) return res.status(400).end();
  express.static(path.join(__dirname, 'generated', req.params.id, 'frontend'))(req, res, next);
});

app.get('/health', (req, res) => res.json({ ok: true, sessions: sessions.size }));

// ── Session management ──
const sessions = new Map();
// sessionCode → { creatorId, users: Map(userId → userData), emotionHistory: [], startedAt, stateUpdateCount }

function generateSessionCode() {
  // Без лесно бъркащи се символи
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZ';
  let code = '';
  do {
    code = Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  } while (sessions.has(code));
  return code;
}

function generateUserColor(index) {
  const hues = [280, 180, 40, 350, 140, 200, 60, 300];
  return { h: hues[index % hues.length], s: 70, l: 60 };
}

io.on('connection', (socket) => {
  let mySessionCode = null;
  let myUserId = null;
  let myAccountId = null; // акаунт (auth) — за battle статистики

  const mySession = () => sessions.get(mySessionCode);
  const myUser = () => mySession()?.users.get(myUserId);

  socket.on('CREATE_SESSION', async ({ nickname, auth, mode, settings }) => {
    const account = await verifyToken(auth);
    myAccountId = account?.id || null;
    mySessionCode = generateSessionCode();
    myUserId = nanoid(8);
    const color = generateUserColor(0);
    const sessionMode = mode === 'arena' ? 'arena' : 'canvas';
    const rounds = [3, 5].includes(Number(settings?.rounds)) ? Number(settings.rounds) : 3;
    const roundSeconds = [30, 60, 90, 120].includes(Number(settings?.roundSeconds))
      ? Number(settings.roundSeconds)
      : 60;

    sessions.set(mySessionCode, {
      mode: sessionMode,
      settings: { rounds, roundSeconds },
      arena: null,
      creatorId: myUserId,
      users: new Map([
        [
          myUserId,
          {
            userId: myUserId,
            accountId: myAccountId,
            nickname: String(nickname || account?.username || 'artist').slice(0, 20),
            baseColor: color,
            emotion: 'neutral',
            gesture: 'NO_HAND',
            audioLevel: 0,
            handPosition: { x: 0.5, y: 0.5 },
            particles: [],
          },
        ],
      ]),
      emotionHistory: [],
      strokes: [],
      chat: [],
      battle: null,
      startedAt: Date.now(),
      stateUpdateCount: 0,
    });

    socket.join(mySessionCode);
    socket.emit('INIT', {
      yourId: myUserId,
      yourColor: color,
      sessionCode: mySessionCode,
      isCreator: true,
      users: [],
      strokes: [],
      chat: [],
      mode: sessionMode,
      settings: { rounds, roundSeconds },
    });
    console.log(`Session ${mySessionCode} (${sessionMode}) created by ${nickname}`);
  });

  socket.on('JOIN_SESSION', async ({ nickname, sessionCode, auth }) => {
    const session = sessions.get(sessionCode);
    if (!session || session.users.size >= 8) {
      socket.emit('JOIN_ERROR', { message: session ? 'Session is full' : 'Session not found' });
      return;
    }
    const account = await verifyToken(auth);
    myAccountId = account?.id || null;

    mySessionCode = sessionCode;
    myUserId = nanoid(8);
    const color = generateUserColor(session.users.size);

    const userData = {
      userId: myUserId,
      accountId: myAccountId,
      nickname: String(nickname || account?.username || 'artist').slice(0, 20),
      baseColor: color,
      emotion: 'neutral',
      gesture: 'NO_HAND',
      audioLevel: 0,
      handPosition: { x: 0.5, y: 0.5 },
      particles: [],
    };
    session.users.set(myUserId, userData);

    socket.join(mySessionCode);
    socket.emit('INIT', {
      yourId: myUserId,
      yourColor: color,
      sessionCode: mySessionCode,
      isCreator: false,
      users: [...session.users.values()].filter((u) => u.userId !== myUserId),
      strokes: session.strokes,
      chat: session.chat.slice(-50),
      mode: session.mode,
      settings: session.settings,
    });
    socket.to(mySessionCode).emit('USER_JOINED', userData);
    console.log(`${nickname} joined session ${sessionCode}`);
  });

  // ── Споделено рисуване ──
  socket.on('STROKE', (data) => {
    const session = mySession();
    const user = myUser();
    if (!session || !user || !Array.isArray(data?.points)) return;
    // По време на battle всеки рисува на собствен слой — не broadcast-вай
    if (session.battle?.phase === 'drawing') return;
    const stroke = {
      userId: myUserId,
      color: typeof data.color === 'string' ? data.color.slice(0, 24) : '#ffffff',
      size: Math.min(60, Math.max(1, Number(data.size) || 4)),
      erase: !!data.erase,
      points: data.points.slice(0, 600).map((p) => [Number(p[0]) || 0, Number(p[1]) || 0]),
    };
    session.strokes.push(stroke);
    if (session.strokes.length > 4000) session.strokes.shift();
    socket.to(mySessionCode).emit('STROKE', stroke);
  });

  socket.on('CLEAR_CANVAS', () => {
    const session = mySession();
    if (!session || session.creatorId !== myUserId) return;
    session.strokes = [];
    io.to(mySessionCode).emit('CANVAS_CLEARED');
  });

  // ── Чат ──
  socket.on('CHAT', ({ text }) => {
    const session = mySession();
    const user = myUser();
    const t = String(text || '').trim().slice(0, 200);
    if (!session || !user || !t) return;
    const msg = {
      userId: myUserId,
      nickname: user.nickname,
      color: user.baseColor,
      text: t,
      at: Date.now(),
    };
    session.chat.push(msg);
    if (session.chat.length > 200) session.chat.shift();
    io.to(mySessionCode).emit('CHAT', msg);
  });

  // ── Реакции ──
  const REACTIONS = ['❤', '🔥', '👏', '✨', '😂'];
  socket.on('REACTION', ({ emoji }) => {
    const user = myUser();
    if (!user || !REACTIONS.includes(emoji)) return;
    io.to(mySessionCode).emit('REACTION', { emoji, userId: myUserId, color: user.baseColor });
  });

  // ── Draw Battle ──
  const finishBattleCollect = () => {
    const session = mySession();
    const battle = session?.battle;
    if (!battle || battle.phase !== 'collect') return;
    clearTimeout(battle.collectTimer);
    battle.phase = 'voting';
    const entries = Object.values(battle.entries);
    if (entries.length < 2) {
      // Няма смисъл от вот с 0-1 творби
      session.battle = null;
      io.to(mySessionCode).emit('BATTLE_RESULT', { winnerId: entries[0]?.userId || null, tally: {}, aborted: entries.length < 2 });
      return;
    }
    io.to(mySessionCode).emit('BATTLE_GALLERY', { entries });
    battle.voteTimer = setTimeout(() => finishBattleVoting(), 30000);
  };

  const finishBattleVoting = () => {
    const session = mySession();
    const battle = session?.battle;
    if (!battle || battle.phase !== 'voting') return;
    clearTimeout(battle.voteTimer);
    const tally = {};
    for (const target of Object.values(battle.votes)) tally[target] = (tally[target] || 0) + 1;
    const entries = Object.values(battle.entries);
    entries.sort((a, b) => (tally[b.userId] || 0) - (tally[a.userId] || 0));
    const winner = entries[0] || null;
    session.battle = null;
    io.to(mySessionCode).emit('BATTLE_RESULT', {
      winnerId: winner?.userId || null,
      winnerNickname: winner?.nickname || null,
      tally,
    });
    if (winner) {
      const winUser = session.users.get(winner.userId);
      if (winUser?.accountId) recordBattleWin(winUser.accountId).catch(() => {});
    }
  };

  socket.on('BATTLE_START', ({ theme, seconds }) => {
    const session = mySession();
    if (!session || session.creatorId !== myUserId || session.battle) return;
    if (session.users.size < 2) return;
    const s = [60, 120, 180].includes(Number(seconds)) ? Number(seconds) : 120;
    const t = String(theme || 'Free theme').trim().slice(0, 60) || 'Free theme';
    const battle = {
      phase: 'drawing',
      theme: t,
      endsAt: Date.now() + s * 1000,
      entries: {},
      votes: {},
    };
    session.battle = battle;
    io.to(mySessionCode).emit('BATTLE_STARTED', { theme: t, endsAt: battle.endsAt, seconds: s });
    battle.drawTimer = setTimeout(() => {
      if (session.battle !== battle) return;
      battle.phase = 'collect';
      io.to(mySessionCode).emit('BATTLE_COLLECT');
      battle.collectTimer = setTimeout(() => finishBattleCollect(), 10000);
    }, s * 1000);
  });

  socket.on('BATTLE_SNAPSHOT', ({ png }) => {
    const session = mySession();
    const user = myUser();
    const battle = session?.battle;
    if (!battle || !user || !['drawing', 'collect'].includes(battle.phase)) {
      console.log(`Battle snapshot rejected: phase=${battle?.phase}, user=${user?.nickname}`);
      return;
    }
    if (typeof png !== 'string' || !png.startsWith('data:image/') || png.length > 400000) {
      console.log(`Battle snapshot rejected: size=${png?.length}`);
      return;
    }
    console.log(`Battle snapshot from ${user.nickname} (${Math.round(png.length / 1024)}KB), phase=${battle.phase}`);
    battle.entries[myUserId] = { userId: myUserId, nickname: user.nickname, color: user.baseColor, png };
    if (battle.phase === 'collect' && Object.keys(battle.entries).length >= session.users.size) {
      finishBattleCollect();
    }
  });

  socket.on('BATTLE_VOTE', ({ forUserId }) => {
    const session = mySession();
    const battle = session?.battle;
    if (!battle || battle.phase !== 'voting') return;
    if (forUserId === myUserId || !battle.entries[forUserId]) return;
    battle.votes[myUserId] = forUserId;
    io.to(mySessionCode).emit('BATTLE_VOTES', { count: Object.keys(battle.votes).length });
    if (Object.keys(battle.votes).length >= session.users.size) finishBattleVoting();
  });

  // ── Живи камери (Shared Canvas режим): JPEG кадри през сокета ──
  socket.on('CAM_FRAME', ({ jpg }) => {
    const session = mySession();
    const user = myUser();
    if (!session || !user) return;
    if (typeof jpg !== 'string' || !jpg.startsWith('data:image/jpeg') || jpg.length > 40000) return;
    const now = Date.now();
    if (user._lastCam && now - user._lastCam < 1000) return; // throttle
    user._lastCam = now;
    socket.to(mySessionCode).emit('CAM_FRAME', { userId: myUserId, jpg });
  });

  // ══════════ GAME ARENA: рундове с точки и AI съдия ══════════

  const arenaComputeResults = async (ranking, comment, aiJudged) => {
    const session = mySession();
    const arena = session?.arena;
    if (!arena) return;
    arena.phase = 'results';
    const results = ranking.map((uid, i) => {
      const gained = ROUND_POINTS[i] ?? 20;
      arena.scores[uid] = (arena.scores[uid] || 0) + gained;
      const entry = arena.entries[uid];
      return {
        userId: uid,
        nickname: entry?.nickname || session.users.get(uid)?.nickname || '?',
        png: entry?.png || null,
        gained,
        total: arena.scores[uid],
      };
    });
    // Персистирай точките към акаунтите — един запис за целия рунд
    recordArenaRounds(
      ranking.map((uid, i) => ({
        accountId: session.users.get(uid)?.accountId,
        points: ROUND_POINTS[i] ?? 20,
        won: i === 0,
        aiJudged,
      }))
    );
    io.to(mySessionCode).emit('ARENA_RESULTS', {
      round: arena.round,
      totalRounds: arena.totalRounds,
      results,
      comment,
      aiJudged,
    });
    arena.nextTimer = setTimeout(() => {
      if (session.arena !== arena) return;
      if (arena.round < arena.totalRounds) startArenaRound(arena.round + 1);
      else {
        const standings = Object.entries(arena.scores)
          .map(([uid, pts]) => ({
            userId: uid,
            nickname: session.users.get(uid)?.nickname || arena.names[uid] || '?',
            points: pts,
          }))
          .sort((a, b) => b.points - a.points);
        session.arena = null;
        io.to(mySessionCode).emit('ARENA_PODIUM', { standings });
      }
    }, 8000);
  };

  const finishArenaCollect = async () => {
    const session = mySession();
    const arena = session?.arena;
    if (!arena || arena.phase !== 'collect') return;
    clearTimeout(arena.collectTimer);
    const entries = Object.values(arena.entries);
    if (entries.length === 0) {
      // Никой не предаде — прескочи рунда
      arenaComputeResults([], 'Nobody submitted a drawing this round!', false);
      return;
    }
    // Малко играчи (или сам) → AI съдия; иначе гласуване
    if (session.users.size < 3 || entries.length < 3) {
      arena.phase = 'judging';
      io.to(mySessionCode).emit('ARENA_JUDGING');
      const verdict = await judgeRound(arena.prompt.text, entries);
      arenaComputeResults(verdict.ranking, verdict.comment, verdict.ai);
    } else {
      arena.phase = 'voting';
      io.to(mySessionCode).emit('ARENA_GALLERY', { entries });
      arena.voteTimer = setTimeout(() => finishArenaVoting(), 25000);
    }
  };

  const finishArenaVoting = () => {
    const session = mySession();
    const arena = session?.arena;
    if (!arena || arena.phase !== 'voting') return;
    clearTimeout(arena.voteTimer);
    const tally = {};
    for (const t of Object.values(arena.votes)) tally[t] = (tally[t] || 0) + 1;
    const ranking = Object.keys(arena.entries).sort(
      (a, b) => (tally[b] || 0) - (tally[a] || 0)
    );
    arenaComputeResults(ranking, null, false);
  };

  const startArenaRound = (n) => {
    const session = mySession();
    if (!session) return;
    const arena = session.arena;
    const kind = ROUND_KINDS[(n - 1) % ROUND_KINDS.length];
    let prompt;
    if (kind === 'memory') {
      const m = MEMORY_PROMPTS[Math.floor(Math.random() * MEMORY_PROMPTS.length)];
      prompt = { text: m.label, emoji: m.emoji };
    } else {
      prompt = { text: DRAW_PROMPTS[Math.floor(Math.random() * DRAW_PROMPTS.length)] };
    }
    const s = session.settings.roundSeconds;
    Object.assign(arena, {
      round: n,
      phase: 'drawing',
      kind,
      prompt,
      endsAt: Date.now() + s * 1000,
      entries: {},
      votes: {},
    });
    io.to(mySessionCode).emit('ARENA_ROUND', {
      round: n,
      totalRounds: arena.totalRounds,
      kind,
      prompt,
      endsAt: arena.endsAt,
      seconds: s,
    });
    arena.drawTimer = setTimeout(() => {
      if (session.arena !== arena) return;
      arena.phase = 'collect';
      io.to(mySessionCode).emit('ARENA_COLLECT');
      arena.collectTimer = setTimeout(() => finishArenaCollect(), 8000);
    }, s * 1000);
  };

  socket.on('ARENA_START', () => {
    const session = mySession();
    if (!session || session.mode !== 'arena') return;
    if (session.creatorId !== myUserId || session.arena) return;
    session.arena = {
      totalRounds: session.settings.rounds,
      round: 0,
      scores: {},
      names: {},
      entries: {},
      votes: {},
    };
    for (const [uid, u] of session.users) session.arena.names[uid] = u.nickname;
    startArenaRound(1);
  });

  socket.on('ARENA_SNAPSHOT', ({ png }) => {
    const session = mySession();
    const user = myUser();
    const arena = session?.arena;
    if (!arena || !user || !['drawing', 'collect'].includes(arena.phase)) return;
    if (typeof png !== 'string' || !png.startsWith('data:image/') || png.length > 400000) return;
    arena.entries[myUserId] = { userId: myUserId, nickname: user.nickname, color: user.baseColor, png };
    if (arena.phase === 'collect' && Object.keys(arena.entries).length >= session.users.size) {
      finishArenaCollect();
    }
  });

  socket.on('ARENA_VOTE', ({ forUserId }) => {
    const session = mySession();
    const arena = session?.arena;
    if (!arena || arena.phase !== 'voting') return;
    if (forUserId === myUserId || !arena.entries[forUserId]) return;
    arena.votes[myUserId] = forUserId;
    io.to(mySessionCode).emit('ARENA_VOTES', { count: Object.keys(arena.votes).length });
    if (Object.keys(arena.votes).length >= session.users.size) finishArenaVoting();
  });

  socket.on('STATE_UPDATE', (data) => {
    if (!mySessionCode || !myUserId) return;
    const session = sessions.get(mySessionCode);
    if (!session) return;

    const user = session.users.get(myUserId);
    if (user) {
      user.emotion = data.emotion ?? user.emotion;
      user.gesture = data.gesture ?? user.gesture;
      user.audioLevel = data.audioLevel ?? user.audioLevel;
      user.handPosition = data.handPosition ?? user.handPosition;
    }

    socket.to(mySessionCode).emit('USER_STATE', {
      userId: myUserId,
      emotion: user?.emotion,
      gesture: user?.gesture,
      audioLevel: user?.audioLevel,
      handPosition: user?.handPosition,
      nickname: user?.nickname,
      baseColor: user?.baseColor,
    });

    // Emotion history — на всеки ~10-ти update (≈1s при 100ms клиентски интервал)
    session.stateUpdateCount++;
    if (session.stateUpdateCount % 10 === 0) {
      const emotions = {};
      session.users.forEach((u, id) => {
        emotions[id] = u.emotion;
      });
      session.emotionHistory.push({
        timestamp: Math.floor((Date.now() - session.startedAt) / 1000),
        emotions,
      });
      // Ограничи историята (пази последните ~2 часа)
      if (session.emotionHistory.length > 7200) session.emotionHistory.shift();
    }
  });

  socket.on('PARTICLE_SNAPSHOT', ({ particles }) => {
    if (!mySessionCode || !Array.isArray(particles)) return;
    const user = sessions.get(mySessionCode)?.users.get(myUserId);
    if (user) user.particles = particles.slice(0, 100);
    socket.to(mySessionCode).emit('USER_PARTICLES', { userId: myUserId, particles });
  });

  socket.on('END_SESSION', () => {
    const session = sessions.get(mySessionCode);
    if (!session || session.creatorId !== myUserId) return;
    io.to(mySessionCode).emit('SESSION_ENDED', {
      emotionHistory: session.emotionHistory,
      duration: Math.floor((Date.now() - session.startedAt) / 1000),
      totalUsers: session.users.size,
    });
    sessions.delete(mySessionCode);
    console.log(`Session ${mySessionCode} ended`);
  });

  socket.on('disconnect', () => {
    if (!mySessionCode) return;
    const session = sessions.get(mySessionCode);
    if (session) {
      session.users.delete(myUserId);
      socket.to(mySessionCode).emit('USER_LEFT', { userId: myUserId });
      if (session.users.size === 0) {
        sessions.delete(mySessionCode);
        console.log(`Session ${mySessionCode} emptied and removed`);
      }
    }
  });
});

const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, () => {
  console.log(`Chorus server running on port ${PORT}`);
});
