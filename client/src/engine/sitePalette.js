// Палитра на сайта — детерминистична връзка между нарисуваното и генерирания
// код. Цветовете, които потребителят е избрал изрично, стават CSS променливи,
// които и промптът, и preview-то, и финалният CSS ползват. Контрастът се
// коригира до WCAG AA, за да не излезе нечетимо/грозно.
import { extractPalette } from './paletteExtract.js';
import { FRAME_COLORS } from '../components/webforge/tools.js';

export const PALETTE_KEYS = ['primary', 'accent', 'bg', 'surface', 'text', 'muted'];

export const DEFAULT_PALETTE = {
  primary: '#6C5CE7',
  accent: '#22B8D4',
  bg: '#FFFFFF',
  surface: '#F4F4F8',
  text: '#1F1F27',
  muted: '#6B6B78',
};

// Цветовете, с които рамките се рисуват по подразбиране, са чертожни знаци —
// никога не бива да влизат в палитрата на сайта.
const GUIDE_COLORS = new Set(
  Object.values(FRAME_COLORS).map((c) => c.toLowerCase())
);

const HEX_RE = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;

export function normalizeHex(hex) {
  if (typeof hex !== 'string') return null;
  const s = hex.trim();
  if (!HEX_RE.test(s)) return null;
  if (s.length === 4) {
    return `#${s[1]}${s[1]}${s[2]}${s[2]}${s[3]}${s[3]}`.toLowerCase();
  }
  return s.toLowerCase();
}

export function hexToRgb(hex) {
  const h = normalizeHex(hex);
  if (!h) return null;
  const n = parseInt(h.slice(1), 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

export function rgbToHex(r, g, b) {
  const c = (v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`;
}

// ── Контраст (WCAG 2.1) ──
export function relLuminance(hex) {
  const rgb = hexToRgb(hex);
  if (!rgb) return 0;
  const ch = (v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * ch(rgb.r) + 0.7152 * ch(rgb.g) + 0.0722 * ch(rgb.b);
}

export function contrastRatio(a, b) {
  const la = relLuminance(a);
  const lb = relLuminance(b);
  const hi = Math.max(la, lb);
  const lo = Math.min(la, lb);
  return (hi + 0.05) / (lo + 0.05);
}

function shift(hex, amount) {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;
  return rgbToHex(rgb.r + amount, rgb.g + amount, rgb.b + amount);
}

// Приближава `fg` към четимост върху `bg`, без да сменя изцяло тона.
// Опитва И двете посоки: срещу среден сив изсветляването НЕ може да стигне
// 4.5 (бяло върху #808080 дава ~3.95), а потъмняването може.
export function ensureContrast(fg, bg, min = 4.5) {
  const from = normalizeHex(fg);
  const to = normalizeHex(bg);
  if (!from || !to) return normalizeHex(fg) || fg;
  if (contrastRatio(from, to) >= min) return from;

  // Предпочитаната посока е „навън" от фона, но проверяваме и двете
  const preferLighter = relLuminance(to) < 0.5;
  const dirs = preferLighter ? [12, -12] : [-12, 12];
  let best = from;
  let bestRatio = contrastRatio(from, to);

  for (const dir of dirs) {
    let cur = from;
    for (let i = 0; i < 22; i++) {
      cur = shift(cur, dir);
      const ratio = contrastRatio(cur, to);
      if (ratio > bestRatio) { bestRatio = ratio; best = cur; }
      if (ratio >= min) return cur;
    }
  }
  // Никоя посока не стига прага → вземи по-контрастния полюс
  const white = contrastRatio('#ffffff', to);
  const black = contrastRatio('#000000', to);
  if (Math.max(white, black) > bestRatio) return white >= black ? '#ffffff' : '#000000';
  return best;
}

// Валидира и „заздравява" цяла палитра. Изходът е винаги нормализиран
// (малки букви, 6 знака), за да е сравним и предвидим в CSS-а.
export function harmonizePalette(p = {}) {
  const out = {};
  for (const k of PALETTE_KEYS) {
    out[k] = normalizeHex(p?.[k]) || normalizeHex(DEFAULT_PALETTE[k]);
  }
  out.text = ensureContrast(out.text, out.bg, 4.5);
  out.muted = ensureContrast(out.muted, out.bg, 3);
  return out;
}

// ── Извличане от скицата ──
// Изричните избори имат приоритет: buttonColor, fill на рамки/текст.
// Guide цветовете (default stroke по тип рамка) се игнорират.
export function paletteFromSketch(objects = [], canvasEl = null) {
  const picked = { primary: null, accent: null, text: null, bg: null };
  const extras = [];

  for (const o of objects) {
    const btn = normalizeHex(o.buttonColor);
    if (btn && !picked.primary) picked.primary = btn;

    const fill = normalizeHex(o.fill);
    if (fill && !GUIDE_COLORS.has(fill)) {
      const type = o.customType || o.type;
      if (type === 'text' || o.type === 'i-text') {
        if (!picked.text) picked.text = fill;
      } else if (!extras.includes(fill)) {
        extras.push(fill);
      }
    }
    // Изричен stroke, който НЕ е default за типа → съзнателен избор
    const stroke = normalizeHex(o.stroke);
    if (stroke && !GUIDE_COLORS.has(stroke) && !extras.includes(stroke)) extras.push(stroke);
  }

  // Допълни от реалните пиксели на платното
  if (canvasEl) {
    for (const c of extractPalette(canvasEl, 6)) {
      const hex = normalizeHex(c.hex);
      if (hex && !GUIDE_COLORS.has(hex) && !extras.includes(hex)) extras.push(hex);
    }
  }

  const next = { ...DEFAULT_PALETTE };
  if (picked.primary) next.primary = picked.primary;
  else if (extras[0]) next.primary = extras[0];
  const accent = extras.find((c) => c !== next.primary);
  if (accent) next.accent = accent;
  if (picked.text) next.text = picked.text;

  return harmonizePalette(next);
}

// ── CSS ──
export function toCssVars(palette) {
  const p = harmonizePalette(palette);
  return `:root {
  --wf-primary: ${p.primary};
  --wf-accent: ${p.accent};
  --wf-bg: ${p.bg};
  --wf-surface: ${p.surface};
  --wf-text: ${p.text};
  --wf-muted: ${p.muted};
}`;
}

// Гарантира, че генерираният CSS съдържа ТОЧНО тези стойности — дори ако
// моделът се е отклонил. Заменя съществуващ :root блок или го добавя отпред.
export function injectPaletteVars(css = '', palette) {
  const block = toCssVars(palette);
  const rootRe = /:root\s*\{[^}]*\}/i;
  if (rootRe.test(css)) {
    const existing = css.match(rootRe)[0];
    // Пази другите променливи в :root, подменя само нашите
    const others = existing
      .replace(/^:root\s*\{/i, '')
      .replace(/\}$/, '')
      .split(';')
      .map((l) => l.trim())
      .filter((l) => l && !/^--wf-(primary|accent|bg|surface|text|muted)\s*:/.test(l));
    const merged = `:root {\n${block
      .replace(/^:root \{\n/, '')
      .replace(/\n\}$/, '')}${others.length ? `\n  ${others.join(';\n  ')};` : ''}\n}`;
    return css.replace(rootRe, merged);
  }
  return `${block}\n\n${css}`;
}
