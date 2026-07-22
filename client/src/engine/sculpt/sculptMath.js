// Чисти helper-и за Sculpt viewport-а — без зависимости, за да са лесни за
// unit-тест (node) и преизползване.

// Единична посока за view preset (front гледа по -Z от +Z и т.н.).
export function viewPresetOffset(name) {
  switch (name) {
    case 'front': return [0, 0, 1];
    case 'back': return [0, 0, -1];
    case 'right': return [1, 0, 0];
    case 'left': return [-1, 0, 0];
    case 'top': return [0, 1, 0];
    case 'bottom': return [0, -1, 0];
    case 'persp':
    default: {
      const d = 1 / Math.sqrt(2.49); // ~нормализиран [1, 0.7, 1]
      return [d, 0.7 * d, d];
    }
  }
}

// Аудио ниво (0..1) → множител за пулс, клампван и монотонен.
export function audioPulse(level) {
  const l = Math.max(0, Math.min(1, level || 0));
  return Math.min(1, l * 1.6);
}
