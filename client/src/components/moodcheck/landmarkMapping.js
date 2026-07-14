// Преобразуване на MediaPipe нормализирани face landmarks (x,y ∈ [0..1],
// y надолу, z към камерата отрицателно) → световни координати на сцената
// (лице ~3.8 units високо, центрирано, огледално като огледало).
//
// Стабилизация на две скорости:
//  - БАВНА EMA (τ=250ms) върху котвата (върха на носа) и мащаба — спокойно
//    кадриране; бързо движение на потребителя "накланя" лицето за миг
//    (фин параллакс), после се центрира обратно.
//  - БЪРЗА EMA (τ=50ms) на всеки landmark — убива детекторския шум, но
//    запазва мигания (~150ms) и движение на устните видими.

export const LM_COUNT = 478;
const NOSE_TIP = 1;
const EYE_L = 33; // външен ъгъл на лявото око
const EYE_R = 263; // външен ъгъл на дясното око

const EYE_TARGET_DIST = 1.8; // ≈ 0.47 × 3.8 (междуочна ≈ 47% от височината на лице)
const Z_SCALE = 1.3; // MediaPipe z е перцептивно плосък — леко преувеличаваме релефа
const Y_OFFSET = 0.25; // върхът на носа е под визуалния център на лицето

export function createMappingState() {
  return {
    initialized: false,
    ax: 0.5,
    ay: 0.5,
    az: 0,
    s: 7,
    sm: new Float32Array(LM_COUNT * 3), // изгладени landmarks
  };
}

/**
 * @param {Float32Array} lm  сурови landmarks (478*3, от useMediaPipe буфера)
 * @param {Float32Array} out изходен texture буфер (478*4 RGBA)
 * @param {object} st        EMA състояние от createMappingState()
 * @param {number} dt        delta time в секунди
 */
export function mapLandmarksToWorld(lm, out, st, dt) {
  // Измервания на кадъра (сурови)
  const ax = lm[NOSE_TIP * 3];
  const ay = lm[NOSE_TIP * 3 + 1];
  const az = lm[NOSE_TIP * 3 + 2];
  const dx = lm[EYE_L * 3] - lm[EYE_R * 3];
  const dy = lm[EYE_L * 3 + 1] - lm[EYE_R * 3 + 1];
  const dz = lm[EYE_L * 3 + 2] - lm[EYE_R * 3 + 2];
  const eyeDist = Math.sqrt(dx * dx + dy * dy + dz * dz);
  let s = EYE_TARGET_DIST / Math.max(eyeDist, 1e-4);
  s = Math.min(Math.max(s, 3.0), 14.0); // clamp срещу лоши детекции

  if (!st.initialized) {
    st.ax = ax;
    st.ay = ay;
    st.az = az;
    st.s = s;
    st.sm.set(lm);
    st.initialized = true;
  }

  // Бавна EMA върху кадрирането
  const kSlow = 1 - Math.exp(-dt / 0.25);
  st.ax += (ax - st.ax) * kSlow;
  st.ay += (ay - st.ay) * kSlow;
  st.az += (az - st.az) * kSlow;
  st.s += (s - st.s) * kSlow;

  // Бърза EMA на всеки landmark + трансформация в световни координати
  const kFast = 1 - Math.exp(-dt / 0.05);
  const sm = st.sm;
  for (let i = 0; i < LM_COUNT; i++) {
    const j = i * 3;
    sm[j] += (lm[j] - sm[j]) * kFast;
    sm[j + 1] += (lm[j + 1] - sm[j + 1]) * kFast;
    sm[j + 2] += (lm[j + 2] - sm[j + 2]) * kFast;
    const o = i * 4;
    out[o] = -(sm[j] - st.ax) * st.s; // огледално x (raw камера → mirror)
    out[o + 1] = -(sm[j + 1] - st.ay) * st.s + Y_OFFSET; // y-надолу → y-нагоре
    out[o + 2] = -(sm[j + 2] - st.az) * st.s * Z_SCALE; // z към зрителя
  }
}
