// Canvas → данни за Gemini анализ и wireframe preview: PNG screenshot
// (ограничен до ~1024px по-дългата страна) + JSON сериализация на обектите
// с px И процентни координати (%-ите носят layout семантиката за модела).

const pct = (v, total) => Math.round((v / (total || 1)) * 1000) / 10;

// Freehand path → компактна полилиния (до 32 точки, абсолютни координати).
// Пълните path данни са огромни и безполезни за модела; полилинията стига
// за wireframe рендер и за форма-подсказка.
function pathToPolyline(obj) {
  const cmds = obj.path || [];
  const sx = obj.scaleX || 1;
  const sy = obj.scaleY || 1;
  const w = obj.width * sx;
  const h = obj.height * sy;
  const offX = obj.pathOffset?.x ?? obj.width / 2;
  const offY = obj.pathOffset?.y ?? obj.height / 2;
  const pts = [];
  for (const cmd of cmds) {
    if (cmd.length >= 3) {
      const px = cmd[cmd.length - 2];
      const py = cmd[cmd.length - 1];
      pts.push([
        Math.round(obj.left + (px - offX) * sx + w / 2),
        Math.round(obj.top + (py - offY) * sy + h / 2),
      ]);
    }
  }
  const step = Math.max(1, Math.ceil(pts.length / 32));
  return pts.filter((_, i) => i % step === 0 || i === pts.length - 1);
}

function serializeObject(obj, cw, ch) {
  const w = obj.width * (obj.scaleX || 1);
  const h = obj.height * (obj.scaleY || 1);
  const isPath = obj.type === 'path';
  const base = {
    type: isPath ? 'freehand' : obj.type,
    left: Math.round(obj.left),
    top: Math.round(obj.top),
    width: Math.round(w),
    height: Math.round(h),
    xPct: pct(obj.left, cw),
    yPct: pct(obj.top, ch),
    wPct: pct(w, cw),
    hPct: pct(h, ch),
    fill: typeof obj.fill === 'string' ? obj.fill : undefined,
    stroke: typeof obj.stroke === 'string' ? obj.stroke : undefined,
    strokeWidth: isPath ? obj.strokeWidth : undefined,
    text: obj.text || undefined,
    fontSize: obj.fontSize ? Math.round(obj.fontSize * (obj.scaleY || 1)) : undefined,
    customType: obj.customType || undefined,
    textRole: obj.textRole || undefined,
    buttonStyle: obj.buttonStyle || undefined,
    formFields: obj.formFields || undefined,
    navItems: obj.navItems || undefined,
    componentKind: obj.componentKind || undefined,
    annotations: obj.annotation ? [obj.annotation] : undefined,
  };
  if (isPath) {
    base.polyline = pathToPolyline(obj);
  }
  if (obj.type === 'group' && typeof obj.getObjects === 'function') {
    if (obj.customType === 'drawing') {
      // Спрей щрих — група от точки; носи само цвета си
      base.stroke = obj.getObjects()[0]?.fill || base.stroke;
      base.children = undefined;
    } else {
      // Децата носят текстово съдържание (лейбъли на бутони/навигация)
      base.children = obj
        .getObjects()
        .filter((c) => c.text)
        .map((c) => ({ type: c.type, text: c.text }));
    }
  }
  // Премахни undefined стойности за компактен payload
  return Object.fromEntries(Object.entries(base).filter(([, v]) => v !== undefined));
}

export function serializeObjects(fabricCanvas) {
  const cw = fabricCanvas.width;
  const ch = fabricCanvas.height;
  return fabricCanvas.getObjects().map((o) => serializeObject(o, cw, ch));
}

export function analyzeCanvas(fabricCanvas) {
  const maxSide = Math.max(fabricCanvas.width, fabricCanvas.height);
  const multiplier = maxSide > 1024 ? 1024 / maxSide : 1;
  const dataURL = fabricCanvas.toDataURL({ format: 'png', multiplier });

  return {
    image: dataURL,
    objects: serializeObjects(fabricCanvas),
    canvasSize: { width: fabricCanvas.width, height: fabricCanvas.height },
  };
}
