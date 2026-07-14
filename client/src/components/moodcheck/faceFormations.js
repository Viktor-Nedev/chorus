// Параметрични "настроенчески" лица за Aura режима на Mood Check.
//
// КРИТИЧНО: всичките 6 формации + ambient облакът се генерират от ЕДИН И СЪЩ
// (u,v) sample поток — така частица i е една и съща "точка от лицето" във
// всяка формация и морфовете се четат като промяна на изражението, а не
// като шум. Затова seed-натият RNG и makeSharedSamples() са отделени.

const FACE_SCALE = 1.9; // v ∈ [-1,1] → ~3.8 световни единици височина

// Прост seed-нат RNG (mulberry32) — детерминистичен bake
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Box–Muller за гаусов jitter (bake-time only)
function makeGauss(rng) {
  let spare = null;
  return function () {
    if (spare !== null) {
      const v = spare;
      spare = null;
      return v;
    }
    let u1 = 0;
    while (u1 === 0) u1 = rng();
    const u2 = rng();
    const mag = Math.sqrt(-2.0 * Math.log(u1));
    spare = mag * Math.sin(2.0 * Math.PI * u2);
    return mag * Math.cos(2.0 * Math.PI * u2);
  };
}

// Споделени (u,v) sample-и върху овалния диск на лицето.
export function makeSharedSamples(count, seed = 1337) {
  const rng = mulberry32(seed);
  const samples = new Float32Array(count * 2);
  let placed = 0;
  while (placed < count) {
    const u = rng() * 2 - 1;
    const v = rng() * 2 - 1;
    // овална граница (леко по-тясна долу — брадичка)
    const oval = (u / 0.85) ** 2 + (v / 1.0) ** 2;
    if (oval > 1) continue;
    samples[placed * 2] = u;
    samples[placed * 2 + 1] = v;
    placed++;
  }
  return samples;
}

export const EMOTION_FACE_PARAMS = {
  neutral: {
    faceAspect: 1.0, mouthCurve: 0.0, mouthWidth: 1.0, mouthOpen: 0,
    browHeight: 0, browAngle: 0, eyeAperture: 1.0, eyeSize: 1.0, cheekRaise: 0, jawDrop: 0,
  },
  happy: {
    faceAspect: 1.08, mouthCurve: 0.22, mouthWidth: 1.25, mouthOpen: 0,
    browHeight: 0.02, browAngle: 0, eyeAperture: 0.75, eyeSize: 1.0, cheekRaise: 0.12, jawDrop: 0,
  },
  sad: {
    faceAspect: 0.98, mouthCurve: -0.16, mouthWidth: 0.85, mouthOpen: 0,
    browHeight: 0.04, browAngle: 0.18, eyeAperture: 0.85, eyeSize: 0.95, cheekRaise: -0.05, jawDrop: 0,
  },
  angry: {
    faceAspect: 1.0, mouthCurve: -0.1, mouthWidth: 0.9, mouthOpen: 0,
    browHeight: -0.06, browAngle: -0.22, eyeAperture: 0.55, eyeSize: 0.95, cheekRaise: 0, jawDrop: 0,
  },
  surprised: {
    faceAspect: 0.96, mouthCurve: 0.0, mouthWidth: 1.0, mouthOpen: 0.85,
    browHeight: 0.12, browAngle: 0.05, eyeAperture: 1.45, eyeSize: 1.15, cheekRaise: 0, jawDrop: 0.15,
  },
  focused: {
    faceAspect: 0.94, mouthCurve: -0.04, mouthWidth: 0.9, mouthOpen: 0,
    browHeight: -0.03, browAngle: -0.08, eyeAperture: 0.6, eyeSize: 0.95, cheekRaise: 0, jawDrop: 0,
  },
};

// Релеф на лицето от суми на гауси, параметризиран по емоция.
function faceRelief(u, v, p) {
  const noseRidge = 0.35 * Math.exp(-((u / 0.12) ** 2) - (((v - 0.05) / 0.5) ** 2));

  // Очи — вертикална σ × eyeAperture, обща σ × eyeSize
  const eyeSigU = 0.14 * p.eyeSize;
  const eyeSigV = 0.12 * p.eyeSize * p.eyeAperture;
  const eyeL = -0.18 * Math.exp(-(((u + 0.32) / eyeSigU) ** 2) - (((v - 0.22) / eyeSigV) ** 2));
  const eyeR = -0.18 * Math.exp(-(((u - 0.32) / eyeSigU) ** 2) - (((v - 0.22) / eyeSigV) ** 2));

  // Вежди — височина + ъгъл (позитивен ъгъл = вдигнати вътрешни краища = тъга)
  const browHalf = 0.18;
  const innerLiftL = p.browAngle * (1 - Math.abs(u + 0.32) / browHalf);
  const innerLiftR = p.browAngle * (1 - Math.abs(u - 0.32) / browHalf);
  const vBrowL = 0.38 + p.browHeight + (u > -0.5 && u < -0.14 ? innerLiftL * (u > -0.32 ? 1 : 0.3) : 0);
  const vBrowR = 0.38 + p.browHeight + (u > 0.14 && u < 0.5 ? innerLiftR * (u < 0.32 ? 1 : 0.3) : 0);
  const browL = 0.08 * Math.exp(-(((u + 0.32) / 0.18) ** 2) - (((v - vBrowL) / 0.08) ** 2));
  const browR = 0.08 * Math.exp(-(((u - 0.32) / 0.18) ** 2) - (((v - vBrowR) / 0.08) ** 2));

  // Бузи
  const cheekAmp = 0.12 + p.cheekRaise;
  const cheekL = cheekAmp * Math.exp(-(((u + 0.5) / 0.28) ** 2) - (((v + 0.05) / 0.35) ** 2));
  const cheekR = cheekAmp * Math.exp(-(((u - 0.5) / 0.28) ** 2) - (((v + 0.05) / 0.35) ** 2));

  // Уста
  let mouth;
  const vMouth = -0.45;
  if (p.mouthOpen > 0) {
    // Отворена "О" уста — елиптичен пръстен
    const rx = 0.14 * p.mouthWidth;
    const ry = p.mouthOpen * 0.2;
    const dE = Math.sqrt((u / rx) ** 2 + ((v - vMouth) / ry) ** 2);
    mouth = 0.14 * Math.exp(-(((dE - 1) / 0.25) ** 2)) - 0.1 * Math.exp(-((dE / 0.6) ** 2));
  } else {
    // Устна линия — центърът следва крива (усмивка/тъга)
    const halfW = 0.35 * p.mouthWidth;
    const vM = vMouth + p.mouthCurve * ((u / halfW) ** 2 - 0.5);
    const inMouth = Math.abs(u) < halfW * 1.3 ? 1 : Math.exp(-(((Math.abs(u) - halfW * 1.3) / 0.08) ** 2));
    mouth =
      (-0.08 * Math.exp(-((u / halfW) ** 2) - (((v - vM) / 0.09) ** 2)) +
        0.05 * Math.exp(-((u / (halfW * 0.9)) ** 2) - (((v - vM - 0.06) / 0.05) ** 2))) *
      inMouth;
  }

  const chin = 0.15 * Math.exp(-((u / 0.3) ** 2) - (((v + 0.8) / 0.22) ** 2));

  return noseRidge + eyeL + eyeR + browL + browR + cheekL + cheekR + mouth + chin;
}

const faceRotCos = Math.cos(0.42);
const faceRotSin = Math.sin(0.42);

// Изгражда една емоционална формация върху споделените samples.
export function buildFaceFormation(params, samples) {
  const count = samples.length / 2;
  const positions = new Float32Array(count * 3);

  for (let i = 0; i < count; i++) {
    let u = samples[i * 2];
    let v = samples[i * 2 + 1];

    // jaw drop — разтегли долната половина
    if (params.jawDrop > 0 && v < 0) v *= 1 + params.jawDrop;

    const uA = u * params.faceAspect;
    const faceW = 0.95 - 0.15 * Math.abs(v);
    const x0 = uA * faceW;
    const y0 = v * 1.15;
    const depth = faceRelief(uA, v, params);
    const z0 = depth * 1.6 - 0.2;

    // Лек Y-завой (~24°), за да е видим релефът, + мащаб до целевата височина
    const rx = x0 * faceRotCos + z0 * faceRotSin;
    const rz = -x0 * faceRotSin + z0 * faceRotCos;

    positions[i * 3] = rx * FACE_SCALE;
    positions[i * 3 + 1] = y0 * FACE_SCALE;
    positions[i * 3 + 2] = rz * FACE_SCALE;
  }

  return positions;
}

// Ambient сферична обвивка — където частиците "почиват" без детектирано лице.
export function buildAmbient(count, seed = 4242) {
  const rng = mulberry32(seed);
  const gauss = makeGauss(rng);
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    let dx = gauss();
    let dy = gauss();
    let dz = gauss();
    const len = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
    const r = 2.4 + gauss() * 0.35;
    positions[i * 3] = (dx / len) * r;
    positions[i * 3 + 1] = (dy / len) * r * 0.75;
    positions[i * 3 + 2] = (dz / len) * r * 0.6;
  }
  return positions;
}

// Фин повърхностен jitter за Mirror режима — при barycentric семплиране
// частиците вече лежат върху повърхността на mesh-а, затова е нужен само
// микроскопичен шум (σ=0.008), за да не изглеждат триъгълниците плоски.
export function buildJitter(count, seed = 777) {
  const rng = mulberry32(seed);
  const gauss = makeGauss(rng);
  const jitter = new Float32Array(count * 3);
  const sigma = 0.008;
  for (let i = 0; i < count; i++) {
    jitter[i * 3] = gauss() * sigma;
    jitter[i * 3 + 1] = gauss() * sigma;
    jitter[i * 3 + 2] = gauss() * sigma * 0.5;
  }
  return jitter;
}

// Барицентрично обвързване: всяка частица → случаен триъгълник от FaceMesh
// триангулацията + случайни барицентрични тегла (равномерни в триъгълника
// чрез reflection trick). areaWeights е опционален Float32Array с тегло на
// триъгълник (кумулативно семплиране) — за равномерно покритие по площ.
export function buildTriangleBinding(count, triangulation, seed = 999, areaWeights = null) {
  const rng = mulberry32(seed);
  const triCount = triangulation.length / 3;
  const tri = new Float32Array(count * 3);
  const bary = new Float32Array(count * 3);

  // Кумулативна дистрибуция при area weights
  let cdf = null;
  if (areaWeights) {
    cdf = new Float32Array(triCount);
    let acc = 0;
    for (let t = 0; t < triCount; t++) {
      acc += areaWeights[t];
      cdf[t] = acc;
    }
    const total = acc || 1;
    for (let t = 0; t < triCount; t++) cdf[t] /= total;
  }

  for (let i = 0; i < count; i++) {
    let t;
    if (cdf) {
      // binary search в CDF
      const r = rng();
      let lo = 0;
      let hi = triCount - 1;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (cdf[mid] < r) lo = mid + 1;
        else hi = mid;
      }
      t = lo;
    } else {
      t = Math.floor(rng() * triCount);
    }

    tri[i * 3] = triangulation[t * 3];
    tri[i * 3 + 1] = triangulation[t * 3 + 1];
    tri[i * 3 + 2] = triangulation[t * 3 + 2];

    // Равномерна точка в триъгълник: (u,v) с reflection ако u+v>1
    let u = rng();
    let v = rng();
    if (u + v > 1) {
      u = 1 - u;
      v = 1 - v;
    }
    bary[i * 3] = 1 - u - v;
    bary[i * 3 + 1] = u;
    bary[i * 3 + 2] = v;
  }

  return { tri, bary };
}
