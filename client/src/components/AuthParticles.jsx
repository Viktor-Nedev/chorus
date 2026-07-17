import { useEffect, useRef } from 'react';

// Лява половина на Auth екрана: ~240 частици, преливащи между пръстен,
// вълна и спирала. Чист canvas 2D rAF (без R3F) — лек и независим.
const N = 240;

export function AuthParticles() {
  const canvasRef = useRef(null);
  const hostRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const host = hostRef.current;
    const ctx = canvas?.getContext('2d');
    if (!ctx) return undefined;

    let W = 0, H = 0;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const resize = () => {
      W = host.clientWidth;
      H = host.clientHeight;
      canvas.width = W * dpr;
      canvas.height = H * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(host);

    const targets = {
      ring: (i, t) => {
        const a = (i / N) * Math.PI * 2 + t * 0.15;
        const r = Math.min(W, H) * (0.26 + 0.05 * Math.sin(i * 3 + t));
        return [W / 2 + Math.cos(a) * r, H / 2 + Math.sin(a) * r];
      },
      wave: (i, t) => {
        const x = (i / N) * W * 0.8 + W * 0.1;
        return [x, H / 2 + Math.sin(x * 0.02 + t * 1.4 + (i % 5)) * H * 0.14];
      },
      spiral: (i, t) => {
        const p = i / N;
        const a = p * Math.PI * 7 + t * 0.3;
        const r = p * Math.min(W, H) * 0.34;
        return [W / 2 + Math.cos(a) * r, H / 2 + Math.sin(a) * r];
      },
    };
    const NAMES = ['ring', 'wave', 'spiral'];

    const parts = Array.from({ length: N }, (_, i) => ({
      x: Math.random() * 800,
      y: Math.random() * 800,
      vx: 0,
      vy: 0,
      hue: 255 + Math.random() * 60,
      i,
    }));

    let raf;
    const start = performance.now();
    const tick = (now) => {
      raf = requestAnimationFrame(tick);
      // rAF timestamp може да предхожда performance.now() от init-а —
      // отрицателно t би дало NAMES[-1] → clamp
      const t = Math.max(0, (now - start) / 1000);
      const form = NAMES[Math.floor(t / 5) % NAMES.length];
      ctx.clearRect(0, 0, W, H);
      for (const p of parts) {
        const [tx, ty] = targets[form](p.i, t);
        p.vx = (p.vx + (tx - p.x) * 0.02) * 0.9;
        p.vy = (p.vy + (ty - p.y) * 0.02) * 0.9;
        p.x += p.vx;
        p.y += p.vy;
        const speed = Math.min(1, Math.hypot(p.vx, p.vy) / 5);
        ctx.beginPath();
        ctx.arc(p.x, p.y, 1.4 + speed, 0, Math.PI * 2);
        ctx.fillStyle = `hsla(${p.hue - speed * 60}, 85%, ${60 + speed * 22}%, ${0.6 + speed * 0.4})`;
        ctx.fill();
      }
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, []);

  return (
    <div ref={hostRef} className="absolute inset-0">
      <canvas ref={canvasRef} className="absolute inset-0" />
    </div>
  );
}
