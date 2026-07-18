// Аксесоари на героите (уши/рога/антена/ореол/мустаци) — допълнителни частици,
// закотвени в базис на главата (right = eyeR−eyeL, up = forehead−chin), затова
// следват позата ти. Локални координати (x=надясно, y=нагоре, z=напред) в
// единици "око-разстояние". При 'none' се скриват зад far-равнината.

export const ACCESSORY_COUNT = 2400;
const HIDDEN_Z = -1000;

const rand = (a, b) => a + Math.random() * (b - a);

// Точка в триъгълник (барицентрично)
function triPoint(A, B, C) {
  let u = Math.random(), v = Math.random();
  if (u + v > 1) { u = 1 - u; v = 1 - v; }
  const w = 1 - u - v;
  return [A[0] * w + B[0] * u + C[0] * v, A[1] * w + B[1] * u + C[1] * v, A[2] * w + B[2] * u + C[2] * v];
}

// Генерира локален template (ACCESSORY_COUNT × 3) за даден тип
function buildTemplate(type) {
  const t = new Float32Array(ACCESSORY_COUNT * 3);
  const set = (i, p) => { t[i * 3] = p[0]; t[i * 3 + 1] = p[1]; t[i * 3 + 2] = p[2]; };

  if (type === 'catEars') {
    for (let i = 0; i < ACCESSORY_COUNT; i++) {
      const left = i < ACCESSORY_COUNT / 2;
      const s = left ? -1 : 1;
      // триъгълно ухо: база (вътр/външ) + връх нагоре
      const A = [s * 0.35, 1.0, 0], B = [s * 1.0, 1.05, 0], C = [s * 0.72, 1.85, 0];
      set(i, triPoint(A, B, C));
    }
  } else if (type === 'horns') {
    for (let i = 0; i < ACCESSORY_COUNT; i++) {
      const s = i < ACCESSORY_COUNT / 2 ? -1 : 1;
      const tt = Math.random();
      const r = 0.16 * (1 - tt); // изтъняващ рог
      const cx = s * (0.4 + tt * 0.5);
      const cy = 1.0 + tt * 0.95;
      const cz = tt * 0.15;
      const a = Math.random() * Math.PI * 2;
      set(i, [cx + Math.cos(a) * r * s, cy + Math.sin(a) * r * 0.6, cz + Math.sin(a) * r]);
    }
  } else if (type === 'antenna') {
    const stalk = Math.floor(ACCESSORY_COUNT * 0.35);
    for (let i = 0; i < ACCESSORY_COUNT; i++) {
      if (i < stalk) {
        set(i, [rand(-0.03, 0.03), rand(1.0, 1.75), rand(-0.03, 0.03)]); // стълб
      } else {
        // топка на върха
        const a = Math.random() * Math.PI * 2, b = Math.acos(rand(-1, 1)), r = 0.18 * Math.cbrt(Math.random());
        set(i, [Math.sin(b) * Math.cos(a) * r, 1.85 + Math.cos(b) * r, Math.sin(b) * Math.sin(a) * r]);
      }
    }
  } else if (type === 'halo') {
    for (let i = 0; i < ACCESSORY_COUNT; i++) {
      const a = (i / ACCESSORY_COUNT) * Math.PI * 2;
      const R = 0.72, tube = 0.06;
      const ta = Math.random() * Math.PI * 2;
      set(i, [
        Math.cos(a) * (R + Math.cos(ta) * tube),
        1.55 + Math.sin(ta) * tube,
        Math.sin(a) * (R + Math.cos(ta) * tube),
      ]);
    }
  } else if (type === 'whiskers') {
    for (let i = 0; i < ACCESSORY_COUNT; i++) {
      const s = i % 2 === 0 ? -1 : 1;
      const row = (Math.floor(i / 2) % 3) - 1; // -1,0,1
      const tt = Math.random();
      set(i, [s * (0.25 + tt * 1.15), -0.15 + row * 0.16 - tt * 0.05, 0.35 + tt * 0.1]);
    }
  } else {
    for (let i = 0; i < ACCESSORY_COUNT; i++) set(i, [0, 0, HIDDEN_Z]);
  }
  return t;
}

const TEMPLATE_CACHE = {};
function template(type) {
  if (!TEMPLATE_CACHE[type]) TEMPLATE_CACHE[type] = buildTemplate(type);
  return TEMPLATE_CACHE[type];
}

const _rx = [0, 0, 0], _uy = [0, 0, 0], _fz = [0, 0, 0];
const norm = (v) => {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
};
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

/**
 * Записва аксесоарните частици в position array-а, започвайки от baseIndex.
 * @param {Float32Array} pos  position атрибут (main + accessory блокове)
 * @param {number} baseIndex  индекс на първата аксесоарна частица (не *3)
 * @param {string} type       тип аксесоар
 * @param {object} a          котвите от computeAnchors
 */
export function updateAccessories(pos, baseIndex, type, a) {
  const base = baseIndex * 3;
  if (!type || type === 'none' || !a) {
    for (let i = 0; i < ACCESSORY_COUNT; i++) {
      pos[base + i * 3] = 0;
      pos[base + i * 3 + 1] = 0;
      pos[base + i * 3 + 2] = HIDDEN_Z;
    }
    return;
  }
  const tpl = template(type);
  const scale = a.eyeDist;
  // Базис на главата
  const right = norm([a.eyeR[0] - a.eyeL[0], a.eyeR[1] - a.eyeL[1], a.eyeR[2] - a.eyeL[2]]);
  const up = norm([a.forehead ? 0 : 0, 1, 0]); // fallback
  // По-добър up от чело→брадичка (само y надеждно) → ползвай световното up,
  // после forward от right×up
  const worldUp = [0, 1, 0];
  const fwd = norm(cross(right, worldUp));
  const trueUp = norm(cross(fwd, right));
  _rx[0] = right[0]; _rx[1] = right[1]; _rx[2] = right[2];
  _uy[0] = trueUp[0]; _uy[1] = trueUp[1]; _uy[2] = trueUp[2];
  _fz[0] = fwd[0]; _fz[1] = fwd[1]; _fz[2] = fwd[2];
  void up;

  // Произход = център на очите
  const ox = a.centerX, oy = a.eyeCenterY, oz = (a.eyeL[2] + a.eyeR[2]) / 2;

  for (let i = 0; i < ACCESSORY_COUNT; i++) {
    const lx = tpl[i * 3], ly = tpl[i * 3 + 1], lz = tpl[i * 3 + 2];
    const wx = ox + (_rx[0] * lx + _uy[0] * ly + _fz[0] * lz) * scale;
    const wy = oy + (_rx[1] * lx + _uy[1] * ly + _fz[1] * lz) * scale;
    const wz = oz + (_rx[2] * lx + _uy[2] * ly + _fz[2] * lz) * scale;
    pos[base + i * 3] = wx;
    pos[base + i * 3 + 1] = wy;
    pos[base + i * 3 + 2] = wz;
  }
}
