// Извличане на доминантната палитра от нарисуваното — за да може поемата да
// отразява реалните цветове. Чистата `quantizePixels` е тествана в Node;
// `extractPalette` е тънка обвивка, която downsample-ва canvas елемента.

const BG = { r: 5, g: 5, b: 5 }; // #050505 — фонът, пропуска се
const BUCKET = 32; // размер на кофата при quantize (по-голямо = по-малко цветове)

// Малка таблица наименувани цветове (RGB) — nearest match за човешко име.
const NAMED = [
  ['black', 22, 22, 22], ['white', 245, 245, 245], ['gray', 150, 150, 158],
  ['red', 255, 45, 45], ['crimson', 220, 20, 60], ['orange', 255, 102, 0],
  ['coral', 255, 127, 80], ['gold', 255, 215, 0], ['yellow', 255, 233, 77],
  ['lime', 163, 230, 53], ['green', 34, 197, 94], ['teal', 20, 184, 166],
  ['cyan', 0, 255, 255], ['blue', 74, 144, 217], ['indigo', 99, 102, 241],
  ['violet', 167, 139, 250], ['purple', 139, 92, 246], ['magenta', 255, 0, 255],
  ['pink', 255, 107, 157], ['brown', 139, 94, 60], ['silver', 192, 192, 192],
];

export function nearestColorName(r, g, b) {
  let best = NAMED[0][0];
  let bestD = Infinity;
  for (const [name, nr, ng, nb] of NAMED) {
    const d = (r - nr) ** 2 + (g - ng) ** 2 + (b - nb) ** 2;
    if (d < bestD) { bestD = d; best = name; }
  }
  return best;
}

function toHex(r, g, b) {
  const h = (v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
  return `#${h(r)}${h(g)}${h(b)}`;
}

/**
 * Чиста функция — quantize-ва RGBA пиксели и връща топ цветовете.
 * Пропуска (почти) прозрачни и (почти) фонови пиксели.
 * @returns [{ hex, name, weight }] сортирано по честота, до maxColors.
 */
export function quantizePixels(pixels, maxColors = 5) {
  const buckets = new Map();
  for (let i = 0; i < pixels.length; i += 4) {
    const a = pixels[i + 3];
    if (a < 40) continue; // прозрачно
    const r = pixels[i];
    const g = pixels[i + 1];
    const b = pixels[i + 2];
    // пропусни фонови/почти-черни пиксели, близки до #050505
    if ((r - BG.r) ** 2 + (g - BG.g) ** 2 + (b - BG.b) ** 2 < 900) continue;
    const key =
      (Math.round(r / BUCKET) * BUCKET << 16) |
      (Math.round(g / BUCKET) * BUCKET << 8) |
      (Math.round(b / BUCKET) * BUCKET);
    const e = buckets.get(key);
    if (e) { e.r += r; e.g += g; e.b += b; e.n += 1; }
    else buckets.set(key, { r, g, b, n: 1 });
  }

  const total = [...buckets.values()].reduce((s, e) => s + e.n, 0) || 1;
  const sorted = [...buckets.values()].sort((a, b) => b.n - a.n);

  const out = [];
  const seenNames = new Set();
  for (const e of sorted) {
    const r = e.r / e.n;
    const g = e.g / e.n;
    const b = e.b / e.n;
    const name = nearestColorName(r, g, b);
    if (seenNames.has(name)) continue; // без дублирани имена
    seenNames.add(name);
    out.push({ hex: toHex(r, g, b), name, weight: +(e.n / total).toFixed(3) });
    if (out.length >= maxColors) break;
  }
  return out;
}

/**
 * Извлича палитра от <canvas> елемент чрез downsample до ~64px.
 * Връща [{ hex, name, weight }]; [] при неуспех.
 */
export function extractPalette(canvasEl, maxColors = 5) {
  try {
    if (!canvasEl) return [];
    const w = 64;
    const h = Math.max(1, Math.round((canvasEl.height / canvasEl.width) * 64)) || 64;
    const off = document.createElement('canvas');
    off.width = w;
    off.height = h;
    const ctx = off.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(canvasEl, 0, 0, w, h);
    const { data } = ctx.getImageData(0, 0, w, h);
    return quantizePixels(data, maxColors);
  } catch {
    return [];
  }
}
