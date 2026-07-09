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

    socket.on('INIT', ({ yourId, yourColor, sessionCode, users: existing, isCreator }) => {
      setSessionInfo({ yourId, yourColor, sessionCode, isCreator });
      const map = {};
      existing.forEach((u) => (map[u.userId] = u));
      syncUsers(() => map);
      setJoinError(null);
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

    return socket;
  }, [syncUsers]);

  const createSession = useCallback(
    (nickname) => {
      const socket = connect();
      socket.emit('CREATE_SESSION', { nickname });
    },
    [connect]
  );

  const joinSession = useCallback(
    (nickname, sessionCode) => {
      const socket = connect();
      socket.emit('JOIN_SESSION', { nickname, sessionCode: sessionCode.toUpperCase() });
    },
    [connect]
  );

  const sendStateUpdate = useCallback((data) => {
    socketRef.current?.emit('STATE_UPDATE', data);
  }, []);

  const sendParticleSnapshot = useCallback((particles) => {
    socketRef.current?.emit('PARTICLE_SNAPSHOT', { particles });
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
  }, [syncUsers]);

  useEffect(() => () => socketRef.current?.disconnect(), []);

  return {
    connected,
    sessionInfo,
    users,
    usersRef,
    joinError,
    sessionEnded,
    createSession,
    joinSession,
    sendStateUpdate,
    sendParticleSnapshot,
    endSession,
    disconnect,
  };
}
