// Процедурни character лица — СЪВСЕМ различни форми (котка, извънземно,
// череп, робот, дявол, призрак), не деформации на потребителското лице.
// Всяко лице е rigged: региони mouth/eyeL/eyeR се задвижват в шейдъра от
// живите blendshapes (jawOpen/blink/smile), а цялата глава следва позата.
//
// Локални координати: центърът между очите е (0,0,0); очите са на x ±0.5;
// 1 единица ≈ разстоянието между очите на потребителя (мащабира се в шейдъра).
//
// region: 0 = skin, 1 = mouth, 2 = eyeL (x<0), 3 = eyeR (x>0)

export const REGION = { SKIN: 0, MOUTH: 1, EYE_L: 2, EYE_R: 3 };

const rnd = (a, b) => a + Math.random() * (b - a);

// ── Семплери ──
function ellipsoidShell(out, reg, i0, n, cx, cy, cz, rx, ry, rz, region = 0, frontBias = 0.65) {
  for (let i = 0; i < n; i++) {
    const th = Math.random() * Math.PI * 2;
    let ph = Math.acos(rnd(-1, 1));
    const j = (i0 + i) * 3;
    let z = Math.cos(ph);
    // Предна пристрастност: повечето частици на видимата (z+) страна
    if (Math.random() < frontBias) z = Math.abs(z);
    const s = Math.sin(ph);
    out[j] = cx + rx * s * Math.cos(th);
    out[j + 1] = cy + ry * s * Math.sin(th);
    out[j + 2] = cz + rz * z * 0.55;
    reg[i0 + i] = region;
  }
}

function diskFill(out, reg, i0, n, cx, cy, cz, rx, ry, region = 0, tilt = 0) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    const r = Math.sqrt(Math.random());
    const j = (i0 + i) * 3;
    const x = Math.cos(a) * r * rx;
    const y = Math.sin(a) * r * ry;
    out[j] = cx + x * Math.cos(tilt) - y * Math.sin(tilt);
    out[j + 1] = cy + x * Math.sin(tilt) + y * Math.cos(tilt);
    out[j + 2] = cz + rnd(-0.02, 0.05);
    reg[i0 + i] = region;
  }
}

function triFill(out, reg, i0, n, A, B, C, region = 0) {
  for (let i = 0; i < n; i++) {
    let u = Math.random(), v = Math.random();
    if (u + v > 1) { u = 1 - u; v = 1 - v; }
    const w = 1 - u - v;
    const j = (i0 + i) * 3;
    out[j] = A[0] * w + B[0] * u + C[0] * v;
    out[j + 1] = A[1] * w + B[1] * u + C[1] * v;
    out[j + 2] = (A[2] || 0) * w + (B[2] || 0) * u + (C[2] || 0) * v + rnd(-0.02, 0.02);
    reg[i0 + i] = region;
  }
}

function lineTube(out, reg, i0, n, A, B, thickness = 0.02, region = 0) {
  for (let i = 0; i < n; i++) {
    const t = Math.random();
    const j = (i0 + i) * 3;
    out[j] = A[0] + (B[0] - A[0]) * t + rnd(-thickness, thickness);
    out[j + 1] = A[1] + (B[1] - A[1]) * t + rnd(-thickness, thickness);
    out[j + 2] = (A[2] || 0) + ((B[2] || 0) - (A[2] || 0)) * t + rnd(-thickness, thickness);
    reg[i0 + i] = region;
  }
}

function curveTube(out, reg, i0, n, fn, thickness = 0.03, region = 0) {
  for (let i = 0; i < n; i++) {
    const t = Math.random();
    const [x, y, z] = fn(t);
    const j = (i0 + i) * 3;
    out[j] = x + rnd(-thickness, thickness);
    out[j + 1] = y + rnd(-thickness, thickness);
    out[j + 2] = (z || 0) + rnd(-thickness, thickness);
    reg[i0 + i] = region;
  }
}

// ── Характери ──
// Всеки връща { positions, regions, rig: {eyeL, eyeR, mouth} } за count частици.

function catFace(count) {
  const p = new Float32Array(count * 3);
  const r = new Float32Array(count);
  let i = 0;
  const n = (frac) => Math.floor(count * frac);

  // Глава — широк елипсоид
  ellipsoidShell(p, r, i, n(0.42), 0, -0.05, 0, 1.25, 1.0, 0.8); i += n(0.42);
  // Муцуна
  ellipsoidShell(p, r, i, n(0.1), 0, -0.55, 0.35, 0.55, 0.4, 0.4); i += n(0.1);
  // Уши (триъгълници с вътрешно ухо)
  triFill(p, r, i, n(0.08), [-1.05, 0.55], [-0.35, 0.85], [-0.8, 1.7]); i += n(0.08);
  triFill(p, r, i, n(0.08), [1.05, 0.55], [0.35, 0.85], [0.8, 1.7]); i += n(0.08);
  triFill(p, r, i, n(0.03), [-0.85, 0.75], [-0.55, 0.85], [-0.75, 1.35]); i += n(0.03);
  triFill(p, r, i, n(0.03), [0.85, 0.75], [0.55, 0.85], [0.75, 1.35]); i += n(0.03);
  // Очи — бадеми
  diskFill(p, r, i, n(0.06), -0.5, 0.05, 0.5, 0.3, 0.18, REGION.EYE_L, 0.25); i += n(0.06);
  diskFill(p, r, i, n(0.06), 0.5, 0.05, 0.5, 0.3, 0.18, REGION.EYE_R, -0.25); i += n(0.06);
  // Нос — триъгълник
  triFill(p, r, i, n(0.02), [-0.14, -0.42, 0.55], [0.14, -0.42, 0.55], [0, -0.6, 0.6]); i += n(0.02);
  // Уста — "w" под носа
  curveTube(p, r, i, n(0.05), (t) => {
    const x = (t - 0.5) * 0.8;
    const y = -0.72 - Math.abs(Math.sin(x * Math.PI * 2.4)) * 0.12;
    return [x, y, 0.5];
  }, 0.03, REGION.MOUTH); i += n(0.05);
  // Мустаци
  for (const [sy, sx] of [[-0.55, -1], [-0.65, -1], [-0.75, -1], [-0.55, 1], [-0.65, 1], [-0.75, 1]]) {
    lineTube(p, r, i, n(0.011), [sx * 0.35, sy, 0.45], [sx * 1.5, sy + rnd(-0.08, 0.12), 0.25], 0.015);
    i += n(0.011);
  }
  fillRest(p, r, i, count, 0, -0.05, 1.25, 1.0);
  return { positions: p, regions: r, rig: { eyeL: [-0.5, 0.05], eyeR: [0.5, 0.05], mouth: [0, -0.72] } };
}

function alienFace(count) {
  const p = new Float32Array(count * 3);
  const r = new Float32Array(count);
  let i = 0;
  const n = (f) => Math.floor(count * f);
  // Крушовиден череп: огромен купол + тясна брадичка
  ellipsoidShell(p, r, i, n(0.45), 0, 0.45, 0, 1.15, 1.05, 0.75); i += n(0.45);
  ellipsoidShell(p, r, i, n(0.15), 0, -0.75, 0.1, 0.5, 0.75, 0.5); i += n(0.15);
  // Огромни наклонени очи
  diskFill(p, r, i, n(0.13), -0.52, 0.05, 0.5, 0.42, 0.22, REGION.EYE_L, 0.5); i += n(0.13);
  diskFill(p, r, i, n(0.13), 0.52, 0.05, 0.5, 0.42, 0.22, REGION.EYE_R, -0.5); i += n(0.13);
  // Мъничка уста — резка
  curveTube(p, r, i, n(0.04), (t) => [(t - 0.5) * 0.5, -1.05, 0.4], 0.025, REGION.MOUTH); i += n(0.04);
  // Ноздри — 2 точици
  diskFill(p, r, i, n(0.01), -0.08, -0.55, 0.5, 0.04, 0.05); i += n(0.01);
  diskFill(p, r, i, n(0.01), 0.08, -0.55, 0.5, 0.04, 0.05); i += n(0.01);
  fillRest(p, r, i, count, 0, 0.3, 1.15, 1.1);
  return { positions: p, regions: r, rig: { eyeL: [-0.52, 0.05], eyeR: [0.52, 0.05], mouth: [0, -1.05] } };
}

function skullFace(count) {
  const p = new Float32Array(count * 3);
  const r = new Float32Array(count);
  let i = 0;
  const n = (f) => Math.floor(count * f);
  // Череп + челюст
  ellipsoidShell(p, r, i, n(0.42), 0, 0.35, 0, 1.05, 0.95, 0.75); i += n(0.42);
  ellipsoidShell(p, r, i, n(0.1), 0, -0.85, 0, 0.72, 0.5, 0.5); i += n(0.1);
  // Очни орбити — плътни тъмни дискове (гъсти частици по ръба)
  for (const [cx, region, tilt] of [[-0.45, REGION.EYE_L, 0.15], [0.45, REGION.EYE_R, -0.15]]) {
    diskFill(p, r, i, n(0.09), cx, 0.1, 0.45, 0.3, 0.26, region, tilt); i += n(0.09);
  }
  // Носна кухина — обърнат триъгълник
  triFill(p, r, i, n(0.03), [-0.14, -0.3, 0.5], [0.14, -0.3, 0.5], [0, -0.62, 0.5]); i += n(0.03);
  // Зъби — решетка
  for (let t = 0; t < 6; t++) {
    const x = -0.45 + t * 0.18;
    lineTube(p, r, i, n(0.02), [x, -0.85, 0.45], [x, -1.15, 0.45], 0.035, REGION.MOUTH);
    i += n(0.02);
  }
  curveTube(p, r, i, n(0.03), (t) => [(t - 0.5) * 1.1, -0.85, 0.45], 0.02, REGION.MOUTH); i += n(0.03);
  fillRest(p, r, i, count, 0, 0.2, 1.05, 1.0);
  return { positions: p, regions: r, rig: { eyeL: [-0.45, 0.1], eyeR: [0.45, 0.1], mouth: [0, -0.95] } };
}

function robotFace(count) {
  const p = new Float32Array(count * 3);
  const r = new Float32Array(count);
  let i = 0;
  const n = (f) => Math.floor(count * f);
  // Кутия — рамки (ръбове + лице)
  const W = 1.15, H = 1.25, D = 0.5;
  for (let k = 0; k < n(0.34); k++) {
    // точки по повърхността на предната плоча + ръбове
    const j = (i + k) * 3;
    if (Math.random() < 0.55) {
      p[j] = rnd(-W, W); p[j + 1] = rnd(-H, H); p[j + 2] = D + rnd(-0.02, 0.02);
    } else {
      const edge = Math.floor(Math.random() * 4);
      if (edge === 0) { p[j] = -W; p[j + 1] = rnd(-H, H); }
      else if (edge === 1) { p[j] = W; p[j + 1] = rnd(-H, H); }
      else if (edge === 2) { p[j] = rnd(-W, W); p[j + 1] = -H; }
      else { p[j] = rnd(-W, W); p[j + 1] = H; }
      p[j + 2] = rnd(-0.1, D);
    }
    r[i + k] = 0;
  }
  i += n(0.34);
  // Визьор-очи: правоъгълни блокове
  for (const [cx, region] of [[-0.5, REGION.EYE_L], [0.5, REGION.EYE_R]]) {
    for (let k = 0; k < n(0.08); k++) {
      const j = (i + k) * 3;
      p[j] = cx + rnd(-0.33, 0.33);
      p[j + 1] = 0.15 + rnd(-0.16, 0.16);
      p[j + 2] = D + 0.06;
      r[i + k] = region;
    }
    i += n(0.08);
  }
  // Уста — решетка от вертикални барове
  for (let t = 0; t < 5; t++) {
    const x = -0.44 + t * 0.22;
    lineTube(p, r, i, n(0.024), [x, -0.6, D + 0.05], [x, -0.95, D + 0.05], 0.03, REGION.MOUTH);
    i += n(0.024);
  }
  // Антена
  lineTube(p, r, i, n(0.02), [0, H, 0], [0, H + 0.55, 0], 0.03); i += n(0.02);
  ellipsoidShell(p, r, i, n(0.02), 0, H + 0.65, 0, 0.12, 0.12, 0.12, 0, 0.5); i += n(0.02);
  // Болтове по ъглите
  for (const [bx, by] of [[-W + 0.15, H - 0.15], [W - 0.15, H - 0.15], [-W + 0.15, -H + 0.15], [W - 0.15, -H + 0.15]]) {
    diskFill(p, r, i, n(0.008), bx, by, D + 0.03, 0.07, 0.07); i += n(0.008);
  }
  fillRest(p, r, i, count, 0, 0, W, H);
  return { positions: p, regions: r, rig: { eyeL: [-0.5, 0.15], eyeR: [0.5, 0.15], mouth: [0, -0.78] } };
}

function devilFace(count) {
  const p = new Float32Array(count * 3);
  const r = new Float32Array(count);
  let i = 0;
  const n = (f) => Math.floor(count * f);
  ellipsoidShell(p, r, i, n(0.42), 0, -0.05, 0, 1.05, 1.05, 0.75); i += n(0.42);
  // Рога — извити конуси
  for (const s of [-1, 1]) {
    curveTube(p, r, i, n(0.06), (t) => [
      s * (0.55 + t * 0.45 + t * t * 0.2),
      0.85 + t * 0.95,
      t * 0.1,
    ], 0.09 * (1 - 0.7 * 0), 0); i += n(0.06);
  }
  // Гневни наклонени очи
  diskFill(p, r, i, n(0.06), -0.48, 0.08, 0.5, 0.3, 0.14, REGION.EYE_L, -0.35); i += n(0.06);
  diskFill(p, r, i, n(0.06), 0.48, 0.08, 0.5, 0.3, 0.14, REGION.EYE_R, 0.35); i += n(0.06);
  // Вежди — резки надолу към центъра
  lineTube(p, r, i, n(0.02), [-0.75, 0.42, 0.5], [-0.22, 0.22, 0.55], 0.03); i += n(0.02);
  lineTube(p, r, i, n(0.02), [0.75, 0.42, 0.5], [0.22, 0.22, 0.55], 0.03); i += n(0.02);
  // Ухилена крива уста
  curveTube(p, r, i, n(0.05), (t) => {
    const x = (t - 0.5) * 1.1;
    return [x, -0.65 + x * x * 0.35, 0.5];
  }, 0.035, REGION.MOUTH); i += n(0.05);
  // Козя брадичка
  triFill(p, r, i, n(0.04), [-0.22, -0.95, 0.4], [0.22, -0.95, 0.4], [0, -1.55, 0.35]); i += n(0.04);
  fillRest(p, r, i, count, 0, -0.05, 1.05, 1.05);
  return { positions: p, regions: r, rig: { eyeL: [-0.48, 0.08], eyeR: [0.48, 0.08], mouth: [0, -0.6] } };
}

function ghostFace(count) {
  const p = new Float32Array(count * 3);
  const r = new Float32Array(count);
  let i = 0;
  const n = (f) => Math.floor(count * f);
  // Тяло-капка: купол горе + вълниста опашка долу
  ellipsoidShell(p, r, i, n(0.4), 0, 0.15, 0, 1.0, 1.0, 0.7); i += n(0.4);
  for (let k = 0; k < n(0.24); k++) {
    const j = (i + k) * 3;
    const t = Math.random();
    const y = -0.6 - t * 1.25;
    const wave = Math.sin(t * Math.PI * 3) * 0.15 * t;
    const x = rnd(-1, 1) * (1.0 - t * 0.45);
    p[j] = x + wave;
    p[j + 1] = y;
    p[j + 2] = rnd(-0.2, 0.35) * (1 - t * 0.5);
    r[i + k] = 0;
  }
  i += n(0.24);
  // Кухи овални очи
  diskFill(p, r, i, n(0.07), -0.42, 0.2, 0.45, 0.2, 0.3, REGION.EYE_L); i += n(0.07);
  diskFill(p, r, i, n(0.07), 0.42, 0.2, 0.45, 0.2, 0.3, REGION.EYE_R); i += n(0.07);
  // "О" уста
  curveTube(p, r, i, n(0.05), (t) => {
    const a = t * Math.PI * 2;
    return [Math.cos(a) * 0.22, -0.5 + Math.sin(a) * 0.28, 0.45];
  }, 0.03, REGION.MOUTH); i += n(0.05);
  fillRest(p, r, i, count, 0, 0, 1.0, 1.2);
  return { positions: p, regions: r, rig: { eyeL: [-0.42, 0.2], eyeR: [0.42, 0.2], mouth: [0, -0.5] } };
}

// Запълва остатъчния бюджет частици (закръгляния) по повърхността на главата
function fillRest(p, r, i, count, cx, cy, rx, ry) {
  for (; i < count; i++) {
    const a = Math.random() * Math.PI * 2;
    const j = i * 3;
    p[j] = cx + Math.cos(a) * rx * rnd(0.9, 1.02);
    p[j + 1] = cy + Math.sin(a) * ry * rnd(0.9, 1.02);
    p[j + 2] = rnd(-0.1, 0.3);
    r[i] = 0;
  }
}

export const CHARACTER_BUILDERS = {
  cat: catFace,
  alien: alienFace,
  skull: skullFace,
  robot: robotFace,
  devil: devilFace,
  ghost: ghostFace,
};

const CACHE = {};
export function buildCharacter(name, count) {
  const key = `${name}:${count}`;
  if (!CACHE[key]) {
    const builder = CHARACTER_BUILDERS[name];
    if (!builder) return null;
    CACHE[key] = builder(count);
  }
  return CACHE[key];
}
