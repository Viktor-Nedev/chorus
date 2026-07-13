import { ImprovedNoise } from 'three/examples/jsm/math/ImprovedNoise.js';

// Формации на партикъл-скулптурите. Всяка формация се генерира от ЕДИН И
// СЪЩ random поток (u, v) за индекс i — така частица i пътува по кохерентен
// път между формациите, вместо да телепортира през обема.

const noise = new ImprovedNoise();

// A: "Vocal ridge" — вълнов лист с два гребена
function waveRidgePoint(u, v) {
  const x = u * 3.2;
  const crest =
    1.4 * Math.exp(-(((u + 0.15) * 1.8) ** 2)) + 0.5 * Math.exp(-(((u - 0.8) * 2.6) ** 2));
  let y = crest * (1 - Math.abs(v) ** 1.5) - 0.8;
  y += 0.35 * noise.noise(u * 1.7, v * 1.7, 0.0) + 0.12 * noise.noise(u * 4.1, v * 4.1, 7.3);
  const z = v * 1.8 + 0.25 * noise.noise(u * 2.3, v * 2.3, 13.1);
  return [x, y, z];
}

const tiltCos = Math.cos(0.4);
const tiltSin = Math.sin(0.4);

// B: trefoil torus-knot лента (плат, не тръба)
function torusKnotPoint(u, v) {
  const t = (u * 0.5 + 0.5) * Math.PI * 2;
  const R = 1.5;
  const r = 0.6;
  const cx = Math.cos(2 * t) * (R + r * Math.cos(3 * t));
  const cy = Math.sin(2 * t) * (R + r * Math.cos(3 * t));
  const cz = r * Math.sin(3 * t);
  const rho = 0.1 + 0.45 * Math.abs(noise.noise(t * 0.9, v * 2.0, 3.0)) ** 2;
  const ang = v * Math.PI;
  const px = cx + rho * Math.cos(ang);
  const py = cy + rho * Math.sin(ang);
  const pz = cz + rho * Math.sin(ang * 1.7);
  const ry = py * tiltCos - pz * tiltSin;
  const rz = py * tiltSin + pz * tiltCos;
  return [px * 0.85, ry * 0.85, rz * 0.85];
}

// C: профил на лице (поглед наляво, -x). Силует = сума от гауси върху
// отдръпваща се черепна база, разтварящ се в плат зад силуета.
function faceProfileDepth(yn) {
  return (
    -0.55 * yn * yn +
    0.38 * Math.exp(-(((yn - 0.05) / 0.1) ** 2)) + // нос
    0.1 * Math.exp(-(((yn - 0.32) / 0.1) ** 2)) + // вежда
    -0.05 * Math.exp(-(((yn - 0.2) / 0.06) ** 2)) + // очна ямка
    -0.06 * Math.exp(-(((yn + 0.08) / 0.05) ** 2)) + // филтрум
    0.16 * Math.exp(-(((yn + 0.22) / 0.07) ** 2)) + // устни
    0.12 * Math.exp(-(((yn + 0.55) / 0.12) ** 2)) // брадичка
  );
}
function faceProfilePoint(u, v) {
  const yn = v;
  const w = u * u;
  const y = yn * 2.0;
  const x = -faceProfileDepth(yn) + w * 1.4 + 0.08 * noise.noise(yn * 3.0, w * 3.0, 21.0) - 0.3;
  const z =
    (u < 0 ? -1 : 1) * (0.04 + w * 0.9) + 0.35 * w * noise.noise(yn * 1.3, w * 2.2, 34.0);
  return [x, y, z];
}

// D: фронтално лице (поглед към зрителя) — рисунка от релефни гауси върху
// овален "диск" от частици.
function frontalFaceRelief(u, v) {
  const noseRidge = 0.35 * Math.exp(-((u / 0.12) ** 2) - (((v - 0.05) / 0.5) ** 2));
  const eyeL = -0.18 * Math.exp(-(((u + 0.32) / 0.14) ** 2) - (((v - 0.22) / 0.12) ** 2));
  const eyeR = -0.18 * Math.exp(-(((u - 0.32) / 0.14) ** 2) - (((v - 0.22) / 0.12) ** 2));
  const browL = 0.08 * Math.exp(-(((u + 0.32) / 0.18) ** 2) - (((v - 0.38) / 0.08) ** 2));
  const browR = 0.08 * Math.exp(-(((u - 0.32) / 0.18) ** 2) - (((v - 0.38) / 0.08) ** 2));
  const cheekL = 0.12 * Math.exp(-(((u + 0.5) / 0.28) ** 2) - (((v + 0.05) / 0.35) ** 2));
  const cheekR = 0.12 * Math.exp(-(((u - 0.5) / 0.28) ** 2) - (((v + 0.05) / 0.35) ** 2));
  const mouth = -0.08 * Math.exp(-((u / 0.35) ** 2) - (((v + 0.45) / 0.09) ** 2));
  const lipUpper = 0.05 * Math.exp(-((u / 0.32) ** 2) - (((v + 0.4) / 0.05) ** 2));
  const chin = 0.15 * Math.exp(-((u / 0.3) ** 2) - (((v + 0.8) / 0.22) ** 2));
  return noseRidge + eyeL + eyeR + browL + browR + cheekL + cheekR + mouth + lipUpper + chin;
}
const faceRotCos = Math.cos(0.5);
const faceRotSin = Math.sin(0.5);
function frontalFacePoint(u, v) {
  const faceW = 0.95 - 0.15 * Math.abs(v);
  const x = u * faceW;
  const y = v * 1.15;
  const depth = frontalFaceRelief(u, v) + 0.06 * noise.noise(u * 3.0 + 50, v * 3.0 + 50, 0.0);
  const z = depth * 1.6 - 0.2;
  // Лек завой (~28°) около Y — иначе релефът (по Z) е невидим за камера,
  // която гледа право по Z; така обемът на лицето прояви силует по X.
  const rx = x * faceRotCos + z * faceRotSin;
  const rz = -x * faceRotSin + z * faceRotCos;
  return [rx, y, rz];
}

// E: стилизирана стояща човешка фигура — обвивка от застъпващи се гауси
// по височина (v), с разделени крака под кръста.
function figureWidth(v) {
  const head = 0.22 * Math.exp(-(((v - 0.88) / 0.14) ** 2));
  const neck = 0.1 * Math.exp(-(((v - 0.68) / 0.08) ** 2));
  const shoulders = 0.5 * Math.exp(-(((v - 0.5) / 0.14) ** 2));
  const chest = 0.4 * Math.exp(-(((v - 0.15) / 0.35) ** 2));
  return Math.max(head, neck, shoulders, chest, 0.05);
}
function figurePoint(u, v) {
  const legZone = v < -0.12;
  let x;
  let w;
  if (legZone) {
    const legW = 0.11 * Math.exp(-(((v + 0.55) / 0.5) ** 2)) + 0.035;
    const side = u < 0 ? -1 : 1;
    x = side * (0.13 + Math.abs(u) * legW);
    w = legW;
  } else {
    w = figureWidth(v);
    x = u * w;
  }
  const y = v * 1.7;
  const z = 0.12 * w * noise.noise(u * 2 + 70, v * 2 + 70, 0.0);
  return [x, y, z];
}

// F: спирала/галактика — абстрактна, "естетична" форма (нарочно НЕ лице),
// подходяща за цветови акценти по радиус/ъгъл.
function spiralPoint(u, v) {
  const revs = 2.4;
  const t = u * 0.5 + 0.5; // 0..1
  const angle = t * revs * Math.PI * 2 + v * 0.4;
  const r = 0.2 + t * 1.7;
  const x = Math.cos(angle) * r;
  const y = Math.sin(angle) * r * 0.85;
  const z = v * 0.4 + 0.15 * noise.noise(u * 3 + 80, v * 3 + 80, 0.0);
  return [x, y, z];
}

// G: "хало" — леко вълнообразен пръстен/тор, приветлива уводна форма за
// новата About секция (нито лице, нито предишните форми).
function haloPoint(u, v) {
  const angle = u * Math.PI * 2;
  const ringR = 1.3 + 0.12 * Math.sin(v * 5.0 + angle * 2.0);
  const tubeR = 0.22 + 0.16 * Math.abs(v);
  const tubeAngle = v * Math.PI;
  const x = Math.cos(angle) * (ringR + tubeR * Math.cos(tubeAngle));
  const y = Math.sin(tubeAngle) * tubeR * 0.9;
  const z = Math.sin(angle) * (ringR + tubeR * Math.cos(tubeAngle)) * 0.4;
  return [x, y, z];
}

const FORMATION_BUILDERS = {
  wave: waveRidgePoint,
  knot: torusKnotPoint,
  faceProfile: faceProfilePoint,
  frontalFace: frontalFacePoint,
  figure: figurePoint,
  spiral: spiralPoint,
  halo: haloPoint,
};

// Ред на формациите за главната пътуваща скулптура — обвързан със секциите
// на страницата (Hero → About → Modes → Instruments → Gallery → Footer).
// Съзнателно НЕ поставяме лице на 3-та позиция (Modes) — там е спиралата.
const MAIN_SEQUENCE = ['wave', 'halo', 'spiral', 'figure', 'faceProfile', 'knot'];

function randomDir() {
  let dx = Math.random() * 2 - 1;
  let dy = Math.random() * 2 - 1;
  let dz = Math.random() * 2 - 1;
  const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
  if (len < 1e-4) return [0, 1, 0];
  return [dx / len, dy / len, dz / len];
}

// Пълният комплект от 5 формации за главната пътуваща скулптура — всичките
// с общ (u,v) поток за кохерентен морф. Редът съответства на MAIN_SEQUENCE
// (Hero/Modes/Instruments/Gallery/Footer), не на азбучен ред от речника.
export function buildFormations(count) {
  const slots = MAIN_SEQUENCE.map(() => new Float32Array(count * 3));
  const rand = new Float32Array(count * 4);
  const dir = new Float32Array(count * 3);

  for (let i = 0; i < count; i++) {
    const u = Math.random() * 2 - 1;
    const v = Math.random() * 2 - 1;

    for (let s = 0; s < MAIN_SEQUENCE.length; s++) {
      const [x, y, z] = FORMATION_BUILDERS[MAIN_SEQUENCE[s]](u, v);
      slots[s][i * 3] = x;
      slots[s][i * 3 + 1] = y;
      slots[s][i * 3 + 2] = z;
    }

    rand[i * 4] = 0.4 + Math.random() * 1.2; // размер
    rand[i * 4 + 1] = Math.random() * Math.PI * 2; // twinkle фаза
    rand[i * 4 + 2] = Math.random() * 100; // noise seed
    rand[i * 4 + 3] = Math.random(); // морф десинхрон

    const [dx, dy, dz] = randomDir();
    dir[i * 3] = dx;
    dir[i * 3 + 1] = dy;
    dir[i * 3 + 2] = dz;
  }

  return {
    posA: slots[0],
    posB: slots[1],
    posC: slots[2],
    posD: slots[3],
    posE: slots[4],
    posF: slots[5],
    rand,
    dir,
  };
}

// Единична статична формация — за декоративни партикъл акценти в другите
// секции на сайта (без morph цикъл, без scroll-разпръскване).
export function buildSingleFormation(name, count) {
  const builder = FORMATION_BUILDERS[name];
  if (!builder) throw new Error(`Unknown formation: ${name}`);
  const positions = new Float32Array(count * 3);
  const rand = new Float32Array(count * 4);

  for (let i = 0; i < count; i++) {
    const u = Math.random() * 2 - 1;
    const v = Math.random() * 2 - 1;
    const [x, y, z] = builder(u, v);
    positions[i * 3] = x;
    positions[i * 3 + 1] = y;
    positions[i * 3 + 2] = z;

    rand[i * 4] = 0.4 + Math.random() * 1.2;
    rand[i * 4 + 1] = Math.random() * Math.PI * 2;
    rand[i * 4 + 2] = Math.random() * 100;
    rand[i * 4 + 3] = Math.random();
  }

  return { positions, rand };
}
