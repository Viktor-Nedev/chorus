import { useRef, useEffect, forwardRef, useImperativeHandle } from 'react';

// Лек particle "аватар" за другите модове — рисува живите face landmarks като
// цветни точки върху тъмен фон (без Three.js). Заменя реалната камера: другите
// виждат partikel лицето ти, не уебкам снимката. exposeCanvas → CamStrip може
// да снема кадри от него.
export const ParticleCam = forwardRef(function ParticleCam(
  { landmarksBufRef, landmarkStampRef, color = '#8B7BFA', className = '', width = 160, height = 120 },
  ref
) {
  const canvasRef = useRef(null);
  useImperativeHandle(ref, () => ({ getCanvas: () => canvasRef.current }), []);

  useEffect(() => {
    let raf;
    const draw = () => {
      raf = requestAnimationFrame(draw);
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext('2d');
      if (!ctx) return;
      ctx.fillStyle = '#0a0a10';
      ctx.fillRect(0, 0, width, height);
      const stamp = landmarkStampRef?.current ?? 0;
      const fresh = stamp > 0 && performance.now() - stamp < 500;
      const lm = landmarksBufRef?.current;
      if (!fresh || !lm) {
        ctx.fillStyle = 'rgba(150,150,170,0.4)';
        ctx.font = '10px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('no face', width / 2, height / 2);
        return;
      }
      // Центрирай/мащабирай по bounding box на лицето
      let minX = 1, maxX = 0, minY = 1, maxY = 0;
      for (let i = 0; i < 478; i++) {
        const x = lm[i * 3], y = lm[i * 3 + 1];
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
      }
      const bw = Math.max(1e-3, maxX - minX), bh = Math.max(1e-3, maxY - minY);
      const scale = Math.min((width * 0.8) / bw, (height * 0.85) / bh);
      const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
      const mcx = 1 - cx; // център в огледалното x
      ctx.fillStyle = color;
      for (let i = 0; i < 478; i += 2) {
        const nx = 1 - lm[i * 3]; // mirror
        const ny = lm[i * 3 + 1];
        const sx = width / 2 + (nx - mcx) * scale;
        const sy = height / 2 + (ny - cy) * scale;
        ctx.globalAlpha = 0.35 + (i % 3) * 0.2;
        ctx.fillRect(sx, sy, 1.6, 1.6);
      }
      ctx.globalAlpha = 1;
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [landmarksBufRef, landmarkStampRef, color, width, height]);

  return <canvas ref={canvasRef} width={width} height={height} className={className} />;
});
