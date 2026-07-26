// Чисти помощни функции за Camera FX (thermal lens / point cloud / …).
// Без DOM → unit-тестваеми. Пикселната обработка в CameraFX.jsx ги ползва.

export const EFFECTS = [
  { id: 'thermal', label: 'Thermal', icon: '🌡' },
  { id: 'pointcloud', label: 'Point cloud', icon: '✦' },
  { id: 'voxel', label: 'Voxel', icon: '⬛' },
  { id: 'hologram', label: 'Hologram', icon: '🛰' },
  { id: 'edge', label: 'Wireframe', icon: '▦' },
  { id: 'neon', label: 'Neon', icon: '💠' },
  { id: 'rainbow', label: 'Spectral', icon: '🌈' },
  { id: 'nightvision', label: 'Night-vis', icon: '🥽' },
  { id: 'xray', label: 'X-ray', icon: '☢' },
  { id: 'sepia', label: 'Sepia', icon: '🎞' },
  { id: 'invert', label: 'Negative', icon: '🔻' },
  { id: 'posterize', label: 'Posterize', icon: '🖼' },
  { id: 'duotone', label: 'Duotone', icon: '🌗' },
  { id: 'contour', label: 'Contour', icon: '🗺' },
  { id: 'mosaic', label: 'Mosaic', icon: '▩' },
  { id: 'halftone', label: 'Halftone', icon: '⣿' },
  { id: 'glitch', label: 'Glitch', icon: '📺' },
];

// Ефекти, които се рисуват СПЕЦИАЛНО в CameraFX (не per-pixel LUT):
export const SPECIAL_EFFECTS = new Set(['pointcloud', 'voxel', 'mosaic', 'halftone', 'glitch']);

// Rec.709 luminance, 0..1
export function luminance(r, g, b) {
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

// Линейна интерполация през масив от [pos,[r,g,b]] спирки.
function ramp(stops, t) {
  const x = clamp01(t);
  for (let i = 1; i < stops.length; i++) {
    if (x <= stops[i][0]) {
      const [p0, c0] = stops[i - 1];
      const [p1, c1] = stops[i];
      const k = (x - p0) / (p1 - p0 || 1);
      return [
        Math.round(c0[0] + (c1[0] - c0[0]) * k),
        Math.round(c0[1] + (c1[1] - c0[1]) * k),
        Math.round(c0[2] + (c1[2] - c0[2]) * k),
      ];
    }
  }
  return stops[stops.length - 1][1].slice();
}

// Термален false-color: черно → синьо → лилаво → червено → оранжево → жълто → бяло
const THERMAL_STOPS = [
  [0.0, [4, 6, 24]],
  [0.2, [30, 20, 130]],
  [0.4, [140, 22, 130]],
  [0.6, [235, 40, 45]],
  [0.78, [255, 140, 20]],
  [0.9, [255, 225, 80]],
  [1.0, [255, 255, 255]],
];
export function thermalLUT(l) {
  return ramp(THERMAL_STOPS, l);
}

// Спектрален (rainbow) ramp
const RAINBOW_STOPS = [
  [0.0, [10, 10, 40]],
  [0.2, [40, 0, 160]],
  [0.4, [0, 140, 220]],
  [0.6, [0, 220, 120]],
  [0.8, [240, 220, 40]],
  [1.0, [255, 60, 60]],
];
export function rainbowLUT(l) {
  return ramp(RAINBOW_STOPS, l);
}

// Точков цвят за point-cloud (студен зелено-циан спектър, по-ярко = по-светло)
export function pointCloudColor(l) {
  const g = Math.round(120 + l * 135);
  const b = Math.round(90 + l * 120);
  const r = Math.round(20 + l * 120);
  return [r, g, b];
}

// ── Прости per-pixel цветови трансформации (чисти, тествани) ──
export function nightvisionColor(l) {
  return [Math.round(l * 40), Math.round(30 + l * 225), Math.round(l * 60)];
}
export function sepiaColor(r, g, b) {
  const tr = 0.393 * r + 0.769 * g + 0.189 * b;
  const tg = 0.349 * r + 0.686 * g + 0.168 * b;
  const tb = 0.272 * r + 0.534 * g + 0.131 * b;
  return [Math.min(255, tr) | 0, Math.min(255, tg) | 0, Math.min(255, tb) | 0];
}
export function invertColor(r, g, b) {
  return [255 - r, 255 - g, 255 - b];
}
export function posterizeColor(r, g, b, levels = 5) {
  const q = (v) => Math.round((Math.round((v / 255) * (levels - 1)) / (levels - 1)) * 255);
  return [q(r), q(g), q(b)];
}
export function duotoneColor(l) {
  const a = [20, 20, 60];
  const c = [255, 120, 180];
  return [Math.round(a[0] + (c[0] - a[0]) * l), Math.round(a[1] + (c[1] - a[1]) * l), Math.round(a[2] + (c[2] - a[2]) * l)];
}

const IDX_TIP = 8;
const THUMB_TIP = 4;

// Правоъгълник (нормализиран, ОГЛЕДАЛЕН по x) от landmarks на наличните ръце.
// handsBuf: Float32Array с 2*21*3 (x,y,z нормализирани в НЕ-огледален кадър).
// При 2 ръце → bounding box на index+thumb tips на двете; при 1 → малка рамка
// около index/thumb на едната. Връща { x, y, w, h } или null.
export function lensRectFromHands(handsBuf, handCount) {
  if (!handsBuf || !handCount) return null;
  const pts = [];
  const n = Math.min(2, handCount);
  for (let h = 0; h < n; h++) {
    const base = h * 21 * 3;
    for (const lm of [IDX_TIP, THUMB_TIP]) {
      const j = base + lm * 3;
      const x = 1 - handsBuf[j]; // огледално
      const y = handsBuf[j + 1];
      pts.push([x, y]);
    }
  }
  if (!pts.length) return null;
  let minX = 1;
  let minY = 1;
  let maxX = 0;
  let maxY = 0;
  for (const [x, y] of pts) {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  // При една ръка рамката е малка → леко я уголеми за по-приятен lens
  if (n === 1) {
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    const half = Math.max(0.09, (maxX - minX) / 2, (maxY - minY) / 2);
    minX = cx - half; maxX = cx + half;
    minY = cy - half * 1.15; maxY = cy + half * 1.15;
  }
  const x = clamp01(minX);
  const y = clamp01(minY);
  return {
    x,
    y,
    w: clamp01(maxX) - x,
    h: clamp01(maxY) - y,
  };
}
