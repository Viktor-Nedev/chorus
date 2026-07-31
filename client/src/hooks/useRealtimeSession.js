// Collective без собствен сървър: Supabase Realtime вместо Socket.io.
//
//  · присъствие (кой е в стаята, емоция/жест/звук) → Realtime **presence**
//  · щрихи, чат, реакции, камери, арена събития → Realtime **broadcast**
//  · стаята (код, режим, настройки) → таблица `sessions`
//
// Публичният интерфейс е ЕДНАКЪВ с useSocket, за да не се пипат
// CollectiveCanvas/SharedCanvas/ChatPanel/CamStrip/ArenaOverlay.
import { useState, useRef, useCallback, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { describeSupabaseError } from '../lib/setupCheck';

const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ'; // без лесно бъркащи се
const randomCode = () =>
  Array.from({ length: 4 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join('');

const USER_HUES = [280, 180, 40, 350, 140, 200, 60, 300];
const colorFor = (i) => ({ h: USER_HUES[i % USER_HUES.length], s: 70, l: 60 });

export function useRealtimeSession() {
  const [connected, setConnected] = useState(false);
  const [sessionInfo, setSessionInfo] = useState(null);
  const [users, setUsers] = useState({});
  const usersRef = useRef({});
  usersRef.current = users;
  const [joinError, setJoinError] = useState(null);
  const [sessionEnded, setSessionEnded] = useState(null);
  const [chatMessages, setChatMessages] = useState([]);
  const [battle, setBattle] = useState(null);
  const [arena, setArena] = useState(null);
  const [camFrames, setCamFrames] = useState({});

  const channelRef = useRef(null);
  const meRef = useRef(null); // { id, nickname, color, isCreator }
  const listenersRef = useRef({}); // локални слушатели (както emitLocal в useSocket)

  // ── локална шина (SharedCanvas/ReactionsBar слушат оттук) ──
  const onEvent = useCallback((name, fn) => {
    (listenersRef.current[name] ||= new Set()).add(fn);
    return () => listenersRef.current[name]?.delete(fn);
  }, []);
  const emitLocal = useCallback((name, payload) => {
    listenersRef.current[name]?.forEach((fn) => fn(payload));
  }, []);

  // ── изпращане по канала ──
  const send = useCallback((event, payload) => {
    channelRef.current?.send({ type: 'broadcast', event, payload });
  }, []);

  // Presence → users обект със същата форма както при Socket.io
  const syncPresence = useCallback(() => {
    const ch = channelRef.current;
    if (!ch) return;
    const state = ch.presenceState();
    const next = {};
    Object.values(state).forEach((entries) => {
      const u = entries[0];
      if (!u || u.userId === meRef.current?.id) return;
      next[u.userId] = {
        nickname: u.nickname,
        baseColor: u.baseColor,
        emotion: u.emotion || 'neutral',
        gesture: u.gesture || 'NO_HAND',
        audioLevel: u.audioLevel || 0,
        handPosition: u.handPosition || { x: 0.5, y: 0.5 },
      };
    });
    setUsers(next);
  }, []);

  // ── свързване към канал ──
  const connect = useCallback(
    (code, me, { isCreator, mode, settings }) => {
      const ch = supabase.channel(`session:${code}`, {
        config: { presence: { key: me.id }, broadcast: { self: false } },
      });
      channelRef.current = ch;
      meRef.current = { ...me, isCreator };

      ch.on('presence', { event: 'sync' }, syncPresence);
      ch.on('presence', { event: 'join' }, syncPresence);
      ch.on('presence', { event: 'leave' }, syncPresence);

      // Рисуване / чат / реакции / камери — имената са същите като преди
      ch.on('broadcast', { event: 'STROKE' }, ({ payload }) => emitLocal('STROKE', payload));
      ch.on('broadcast', { event: 'CANVAS_CLEARED' }, () => emitLocal('CANVAS_CLEARED'));
      ch.on('broadcast', { event: 'CHAT' }, ({ payload }) =>
        setChatMessages((prev) => [...prev.slice(-199), payload])
      );
      ch.on('broadcast', { event: 'REACTION' }, ({ payload }) => emitLocal('REACTION', payload));
      ch.on('broadcast', { event: 'CAM_FRAME' }, ({ payload }) =>
        setCamFrames((prev) => ({ ...prev, [payload.userId]: payload.jpg }))
      );
      ch.on('broadcast', { event: 'PICTIONARY_STROKE' }, ({ payload }) =>
        emitLocal('PICTIONARY_STROKE', payload)
      );

      // Състояния на игрите — host-ът ги излъчва, всички ги отразяват
      ch.on('broadcast', { event: 'BATTLE' }, ({ payload }) => setBattle(payload));
      ch.on('broadcast', { event: 'ARENA' }, ({ payload }) =>
        setArena((prev) => (payload === null ? null : { ...prev, ...payload }))
      );
      ch.on('broadcast', { event: 'ARENA_EVENT' }, ({ payload }) =>
        emitLocal(payload.name, payload.data)
      );
      ch.on('broadcast', { event: 'SESSION_ENDED' }, ({ payload }) => setSessionEnded(payload));

      // Само host-ът трупа рисунките и гласовете за текущия рунд
      ch.on('broadcast', { event: 'ENTRY' }, ({ payload }) => {
        if (meRef.current?.isCreator) entriesRef.current[payload.userId] = payload;
      });
      ch.on('broadcast', { event: 'VOTE' }, ({ payload }) => {
        if (!meRef.current?.isCreator) return;
        votesRef.current[payload.voterId] = payload.targetId;
        emitLocal('ARENA_VOTES', { count: Object.keys(votesRef.current).length });
      });

      // Само host-ът отговаря на молба за текущото състояние (късно присъединяване)
      ch.on('broadcast', { event: 'REQUEST_STATE' }, () => {
        if (!meRef.current?.isCreator) return;
        send('STATE_SNAPSHOT', { battle: null, arena: null, chat: chatMessages.slice(-50) });
      });
      ch.on('broadcast', { event: 'STATE_SNAPSHOT' }, ({ payload }) => {
        if (payload.chat?.length) setChatMessages(payload.chat);
        if (payload.battle) setBattle(payload.battle);
        if (payload.arena) setArena(payload.arena);
      });

      ch.subscribe(async (status) => {
        if (status !== 'SUBSCRIBED') return;
        setConnected(true);
        await ch.track({
          userId: me.id,
          nickname: me.nickname,
          baseColor: me.color,
          emotion: 'neutral',
          gesture: 'NO_HAND',
          audioLevel: 0,
          handPosition: { x: 0.5, y: 0.5 },
        });
        setSessionInfo({
          yourId: me.id,
          yourColor: me.color,
          sessionCode: code,
          isCreator,
          mode: mode || 'canvas',
          settings: settings || {},
        });
        if (!isCreator) send('REQUEST_STATE', {});
      });
    },
    [emitLocal, send, syncPresence, chatMessages]
  );

  // ── създаване на стая ──
  const createSession = useCallback(
    async (nickname, auth, mode = 'canvas', settings = {}) => {
      setJoinError(null);
      if (!supabase) return setJoinError('Collective needs Supabase — ask the admin to configure it.');
      const { data: userRes } = await supabase.auth.getUser();
      const uid = userRes?.user?.id;
      if (!uid) return setJoinError('Sign in first to create a room.');

      // намери свободен код
      let code = null;
      for (let i = 0; i < 6 && !code; i++) {
        const candidate = randomCode();
        const { data } = await supabase.from('sessions').select('code').eq('code', candidate).maybeSingle();
        if (!data) code = candidate;
      }
      if (!code) return setJoinError('Could not allocate a room code — try again.');

      const { error } = await supabase.from('sessions').insert({
        code, creator_id: uid, creator_name: nickname, mode, settings, active: true,
      });
      if (error) return setJoinError(describeSupabaseError(error, 'Creating the room'));

      connect(code, { id: uid, nickname, color: colorFor(0) }, { isCreator: true, mode, settings });
    },
    [connect]
  );

  // ── присъединяване по код ──
  const joinSession = useCallback(
    async (nickname, code) => {
      setJoinError(null);
      if (!supabase) return setJoinError('Collective needs Supabase — ask the admin to configure it.');
      const upper = String(code || '').toUpperCase().trim();
      const { data: userRes } = await supabase.auth.getUser();
      const uid = userRes?.user?.id;
      if (!uid) return setJoinError('Sign in first to join a room.');

      const { data, error } = await supabase
        .from('sessions').select('*').eq('code', upper).eq('active', true).maybeSingle();
      if (error) return setJoinError(describeSupabaseError(error, 'Joining'));
      if (!data) return setJoinError('No active room with that code.');

      const idx = Object.keys(usersRef.current).length + 1;
      connect(upper, { id: uid, nickname, color: colorFor(idx) },
        { isCreator: data.creator_id === uid, mode: data.mode, settings: data.settings });
    },
    [connect]
  );

  // ── излъчване на състояние (емоция/жест/звук) през presence ──
  const sendStateUpdate = useCallback((state) => {
    const ch = channelRef.current;
    const me = meRef.current;
    if (!ch || !me) return;
    ch.track({
      userId: me.id, nickname: me.nickname, baseColor: me.color,
      emotion: state.emotion, gesture: state.gesture,
      audioLevel: state.audioLevel, handPosition: state.handPosition,
    });
  }, []);

  const sendStroke = useCallback((op) => {
    emitLocal('STROKE', op); // веднага локално, после към другите
    send('STROKE', op);
  }, [emitLocal, send]);

  const clearCanvas = useCallback(() => {
    emitLocal('CANVAS_CLEARED');
    send('CANVAS_CLEARED', {});
  }, [emitLocal, send]);

  const sendChat = useCallback((text) => {
    const me = meRef.current;
    if (!me) return;
    const msg = { userId: me.id, nickname: me.nickname, text: String(text).slice(0, 300), at: Date.now() };
    setChatMessages((prev) => [...prev.slice(-199), msg]);
    send('CHAT', msg);
  }, [send]);

  const sendReaction = useCallback((emoji) => {
    const me = meRef.current;
    const r = { userId: me?.id, emoji, x: 10 + Math.random() * 80 };
    emitLocal('REACTION', r);
    send('REACTION', r);
  }, [emitLocal, send]);

  const sendCamFrame = useCallback((jpg) => {
    const me = meRef.current;
    if (me) send('CAM_FRAME', { userId: me.id, jpg });
  }, [send]);

  const sendPictionaryStroke = useCallback((op) => send('PICTIONARY_STROKE', op), [send]);

  // Арена/battle — host-ът праща състоянието; engine-ът ги ползва
  const broadcastArena = useCallback((patch) => {
    setArena((prev) => (patch === null ? null : { ...prev, ...patch }));
    send('ARENA', patch);
  }, [send]);
  const broadcastBattle = useCallback((state) => {
    setBattle(state);
    send('BATTLE', state);
  }, [send]);
  const broadcastArenaEvent = useCallback((name, data) => {
    emitLocal(name, data);
    send('ARENA_EVENT', { name, data });
  }, [emitLocal, send]);

  // ── Игри: host-ът върти фазите и таймерите, останалите само слушат ──
  const strokesRef = useRef([]);
  const entriesRef = useRef({}); // userId → { png, nickname }
  const votesRef = useRef({});   // voterId → targetId
  const timersRef = useRef([]);
  const clearTimers = () => { timersRef.current.forEach(clearTimeout); timersRef.current = []; };
  const later = (fn, ms) => timersRef.current.push(setTimeout(fn, ms));

  const isHost = () => !!meRef.current?.isCreator;
  const roster = () => [
    { id: meRef.current?.id, nickname: meRef.current?.nickname },
    ...Object.entries(usersRef.current).map(([id, u]) => ({ id, nickname: u.nickname })),
  ].filter((u) => u.id);

  // Събиране на рисунките → галерия → гласуване → резултат
  const collectThenVote = useCallback((kind, seconds, onResult) => {
    entriesRef.current = {};
    votesRef.current = {};
    later(() => {
      broadcastArenaEvent(kind === 'battle' ? 'BATTLE_COLLECT' : 'ARENA_COLLECT');
      later(() => {
        const entries = Object.entries(entriesRef.current).map(([userId, e]) => ({ userId, ...e }));
        broadcastArenaEvent(kind === 'battle' ? 'BATTLE_GALLERY' : 'ARENA_GALLERY', { entries });
        later(() => onResult(entries), 20000); // 20s за гласуване
      }, 1200);
    }, seconds * 1000);
  }, [broadcastArenaEvent]);

  // Draw Battle
  const startBattle = useCallback((theme, seconds = 60) => {
    if (!isHost()) return;
    clearTimers();
    const endsAt = Date.now() + seconds * 1000;
    broadcastBattle({ phase: 'drawing', theme, endsAt, seconds });
    collectThenVote('battle', seconds, (entries) => {
      const tally = {};
      Object.values(votesRef.current).forEach((t) => { tally[t] = (tally[t] || 0) + 1; });
      const winner = entries.map((e) => e.userId).sort((a, b) => (tally[b] || 0) - (tally[a] || 0))[0];
      const win = entries.find((e) => e.userId === winner);
      broadcastArenaEvent('BATTLE_RESULT', {
        winner: win ? { userId: win.userId, nickname: win.nickname, votes: tally[winner] || 0 } : null,
        entries: entries.map((e) => ({ ...e, votes: tally[e.userId] || 0 })),
      });
      broadcastBattle({ phase: 'result', theme });
      if (winner === meRef.current?.id && supabase) supabase.rpc('add_battle_win').then(null, () => {});
    });
  }, [broadcastBattle, broadcastArenaEvent, collectThenVote]);

  const sendBattleSnapshot = useCallback((png) => {
    const me = meRef.current;
    if (me) send('ENTRY', { userId: me.id, nickname: me.nickname, png });
  }, [send]);
  const sendBattleVote = useCallback((targetId) => {
    const me = meRef.current;
    if (me) send('VOTE', { voterId: me.id, targetId });
  }, [send]);
  const dismissBattle = useCallback(() => { clearTimers(); broadcastBattle(null); }, [broadcastBattle]);

  // Game Arena — рундове по избрания план
  const startArena = useCallback(async () => {
    if (!isHost()) return;
    clearTimers();
    const { planFromGame, pick, PICTIONARY_WORDS } = await import('../engine/arenaGames.js');
    const s = sessionInfo?.settings || {};
    const players = roster();
    const plan = planFromGame(s.game, s.rounds || 3, players.length);
    const seconds = s.roundSeconds || 60;
    let round = 0;

    const nextRound = () => {
      if (round >= plan.length) {
        broadcastArenaEvent('ARENA_PODIUM', { standings: [] });
        return;
      }
      const kind = plan[round];
      round += 1;
      const prompt = kind === 'pictionary' ? pick(PICTIONARY_WORDS) : null;
      broadcastArena({
        phase: 'drawing', kind, round, totalRounds: plan.length,
        endsAt: Date.now() + seconds * 1000,
        prompt: prompt ? { text: prompt } : null,
      });
      collectThenVote('arena', seconds, (entries) => {
        const tally = {};
        Object.values(votesRef.current).forEach((t) => { tally[t] = (tally[t] || 0) + 1; });
        const results = entries
          .map((e) => ({ ...e, votes: tally[e.userId] || 0, gained: (tally[e.userId] || 0) * 20 }))
          .sort((a, b) => b.votes - a.votes);
        broadcastArenaEvent('ARENA_RESULTS', { results });
        broadcastArena({ phase: 'result' });
        const mine = results.find((r) => r.userId === meRef.current?.id);
        if (mine && supabase) {
          supabase.rpc('add_arena_points', {
            p_points: mine.gained, p_won: results[0]?.userId === mine.userId, p_ai: false,
          }).then(null, () => {});
        }
        later(nextRound, 6000);
      });
    };
    nextRound();
  }, [broadcastArena, broadcastArenaEvent, collectThenVote, sessionInfo]);

  const sendArenaSnapshot = sendBattleSnapshot;
  const sendArenaVote = sendBattleVote;
  const dismissArena = useCallback(() => { clearTimers(); broadcastArena(null); }, [broadcastArena]);

  const endSession = useCallback(async () => {
    const info = sessionInfo;
    const payload = { totalUsers: Object.keys(usersRef.current).length + 1, duration: 0, emotionHistory: [] };
    send('SESSION_ENDED', payload);
    setSessionEnded(payload);
    if (info?.sessionCode && supabase) {
      await supabase.from('sessions').update({ active: false }).eq('code', info.sessionCode);
    }
  }, [send, sessionInfo]);

  const disconnect = useCallback(() => {
    channelRef.current?.unsubscribe();
    channelRef.current = null;
    meRef.current = null;
    setConnected(false);
    setSessionInfo(null);
    setUsers({});
    setChatMessages([]);
    setBattle(null);
    setArena(null);
    setCamFrames({});
    setSessionEnded(null);
  }, []);

  useEffect(() => () => channelRef.current?.unsubscribe(), []);

  return {
    connected, sessionInfo, users, usersRef, joinError, sessionEnded,
    chatMessages, battle, arena, camFrames, strokesRef,
    createSession, joinSession, sendStateUpdate, sendStroke, clearCanvas,
    sendChat, sendReaction, sendCamFrame, sendPictionaryStroke,
    startBattle, sendBattleSnapshot, sendBattleVote, dismissBattle,
    startArena, sendArenaSnapshot, sendArenaVote, dismissArena,
    endSession, disconnect, onEvent,
    emitStroke: sendStroke,
    // съвместимост със стария интерфейс
    sendParticleSnapshot: () => {},
  };
}
