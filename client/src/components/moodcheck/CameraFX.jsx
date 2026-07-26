import { useEffect, useRef } from 'react';
import {
  luminance, thermalLUT, rainbowLUT, pointCloudColor, lensRectFromHands, EFFECTS, SPECIAL_EFFECTS,
  nightvisionColor, sepiaColor, invertColor, posterizeColor, duotoneColor,
} from './cameraFxUtils';

// Camera FX overlay: рисува огледаната камера и прилага ефект — или само в
// правоъгълник, образуван от пръстите (lens), или на целия екран (fullscreen).
const PW = 256; // обработваща резолюция (downscaled за скорост)
const PH = 192;

const HAND_CONNECTIONS = [
  [0, 1], [1, 2], [2, 3], [3, 4], [0, 5], [5, 6], [6, 7], [7, 8], [5, 9],
  [9, 10], [10, 11], [11, 12], [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [17, 18], [18, 19], [19, 20], [0, 17],
];

// Пикселна обработка (proc-size) → нов ImageData
function processPixels(effect, img) {
  const { data: src, width: W } = img;
  const out = new ImageData(W, img.height);
  const o = out.data;
  if (effect === 'edge') return sobel(img, out);
  if (effect === 'neon') return sobel(img, out, true);
  if (effect === 'contour') return contour(img, out);
  for (let i = 0; i < src.length; i += 4) {
    const r = src[i]; const g = src[i + 1]; const b = src[i + 2];
    const l = luminance(r, g, b);
    let c;
    if (effect === 'thermal') c = thermalLUT(l);
    else if (effect === 'rainbow') c = rainbowLUT(l);
    else if (effect === 'nightvision') c = nightvisionColor(l);
    else if (effect === 'sepia') c = sepiaColor(r, g, b);
    else if (effect === 'invert') c = invertColor(r, g, b);
    else if (effect === 'posterize') c = posterizeColor(r, g, b, 5);
    else if (effect === 'duotone') c = duotoneColor(l);
    else if (effect === 'xray') { const v = 1 - l; c = [Math.round(v * 120), Math.round(v * 220), Math.round(v * 255)]; }
    else if (effect === 'hologram') { const y = (i / 4 / W) | 0; const dim = y % 2 ? 0.55 : 1; c = [Math.round(l * 40 * dim), Math.round(l * 235 * dim), Math.round(l * 255 * dim)]; }
    else c = [r, g, b];
    o[i] = c[0]; o[i + 1] = c[1]; o[i + 2] = c[2]; o[i + 3] = 255;
  }
  return out;
}

// Контурна карта: квантувани цветни ленти + тъмни граници между тях
function contour(img, out) {
  const { data: s, width: W, height: H } = img;
  const o = out.data;
  const BANDS = 8;
  const band = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) band[i] = Math.round(luminance(s[i * 4], s[i * 4 + 1], s[i * 4 + 2]) * BANDS);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const idx = y * W + x;
      const j = idx * 4;
      const edge = (x < W - 1 && band[idx] !== band[idx + 1]) || (y < H - 1 && band[idx] !== band[idx + W]);
      const c = rainbowLUT(band[idx] / BANDS);
      const k = edge ? 0.2 : 1;
      o[j] = Math.round(c[0] * k); o[j + 1] = Math.round(c[1] * k); o[j + 2] = Math.round(c[2] * k); o[j + 3] = 255;
    }
  }
  return out;
}

// Sobel ръбове → светещи линии на тъмно (neon = по-ярко, cyan→magenta)
function sobel(img, out, neon = false) {
  const { data: s, width: W, height: H } = img;
  const o = out.data;
  const lum = new Float32Array(W * H);
  for (let i = 0; i < W * H; i++) lum[i] = luminance(s[i * 4], s[i * 4 + 1], s[i * 4 + 2]);
  for (let y = 1; y < H - 1; y++) {
    for (let x = 1; x < W - 1; x++) {
      const idx = y * W + x;
      const gx = -lum[idx - W - 1] - 2 * lum[idx - 1] - lum[idx + W - 1] + lum[idx - W + 1] + 2 * lum[idx + 1] + lum[idx + W + 1];
      const gy = -lum[idx - W - 1] - 2 * lum[idx - W] - lum[idx - W + 1] + lum[idx + W - 1] + 2 * lum[idx + W] + lum[idx + W + 1];
      const e = Math.min(1, Math.hypot(gx, gy) * (neon ? 1.8 : 1.4));
      const j = idx * 4;
      if (neon) { o[j] = Math.round(e * 200 * (x / W)); o[j + 1] = Math.round(e * 120); o[j + 2] = Math.round(e * 255); }
      else { o[j] = Math.round(e * 40); o[j + 1] = Math.round(e * 255); o[j + 2] = Math.round(e * 180); }
      o[j + 3] = 255;
    }
  }
  return out;
}

let TMP = null; // временен canvas за glitch

// Специални ефекти (не per-pixel LUT) — рисуват директно в display ctx върху
// правоъгълника `rect` (display px), четейки proc буфера.
function renderSpecial(ctx, pctx, fx, rect, W, H) {
  const img = pctx.getImageData(0, 0, PW, PH);
  const d = img.data;
  const sx = (x) => rect.x + (x / PW) * rect.w;
  const sy = (y) => rect.y + (y / PH) * rect.h;

  if (fx === 'pointcloud' || fx === 'voxel') {
    ctx.fillStyle = '#05060a'; ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
    const step = fx === 'voxel' ? 6 : 3;
    const cw = (step / PW) * rect.w;
    for (let y = 0; y < PH; y += step) {
      for (let x = 0; x < PW; x += step) {
        const i = (y * PW + x) * 4;
        const l = luminance(d[i], d[i + 1], d[i + 2]);
        if (l < 0.14) continue;
        const [r, g, b] = pointCloudColor(l);
        ctx.fillStyle = `rgb(${r},${g},${b})`;
        ctx.globalAlpha = 0.4 + l * 0.6;
        if (fx === 'voxel') { const s = cw * (0.5 + l * 0.7); ctx.fillRect(sx(x), sy(y), s, s); }
        else { ctx.beginPath(); ctx.arc(sx(x), sy(y), 0.6 + l * 2.2, 0, Math.PI * 2); ctx.fill(); }
      }
    }
    ctx.globalAlpha = 1;
    return;
  }

  if (fx === 'mosaic') {
    const step = 8;
    const bw = (step / PW) * rect.w + 1;
    const bh = (step / PH) * rect.h + 1;
    for (let y = 0; y < PH; y += step) {
      for (let x = 0; x < PW; x += step) {
        const i = (y * PW + x) * 4;
        ctx.fillStyle = `rgb(${d[i]},${d[i + 1]},${d[i + 2]})`;
        ctx.fillRect(sx(x), sy(y), bw, bh);
      }
    }
    return;
  }

  if (fx === 'halftone') {
    ctx.fillStyle = '#0a0d12'; ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
    const step = 6;
    const cell = (step / PW) * rect.w;
    for (let y = 0; y < PH; y += step) {
      for (let x = 0; x < PW; x += step) {
        const i = (y * PW + x) * 4;
        const l = luminance(d[i], d[i + 1], d[i + 2]);
        const rad = cell * 0.62 * l;
        if (rad < 0.4) continue;
        ctx.fillStyle = 'rgba(150,240,220,0.95)';
        ctx.beginPath(); ctx.arc(sx(x) + cell / 2, sy(y) + cell / 2, rad, 0, Math.PI * 2); ctx.fill();
      }
    }
    return;
  }

  if (fx === 'glitch') {
    if (!TMP) { TMP = document.createElement('canvas'); TMP.width = PW; TMP.height = PH; }
    TMP.getContext('2d').putImageData(img, 0, 0);
    ctx.drawImage(TMP, rect.x, rect.y, rect.w, rect.h);
    const off = Math.max(2, rect.w * 0.012);
    ctx.globalCompositeOperation = 'screen';
    ctx.globalAlpha = 0.5;
    ctx.drawImage(TMP, rect.x + off, rect.y, rect.w, rect.h);
    ctx.drawImage(TMP, rect.x - off, rect.y, rect.w, rect.h);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    for (let k = 0; k < 6; k++) {
      const sh = rect.y + Math.random() * rect.h;
      const hh = 4 + Math.random() * (rect.h * 0.06);
      const dxo = (Math.random() - 0.5) * rect.w * 0.08;
      const srcY = ((sh - rect.y) / rect.h) * PH;
      const srcH = (hh / rect.h) * PH;
      ctx.drawImage(TMP, 0, srcY, PW, srcH, rect.x + dxo, sh, rect.w, hh);
    }
  }
}

export function CameraFX({ videoRef, handsBufRef, handCountRef, effect, mode, onCanvasReady }) {
  const canvasRef = useRef(null);
  const hostRef = useRef(null);
  const procRef = useRef(null);
  const fxRef = useRef(null);
  const rectRef = useRef(null); // EMA-изгладен lens правоъгълник (нормализиран)
  const cfg = useRef({ effect, mode });
  cfg.current = { effect, mode };

  useEffect(() => {
    const host = hostRef.current;
    const canvas = canvasRef.current;
    if (!host || !canvas) return undefined;
    onCanvasReady?.(canvas);
    procRef.current = document.createElement('canvas');
    procRef.current.width = PW;
    procRef.current.height = PH;
    fxRef.current = document.createElement('canvas');
    fxRef.current.width = PW;
    fxRef.current.height = PH;

    let raf = 0;
    const draw = () => {
      raf = requestAnimationFrame(draw);
      const video = videoRef.current;
      const { effect: fx, mode: md } = cfg.current;
      const W = host.clientWidth || 1;
      const H = host.clientHeight || 1;
      if (canvas.width !== W || canvas.height !== H) { canvas.width = W; canvas.height = H; }
      const ctx = canvas.getContext('2d');
      if (!video || video.readyState < 2) { ctx.clearRect(0, 0, W, H); return; }

      // proc: огледана камера (downscaled)
      const pctx = procRef.current.getContext('2d', { willReadFrequently: true });
      pctx.save(); pctx.scale(-1, 1); pctx.drawImage(video, -PW, 0, PW, PH); pctx.restore();

      const lensMode = md === 'lens';
      // База: огледаната камера на цял екран (за lens) или черно (fullscreen point cloud)
      if (lensMode) {
        ctx.save(); ctx.scale(-1, 1); ctx.drawImage(video, -W, 0, W, H); ctx.restore();
      } else {
        ctx.fillStyle = '#05060a'; ctx.fillRect(0, 0, W, H);
      }

      // Определи lens правоъгълника (в display px) — EMA изглаждане
      let rectPx = null;
      if (lensMode) {
        const r = lensRectFromHands(handsBufRef.current, handCountRef.current);
        if (r) {
          const prev = rectRef.current;
          rectRef.current = prev
            ? { x: prev.x + (r.x - prev.x) * 0.35, y: prev.y + (r.y - prev.y) * 0.35, w: prev.w + (r.w - prev.w) * 0.35, h: prev.h + (r.h - prev.h) * 0.35 }
            : r;
        }
        const sr = rectRef.current;
        if (sr && sr.w > 0.02 && sr.h > 0.02) rectPx = { x: sr.x * W, y: sr.y * H, w: sr.w * W, h: sr.h * H };
      }

      const special = SPECIAL_EFFECTS.has(fx);

      const renderEffectInto = (clip) => {
        ctx.save();
        const cl = clip || { x: 0, y: 0, w: W, h: H };
        if (clip) { ctx.beginPath(); ctx.rect(clip.x, clip.y, clip.w, clip.h); ctx.clip(); }
        if (special) {
          renderSpecial(ctx, pctx, fx, cl, W, H);
        } else {
          const img = pctx.getImageData(0, 0, PW, PH);
          const processed = processPixels(fx, img);
          const fctx = fxRef.current.getContext('2d');
          fctx.putImageData(processed, 0, 0);
          ctx.imageSmoothingEnabled = fx !== 'edge' && fx !== 'neon' && fx !== 'contour';
          ctx.drawImage(fxRef.current, 0, 0, W, H);
        }
        ctx.restore();
      };

      if (!lensMode) {
        renderEffectInto(null);
      } else if (rectPx) {
        renderEffectInto(rectPx);
        drawHands(ctx, handsBufRef.current, handCountRef.current, W, H);
        drawBrackets(ctx, rectPx);
        drawScanline(ctx, rectPx);
        drawLabel(ctx, fx, rectPx.x, rectPx.y);
      } else {
        // няма ръце → подсказка
        ctx.save();
        ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(0, H - 44, W, 44);
        ctx.fillStyle = 'rgba(180,255,200,0.9)'; ctx.font = '14px monospace'; ctx.textAlign = 'center';
        ctx.fillText('✋ Frame the effect with your hands', W / 2, H - 18);
        ctx.restore();
      }

      if (!lensMode) drawLabel(ctx, fx, 16, 16);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div ref={hostRef} className="absolute inset-0 z-[15]">
      <canvas ref={canvasRef} className="w-full h-full" />
    </div>
  );
}

function drawHands(ctx, buf, count, W, H) {
  ctx.save();
  ctx.lineWidth = 2;
  for (let h = 0; h < Math.min(2, count); h++) {
    const base = h * 21 * 3;
    const px = (i) => (1 - buf[base + i * 3]) * W;
    const py = (i) => buf[base + i * 3 + 1] * H;
    ctx.strokeStyle = 'rgba(60,240,90,0.9)';
    ctx.beginPath();
    for (const [a, b] of HAND_CONNECTIONS) { ctx.moveTo(px(a), py(a)); ctx.lineTo(px(b), py(b)); }
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,60,60,0.95)';
    for (let i = 0; i < 21; i++) { ctx.beginPath(); ctx.arc(px(i), py(i), 3, 0, Math.PI * 2); ctx.fill(); }
  }
  ctx.restore();
}

function drawBrackets(ctx, r) {
  const s = Math.min(28, r.w * 0.3, r.h * 0.3);
  ctx.save();
  ctx.strokeStyle = 'rgba(180,255,220,0.9)';
  ctx.lineWidth = 2.5;
  const corners = [
    [r.x, r.y, 1, 1], [r.x + r.w, r.y, -1, 1],
    [r.x, r.y + r.h, 1, -1], [r.x + r.w, r.y + r.h, -1, -1],
  ];
  for (const [cx, cy, sx, sy] of corners) {
    ctx.beginPath();
    ctx.moveTo(cx + sx * s, cy); ctx.lineTo(cx, cy); ctx.lineTo(cx, cy + sy * s);
    ctx.stroke();
  }
  ctx.restore();
}

let scanT = 0;
function drawScanline(ctx, r) {
  scanT = (scanT + 0.012) % 1;
  const y = r.y + scanT * r.h;
  ctx.save();
  ctx.beginPath(); ctx.rect(r.x, r.y, r.w, r.h); ctx.clip();
  const grad = ctx.createLinearGradient(0, y - 12, 0, y + 12);
  grad.addColorStop(0, 'rgba(140,255,220,0)');
  grad.addColorStop(0.5, 'rgba(140,255,220,0.35)');
  grad.addColorStop(1, 'rgba(140,255,220,0)');
  ctx.fillStyle = grad; ctx.fillRect(r.x, y - 12, r.w, 24);
  ctx.restore();
}

function drawLabel(ctx, effect, x, y) {
  const e = EFFECTS.find((k) => k.id === effect);
  const text = `${e?.icon || '◆'} ${(e?.label || effect).toUpperCase()}`;
  ctx.save();
  ctx.font = '12px monospace';
  const w = ctx.measureText(text).width + 16;
  ctx.fillStyle = 'rgba(6,10,16,0.7)';
  ctx.fillRect(x, y, w, 22);
  ctx.strokeStyle = 'rgba(140,255,220,0.5)'; ctx.lineWidth = 1; ctx.strokeRect(x, y, w, 22);
  ctx.fillStyle = 'rgba(180,255,220,0.95)'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  ctx.fillText(text, x + 8, y + 12);
  ctx.restore();
}
