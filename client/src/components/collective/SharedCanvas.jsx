import { useEffect, useRef } from 'react';
import { EMOTION_HEX } from '../../constants/emotions';

// Споделен слой за рисуване НАД p5 платното (независим от p5). Op-модел:
// brush/line/rect/circle с цвят/размер/непрозрачност/гума. Точките са
// нормализирани [0..1], дебелината е в „референтни px" (1920) → еднакво на
// всеки екран. Три режима: shared (общо платно), personal (battle/arena рунд —
// скрит личен слой), pictionary (само рисуващият, но всички го виждат).
const REF_W = 1920;

function drawOp(ctx, op, W, H) {
  const pts = op.points;
  if (!pts || !pts.length) return;
  const type = op.type || 'brush';
  ctx.save();
  ctx.globalCompositeOperation = op.erase ? 'destination-out' : 'source-over';
  ctx.globalAlpha = op.erase ? 1 : op.opacity == null ? 1 : op.opacity;
  ctx.strokeStyle = op.color || '#fff';
  ctx.fillStyle = op.color || '#fff';
  ctx.lineWidth = Math.max(1, (op.size * W) / REF_W);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  if (type === 'brush') {
    if (pts.length < 2) {
      ctx.beginPath();
      ctx.arc(pts[0][0] * W, pts[0][1] * H, ctx.lineWidth / 2, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.beginPath();
      ctx.moveTo(pts[0][0] * W, pts[0][1] * H);
      for (const [nx, ny] of pts) ctx.lineTo(nx * W, ny * H);
      ctx.stroke();
    }
  } else {
    const a = pts[0];
    const b = pts[pts.length - 1];
    const x1 = a[0] * W;
    const y1 = a[1] * H;
    const x2 = b[0] * W;
    const y2 = b[1] * H;
    ctx.beginPath();
    if (type === 'line') {
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
    } else if (type === 'rect') {
      ctx.rect(Math.min(x1, x2), Math.min(y1, y2), Math.abs(x2 - x1), Math.abs(y2 - y1));
    } else if (type === 'circle') {
      ctx.arc(x1, y1, Math.hypot(x2 - x1, y2 - y1), 0, Math.PI * 2);
    }
    ctx.stroke();
  }
  ctx.restore();
}

export function SharedCanvas({
  socket,
  drawMode,
  tool = 'brush', // brush | line | rect | circle | eraser
  color,
  size,
  opacity = 1,
  battlePhase, // null | 'drawing' | 'collect' (battle ИЛИ personal arena рунд)
  blind = false,
  pictionary, // { active, isDrawer } — pictionary рунд
  drivers, // { handRef, gestureRef, emotionRef, getAudioData, handDraw, voicePaint, emotionColor }
  onCanvasReady,
}) {
  const canvasRef = useRef(null);
  const previewRef = useRef(null);
  const hostRef = useRef(null);
  const stateRef = useRef({
    drawing: false, points: [], personalOps: [], pictionaryOps: [],
    hand: { active: false, points: [] },
    voice: { drew: false, points: [] },
  });
  const propsRef = useRef({});
  propsRef.current = { drawMode, tool, color, size, opacity, battlePhase, blind, pictionary, drivers };

  const mainCtx = () => canvasRef.current?.getContext('2d');
  const previewCtx = () => previewRef.current?.getContext('2d');

  const currentOps = () => {
    const p = propsRef.current;
    if (p.pictionary?.active) return stateRef.current.pictionaryOps;
    if (p.battlePhase) return p.blind ? [] : stateRef.current.personalOps;
    return socket.strokesRef.current;
  };

  const redrawAll = () => {
    const canvas = canvasRef.current;
    const ctx = mainCtx();
    if (!ctx) return;
    const { width: W, height: H } = canvas;
    ctx.clearRect(0, 0, W, H);
    for (const op of currentOps()) drawOp(ctx, op, W, H);
  };

  // Ефективен цвят (emotion color → цвят по емоцията)
  const effColor = () => {
    const p = propsRef.current;
    if (p.drivers?.emotionColor) return EMOTION_HEX[p.drivers.emotionRef?.current] || p.color;
    return p.color;
  };

  // Commit на op по текущия режим (shared / personal / pictionary) — общо за
  // мишка, ръка и глас.
  const commitOp = (opObj) => {
    const p = propsRef.current;
    if (p.pictionary?.active) {
      stateRef.current.pictionaryOps.push(opObj);
      socket.emitStroke(opObj);
    } else if (p.battlePhase === 'drawing') {
      stateRef.current.personalOps.push(opObj);
    } else if (!p.battlePhase) {
      socket.sendStroke(opObj);
    }
  };

  // rAF драйвер за рисуване с РЪКА и с ГЛАС (порт на Solo механиките)
  const rafRef = useRef(0);
  const tick = () => {
    rafRef.current = requestAnimationFrame(tick);
    const p = propsRef.current;
    const d = p.drivers;
    const canvas = canvasRef.current;
    if (!d || !canvas) return;
    const W = canvas.width;
    const H = canvas.height;
    const col = effColor();
    const isEraser = p.tool === 'eraser';
    const showLive = !(p.blind && p.battlePhase); // blind рунд: без живо рисуване

    // ── Рисуване с ръка ──
    const hs = stateRef.current.hand;
    if (d.handDraw && d.handRef && p.drawMode) {
      const hp = d.handRef.current || { x: 0.5, y: 0.5 };
      const gesture = d.gestureRef?.current || 'NO_HAND';
      const canDraw = gesture !== 'NO_HAND' && gesture !== 'OPEN_PALM';
      // курсор-пръстен (обратна връзка), ако мишката не тегли
      const pc = previewCtx();
      if (pc && !stateRef.current.drawing) {
        pc.clearRect(0, 0, W, H);
        pc.save();
        pc.strokeStyle = canDraw ? 'rgba(120,255,160,0.9)' : 'rgba(255,255,255,0.5)';
        pc.lineWidth = 2;
        pc.beginPath();
        pc.arc(hp.x * W, hp.y * H, Math.max(10, (p.size * W) / REF_W), 0, Math.PI * 2);
        pc.stroke();
        pc.restore();
      }
      if (canDraw) {
        const pt = [hp.x, hp.y];
        if (!hs.points.length) { hs.points = [pt]; hs.active = true; }
        else {
          const last = hs.points[hs.points.length - 1];
          if (Math.hypot(pt[0] - last[0], pt[1] - last[1]) > 0.004) {
            if (showLive) drawOp(mainCtx(), { type: 'brush', color: col, size: p.size, opacity: p.opacity, erase: isEraser, points: [last, pt] }, W, H);
            hs.points.push(pt);
          }
        }
      } else if (hs.active) {
        if (hs.points.length >= 1) {
          commitOp({ type: 'brush', color: col, size: p.size, opacity: p.opacity, erase: isEraser, points: hs.points.map(([x, y]) => [Math.round(x * 1e4) / 1e4, Math.round(y * 1e4) / 1e4]) });
        }
        hs.points = []; hs.active = false;
      }
    } else if (hs.active) {
      hs.points = []; hs.active = false;
    }

    // ── Рисуване с глас ──
    const vs = stateRef.current.voice;
    if (d.voicePaint && d.getAudioData && p.drawMode) {
      const level = d.getAudioData().totalLevel || 0;
      const gesture = d.gestureRef?.current || 'NO_HAND';
      const hp = d.handRef?.current || { x: 0.5, y: 0.5 };
      const steer = gesture !== 'NO_HAND' ? [hp.x, hp.y] : [0.5, 0.5];
      if (level > 0.06) {
        if (!vs.points.length) { vs.points = [steer]; }
        else {
          const last = vs.points[vs.points.length - 1];
          const w = Math.max(p.size, p.size * (0.6 + level * 3));
          if (showLive) drawOp(mainCtx(), { type: 'brush', color: col, size: w, opacity: p.opacity, points: [last, steer] }, W, H);
          vs.points.push(steer);
        }
        vs.drew = true;
      } else if (vs.drew) {
        if (vs.points.length >= 1) {
          commitOp({ type: 'brush', color: col, size: Math.max(p.size, p.size * 1.5), opacity: p.opacity, points: vs.points.map(([x, y]) => [Math.round(x * 1e4) / 1e4, Math.round(y * 1e4) / 1e4]) });
        }
        vs.points = []; vs.drew = false;
      }
    }
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    const preview = previewRef.current;
    const host = hostRef.current;
    if (!canvas || !preview || !host) return undefined;
    onCanvasReady?.(canvas);

    const resize = () => {
      canvas.width = host.clientWidth;
      canvas.height = host.clientHeight;
      preview.width = host.clientWidth;
      preview.height = host.clientHeight;
      redrawAll();
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(host);

    // Входящи ops / replay / clear
    const offStroke = socket.onEvent('STROKE', (op) => {
      if (propsRef.current.battlePhase || propsRef.current.pictionary?.active) return;
      drawOp(mainCtx(), op, canvas.width, canvas.height);
    });
    const offReplay = socket.onEvent('CANVAS_REPLAY', () => redrawAll());
    const offClear = socket.onEvent('CANVAS_CLEARED', () => redrawAll());

    // Pictionary: чужди щрихи от рисуващия → показвай на всички
    const offPicStroke = socket.onEvent('PICTIONARY_STROKE', (op) => {
      stateRef.current.pictionaryOps.push(op);
      if (propsRef.current.pictionary?.active) drawOp(mainCtx(), op, canvas.width, canvas.height);
    });
    const offPicEnd = socket.onEvent('PICTIONARY_END', () => {
      stateRef.current.pictionaryOps = [];
      redrawAll();
    });

    // Snapshot на личния слой при COLLECT (battle/arena)
    const buildSnapshot = () => {
      const snap = document.createElement('canvas');
      const scale = 400 / canvas.width;
      snap.width = 400;
      snap.height = Math.round(canvas.height * scale);
      const sctx = snap.getContext('2d');
      sctx.fillStyle = '#0d0d12';
      sctx.fillRect(0, 0, snap.width, snap.height);
      for (const op of stateRef.current.personalOps) drawOp(sctx, op, snap.width, snap.height);
      return snap.toDataURL('image/png');
    };
    const offCollect = socket.onEvent('BATTLE_COLLECT', () => socket.sendBattleSnapshot(buildSnapshot()));
    const offArenaCollect = socket.onEvent('ARENA_COLLECT', () => socket.sendArenaSnapshot(buildSnapshot()));

    rafRef.current = requestAnimationFrame(tick); // hand/voice драйвер

    return () => {
      ro.disconnect();
      cancelAnimationFrame(rafRef.current);
      offStroke();
      offReplay();
      offClear();
      offPicStroke();
      offPicEnd();
      offCollect();
      offArenaCollect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Влизане в личен рунд → чист личен слой; излизане → replay на общото
  const prevPhase = useRef(null);
  useEffect(() => {
    if (battlePhase === 'drawing' && prevPhase.current !== 'drawing') {
      stateRef.current.personalOps = [];
      redrawAll();
    }
    if (!battlePhase && prevPhase.current) redrawAll();
    prevPhase.current = battlePhase;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [battlePhase]);

  // Смяна на pictionary състоянието → пречертай
  useEffect(() => {
    if (!pictionary?.active) stateRef.current.pictionaryOps = [];
    redrawAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pictionary?.active]);

  // ── Рисуване ──
  const pointerPos = (e) => {
    const r = canvasRef.current.getBoundingClientRect();
    return [(e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height];
  };

  const isShape = () => ['line', 'rect', 'circle'].includes(propsRef.current.tool);

  const onDown = (e) => {
    if (!propsRef.current.drawMode) return;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    stateRef.current.drawing = true;
    stateRef.current.points = [pointerPos(e)];
  };

  const onMove = (e) => {
    const st = stateRef.current;
    if (!st.drawing) return;
    const p = pointerPos(e);
    const { tool: tl, blind: bl, battlePhase: phase, size: sz, opacity: op } = propsRef.current;
    const col = effColor();
    if (isShape()) {
      // Preview на фигурата върху overlay-а
      const pc = previewCtx();
      pc.clearRect(0, 0, previewRef.current.width, previewRef.current.height);
      if (!(bl && phase)) {
        drawOp(pc, { type: tl, color: col, size: sz, opacity: op, points: [st.points[0], p] }, previewRef.current.width, previewRef.current.height);
      }
      st.points[1] = p;
      return;
    }
    const last = st.points[st.points.length - 1];
    if (Math.hypot(p[0] - last[0], p[1] - last[1]) < 0.0025) return;
    st.points.push(p);
    if (bl && phase) return; // blind: без живо рисуване
    // Живо рисуване на последния сегмент (brush/eraser)
    const isEraser = tl === 'eraser';
    drawOp(mainCtx(), { type: 'brush', color: col, size: sz, opacity: op, erase: isEraser, points: [last, p] }, canvasRef.current.width, canvasRef.current.height);
  };

  const onUp = () => {
    const st = stateRef.current;
    if (!st.drawing) return;
    st.drawing = false;
    const p = propsRef.current;
    const tl = p.tool;
    const col = effColor();
    const shape = isShape();
    if (!shape && st.points.length < 1) { st.points = []; return; }
    if (shape && st.points.length < 2) { st.points = []; previewCtx()?.clearRect(0, 0, previewRef.current.width, previewRef.current.height); return; }

    const rounded = st.points.map(([x, y]) => [Math.round(x * 10000) / 10000, Math.round(y * 10000) / 10000]);
    const opObj = {
      type: shape ? tl : 'brush',
      color: col,
      size: p.size,
      opacity: p.opacity,
      erase: tl === 'eraser',
      points: shape ? [rounded[0], rounded[rounded.length - 1]] : rounded,
    };

    commitOp(opObj);
    const showLive = !(p.blind && p.battlePhase);
    if (shape && showLive) drawOp(mainCtx(), opObj, canvasRef.current.width, canvasRef.current.height);

    previewCtx()?.clearRect(0, 0, previewRef.current.width, previewRef.current.height);
    st.points = [];
  };

  return (
    <div
      ref={hostRef}
      className={`absolute inset-0 z-10 ${drawMode ? 'cursor-crosshair' : 'pointer-events-none'}`}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerLeave={onUp}
    >
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />
      <canvas ref={previewRef} className="absolute inset-0 w-full h-full pointer-events-none" />
    </div>
  );
}
