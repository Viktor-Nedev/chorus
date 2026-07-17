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

  // ── Споделено рисуване / чат / реакции / battle ──
  const strokesRef = useRef([]); // пълна история (за replay при късно закачане)
  const [chatMessages, setChatMessages] = useState([]);
  const [battle, setBattle] = useState(null);
  // battle: { phase:'drawing'|'collect'|'voting'|'result', theme, endsAt, entries?, result? }
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

    socket.on('INIT', ({ yourId, yourColor, sessionCode, users: existing, isCreator, strokes, chat }) => {
      setSessionInfo({ yourId, yourColor, sessionCode, isCreator });
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

    return socket;
  }, [syncUsers, emitLocal]);

  const createSession = useCallback(
    (nickname, auth) => {
      const socket = connect();
      socket.emit('CREATE_SESSION', { nickname, auth });
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
    endSession,
    disconnect,
  };
}
