import { useEffect, useRef } from 'react';

// Споделен слой за рисуване НАД p5 платното (независим от p5 — не пипа
// particle системата). Точките са нормализирани [0..1], дебелината е в
// "референтни px" (1920 ширина) → изглежда еднакво при всякакви екрани.
// По време на battle рисуваш на собствен слой (без broadcast).
const REF_W = 1920;

export function SharedCanvas({
  socket,
  drawMode,
  erase,
  brushSize,
  colorCss,
  battlePhase, // null | 'drawing' | 'collect' | … (battle ИЛИ arena фаза)
  blind = false, // blind рунд: щрихите не се виждат, но се събират
  onCanvasReady,
}) {
  const canvasRef = useRef(null);
  const hostRef = useRef(null);
  const stateRef = useRef({
    drawing: false,
    points: [],
    battleStrokes: [],
  });
  const propsRef = useRef({});
  propsRef.current = { drawMode, erase, brushSize, colorCss, battlePhase, blind };

  // ── Рендер помощници ──
  const drawStroke = (ctx, stroke, W, H) => {
    const pts = stroke.points;
    if (!pts || pts.length < 2) return;
    ctx.save();
    ctx.globalCompositeOperation = stroke.erase ? 'destination-out' : 'source-over';
    ctx.strokeStyle = stroke.color;
    ctx.lineWidth = Math.max(1, (stroke.size * W) / REF_W);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(pts[0][0] * W, pts[0][1] * H);
    for (const [nx, ny] of pts) ctx.lineTo(nx * W, ny * H);
    ctx.stroke();
    ctx.restore();
  };

  const redrawAll = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!ctx) return;
    const { width: W, height: H } = canvas;
    ctx.clearRect(0, 0, W, H);
    const inBattle = !!propsRef.current.battlePhase;
    if (inBattle && propsRef.current.blind) return; // blind рунд: нищо не се показва
    const strokes = inBattle ? stateRef.current.battleStrokes : socket.strokesRef.current;
    for (const s of strokes) drawStroke(ctx, s, W, H);
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    const host = hostRef.current;
    if (!canvas || !host) return undefined;
    onCanvasReady?.(canvas);

    const resize = () => {
      canvas.width = host.clientWidth;
      canvas.height = host.clientHeight;
      redrawAll();
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(host);

    // Входящи щрихи / replay / clear
    const offStroke = socket.onEvent('STROKE', (stroke) => {
      if (propsRef.current.battlePhase) return; // ще се нарисува при replay след battle
      const ctx = canvas.getContext('2d');
      drawStroke(ctx, stroke, canvas.width, canvas.height);
    });
    const offReplay = socket.onEvent('CANVAS_REPLAY', () => redrawAll());
    const offClear = socket.onEvent('CANVAS_CLEARED', () => redrawAll());

    // При COLLECT — прати snapshot на собствения личен слой
    const buildSnapshot = () => {
      const snap = document.createElement('canvas');
      const scale = 400 / canvas.width;
      snap.width = 400;
      snap.height = Math.round(canvas.height * scale);
      const sctx = snap.getContext('2d');
      sctx.fillStyle = '#0d0d12';
      sctx.fillRect(0, 0, snap.width, snap.height);
      for (const s of stateRef.current.battleStrokes) drawStroke(sctx, s, snap.width, snap.height);
      return snap.toDataURL('image/png');
    };
    const offCollect = socket.onEvent('BATTLE_COLLECT', () =>
      socket.sendBattleSnapshot(buildSnapshot())
    );
    const offArenaCollect = socket.onEvent('ARENA_COLLECT', () =>
      socket.sendArenaSnapshot(buildSnapshot())
    );

    return () => {
      ro.disconnect();
      offStroke();
      offReplay();
      offClear();
      offCollect();
      offArenaCollect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Смяна на battle фаза: влизане → чист личен слой; излизане → replay
  const prevPhase = useRef(null);
  useEffect(() => {
    if (battlePhase === 'drawing' && prevPhase.current !== 'drawing') {
      stateRef.current.battleStrokes = [];
      redrawAll();
    }
    if (!battlePhase && prevPhase.current) redrawAll();
    prevPhase.current = battlePhase;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [battlePhase]);

  // ── Рисуване с pointer ──
  const pointerPos = (e) => {
    const r = canvasRef.current.getBoundingClientRect();
    return [(e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height];
  };

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
    const last = st.points[st.points.length - 1];
    if (Math.hypot(p[0] - last[0], p[1] - last[1]) < 0.0025) return;
    st.points.push(p);
    if (propsRef.current.blind && propsRef.current.battlePhase) return; // blind: без живо рисуване
    // Живо рисуване на последния сегмент
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const { erase: er, brushSize: size, colorCss: color } = propsRef.current;
    drawStroke(
      ctx,
      { points: [last, p], color, size, erase: er },
      canvas.width,
      canvas.height
    );
  };

  const onUp = () => {
    const st = stateRef.current;
    if (!st.drawing) return;
    st.drawing = false;
    if (st.points.length < 2) return;
    const { erase: er, brushSize: size, colorCss: color, battlePhase: phase } = propsRef.current;
    const stroke = {
      color,
      size,
      erase: er,
      points: st.points.map(([x, y]) => [Math.round(x * 10000) / 10000, Math.round(y * 10000) / 10000]),
    };
    if (phase === 'drawing') {
      stateRef.current.battleStrokes.push(stroke);
    } else if (!phase) {
      socket.sendStroke(stroke); // добавя и в strokesRef
    }
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
      <canvas ref={canvasRef} className="w-full h-full" />
    </div>
  );
}
