// Ръка от частици + рисуване с пръст. 21-те MediaPipe hand landmarks се
// мапват в същия world space като лицето (нормализирани [0..1], x-mirror),
// после частиците се разпръскват по костите. Върхът на показалеца (8) оставя
// постоянна следа в TRAIL блока когато Draw режимът е ON.
export const HANDS_COUNT = 1600;
export const TRAIL_COUNT = 4000;
const HIDDEN_Z = -1000;

// Кости (двойки landmark индекси) на дланта + 5-те пръста
const BONES = [
  [0, 1], [1, 2], [2, 3], [3, 4],       // палец
  [0, 5], [5, 6], [6, 7], [7, 8],       // показалец
  [5, 9], [9, 10], [10, 11], [11, 12],  // среден
  [9, 13], [13, 14], [14, 15], [15, 16],// безименен
  [13, 17], [17, 18], [18, 19], [19, 20], // кутре
  [0, 17],                               // основа на дланта
];

// Използва СЪЩОТО кадриране като лицето (st: mappingState от landmarkMapping),
// за да съвпадне мащабът/центърът. hb: 21×3 нормализирани.
function toWorld(hb, i, st, o) {
  o[0] = -(hb[i * 3] - st.ax) * st.s;
  o[1] = -(hb[i * 3 + 1] - st.ay) * st.s + 0.25;
  o[2] = -(hb[i * 3 + 2] - st.az) * st.s * 1.3;
}

const _a = [0, 0, 0], _b = [0, 0, 0];

export function updateHands(pos, baseIndex, handBuf, mappingState, fresh) {
  const base = baseIndex * 3;
  if (!fresh) {
    for (let i = 0; i < HANDS_COUNT; i++) pos[base + i * 3 + 2] = HIDDEN_Z;
    return;
  }
  const per = Math.floor(HANDS_COUNT / BONES.length);
  let idx = 0;
  for (const [ia, ib] of BONES) {
    toWorld(handBuf, ia, mappingState, _a);
    toWorld(handBuf, ib, mappingState, _b);
    for (let k = 0; k < per; k++) {
      const t = Math.random();
      const j = base + idx * 3;
      pos[j] = _a[0] + (_b[0] - _a[0]) * t + (Math.random() - 0.5) * 0.05;
      pos[j + 1] = _a[1] + (_b[1] - _a[1]) * t + (Math.random() - 0.5) * 0.05;
      pos[j + 2] = _a[2] + (_b[2] - _a[2]) * t + (Math.random() - 0.5) * 0.05;
      idx++;
    }
  }
  for (; idx < HANDS_COUNT; idx++) pos[base + idx * 3 + 2] = HIDDEN_Z;
}

// Индекс на върха на показалеца
const INDEX_TIP = 8;

export function createTrailState() {
  return { head: 0, count: 0, lastX: 0, lastY: 0, lastZ: 0, drawing: false };
}

export function updateTrail(pos, baseIndex, trail, handBuf, mappingState, fresh, drawOn) {
  const base = baseIndex * 3;
  if (!drawOn || !fresh) {
    trail.drawing = false;
    return; // следата остава (постоянна), само спираме да добавяме
  }
  toWorld(handBuf, INDEX_TIP, mappingState, _a);
  const dx = _a[0] - trail.lastX, dy = _a[1] - trail.lastY;
  const moved = Math.hypot(dx, dy) > 0.04 || !trail.drawing;
  if (moved) {
    // Добави няколко точки по сегмента (гладка линия)
    const steps = trail.drawing ? Math.min(6, Math.ceil(Math.hypot(dx, dy) / 0.03)) : 1;
    for (let s = 0; s < steps; s++) {
      const t = (s + 1) / steps;
      const x = trail.drawing ? trail.lastX + dx * t : _a[0];
      const y = trail.drawing ? trail.lastY + dy * t : _a[1];
      const z = _a[2];
      for (let d = 0; d < 3; d++) { // няколко частици за плътност
        const j = base + trail.head * 3;
        pos[j] = x + (Math.random() - 0.5) * 0.03;
        pos[j + 1] = y + (Math.random() - 0.5) * 0.03;
        pos[j + 2] = z;
        trail.head = (trail.head + 1) % TRAIL_COUNT;
        trail.count = Math.min(TRAIL_COUNT, trail.count + 1);
      }
    }
    trail.lastX = _a[0]; trail.lastY = _a[1]; trail.lastZ = _a[2];
    trail.drawing = true;
  }
}

export function initTrailHidden(pos, baseIndex) {
  const base = baseIndex * 3;
  for (let i = 0; i < TRAIL_COUNT; i++) pos[base + i * 3 + 2] = HIDDEN_Z;
}

export function clearTrail(pos, baseIndex, trail) {
  const base = baseIndex * 3;
  for (let i = 0; i < TRAIL_COUNT; i++) pos[base + i * 3 + 2] = HIDDEN_Z;
  trail.head = 0; trail.count = 0; trail.drawing = false;
}
