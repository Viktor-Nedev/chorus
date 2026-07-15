import { useEffect, useRef, useState } from 'react';

// Particle loading overlay при генерация: ~160 частици се преливат между
// пръстен и "уебстраница" формация (navbar/hero/колони), докато статусите
// се сменят. Чист canvas 2D + rAF — без p5.
const PHASES = [
  'Reading your sketch…',
  'Recognizing components…',
  'Writing the HTML structure…',
  'Styling with CSS…',
  'Adding interactions…',
  'Assembling the React version…',
  'Wiring up the backend…',
  'Final touches…',
];

const SIZE = 340;
const N = 160;

// Точки по контура на правоъгълник
function rectOutline(x, y, w, h, count) {
  const pts = [];
  const perim = 2 * (w + h);
  for (let i = 0; i < count; i++) {
    let d = (i / count) * perim;
    if (d < w) pts.push([x + d, y]);
    else if ((d -= w) < h) pts.push([x + w, y + d]);
    else if ((d -= h) < w) pts.push([x + w - d, y + h]);
    else pts.push([x, y + h - (d - w)]);
  }
  return pts;
}

// Формация "уебстраница": navbar + hero + две колони + footer (в 340x340)
function pageFormation() {
  const pts = [
    ...rectOutline(70, 60, 200, 24, 40),   // navbar
    ...rectOutline(70, 96, 200, 90, 52),   // hero
    ...rectOutline(70, 198, 92, 62, 32),   // col 1
    ...rectOutline(178, 198, 92, 62, 32),  // col 2
    ...rectOutline(70, 272, 200, 14, 4),   // footer
  ];
  while (pts.length < N) pts.push(pts[pts.length % 4]);
  return pts.slice(0, N);
}

function ringFormation() {
  const pts = [];
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2;
    const r = 105 + (i % 3) * 9;
    pts.push([SIZE / 2 + Math.cos(a) * r, SIZE / 2 + Math.sin(a) * r]);
  }
  return pts;
}

export function ForgeLoader({ projectName }) {
  const canvasRef = useRef(null);
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setPhase((p) => Math.min(p + 1, PHASES.length - 1)), 2400);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!ctx) return undefined;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = SIZE * dpr;
    canvas.height = SIZE * dpr;
    ctx.scale(dpr, dpr);

    const ring = ringFormation();
    const page = pageFormation();
    const particles = ring.map(([x, y], i) => ({
      x: SIZE / 2 + (Math.random() - 0.5) * SIZE,
      y: SIZE / 2 + (Math.random() - 0.5) * SIZE,
      vx: 0,
      vy: 0,
      hue: 255 + Math.random() * 60, // виолетово → циан
      seed: Math.random() * Math.PI * 2,
      i,
    }));

    let raf;
    const start = performance.now();

    const tick = (now) => {
      const t = (now - start) / 1000;
      // На всеки 3.2s се сменя формацията: ring → page → ring …
      const usePage = Math.floor(t / 3.2) % 2 === 1;
      const targets = usePage ? page : ring;

      ctx.clearRect(0, 0, SIZE, SIZE);

      for (const p of particles) {
        const [tx, ty] = targets[p.i];
        // Пружина към целта + лек шум за "живост"
        const wob = usePage ? 1.2 : 4;
        const gx = tx + Math.cos(t * 1.7 + p.seed) * wob;
        const gy = ty + Math.sin(t * 1.3 + p.seed) * wob;
        p.vx = (p.vx + (gx - p.x) * 0.045) * 0.86;
        p.vy = (p.vy + (gy - p.y) * 0.045) * 0.86;
        p.x += p.vx;
        p.y += p.vy;

        const speed = Math.min(1, Math.hypot(p.vx, p.vy) / 6);
        const hue = p.hue - speed * 60;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 1.6 + speed * 1.2, 0, Math.PI * 2);
        ctx.fillStyle = `hsla(${hue}, 85%, ${62 + speed * 20}%, ${0.75 + speed * 0.25})`;
        ctx.fill();
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-ink/85 backdrop-blur-sm animate-fade-in">
      <canvas ref={canvasRef} style={{ width: SIZE, height: SIZE }} />
      <div className="font-display font-bold text-white text-lg mt-2 tracking-wide">
        Forging “{projectName}”
      </div>
      <div className="text-sm text-accent-cyan mt-2 glow-pulse">{PHASES[phase]}</div>
      <div className="text-[11px] text-gray-500 mt-4">Gemini is writing your website code — usually 20–60 seconds</div>
    </div>
  );
}
