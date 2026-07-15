// Canvas → данни за Gemini анализ: PNG screenshot (ограничен до ~1024px
// по-дългата страна за разумен payload) + рекурсивна JSON сериализация на
// обектите със семантичните им custom props.

function serializeObject(obj) {
  const base = {
    type: obj.type,
    left: Math.round(obj.left),
    top: Math.round(obj.top),
    width: Math.round(obj.width * (obj.scaleX || 1)),
    height: Math.round(obj.height * (obj.scaleY || 1)),
    fill: typeof obj.fill === 'string' ? obj.fill : undefined,
    text: obj.text || undefined,
    customType: obj.customType || undefined,
    textRole: obj.textRole || undefined,
    buttonStyle: obj.buttonStyle || undefined,
    formFields: obj.formFields || undefined,
    navItems: obj.navItems || undefined,
    componentKind: obj.componentKind || undefined,
    annotations: obj.annotation ? [obj.annotation] : undefined,
  };
  if (obj.type === 'group' && typeof obj.getObjects === 'function') {
    // Децата носят текстово съдържание (лейбъли на бутони/форми)
    base.children = obj
      .getObjects()
      .filter((c) => c.text)
      .map((c) => ({ type: c.type, text: c.text }));
  }
  // Премахни undefined стойности за компактен payload
  return Object.fromEntries(Object.entries(base).filter(([, v]) => v !== undefined));
}

export function analyzeCanvas(fabricCanvas) {
  const maxSide = Math.max(fabricCanvas.width, fabricCanvas.height);
  const multiplier = maxSide > 1024 ? 1024 / maxSide : 1;
  const dataURL = fabricCanvas.toDataURL({ format: 'png', multiplier });

  const objects = fabricCanvas.getObjects().map(serializeObject);

  return {
    image: dataURL,
    objects,
    canvasSize: { width: fabricCanvas.width, height: fabricCanvas.height },
  };
}
