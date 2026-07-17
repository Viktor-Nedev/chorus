import { useRef, useState, useCallback, useEffect } from 'react';
import { io } from 'socket.io-client';

const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:3001';

export function useSocket() {
  const socketRef = useRef(null);
  const [connected, setConnected] = useState(false);
  const [sessionInfo, setSessionInfo] = useState(null);
  // { yourId, yourColor, sessionCode, isCreator }
  const [users, setUsers] = useState({}); // userId → { nickname, baseColor, emotion, gesture, audioLevel, handPosition, particles }
  const usersRef = useRef({});
  const [joinError, setJoinError] = useState(null);
  const [sessionEnded, setSessionEnded] = useState(null); // { emotionHistory, duration, totalUsers }

  // ── Споделено рисуване / чат / реакции / battle / arena ──
  const strokesRef = useRef([]); // пълна история (за replay при късно закачане)
  const [chatMessages, setChatMessages] = useState([]);
  const [battle, setBattle] = useState(null);
  // battle: { phase:'drawing'|'collect'|'voting'|'result', theme, endsAt, entries?, result? }
  const [arena, setArena] = useState(null);
  // arena: { phase:'drawing'|'collect'|'judging'|'voting'|'results'|'podium', round,
  //          totalRounds, kind, prompt, endsAt, entries?, results?, comment?, standings? }
  const [camFrames, setCamFrames] = useState({}); // userId → jpg dataURL
  const listenersRef = useRef({}); // event → Set<fn> (за canvas компонентите)

  const emitLocal = useCallback((event, data) => {
    listenersRef.current[event]?.forEach((fn) => fn(data));
  }, []);

  // Canvas компонентите се абонират за STROKE/CANVAS_CLEARED без re-render
  const onEvent = useCallback((event, fn) => {
    (listenersRef.current[event] ??= new Set()).add(fn);
    return () => listenersRef.current[event]?.delete(fn);
  }, []);

  const syncUsers = useCallback((updater) => {
    usersRef.current = updater(usersRef.current);
    setUsers(usersRef.current);
  }, []);

  const connect = useCallback(() => {
    if (socketRef.current) return socketRef.current;
    const socket = io(SERVER_URL, { transports: ['websocket', 'polling'] });
    socketRef.current = socket;

    socket.on('connect', () => setConnected(true));
    socket.on('disconnect', () => setConnected(false));

    socket.on('INIT', ({ yourId, yourColor, sessionCode, users: existing, isCreator, strokes, chat, mode, settings }) => {
      setSessionInfo({ yourId, yourColor, sessionCode, isCreator, mode: mode || 'canvas', settings });
      const map = {};
      existing.forEach((u) => (map[u.userId] = u));
      syncUsers(() => map);
      setJoinError(null);
      strokesRef.current = strokes || [];
      setChatMessages(chat || []);
      emitLocal('CANVAS_REPLAY', strokesRef.current);
    });

    socket.on('JOIN_ERROR', ({ message }) => setJoinError(message));

    socket.on('USER_JOINED', (userData) => {
      syncUsers((prev) => ({ ...prev, [userData.userId]: userData }));
    });

    socket.on('USER_LEFT', ({ userId }) => {
      syncUsers((prev) => {
        const next = { ...prev };
        delete next[userId];
        return next;
      });
    });

    socket.on('USER_STATE', ({ userId, ...data }) => {
      syncUsers((prev) => ({
        ...prev,
        [userId]: { ...prev[userId], userId, ...data },
      }));
    });

    socket.on('USER_PARTICLES', ({ userId, particles }) => {
      // Директно в ref — не re-render-ва React на всеки 500ms
      if (usersRef.current[userId]) {
        usersRef.current[userId].particles = particles;
      }
    });

    socket.on('SESSION_ENDED', (data) => setSessionEnded(data));

    // ── Рисуване ──
    socket.on('STROKE', (stroke) => {
      strokesRef.current.push(stroke);
      emitLocal('STROKE', stroke);
    });
    socket.on('CANVAS_CLEARED', () => {
      strokesRef.current = [];
      emitLocal('CANVAS_CLEARED');
    });

    // ── Чат / реакции ──
    socket.on('CHAT', (msg) => setChatMessages((prev) => [...prev.slice(-199), msg]));
    socket.on('REACTION', (r) => emitLocal('REACTION', r));

    // ── Draw battle ──
    socket.on('BATTLE_STARTED', ({ theme, endsAt, seconds }) =>
      setBattle({ phase: 'drawing', theme, endsAt, seconds })
    );
    socket.on('BATTLE_COLLECT', () => {
      setBattle((b) => (b ? { ...b, phase: 'collect' } : b));
      emitLocal('BATTLE_COLLECT');
    });
    socket.on('BATTLE_GALLERY', ({ entries }) =>
      setBattle((b) => ({ ...(b || {}), phase: 'voting', entries, votesIn: 0 }))
    );
    socket.on('BATTLE_VOTES', ({ count }) =>
      setBattle((b) => (b ? { ...b, votesIn: count } : b))
    );
    socket.on('BATTLE_RESULT', (result) =>
      setBattle((b) => ({ ...(b || {}), phase: 'result', result }))
    );

    // ── Game Arena ──
    socket.on('ARENA_ROUND', (data) =>
      setArena({ phase: 'drawing', ...data })
    );
    socket.on('ARENA_COLLECT', () => {
      setArena((a) => (a ? { ...a, phase: 'collect' } : a));
      emitLocal('ARENA_COLLECT');
    });
    socket.on('ARENA_JUDGING', () =>
      setArena((a) => (a ? { ...a, phase: 'judging' } : a))
    );
    socket.on('ARENA_GALLERY', ({ entries }) =>
      setArena((a) => ({ ...(a || {}), phase: 'voting', entries, votesIn: 0 }))
    );
    socket.on('ARENA_VOTES', ({ count }) =>
      setArena((a) => (a ? { ...a, votesIn: count } : a))
    );
    socket.on('ARENA_RESULTS', (data) =>
      setArena((a) => ({ ...(a || {}), phase: 'results', ...data }))
    );
    socket.on('ARENA_PODIUM', ({ standings }) =>
      setArena((a) => ({ ...(a || {}), phase: 'podium', standings }))
    );

    // ── Живи камери ──
    socket.on('CAM_FRAME', ({ userId, jpg }) =>
      setCamFrames((prev) => ({ ...prev, [userId]: jpg }))
    );

    return socket;
  }, [syncUsers, emitLocal]);

  const createSession = useCallback(
    (nickname, auth, mode, settings) => {
      const socket = connect();
      socket.emit('CREATE_SESSION', { nickname, auth, mode, settings });
    },
    [connect]
  );

  const joinSession = useCallback(
    (nickname, sessionCode, auth) => {
      const socket = connect();
      socket.emit('JOIN_SESSION', { nickname, sessionCode: sessionCode.toUpperCase(), auth });
    },
    [connect]
  );

  const sendStateUpdate = useCallback((data) => {
    socketRef.current?.emit('STATE_UPDATE', data);
  }, []);

  const sendParticleSnapshot = useCallback((particles) => {
    socketRef.current?.emit('PARTICLE_SNAPSHOT', { particles });
  }, []);

  const sendStroke = useCallback((stroke) => {
    strokesRef.current.push(stroke);
    socketRef.current?.emit('STROKE', stroke);
  }, []);

  const clearCanvas = useCallback(() => {
    socketRef.current?.emit('CLEAR_CANVAS');
  }, []);

  const sendChat = useCallback((text) => {
    socketRef.current?.emit('CHAT', { text });
  }, []);

  const sendReaction = useCallback((emoji) => {
    socketRef.current?.emit('REACTION', { emoji });
  }, []);

  const startBattle = useCallback((theme, seconds) => {
    socketRef.current?.emit('BATTLE_START', { theme, seconds });
  }, []);

  const sendBattleSnapshot = useCallback((png) => {
    socketRef.current?.emit('BATTLE_SNAPSHOT', { png });
  }, []);

  const sendBattleVote = useCallback((forUserId) => {
    socketRef.current?.emit('BATTLE_VOTE', { forUserId });
  }, []);

  const dismissBattle = useCallback(() => setBattle(null), []);

  // ── Arena ──
  const startArena = useCallback(() => {
    socketRef.current?.emit('ARENA_START');
  }, []);
  const sendArenaSnapshot = useCallback((png) => {
    socketRef.current?.emit('ARENA_SNAPSHOT', { png });
  }, []);
  const sendArenaVote = useCallback((forUserId) => {
    socketRef.current?.emit('ARENA_VOTE', { forUserId });
  }, []);
  const dismissArena = useCallback(() => setArena(null), []);

  // ── Камери ──
  const sendCamFrame = useCallback((jpg) => {
    socketRef.current?.emit('CAM_FRAME', { jpg });
  }, []);

  const endSession = useCallback(() => {
    socketRef.current?.emit('END_SESSION');
  }, []);

  const disconnect = useCallback(() => {
    socketRef.current?.disconnect();
    socketRef.current = null;
    setConnected(false);
    setSessionInfo(null);
    syncUsers(() => ({}));
    setSessionEnded(null);
    setChatMessages([]);
    setBattle(null);
    setArena(null);
    setCamFrames({});
    strokesRef.current = [];
  }, [syncUsers]);

  useEffect(() => () => socketRef.current?.disconnect(), []);

  return {
    connected,
    sessionInfo,
    users,
    usersRef,
    joinError,
    sessionEnded,
    chatMessages,
    battle,
    arena,
    camFrames,
    strokesRef,
    onEvent,
    createSession,
    joinSession,
    sendStateUpdate,
    sendParticleSnapshot,
    sendStroke,
    clearCanvas,
    sendChat,
    sendReaction,
    startBattle,
    sendBattleSnapshot,
    sendBattleVote,
    dismissBattle,
    startArena,
    sendArenaSnapshot,
    sendArenaVote,
    dismissArena,
    sendCamFrame,
    endSession,
    disconnect,
  };
}
