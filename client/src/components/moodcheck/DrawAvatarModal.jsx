import { useRef, useState, useEffect } from 'react';

// Нарисувай си аватар: 2D платно с четка/цветове. Щрихите се семплират до
// ≤5000 нормализирани точки [-1..1] → type:'drawn' аватар, който се закача за
// главата ти и „диша" при говорене. Ръководни линии за очи/уста.
const W = 300, H = 300;
const COLORS = ['#F5F5F5', '#8B7BFA', '#67E8F9', '#3DDC97', '#FFD27F', '#FF8FC7', '#FF5555', '#FFB020'];

export function DrawAvatarModal({ onConfirm, onCancel }) {
  const canvasRef = useRef(null);
  const [color, setColor] = useState('#67E8F9');
  const [size, setSize] = useState(6);
  const [drawing, setDrawing] = useState(false);
  const strokesRef = useRef([]); // [{x,y}] в canvas координати
  const [hasDrawing, setHasDrawing] = useState(false);

  const redraw = () => {
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = '#0d0d12';
    ctx.fillRect(0, 0, W, H);
    // Ръководни линии (очи/уста)
    ctx.strokeStyle = 'rgba(139,123,250,0.25)';
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.arc(W * 0.36, H * 0.42, 22, 0, Math.PI * 2);
    ctx.arc(W * 0.64, H * 0.42, 22, 0, Math.PI * 2);
    ctx.moveTo(W * 0.35, H * 0.66);
    ctx.quadraticCurveTo(W * 0.5, H * 0.72, W * 0.65, H * 0.66);
    ctx.stroke();
    ctx.setLineDash([]);
    // Щрихи
    for (const s of strokesRef.current) {
      ctx.fillStyle = s.color;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.size / 2, 0, Math.PI * 2);
      ctx.fill();
    }
  };
  useEffect(redraw, []);

  const pos = (e) => {
    const r = canvasRef.current.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * H };
  };
  const add = (e) => {
    const { x, y } = pos(e);
    strokesRef.current.push({ x, y, color, size });
    setHasDrawing(true);
    redraw();
  };
  const down = (e) => { setDrawing(true); add(e); };
  const move = (e) => { if (drawing) add(e); };
  const up = () => setDrawing(false);

  const confirm = () => {
    // Семплирай ≤5000 точки, нормализирани [-1..1] (y нагоре)
    const raw = strokesRef.current;
    const step = Math.max(1, Math.ceil(raw.length / 5000));
    const points = [];
    for (let i = 0; i < raw.length; i += step) {
      const s = raw[i];
      points.push([(s.x / W) * 2 - 1, -((s.y / H) * 2 - 1)]);
    }
    onConfirm({ type: 'drawn', label: 'My Drawing', emoji: '🎨', points, fixedColor: color, glow: 0.5, particleSize: 1 });
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/75 backdrop-blur-sm animate-fade-in">
      <div className="rounded-2xl bg-ink-soft border border-ink-line p-5 animate-slide-up">
        <h2 className="font-display font-bold text-white mb-1">Draw your avatar</h2>
        <p className="text-[11px] text-gray-500 mb-3">Draw a face — it'll track your head and mouth.</p>
        <canvas
          ref={canvasRef}
          width={W}
          height={H}
          onPointerDown={down}
          onPointerMove={move}
          onPointerUp={up}
          onPointerLeave={up}
          className="rounded-lg border border-ink-line cursor-crosshair touch-none"
        />
        <div className="flex items-center gap-1.5 mt-3">
          {COLORS.map((c) => (
            <button key={c} onClick={() => setColor(c)} className={`w-6 h-6 rounded-full border-2 transition ${color === c ? 'border-white scale-110' : 'border-white/10'}`} style={{ background: c }} />
          ))}
          <input type="range" min={2} max={16} value={size} onChange={(e) => setSize(Number(e.target.value))} className="flex-1 ml-2 accent-accent-violet" />
        </div>
        <div className="flex gap-2 mt-4">
          <button onClick={() => { strokesRef.current = []; setHasDrawing(false); redraw(); }} className="rounded-lg border border-ink-line px-3 py-2 text-xs text-gray-400 hover:text-white transition">Clear</button>
          <button onClick={onCancel} className="flex-1 rounded-lg border border-ink-line py-2 text-sm text-gray-300 hover:bg-ink-line/50 transition">Cancel</button>
          <button onClick={confirm} disabled={!hasDrawing} className="flex-1 rounded-lg bg-accent-violet/85 py-2 text-sm font-bold text-ink hover:bg-accent-violet transition disabled:opacity-40">Use this</button>
        </div>
      </div>
    </div>
  );
}
