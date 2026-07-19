// Процедурни character лица — РАЗПОЗНАВАЕМИ фронтално. Стратегия: плосък
// 2D layout в лицевата равнина (лек z-релеф само за обем) със СИЛУЕТ + ясни
// фичъри с ПО-ВИСОКА плътност (при additive blending → по-ярки, изпъкват).
// Всяко лице е rigged: региони mouth/eyeL/eyeR се задвижват от живите
// blendshapes (jaw/blink/smile) в шейдъра; цялото следва позата на главата.
//
// Локални координати: център между очите = (0,0,0); очи ~x±0.5; y нагоре.
// region: 0 skin · 1 mouth · 2 eyeL (x<0) · 3 eyeR (x>0)

export const REGION = { SKIN: 0, MOUTH: 1, EYE_L: 2, EYE_R: 3 };
const rnd = (a, b) => a + Math.random() * (b - a);

// Малък builder helper: пише в p/r и брои
function maker(p, r) {
  let i = 0;
  const cap = r.length;
  const put = (x, y, z, reg) => {
    if (i >= cap) return;
    const j = i * 3;
    p[j] = x; p[j + 1] = y; p[j + 2] = z || 0;
    r[i] = reg || 0;
    i++;
  };
  return {
    get i() { return i; },
    remaining: () => cap - i,
    // Пълен елипсовиден диск (силует запълване)
    ellipseFill(cx, cy, rx, ry, n, reg = 0, z = 0, zrelief = 0.15) {
      for (let k = 0; k < n; k++) {
        const a = Math.random() * Math.PI * 2;
        const rr = Math.sqrt(Math.random());
        const x = cx + Math.cos(a) * rr * rx, y = cy + Math.sin(a) * rr * ry;
        put(x, y, z + Math.cos(rr * 1.5) * zrelief + rnd(-0.02, 0.02), reg);
      }
    },
    // Плътен контур на елипса (силует ръб)
    ellipseOutline(cx, cy, rx, ry, n, reg = 0, z = 0) {
      for (let k = 0; k < n; k++) {
        const a = (k / n) * Math.PI * 2 + rnd(-0.03, 0.03);
        put(cx + Math.cos(a) * rx + rnd(-0.02, 0.02), cy + Math.sin(a) * ry + rnd(-0.02, 0.02), z, reg);
      }
    },
    triFill(A, B, C, n, reg = 0, z = 0) {
      for (let k = 0; k < n; k++) {
        let u = Math.random(), v = Math.random();
        if (u + v > 1) { u = 1 - u; v = 1 - v; }
        const w = 1 - u - v;
        put(A[0] * w + B[0] * u + C[0] * v, A[1] * w + B[1] * u + C[1] * v, (A[2] || z) * w + (B[2] || z) * u + (C[2] || z) * v + rnd(-0.02, 0.02), reg);
      }
    },
    // Запълнен изпъкнал многоъгълник (fan триангулация)
    polyFill(pts, n, reg = 0, z = 0) {
      const areas = [];
      let tot = 0;
      for (let t = 1; t < pts.length - 1; t++) {
        const [ax, ay] = pts[0], [bx, by] = pts[t], [cx, cy] = pts[t + 1];
        const ar = Math.abs((bx - ax) * (cy - ay) - (cx - ax) * (by - ay)) / 2;
        areas.push(ar); tot += ar;
      }
      for (let k = 0; k < n; k++) {
        let pick = Math.random() * tot, t = 0;
        while (t < areas.length - 1 && pick > areas[t]) { pick -= areas[t]; t++; }
        let u = Math.random(), v = Math.random();
        if (u + v > 1) { u = 1 - u; v = 1 - v; }
        const w = 1 - u - v;
        const A = pts[0], B = pts[t + 1], C = pts[t + 2];
        put(A[0] * w + B[0] * u + C[0] * v, A[1] * w + B[1] * u + C[1] * v, z + rnd(-0.03, 0.03), reg);
      }
    },
    // Крива с дебелина (за мустаци, уста, вежди, рога)
    curve(fn, n, thickness, reg = 0) {
      for (let k = 0; k < n; k++) {
        const t = Math.random();
        const [x, y, z] = fn(t);
        put(x + rnd(-thickness, thickness), y + rnd(-thickness, thickness), (z || 0) + rnd(-thickness, thickness), reg);
      }
    },
    line(A, B, n, thickness, reg = 0) {
      this.curve((t) => [A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, (A[2] || 0) + ((B[2] || 0) - (A[2] || 0)) * t], n, thickness, reg);
    },
    fillEllipseRest(cx, cy, rx, ry, reg = 0) {
      while (i < cap) {
        const a = Math.random() * Math.PI * 2, rr = Math.sqrt(Math.random());
        put(cx + Math.cos(a) * rr * rx, cy + Math.sin(a) * rr * ry, rnd(-0.1, 0.2), reg);
      }
    },
  };
}

const N = (frac, total) => Math.floor(total * frac);

// ── CAT: кръгла глава, едри триъгълни уши, мустаци ──
function catFace(c) {
  const m = maker(c.p, c.r), T = c.n;
  m.ellipseOutline(0, -0.05, 1.02, 0.98, N(0.14, T));
  m.ellipseFill(0, -0.05, 0.95, 0.92, N(0.14, T), 0, 0, 0.12);
  // Уши (голям триъгълник + розово вътрешно)
  m.triFill([-1.02, 0.5], [-0.32, 0.82], [-0.7, 1.85], N(0.08, T));
  m.triFill([1.02, 0.5], [0.32, 0.82], [0.7, 1.85], N(0.08, T));
  m.triFill([-0.82, 0.7], [-0.5, 0.85], [-0.68, 1.4], N(0.03, T));
  m.triFill([0.82, 0.7], [0.5, 0.85], [0.68, 1.4], N(0.03, T));
  // Очи — бадем + вертикална зеница (плътно)
  for (const [cx, reg] of [[-0.46, REGION.EYE_L], [0.46, REGION.EYE_R]]) {
    m.ellipseFill(cx, 0.08, 0.26, 0.17, N(0.055, T), reg, 0.45, 0.05);
    m.line([cx, -0.06, 0.5], [cx, 0.22, 0.5], N(0.012, T), 0.02, reg); // зеница
  }
  // Нос — обърнат триъгълник
  m.triFill([-0.13, -0.35, 0.5], [0.13, -0.35, 0.5], [0, -0.52, 0.5], N(0.025, T), REGION.MOUTH);
  // Уста "w"
  m.curve((t) => { const x = (t - 0.5) * 0.7; return [x, -0.62 - Math.abs(Math.sin(x * Math.PI * 3)) * 0.1, 0.5]; }, N(0.04, T), 0.025, REGION.MOUTH);
  // Мустаци
  for (const s of [-1, 1]) for (const yy of [-0.42, -0.52, -0.62]) {
    m.line([s * 0.28, yy, 0.45], [s * 1.55, yy + rnd(-0.06, 0.14), 0.2], N(0.012, T), 0.012);
  }
  m.fillEllipseRest(0, -0.05, 0.9, 0.88);
  return { positions: c.p, regions: c.r, rig: { eyeL: [-0.46, 0.08], eyeR: [0.46, 0.08], mouth: [0, -0.62] } };
}

// ── ALIEN: сълзовидна глава, огромни наклонени очи ──
function alienFace(c) {
  const m = maker(c.p, c.r), T = c.n;
  // Сълзовиден силует: широко теме → остра брадичка
  const headPt = (t) => {
    const a = t * Math.PI * 2;
    const w = 1.1 * (0.55 + 0.45 * Math.cos(a * 0.5) ** 2);
    const x = Math.sin(a) * (a < Math.PI ? 1.15 : 1.15);
    const y = 0.45 + Math.cos(a) * 1.25;
    // изостряне надолу
    const taper = y < 0 ? 1 + y * 0.35 : 1;
    return [Math.sin(a) * 1.15 * Math.max(0.15, taper), y, 0];
    void [w, x];
  };
  m.curve((t) => headPt(t), N(0.16, T), 0.03);
  // вътрешно запълване (рядко)
  for (let k = 0; k < N(0.14, T); k++) {
    const y = rnd(-1.05, 1.6);
    const taper = y < 0 ? Math.max(0.15, 1 + y * 0.4) : Math.max(0.3, 1 - (y - 0.4) * 0.25);
    const x = rnd(-1, 1) * 1.1 * taper;
    m.line([x, y, 0], [x, y, rnd(-0.1, 0.25)], 1, 0.01);
  }
  // ОГРОМНИ наклонени бадемови очи (доминиращи)
  for (const [cx, reg, tilt] of [[-0.5, REGION.EYE_L, 0.5], [0.5, REGION.EYE_R, -0.5]]) {
    for (let k = 0; k < N(0.16, T); k++) {
      const a = Math.random() * Math.PI * 2, rr = Math.sqrt(Math.random());
      const ex = Math.cos(a) * rr * 0.44, ey = Math.sin(a) * rr * 0.24;
      m.curve(() => [cx + ex * Math.cos(tilt) - ey * Math.sin(tilt), 0.15 + ex * Math.sin(tilt) + ey * Math.cos(tilt), 0.5], 1, 0.01, reg);
    }
  }
  // Ноздри + резка уста
  m.ellipseFill(-0.07, -0.5, 0.03, 0.05, N(0.008, T), 0.5, 0);
  m.ellipseFill(0.07, -0.5, 0.03, 0.05, N(0.008, T), 0.5, 0);
  m.curve((t) => [(t - 0.5) * 0.45, -0.82, 0.45], N(0.03, T), 0.02, REGION.MOUTH);
  m.fillEllipseRest(0, 0.3, 1.0, 1.1);
  return { positions: c.p, regions: c.r, rig: { eyeL: [-0.5, 0.15], eyeR: [0.5, 0.15], mouth: [0, -0.82] } };
}

// ── SKULL: череп + челюст, орбити, зъби ──
function skullFace(c) {
  const m = maker(c.p, c.r), T = c.n;
  // Череп (заоблено теме) + скули
  m.ellipseOutline(0, 0.35, 1.0, 0.92, N(0.12, T));
  m.ellipseFill(0, 0.35, 0.95, 0.88, N(0.1, T), 0, 0, 0.1);
  // Долна челюст (отделена, по-тясна)
  m.ellipseOutline(0, -0.75, 0.62, 0.55, N(0.06, T));
  m.ellipseFill(0, -0.7, 0.55, 0.48, N(0.05, T));
  // Орбити — дълбоки кръгли (плътен ръб + запълване = тъмни ями)
  for (const [cx, reg] of [[-0.42, REGION.EYE_L], [0.42, REGION.EYE_R]]) {
    m.ellipseOutline(cx, 0.15, 0.3, 0.3, N(0.05, T), 0.3);
    m.ellipseFill(cx, 0.15, 0.26, 0.26, N(0.05, T), reg, 0.2);
  }
  // Носна кухина — обърнат триъгълник
  m.triFill([-0.13, -0.15, 0.4], [0.13, -0.15, 0.4], [0, -0.5, 0.4], N(0.03, T));
  // Зъби — вертикални барчета (горен + долен ред)
  for (let t = 0; t < 7; t++) {
    const x = -0.48 + t * 0.16;
    m.line([x, -0.6, 0.45], [x, -0.9, 0.45], N(0.014, T), 0.03, REGION.MOUTH);
  }
  m.curve((t) => [(t - 0.5) * 1.05, -0.6, 0.45], N(0.02, T), 0.02, REGION.MOUTH);
  m.fillEllipseRest(0, 0.1, 0.95, 1.0);
  return { positions: c.p, regions: c.r, rig: { eyeL: [-0.42, 0.15], eyeR: [0.42, 0.15], mouth: [0, -0.75] } };
}

// ── ROBOT: правоъгълна глава, визьор-очи, уста-решетка, антена ──
function robotFace(c) {
  const m = maker(c.p, c.r), T = c.n;
  const W = 1.1, H = 1.2;
  // Правоъгълен силует (ръбове плътни)
  for (let k = 0; k < N(0.16, T); k++) {
    const e = Math.floor(Math.random() * 4);
    if (e === 0) m.line([-W, -H], [-W, H], 1, 0.03);
    else if (e === 1) m.line([W, -H], [W, H], 1, 0.03);
    else if (e === 2) m.line([-W, H], [W, H], 1, 0.03);
    else m.line([-W, -H], [W, -H], 1, 0.03);
  }
  m.polyFill([[-W, -H], [W, -H], [W, H], [-W, H]], N(0.14, T), 0, 0.05); // лице
  // Правоъгълни очи
  for (const [cx, reg] of [[-0.5, REGION.EYE_L], [0.5, REGION.EYE_R]]) {
    m.polyFill([[cx - 0.32, -0.02], [cx + 0.32, -0.02], [cx + 0.32, 0.32], [cx - 0.32, 0.32]], N(0.07, T), reg, 0.12);
  }
  // Уста-решетка
  for (let t = 0; t < 6; t++) {
    const x = -0.5 + t * 0.2;
    m.line([x, -0.62, 0.12], [x, -0.95, 0.12], N(0.02, T), 0.03, REGION.MOUTH);
  }
  m.line([-0.55, -0.62, 0.12], [0.55, -0.62, 0.12], N(0.015, T), 0.02, REGION.MOUTH);
  // Антена
  m.line([0, H, 0], [0, H + 0.5, 0], N(0.02, T), 0.03);
  m.ellipseFill(0, H + 0.6, 0.12, 0.12, N(0.02, T), 0, 0, 0.05);
  // Болтчета
  for (const [bx, by] of [[-W + 0.12, H - 0.12], [W - 0.12, H - 0.12], [-W + 0.12, -H + 0.12], [W - 0.12, -H + 0.12]])
    m.ellipseFill(bx, by, 0.07, 0.07, N(0.008, T), 0.1);
  // остатъка — рядко лице
  while (m.remaining() > 0) m.polyFill([[-W, -H], [W, -H], [W, H], [-W, H]], Math.min(m.remaining(), 500), 0, 0.03);
  return { positions: c.p, regions: c.r, rig: { eyeL: [-0.5, 0.15], eyeR: [0.5, 0.15], mouth: [0, -0.78] } };
}

// ── DEVIL: лице + два рога, ъглести вежди, брадичка ──
function devilFace(c) {
  const m = maker(c.p, c.r), T = c.n;
  m.ellipseOutline(0, -0.05, 0.95, 1.0, N(0.12, T));
  m.ellipseFill(0, -0.05, 0.88, 0.94, N(0.12, T), 0, 0, 0.12);
  // Рога — извити конуси нагоре-встрани
  for (const s of [-1, 1]) {
    m.curve((t) => [s * (0.5 + t * 0.55 + t * t * 0.2), 0.8 + t * 1.0, t * 0.1], N(0.07, T), 0.07 * 1);
  }
  // Ъглести вежди надолу към центъра
  m.line([-0.78, 0.42, 0.5], [-0.2, 0.2, 0.55], N(0.02, T), 0.03);
  m.line([0.78, 0.42, 0.5], [0.2, 0.2, 0.55], N(0.02, T), 0.03);
  // Наклонени очи
  for (const [cx, reg, tilt] of [[-0.46, REGION.EYE_L, -0.35], [0.46, REGION.EYE_R, 0.35]]) {
    for (let k = 0; k < N(0.055, T); k++) {
      const a = Math.random() * Math.PI * 2, rr = Math.sqrt(Math.random());
      const ex = Math.cos(a) * rr * 0.28, ey = Math.sin(a) * rr * 0.13;
      m.curve(() => [cx + ex * Math.cos(tilt) - ey * Math.sin(tilt), 0.08 + ex * Math.sin(tilt) + ey * Math.cos(tilt), 0.5], 1, 0.01, reg);
    }
  }
  // Ухилена крива уста
  m.curve((t) => { const x = (t - 0.5) * 1.1; return [x, -0.6 + x * x * 0.35, 0.5]; }, N(0.05, T), 0.03, REGION.MOUTH);
  // Козя брадичка
  m.triFill([-0.2, -0.92, 0.4], [0.2, -0.92, 0.4], [0, -1.5, 0.35], N(0.04, T));
  m.fillEllipseRest(0, -0.05, 0.85, 0.9);
  return { positions: c.p, regions: c.r, rig: { eyeL: [-0.46, 0.08], eyeR: [0.46, 0.08], mouth: [0, -0.58] } };
}

// ── GHOST: заоблено теме + вълниста опашка, кръгли очи, O уста ──
function ghostFace(c) {
  const m = maker(c.p, c.r), T = c.n;
  // Силует: горен купол + фестонирано дъно
  const ghostOutline = (t) => {
    const a = t * Math.PI; // 0..π горна дъга
    if (t < 0.5) {
      const aa = t * 2 * Math.PI; // цяла горна половина
      return [Math.cos(aa) * 0.98, 0.35 + Math.sin(aa) * 1.15, 0];
    }
    // дъно: вълни
    const u = (t - 0.5) * 2; // 0..1 отляво надясно долу
    const x = -0.98 + u * 1.96;
    const y = -0.8 + Math.abs(Math.sin(u * Math.PI * 3.5)) * 0.28 - 0.15;
    return [x, y, 0];
    void a;
  };
  m.curve((t) => ghostOutline(t), N(0.16, T), 0.03);
  // Запълване
  for (let k = 0; k < N(0.18, T); k++) {
    const y = rnd(-1.0, 1.4);
    const halfW = y > 0.35 ? Math.sqrt(Math.max(0, 1 - ((y - 0.35) / 1.15) ** 2)) * 0.98 : 0.95;
    m.line([rnd(-halfW, halfW), y, 0], [0, y, rnd(-0.1, 0.2)], 1, 0.01);
  }
  // Кръгли кухи очи
  for (const [cx, reg] of [[-0.4, REGION.EYE_L], [0.4, REGION.EYE_R]]) {
    m.ellipseFill(cx, 0.25, 0.19, 0.28, N(0.07, T), reg, 0.4, 0.05);
  }
  // O уста
  m.curve((t) => { const a = t * Math.PI * 2; return [Math.cos(a) * 0.22, -0.45 + Math.sin(a) * 0.28, 0.45]; }, N(0.05, T), 0.03, REGION.MOUTH);
  m.fillEllipseRest(0, 0.1, 0.9, 1.1);
  return { positions: c.p, regions: c.r, rig: { eyeL: [-0.4, 0.25], eyeR: [0.4, 0.25], mouth: [0, -0.45] } };
}

export const CHARACTER_BUILDERS = { cat: catFace, alien: alienFace, skull: skullFace, robot: robotFace, devil: devilFace, ghost: ghostFace };

const CACHE = {};
export function buildCharacter(name, count) {
  const key = `${name}:${count}`;
  if (!CACHE[key]) {
    const builder = CHARACTER_BUILDERS[name];
    if (!builder) return null;
    CACHE[key] = builder({ p: new Float32Array(count * 3), r: new Float32Array(count), n: count });
  }
  return CACHE[key];
}
