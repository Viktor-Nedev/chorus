// Чист парсер за гласови команди в WebForge. Връща типизирана команда или null.
// Речникът е специфичен за изграждане на сайт (за разлика от Solo рисуването).

const COLORS = {
  red: '#FF5555', crimson: '#DC143C', orange: '#FF8A3D', gold: '#FFD27F',
  yellow: '#FFE94D', lime: '#A3E635', green: '#3DDC97', teal: '#14B8A6',
  cyan: '#67E8F9', blue: '#4A9EFF', indigo: '#6366F1', violet: '#8B7BFA',
  purple: '#8B5CF6', magenta: '#FF00FF', pink: '#FF8FC7', brown: '#8B5E3C',
  black: '#1a1a24', white: '#F5F5F5', gray: '#8a8a92', grey: '#8a8a92',
  silver: '#C0C0C0',
};

// Инструменти/елементи, които може да поискаш на глас
const TOOLS = {
  select: 'SELECT', pointer: 'SELECT', move: 'SELECT',
  frame: 'FRAME', block: 'FRAME', box: 'FRAME', section: 'FRAME',
  text: 'TEXT', heading: 'TEXT', title: 'TEXT',
  image: 'IMAGE', picture: 'IMAGE', photo: 'IMAGE',
  button: 'BUTTON',
  navbar: 'NAV', nav: 'NAV', menu: 'NAV', navigation: 'NAV',
  draw: 'DRAW', brush: 'DRAW', pencil: 'DRAW',
  eraser: 'ERASER', erase: 'ERASER', rubber: 'ERASER',
  fill: 'FILL', bucket: 'FILL', paint: 'FILL',
  hand: 'HAND', finger: 'HAND',
  voice: 'VOICE',
};

const BRUSHES = {
  pen: 'pen', pencil: 'pencil', marker: 'marker', highlighter: 'highlighter',
  calligraphy: 'calligraphy', spray: 'spray', neon: 'neon', eraser: 'eraser',
};

const has = (t, ...words) => words.some((w) => new RegExp(`\\b${w}\\b`).test(t));

/**
 * @returns {null | { type, value? }} типове:
 *  tool | brush | color | emotionColor | text | addPage | nextPage | prevPage |
 *  generate | analyze | publish | download | clear | undo | redo | size | extend
 */
export function parseWebforgeCommand(raw) {
  if (!raw) return null;
  const src = String(raw).trim();
  const t = src.toLowerCase();
  if (!t) return null;

  // „text hello world" / „write hello" → поставя надпис.
  // Съдържанието се взима от ОРИГИНАЛНИЯ низ, за да се запази регистърът.
  const textMatch = /\b(?:text|write|label|say)\s+(.{1,60})$/.exec(t);
  if (textMatch && !has(t, 'colour', 'color')) {
    const start = textMatch.index + textMatch[0].length - textMatch[1].length;
    return { type: 'text', value: src.slice(start).trim() };
  }

  // Действия (преди инструментите — „generate" не е инструмент)
  if (has(t, 'new page', 'add page', 'another page')) return { type: 'addPage' };
  if (has(t, 'next page')) return { type: 'nextPage' };
  if (has(t, 'previous page', 'last page', 'back page')) return { type: 'prevPage' };
  if (has(t, 'generate', 'build the site', 'build it', 'make the website')) return { type: 'generate' };
  if (has(t, 'analyse', 'analyze', 'recognise', 'recognize')) return { type: 'analyze' };
  if (has(t, 'publish', 'go live')) return { type: 'publish' };
  if (has(t, 'download', 'export', 'zip')) return { type: 'download' };
  if (has(t, 'clear', 'wipe', 'start over')) return { type: 'clear' };
  if (has(t, 'undo')) return { type: 'undo' };
  if (has(t, 'redo')) return { type: 'redo' };
  if (has(t, 'extend', 'longer', 'taller', 'more space')) return { type: 'extend' };
  if (has(t, 'bigger', 'larger', 'thicker')) return { type: 'size', value: +2 };
  if (has(t, 'smaller', 'thinner')) return { type: 'size', value: -2 };

  // Цвят по емоция
  if (has(t, 'emotion colour', 'emotion color', 'mood colour', 'mood color', 'feel')) {
    return { type: 'emotionColor' };
  }

  // Цвят
  for (const [name, hex] of Object.entries(COLORS)) {
    if (has(t, name)) return { type: 'color', value: hex, name };
  }

  // Четка — само когато е ясно поискана („marker", „use neon")
  for (const [name, id] of Object.entries(BRUSHES)) {
    if (has(t, name)) {
      // „pencil"/„eraser" са и инструменти — четката печели, тя включва рисуване
      return { type: 'brush', value: id };
    }
  }

  // Инструменти / елементи
  for (const [name, id] of Object.entries(TOOLS)) {
    if (has(t, name)) return { type: 'tool', value: id };
  }

  return null;
}

export const VOICE_EXAMPLES = [
  'add a navbar', 'button', 'frame', 'text Our services',
  'marker', 'neon', 'red', 'emotion colour',
  'new page', 'next page', 'extend', 'generate', 'publish', 'undo',
];

export { COLORS as VOICE_COLORS };
