// Чисти помощни функции за Camera FX (thermal lens / point cloud / …).
// Без DOM → unit-тестваеми. Пикселната обработка в CameraFX.jsx ги ползва.

export const EFFECTS = [
  { id: 'thermal', label: 'Thermal', icon: '🌡' },
  { id: 'pointcloud', label: 'Point cloud', icon: '✦' },
  { id: 'hologram', label: 'Hologram', icon: '🛰' },
  { id: 'edge', label: 'Wireframe', icon: '▦' },
  { id: 'rainbow', label: 'Spectral', icon: '🌈' },
  { id: 'xray', label: 'X-ray', icon: '☢' },
];

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
