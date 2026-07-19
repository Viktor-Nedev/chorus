// Обемна 3D ръка от частици + рисуване с пръст. 21-те MediaPipe hand landmarks
// се мапват в същия world space като лицето; частиците ПЪЛНЯТ ОБЕМА на
// пръстите (капсули с изтъняващ радиус) + месеста длан → изглежда като истинска
// ръка, не като линии. Върхът на показалеца (8) оставя следа в TRAIL блока.
export const HANDS_COUNT = 3000;
export const TRAIL_COUNT = 4000;
const HIDDEN_Z = -1000;

// Фаланги (двойки landmark индекси) с радиуси в НОРМАЛИЗИРАНИ единици
// (началото при ставата към дланта → изтънява към върха). Мащабират се с
// mappingState.s, за да са 1:1 с реалната ти ръка.
const BONES = [
  // палец
  { a: 1, b: 2, r0: 0.016, r1: 0.013 }, { a: 2, b: 3, r0: 0.013, r1: 0.010 }, { a: 3, b: 4, r0: 0.010, r1: 0.006 },
  // показалец
  { a: 5, b: 6, r0: 0.013, r1: 0.011 }, { a: 6, b: 7, r0: 0.011, r1: 0.009 }, { a: 7, b: 8, r0: 0.009, r1: 0.005 },
  // среден
  { a: 9, b: 10, r0: 0.014, r1: 0.011 }, { a: 10, b: 11, r0: 0.011, r1: 0.009 }, { a: 11, b: 12, r0: 0.009, r1: 0.005 },
  // безименен
  { a: 13, b: 14, r0: 0.013, r1: 0.010 }, { a: 14, b: 15, r0: 0.010, r1: 0.008 }, { a: 15, b: 16, r0: 0.008, r1: 0.005 },
  // кутре
  { a: 17, b: 18, r0: 0.011, r1: 0.009 }, { a: 18, b: 19, r0: 0.009, r1: 0.007 }, { a: 19, b: 20, r0: 0.007, r1: 0.004 },
];
// Дланта — запълнен петоъгълник (китка + основи на пръстите)
const PALM = [0, 1, 5, 9, 13, 17];
const PALM_THICK = 0.02; // нормализирано, *s

function toWorld(hb, i, st, o) {
  o[0] = -(hb[i * 3] - st.ax) * st.s;
  o[1] = -(hb[i * 3 + 1] - st.ay) * st.s + 0.25;
  o[2] = -(hb[i * 3 + 2] - st.az) * st.s * 1.3;
}

const _a = [0, 0, 0], _b = [0, 0, 0], _u = [0, 0, 0], _v = [0, 0, 0], _d = [0, 0, 0];
const sub = (o, p, q) => { o[0] = p[0] - q[0]; o[1] = p[1] - q[1]; o[2] = p[2] - q[2]; };
const normalize = (o) => { const l = Math.hypot(o[0], o[1], o[2]) || 1; o[0] /= l; o[1] /= l; o[2] /= l; };
const cross = (o, a, b) => { o[0] = a[1] * b[2] - a[2] * b[1]; o[1] = a[2] * b[0] - a[0] * b[2]; o[2] = a[0] * b[1] - a[1] * b[0]; };

export function updateHands(pos, baseIndex, handBuf, mappingState, fresh) {
  const base = baseIndex * 3;
  if (!fresh || !handBuf) {
    for (let i = 0; i < HANDS_COUNT; i++) pos[base + i * 3 + 2] = HIDDEN_Z;
    return;
  }
  const s = mappingState.s;
  let idx = 0;
  const write = (x, y, z) => { const j = base + idx * 3; pos[j] = x; pos[j + 1] = y; pos[j + 2] = z; idx++; };

  // ── Пръсти: пълни капсули с изтъняващ радиус ──
  const perBone = Math.floor((HANDS_COUNT * 0.72) / BONES.length);
  for (const bone of BONES) {
    toWorld(handBuf, bone.a, mappingState, _a);
    toWorld(handBuf, bone.b, mappingState, _b);
    sub(_d, _b, _a); normalize(_d);
    // Перпендикулярен базис на оста на костта
    _u[0] = 1; _u[1] = 0; _u[2] = 0;
    if (Math.abs(_d[0]) > 0.9) { _u[0] = 0; _u[1] = 1; }
    cross(_v, _d, _u); normalize(_v);
    cross(_u, _v, _d); normalize(_u);
    for (let k = 0; k < perBone; k++) {
      const t = Math.random();
      const rad = (bone.r0 + (bone.r1 - bone.r0) * t) * s;
      const rr = Math.sqrt(Math.random()) * rad;
      const a = Math.random() * Math.PI * 2;
      const ox = Math.cos(a) * rr, oy = Math.sin(a) * rr;
      write(
        _a[0] + _d[0] * (t * dist(_a, _b)) + _u[0] * ox + _v[0] * oy,
        _a[1] + _d[1] * (t * dist(_a, _b)) + _u[1] * ox + _v[1] * oy,
        _a[2] + _d[2] * (t * dist(_a, _b)) + _u[2] * ox + _v[2] * oy
      );
    }
  }

  // ── Кокалчета: малки топчета при основите на пръстите (обем) ──
  const knuckPer = Math.floor((HANDS_COUNT * 0.06) / 4);
  for (const ki of [5, 9, 13, 17]) {
    toWorld(handBuf, ki, mappingState, _a);
    for (let k = 0; k < knuckPer; k++) {
      const rr = Math.sqrt(Math.random()) * 0.014 * s;
      const a = Math.random() * Math.PI * 2, ph = Math.acos(2 * Math.random() - 1);
      write(_a[0] + Math.sin(ph) * Math.cos(a) * rr, _a[1] + Math.sin(ph) * Math.sin(a) * rr, _a[2] + Math.cos(ph) * rr);
    }
  }

  // ── Длан: запълнен петоъгълник с дебелина по нормалата ──
  const palmPts = PALM.map((i) => { const o = [0, 0, 0]; toWorld(handBuf, i, mappingState, o); return o; });
  // Нормала на дланта (от 3 точки: китка 0, основа показалец 5, основа кутре 17)
  sub(_u, palmPts[2], palmPts[0]);
  sub(_v, palmPts[5], palmPts[0]);
  cross(_d, _u, _v); normalize(_d);
  const thick = PALM_THICK * s;
  while (idx < HANDS_COUNT) {
    // fan триангулация през palmPts[0]
    const t = 1 + Math.floor(Math.random() * (palmPts.length - 2));
    let u = Math.random(), v = Math.random();
    if (u + v > 1) { u = 1 - u; v = 1 - v; }
    const w = 1 - u - v;
    const A = palmPts[0], B = palmPts[t], C = palmPts[t + 1];
    const off = (Math.random() - 0.5) * 2 * thick;
    write(
      A[0] * w + B[0] * u + C[0] * v + _d[0] * off,
      A[1] * w + B[1] * u + C[1] * v + _d[1] * off,
      A[2] * w + B[2] * u + C[2] * v + _d[2] * off
    );
  }
}

function dist(a, b) { return Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]); }

// ── Рисуване с пръст (следа) — непроменено ──
const INDEX_TIP = 8;
export function createTrailState() {
  return { head: 0, count: 0, lastX: 0, lastY: 0, lastZ: 0, drawing: false };
}
export function updateTrail(pos, baseIndex, trail, handBuf, mappingState, fresh, drawOn) {
  const base = baseIndex * 3;
  if (!drawOn || !fresh || !handBuf) { trail.drawing = false; return; }
  toWorld(handBuf, INDEX_TIP, mappingState, _a);
  const dx = _a[0] - trail.lastX, dy = _a[1] - trail.lastY;
  const moved = Math.hypot(dx, dy) > 0.04 || !trail.drawing;
  if (moved) {
    const steps = trail.drawing ? Math.min(6, Math.ceil(Math.hypot(dx, dy) / 0.03)) : 1;
    for (let st = 0; st < steps; st++) {
      const t = (st + 1) / steps;
      const x = trail.drawing ? trail.lastX + dx * t : _a[0];
      const y = trail.drawing ? trail.lastY + dy * t : _a[1];
      const z = _a[2];
      for (let d = 0; d < 3; d++) {
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
