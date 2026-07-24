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
const { router: videosRouter, serveVideo } = require('./routes/videos');
const { verifyToken } = require('./middleware/auth');
const { judgeRound } = require('./services/arenaJudge');
const {
  PICTIONARY_WORDS, IMPOSTOR_WORDS, pick,
  isCorrectGuess, normalizeGuess, pictionaryScore, pictionaryDrawerScore, impostorScores,
} = require('./services/arenaGames');

// ── Drawing op validation (multiplayer) ──
const OP_TYPES = new Set(['brush', 'line', 'rect', 'circle']);
function validateOp(data, userId) {
  if (!data || !Array.isArray(data.points) || data.points.length < 1) return null;
  return {
    userId,
    type: OP_TYPES.has(data.type) ? data.type : 'brush',
    color: typeof data.color === 'string' ? data.color.slice(0, 24) : '#ffffff',
    size: Math.min(60, Math.max(1, Number(data.size) || 4)),
    opacity: Math.min(1, Math.max(0, data.opacity == null ? 1 : Number(data.opacity))),
    erase: !!data.erase,
    points: data.points.slice(0, 600).map((p) => [Number(p[0]) || 0, Number(p[1]) || 0]),
  };
}

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
const ROUND_KINDS = ['draw', 'pictionary', 'memory', 'impostor', 'blind'];
const ROUND_POINTS = [100, 60, 40]; // 1-во/2-ро/3-то място; всички останали +20

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: process.env.CLIENT_URL || 'http://localhost:5173' },
});

app.use(cors());
// Видео upload: суров webm body ПРЕДИ express.json (иначе се поглъща/отхвърля)
app.use('/api/videos', express.raw({ type: 'video/webm', limit: '45mb' }), videosRouter);
app.use(express.json({ limit: '10mb' })); // за imageData (base64 PNG)
app.use('/api/poem', poemRouter);
app.use('/api/gallery', galleryRouter);
app.use('/api/webforge', webforgeRouter);
app.use('/api/auth', authRouter);
app.use('/api/competitions', competitionsRouter);
app.use('/api/users', usersRouter);
// Static сервиране на записаните видеа
app.get('/videos/:id.webm', (req, res) => serveVideo({ params: { id: req.params.id } }, res));
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
            socketId: socket.id,
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
      socketId: socket.id,
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

  // ── Споделено рисуване (op-модел: brush/line/rect/circle) ──
  socket.on('STROKE', (data) => {
    const session = mySession();
    const user = myUser();
    if (!session || !user) return;
    const op = validateOp(data, myUserId);
    if (!op) return;
    const arena = session.arena;

    // Pictionary: САМО рисуващият рисува; ops се препращат на временен слой
    if (arena && arena.kind === 'pictionary' && arena.phase === 'drawing') {
      if (myUserId !== arena.drawerId) return;
      socket.to(mySessionCode).emit('PICTIONARY_STROKE', op);
      return;
    }
    // Battle / arena рунд (draw/memory/blind/impostor): рисува се на личен слой,
    // не се broadcast-ва (вижда се чак при reveal).
    if (session.battle?.phase === 'drawing') return;
    if (arena && ['drawing', 'collect'].includes(arena.phase)) return;

    // Общо споделено платно
    session.strokes.push(op);
    if (session.strokes.length > 4000) session.strokes.shift();
    socket.to(mySessionCode).emit('STROKE', op);
  });

  socket.on('CLEAR_CANVAS', () => {
    const session = mySession();
    if (!session || session.creatorId !== myUserId) return;
    session.strokes = [];
    io.to(mySessionCode).emit('CANVAS_CLEARED');
  });

  // ── Чат (+ Pictionary познаване през чата) ──
  socket.on('CHAT', ({ text }) => {
    const session = mySession();
    const user = myUser();
    const t = String(text || '').trim().slice(0, 200);
    if (!session || !user || !t) return;

    const arena = session.arena;
    if (arena && arena.kind === 'pictionary' && arena.phase === 'drawing') {
      const containsWord = normalizeGuess(t).includes(normalizeGuess(arena.secret));
      if (myUserId === arena.drawerId) {
        if (containsWord) return; // рисуващият да не спойлва думата
      } else {
        if (!arena.guessed[myUserId] && isCorrectGuess(t, arena.secret)) {
          // Позна! Не показвай думата — само системно съобщение + точки.
          arena.guessed[myUserId] = true;
          arena.guessOrder.push(myUserId);
          const sys = { system: true, text: `${user.nickname} guessed the drawing! ✅`, at: Date.now() };
          session.chat.push(sys);
          io.to(mySessionCode).emit('CHAT', sys);
          io.to(mySessionCode).emit('PICTIONARY_GUESSED', { userId: myUserId, count: arena.guessOrder.length });
          if (arena.guessOrder.length >= arena.guessers) finishPictionary();
          return;
        }
        if (containsWord) return; // анти-спойл
      }
    }

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

  // Приложи точки за рунда (обща за всички видове игри) → results → next/podium.
  const applyRoundPoints = (pointsMap, extra = {}) => {
    const session = mySession();
    const arena = session?.arena;
    if (!arena) return;
    arena.phase = 'results';
    const uids = Object.keys(pointsMap);
    for (const uid of uids) arena.scores[uid] = (arena.scores[uid] || 0) + (pointsMap[uid] || 0);
    const results = uids
      .map((uid) => ({
        userId: uid,
        nickname: session.users.get(uid)?.nickname || arena.entries[uid]?.nickname || arena.names[uid] || '?',
        png: arena.entries[uid]?.png || null,
        gained: pointsMap[uid] || 0,
        total: arena.scores[uid],
      }))
      .sort((a, b) => b.gained - a.gained);
    recordArenaRounds(
      results.map((r, i) => ({
        accountId: session.users.get(r.userId)?.accountId,
        points: r.gained,
        won: i === 0 && r.gained > 0,
        aiJudged: !!extra.aiJudged,
      }))
    );
    io.to(mySessionCode).emit('ARENA_RESULTS', {
      round: arena.round,
      totalRounds: arena.totalRounds,
      results,
      comment: extra.comment || null,
      aiJudged: !!extra.aiJudged,
      reveal: extra.reveal || null,
      kind: arena.kind,
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

  // draw / memory / blind: класация → ROUND_POINTS
  const arenaComputeResults = (ranking, comment, aiJudged) => {
    const pointsMap = {};
    ranking.forEach((uid, i) => { pointsMap[uid] = ROUND_POINTS[i] ?? 20; });
    applyRoundPoints(pointsMap, { comment, aiJudged });
  };

  // pictionary: точки на познали (по ред) + на рисуващия (по дял познали)
  const finishPictionary = () => {
    const session = mySession();
    const arena = session?.arena;
    if (!arena || arena.kind !== 'pictionary' || arena.phase !== 'drawing') return;
    clearTimeout(arena.drawTimer);
    const pointsMap = {};
    arena.guessOrder.forEach((uid, i) => { pointsMap[uid] = pictionaryScore(i); });
    if (arena.drawerId) pointsMap[arena.drawerId] = pictionaryDrawerScore(arena.guessOrder.length, arena.guessers);
    const comment = arena.guessOrder.length === 0
      ? `Nobody guessed it — the word was “${arena.secret}”.`
      : `The word was “${arena.secret}”.`;
    io.to(mySessionCode).emit('PICTIONARY_END');
    applyRoundPoints(pointsMap, { reveal: { word: arena.secret, drawerId: arena.drawerId }, comment });
  };

  const finishArenaCollect = async () => {
    const session = mySession();
    const arena = session?.arena;
    if (!arena || arena.phase !== 'collect') return;
    clearTimeout(arena.collectTimer);
    const entries = Object.values(arena.entries);
    if (entries.length === 0 && arena.kind !== 'impostor') {
      arenaComputeResults([], 'Nobody submitted a drawing this round!', false);
      return;
    }
    // Impostor: винаги гласуване „кой е фалшивият?"
    if (arena.kind === 'impostor') {
      arena.phase = 'voting';
      io.to(mySessionCode).emit('ARENA_GALLERY', { entries });
      arena.voteTimer = setTimeout(() => finishArenaVoting(), 25000);
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

    if (arena.kind === 'impostor') {
      const players = [...session.users.keys()];
      const { scores, caught, suspectId } = impostorScores(arena.votes, arena.impostorId, players);
      const impNick = session.users.get(arena.impostorId)?.nickname || '?';
      applyRoundPoints(scores, {
        reveal: { impostorId: arena.impostorId, impostorNickname: impNick, caught, suspectId },
        comment: caught ? '🕵 The impostor was caught!' : '🎭 The impostor fooled everyone!',
      });
      return;
    }

    const tally = {};
    for (const t of Object.values(arena.votes)) tally[t] = (tally[t] || 0) + 1;
    const ranking = Object.keys(arena.entries).sort((a, b) => (tally[b] || 0) - (tally[a] || 0));
    arenaComputeResults(ranking, null, false);
  };

  const startArenaRound = (n) => {
    const session = mySession();
    if (!session) return;
    const arena = session.arena;
    const userIds = [...session.users.keys()];
    let kind = ROUND_KINDS[(n - 1) % ROUND_KINDS.length];
    // Гардове: pictionary иска ≥2 играчи, impostor ≥3 — иначе обикновен draw
    if (kind === 'pictionary' && userIds.length < 2) kind = 'draw';
    if (kind === 'impostor' && userIds.length < 3) kind = 'draw';

    const s = session.settings.roundSeconds;
    const endsAt = Date.now() + s * 1000;
    Object.assign(arena, {
      round: n, phase: 'drawing', kind, endsAt, entries: {}, votes: {},
      prompt: null, drawerId: null, secret: null, guessed: {}, guessOrder: [], guessers: 0, impostorId: null,
    });

    // ── Pictionary ──
    if (kind === 'pictionary') {
      arena.drawerIndex = (arena.drawerIndex + 1) % userIds.length;
      const drawerId = userIds[arena.drawerIndex];
      const word = pick(PICTIONARY_WORDS);
      arena.drawerId = drawerId;
      arena.secret = word;
      arena.guessers = userIds.length - 1;
      arena.prompt = { text: null };
      io.to(mySessionCode).emit('ARENA_ROUND', {
        round: n, totalRounds: arena.totalRounds, kind, endsAt, seconds: s,
        drawerId, drawerNickname: session.users.get(drawerId)?.nickname || '?',
        guessers: arena.guessers,
      });
      const drawerSock = session.users.get(drawerId)?.socketId;
      if (drawerSock) io.to(drawerSock).emit('PICTIONARY_WORD', { word });
      arena.drawTimer = setTimeout(() => {
        if (session.arena !== arena) return;
        finishPictionary();
      }, s * 1000);
      return;
    }

    // ── Impostor / Fake Artist ──
    if (kind === 'impostor') {
      const impostorId = userIds[Math.floor(Math.random() * userIds.length)];
      const word = pick(IMPOSTOR_WORDS);
      arena.impostorId = impostorId;
      arena.prompt = { text: word };
      io.to(mySessionCode).emit('ARENA_ROUND', {
        round: n, totalRounds: arena.totalRounds, kind, endsAt, seconds: s, prompt: { text: null },
      });
      for (const [uid, u] of session.users) {
        if (u.socketId) io.to(u.socketId).emit('ARENA_PROMPT', {
          text: uid === impostorId ? null : word,
          impostor: uid === impostorId,
        });
      }
      arena.drawTimer = setTimeout(() => {
        if (session.arena !== arena) return;
        arena.phase = 'collect';
        io.to(mySessionCode).emit('ARENA_COLLECT');
        arena.collectTimer = setTimeout(() => finishArenaCollect(), 8000);
      }, s * 1000);
      return;
    }

    // ── draw / memory / blind ──
    let prompt;
    if (kind === 'memory') {
      const m = MEMORY_PROMPTS[Math.floor(Math.random() * MEMORY_PROMPTS.length)];
      prompt = { text: m.label, emoji: m.emoji };
    } else {
      prompt = { text: DRAW_PROMPTS[Math.floor(Math.random() * DRAW_PROMPTS.length)] };
    }
    arena.prompt = prompt;
    io.to(mySessionCode).emit('ARENA_ROUND', {
      round: n, totalRounds: arena.totalRounds, kind, prompt, endsAt, seconds: s,
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
      drawerIndex: -1,
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
