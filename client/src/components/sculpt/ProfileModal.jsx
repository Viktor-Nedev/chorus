import { useRef, useState, useEffect, useCallback } from 'react';

// 2D рисувателен модал за Lathe (полу-профил, върти се около оста) и
// Extrude (затворена форма, изтегля се в дълбочина). Връща нормализирани
// точки в световни единици (~2.4 max размер).
export function ProfileModal({ mode, onConfirm, onCancel }) {
  const canvasRef = useRef(null);
  const [points, setPoints] = useState([]);
  const [drawing, setDrawing] = useState(false);
  const [depth, setDepth] = useState(0.8);
  const [bevel, setBevel] = useState(0.06);

  const W = 320, H = 340;
  const isLathe = mode === 'lathe';

  const redraw = useCallback(() => {
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#101016';
    ctx.fillRect(0, 0, W, H);
    // Ос за lathe (лява граница = ос на въртене)
    if (isLathe) {
      ctx.strokeStyle = '#8B7BFA';
      ctx.setLineDash([6, 5]);
      ctx.beginPath();
      ctx.moveTo(40, 10);
      ctx.lineTo(40, H - 10);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = '#8B7BFA';
      ctx.font = '9px sans-serif';
      ctx.fillText('axis', 26, 20);
    }
    if (points.length > 1) {
      ctx.strokeStyle = '#67E8F9';
      ctx.lineWidth = 2.5;
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(points[0][0], points[0][1]);
      for (const [x, y] of points) ctx.lineTo(x, y);
      if (!isLathe) ctx.closePath();
      ctx.stroke();
      if (!isLathe) {
        ctx.fillStyle = 'rgba(103,232,249,0.12)';
        ctx.fill();
      }
    }
  }, [points, isLathe]);

  useEffect(redraw, [redraw]);

  const pos = (e) => {
    const r = canvasRef.current.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  };

  const start = (e) => {
    setDrawing(true);
    setPoints([pos(e)]);
  };
  const move = (e) => {
    if (!drawing) return;
    const p = pos(e);
    setPoints((pts) => {
      const last = pts[pts.length - 1];
      if (last && Math.hypot(p[0] - last[0], p[1] - last[1]) < 4) return pts;
      return [...pts, p];
    });
  };
  const end = () => setDrawing(false);

  const confirm = () => {
    if (points.length < 3) return;
    // Прореди и нормализирай до световни единици
    const step = Math.max(1, Math.floor(points.length / 60));
    const pts = points.filter((_, i) => i % step === 0 || i === points.length - 1);
    if (isLathe) {
      // x спрямо оста (40px), y обърнато; мащаб: H → ~3 свят
      const s = 3 / H;
      const profile = pts.map(([x, y]) => [Math.max(0, (x - 40) * s), (H - y) * s]);
      onConfirm({ points: profile });
    } else {
      // Центрирай около (0,0); мащаб до ~2.6 свят
      const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
      const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
      const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
      const size = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys), 1);
      const s = 2.6 / size;
      const outline = pts.map(([x, y]) => [(x - cx) * s, (cy - y) * s]);
      onConfirm({ points: outline, opts: { depth, bevel } });
    }
  };

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/70 backdrop-blur-sm animate-fade-in">
      <div className="rounded-2xl bg-ink-soft border border-ink-line p-5 animate-slide-up">
        <h2 className="font-display font-bold text-white mb-1">
          {isLathe ? '🏺 Lathe — draw a half profile' : '⬒ Extrude — draw a closed shape'}
        </h2>
        <p className="text-[11px] text-gray-500 mb-3">
          {isLathe
            ? 'Draw the right half silhouette (like a vase). It revolves around the dashed axis.'
            : 'Draw an outline — it becomes a 3D solid with depth and bevel.'}
        </p>

        <canvas
          ref={canvasRef}
          width={W}
          height={H}
          onPointerDown={start}
          onPointerMove={move}
          onPointerUp={end}
          onPointerLeave={end}
          className="rounded-lg border border-ink-line cursor-crosshair touch-none"
        />

        {!isLathe && (
          <div className="mt-3 space-y-2">
            <label className="block text-[10px] uppercase tracking-[0.15em] text-gray-500">
              Depth: {depth.toFixed(2)}
              <input
                type="range" min={0.1} max={3} step={0.05} value={depth}
                onChange={(e) => setDepth(Number(e.target.value))}
                className="w-full accent-accent-violet"
              />
            </label>
            <label className="block text-[10px] uppercase tracking-[0.15em] text-gray-500">
              Bevel: {bevel.toFixed(2)}
              <input
                type="range" min={0} max={0.3} step={0.01} value={bevel}
                onChange={(e) => setBevel(Number(e.target.value))}
                className="w-full accent-accent-violet"
              />
            </label>
          </div>
        )}

        <div className="flex gap-2 mt-4">
          <button
            onClick={() => setPoints([])}
            className="rounded-lg border border-ink-line px-3 py-2 text-xs text-gray-400 hover:text-white transition"
          >
            Clear
          </button>
          <button
            onClick={onCancel}
            className="flex-1 rounded-lg border border-ink-line py-2 text-sm text-gray-300 hover:bg-ink-line/50 transition"
          >
            Cancel
          </button>
          <button
            onClick={confirm}
            disabled={points.length < 3}
            className="flex-1 rounded-lg bg-accent-violet/80 py-2 text-sm text-ink hover:bg-accent-violet transition disabled:opacity-40"
          >
            Create
          </button>
        </div>
      </div>
    </div>
  );
}
