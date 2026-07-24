import { useEffect, useRef } from 'react';

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
  onCanvasReady,
}) {
  const canvasRef = useRef(null);
  const previewRef = useRef(null);
  const hostRef = useRef(null);
  const stateRef = useRef({ drawing: false, points: [], personalOps: [], pictionaryOps: [] });
  const propsRef = useRef({});
  propsRef.current = { drawMode, tool, color, size, opacity, battlePhase, blind, pictionary };

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

    return () => {
      ro.disconnect();
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
    const { tool: tl, blind: bl, battlePhase: phase, color: col, size: sz, opacity: op } = propsRef.current;
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
    const { tool: tl, color: col, size: sz, opacity: op, battlePhase: phase, pictionary: pic } = propsRef.current;
    const shape = isShape();
    if (!shape && st.points.length < 1) { st.points = []; return; }
    if (shape && st.points.length < 2) { st.points = []; previewCtx()?.clearRect(0, 0, previewRef.current.width, previewRef.current.height); return; }

    const isEraser = tl === 'eraser';
    const rounded = st.points.map(([x, y]) => [Math.round(x * 10000) / 10000, Math.round(y * 10000) / 10000]);
    const opObj = {
      type: shape ? tl : 'brush',
      color: col,
      size: sz,
      opacity: op,
      erase: isEraser,
      points: shape ? [rounded[0], rounded[rounded.length - 1]] : rounded,
    };

    if (pic?.active) {
      // Pictionary: само рисуващият стига дотук (drawMode=false за останалите).
      // emitStroke (без запис в общата история) → сървърът препраща на всички.
      stateRef.current.pictionaryOps.push(opObj);
      socket.emitStroke(opObj);
      if (shape) drawOp(mainCtx(), opObj, canvasRef.current.width, canvasRef.current.height);
    } else if (phase === 'drawing') {
      stateRef.current.personalOps.push(opObj);
      if (shape && !propsRef.current.blind) drawOp(mainCtx(), opObj, canvasRef.current.width, canvasRef.current.height);
    } else if (!phase) {
      socket.sendStroke(opObj);
      if (shape) drawOp(mainCtx(), opObj, canvasRef.current.width, canvasRef.current.height);
    }

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
