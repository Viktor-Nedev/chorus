// Fabric четки за WebForge — огледало на Solo PEN_STYLES, но върху Fabric v6.
// `applyBrush(canvas, {type,color,width})` конфигурира canvas.freeDrawingBrush;
// `strokeProps(type)` дава props-ите, които се закачат на създадения path
// (гумата реално изтрива през destination-out).
import { PencilBrush, SprayBrush, Shadow } from 'fabric';

export const BRUSH_TYPES = [
  { id: 'pen', label: 'Pen', hint: 'thin crisp ink' },
  { id: 'pencil', label: 'Pencil', hint: 'light sketch line' },
  { id: 'marker', label: 'Marker', hint: 'soft bold stroke' },
  { id: 'highlighter', label: 'Highlighter', hint: 'wide transparent wash' },
  { id: 'calligraphy', label: 'Calligraphy', hint: 'angled, elegant' },
  { id: 'spray', label: 'Spray', hint: 'scattered dots' },
  { id: 'neon', label: 'Neon', hint: 'glowing tube' },
  { id: 'eraser', label: 'Eraser', hint: 'removes what you cross' },
];
export const BRUSH_IDS = BRUSH_TYPES.map((b) => b.id);

// Полупрозрачна версия на hex цвят
export function withAlpha(hex, alpha) {
  const m = /^#([0-9a-f]{6})$/i.exec(hex || '');
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}

// Чиста конфигурация на щриха по тип — унит-тестируема, без Fabric.
export function brushConfig(type, color = '#F5F5F5', width = 3) {
  switch (type) {
    case 'pen':
      return { kind: 'pencil', color, width: Math.max(1, width * 0.7), decimate: 0.4 };
    case 'pencil':
      return { kind: 'pencil', color: withAlpha(color, 0.75), width: Math.max(1, width * 0.8) };
    case 'marker':
      return { kind: 'pencil', color: withAlpha(color, 0.5), width: width * 3 };
    case 'highlighter':
      return { kind: 'pencil', color: withAlpha(color, 0.28), width: width * 6 };
    case 'calligraphy':
      return { kind: 'pencil', color, width: width * 2, calligraphy: true };
    case 'spray':
      return { kind: 'spray', color, width: width * 5, density: 60, dotWidth: Math.max(1, width / 3) };
    case 'neon':
      return { kind: 'pencil', color, width: Math.max(2, width * 1.4), glow: color };
    case 'eraser':
      // Цветът е без значение — щрихът се композира като destination-out
      return { kind: 'pencil', color: '#000000', width: width * 4, erase: true };
    default:
      return { kind: 'pencil', color, width };
  }
}

// Props, които се закачат на новосъздадения path (виж ForgeCanvas path:created)
export function strokeProps(type) {
  if (type === 'eraser') {
    return { customType: 'eraser', globalCompositeOperation: 'destination-out', selectable: false, evented: false };
  }
  return { customType: 'drawing' };
}

export function applyBrush(canvas, { type = 'pen', color = '#F5F5F5', width = 3 } = {}) {
  if (!canvas) return null;
  const cfg = brushConfig(type, color, width);

  if (cfg.kind === 'spray') {
    const brush = new SprayBrush(canvas);
    brush.color = cfg.color;
    brush.width = cfg.width;
    brush.density = cfg.density;
    brush.dotWidth = cfg.dotWidth;
    brush.dotWidthVariance = 1;
    canvas.freeDrawingBrush = brush;
    return brush;
  }

  const brush = new PencilBrush(canvas);
  brush.color = cfg.color;
  brush.width = cfg.width;
  brush.strokeLineCap = cfg.calligraphy ? 'butt' : 'round';
  brush.strokeLineJoin = 'round';
  if (cfg.decimate != null) brush.decimate = cfg.decimate;
  brush.shadow = cfg.glow
    ? new Shadow({ color: cfg.glow, blur: Math.max(8, cfg.width * 3), offsetX: 0, offsetY: 0 })
    : null;
  canvas.freeDrawingBrush = brush;
  return brush;
}
