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

  socket.on('CREATE_SESSION', ({ nickname }) => {
    mySessionCode = generateSessionCode();
    myUserId = nanoid(8);
    const color = generateUserColor(0);

    sessions.set(mySessionCode, {
      creatorId: myUserId,
      users: new Map([
        [
          myUserId,
          {
            userId: myUserId,
            nickname: String(nickname).slice(0, 20),
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
    });
    console.log(`Session ${mySessionCode} created by ${nickname}`);
  });

  socket.on('JOIN_SESSION', ({ nickname, sessionCode }) => {
    const session = sessions.get(sessionCode);
    if (!session || session.users.size >= 8) {
      socket.emit('JOIN_ERROR', { message: session ? 'Session is full' : 'Session not found' });
      return;
    }

    mySessionCode = sessionCode;
    myUserId = nanoid(8);
    const color = generateUserColor(session.users.size);

    const userData = {
      userId: myUserId,
      nickname: String(nickname).slice(0, 20),
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
    });
    socket.to(mySessionCode).emit('USER_JOINED', userData);
    console.log(`${nickname} joined session ${sessionCode}`);
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
