import { useEffect, useRef } from 'react';

// Атмосферни ефекти в празните странични полета на Landing: фойерверки +
// издигащи се искри. Само ефекти (без фигури). Fixed canvas, pointer-events-none,
// зад съдържанието. Уважава prefers-reduced-motion и капва броя частици.
const HUES = [265, 190, 330, 150, 205, 45];
const rand = (a, b) => a + Math.random() * (b - a);

export function SideFireworks() {
  const canvasRef = useRef(null);

  useEffect(() => {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return undefined;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    let W = 0, H = 0, dpr = Math.min(window.devicePixelRatio || 1, 2);
    const resize = () => {
      W = canvas.clientWidth; H = canvas.clientHeight;
      canvas.width = W * dpr; canvas.height = H * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener('resize', resize);

    // Странични зони (лявo/дясно поле). Ако екранът е тесен → без ефекти.
    const sideFrac = 0.18;
    const particles = [];   // искри от експлозии
    const embers = [];      // бавно издигащи се точки
    const MAX = 260;

    const launchX = () => {
      const gutter = W * sideFrac;
      if (W < 900) return null; // на тесни екрани няма достатъчно празно място
      return Math.random() < 0.5 ? rand(gutter * 0.15, gutter * 0.85) : rand(W - gutter * 0.85, W - gutter * 0.15);
    };

    const burst = () => {
      const x = launchX();
      if (x == null) return;
      const y = rand(H * 0.18, H * 0.7);
      const hue = HUES[(Math.random() * HUES.length) | 0];
      const n = 26 + (Math.random() * 22 | 0);
      for (let i = 0; i < n && particles.length < MAX; i++) {
        const a = (Math.PI * 2 * i) / n + rand(-0.1, 0.1);
        const sp = rand(0.6, 2.8);
        particles.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 1, hue, size: rand(1.2, 2.6) });
      }
    };

    const addEmber = () => {
      const x = launchX();
      if (x == null) return;
      embers.push({ x, y: H + 8, vy: rand(-0.25, -0.6), drift: rand(-0.2, 0.2), life: 1, hue: HUES[(Math.random() * HUES.length) | 0], size: rand(0.8, 1.8) });
    };

    let raf, last = performance.now(), sinceBurst = 0, sinceEmber = 0;
    const tick = (now) => {
      const dt = Math.min(50, now - last); last = now;
      sinceBurst += dt; sinceEmber += dt;
      if (sinceBurst > rand(900, 1600)) { burst(); sinceBurst = 0; }
      if (sinceEmber > 220) { addEmber(); sinceEmber = 0; }

      ctx.clearRect(0, 0, W, H);
      ctx.globalCompositeOperation = 'lighter';

      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.vy += 0.012;           // лека гравитация
        p.vx *= 0.985; p.vy *= 0.985;
        p.x += p.vx; p.y += p.vy;
        p.life -= 0.012;
        if (p.life <= 0) { particles.splice(i, 1); continue; }
        ctx.globalAlpha = Math.max(0, p.life) * 0.9;
        ctx.fillStyle = `hsl(${p.hue} 90% 65%)`;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.fill();
      }
      for (let i = embers.length - 1; i >= 0; i--) {
        const e = embers[i];
        e.y += e.vy; e.x += e.drift; e.life -= 0.004;
        if (e.life <= 0 || e.y < -10) { embers.splice(i, 1); continue; }
        ctx.globalAlpha = Math.max(0, e.life) * 0.5;
        ctx.fillStyle = `hsl(${e.hue} 85% 70%)`;
        ctx.beginPath(); ctx.arc(e.x, e.y, e.size, 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', resize); };
  }, []);

  return <canvas ref={canvasRef} className="pointer-events-none fixed inset-0 z-[8] h-full w-full" aria-hidden="true" />;
}
