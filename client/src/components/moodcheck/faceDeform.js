// Деформира живия face mesh (world-space landmark буфер, 478×4 RGBA) на място
// според avatar.deform параметрите. Всичко е плавни регионални трансформации
// около котви (очи/нос/чело/брадичка), затова резултатът ВИНАГИ следва
// изражението и позата на реалното лице. Идентичността е no-op → 1:1 Mirror.

const NOSE_TIP = 1;
const CHIN = 152;
const FOREHEAD = 10;
const LEFT_IRIS = 468;
const RIGHT_IRIS = 473;

const px = (out, i) => out[i * 4];
const py = (out, i) => out[i * 4 + 1];
const pz = (out, i) => out[i * 4 + 2];

export function isIdentity(dm) {
  return (
    dm.eye === 1 && dm.faceLength === 1 && dm.jaw === 1 &&
    dm.cheek === 1 && dm.nose === 1 && dm.eyeDepth === 1
  );
}

export function computeAnchors(out) {
  const elx = px(out, LEFT_IRIS), ely = py(out, LEFT_IRIS), elz = pz(out, LEFT_IRIS);
  const erx = px(out, RIGHT_IRIS), ery = py(out, RIGHT_IRIS), erz = pz(out, RIGHT_IRIS);
  const eyeDist = Math.hypot(elx - erx, ely - ery, elz - erz) || 1;
  const foreheadY = py(out, FOREHEAD);
  const chinY = py(out, CHIN);
  const nx = px(out, NOSE_TIP), ny = py(out, NOSE_TIP), nz = pz(out, NOSE_TIP);
  return {
    eyeL: [elx, ely, elz],
    eyeR: [erx, ery, erz],
    eyeCenterY: (ely + ery) / 2,
    centerX: (elx + erx) / 2,
    centerY: (foreheadY + chinY) / 2,
    foreheadY,
    chinY,
    nose: [nx, ny, nz],
    eyeDist,
  };
}

const clamp01 = (v) => Math.min(1, Math.max(0, v));
const smooth = (t) => {
  const x = clamp01(t);
  return x * x * (3 - 2 * x);
};

// Усилено, видимо мигане: при blink свива очния регион вертикално към
// центъра на окото (клепачите буквално се затварят). Прилага се ВИНАГИ,
// включително за Real — MediaPipe движи клепачните точки само с милиметри,
// което при 24k частици+jitter се губи; това го прави драматично.
export function applyBlink(out, a, blinkL, blinkR) {
  if (blinkL < 0.25 && blinkR < 0.25) return;
  const sig = a.eyeDist * 0.55;
  const sig2 = 2 * sig * sig;
  for (let i = 0; i < 478; i++) {
    const o = i * 4;
    const x = out[o];
    const y = out[o + 1];
    const dl = (x - a.eyeL[0]) ** 2 + (y - a.eyeL[1]) ** 2;
    const dr = (x - a.eyeR[0]) ** 2 + (y - a.eyeR[1]) ** 2;
    const nearL = dl < dr;
    const blink = nearL ? blinkL : blinkR;
    if (blink < 0.25) continue;
    const near = nearL ? a.eyeL : a.eyeR;
    const w = Math.exp(-(nearL ? dl : dr) / sig2);
    if (w < 0.002) continue;
    // Свий вертикално към линията на окото, пропорционално на мигането
    const k = Math.min(1, (blink - 0.25) / 0.55);
    out[o + 1] = y - (y - near[1]) * w * k * 0.85;
  }
}

export function deformLandmarks(out, dm, a) {
  if (isIdentity(dm)) return;
  const scale = a.eyeDist;
  const sigEye = scale * 0.5;
  const sigNose = scale * 0.42;
  const sig2Eye = 2 * sigEye * sigEye;
  const sig2Nose = 2 * sigNose * sigNose;
  const cheekY = (a.eyeCenterY + a.chinY) / 2; // средна височина на бузите
  const sigCheek = scale * 0.7;
  const sig2Cheek = 2 * sigCheek * sigCheek;

  for (let i = 0; i < 478; i++) {
    const o = i * 4;
    let x = out[o], y = out[o + 1], z = out[o + 2];

    // ── Очи: радиално мащабиране около по-близкото око + z-дълбочина ──
    if (dm.eye !== 1 || dm.eyeDepth !== 1) {
      const dl = (x - a.eyeL[0]) ** 2 + (y - a.eyeL[1]) ** 2;
      const dr = (x - a.eyeR[0]) ** 2 + (y - a.eyeR[1]) ** 2;
      const near = dl < dr ? a.eyeL : a.eyeR;
      const d2 = Math.min(dl, dr);
      const w = Math.exp(-d2 / sig2Eye);
      if (w > 0.001) {
        x += (dm.eye - 1) * w * (x - near[0]);
        y += (dm.eye - 1) * w * (y - near[1]);
        z -= (dm.eyeDepth - 1) * w * 0.5; // навътре (по-хлътнали очи)
      }
    }

    // ── Череп: издължаване нагоре над очите ──
    if (dm.faceLength !== 1 && y > a.eyeCenterY) {
      const wUp = smooth((y - a.eyeCenterY) / Math.max(0.001, a.foreheadY - a.eyeCenterY));
      y += (dm.faceLength - 1) * wUp * (y - a.eyeCenterY);
    }

    // ── Челюст: ширина под носа ──
    if (dm.jaw !== 1 && y < a.nose[1]) {
      const wDown = smooth((a.nose[1] - y) / Math.max(0.001, a.nose[1] - a.chinY));
      x = a.centerX + (x - a.centerX) * (1 + (dm.jaw - 1) * wDown);
    }

    // ── Бузи: издуване/хлътване встрани на средна височина ──
    if (dm.cheek !== 1) {
      const wY = Math.exp(-((y - cheekY) ** 2) / sig2Cheek);
      const side = clamp01((Math.abs(x - a.centerX) - scale * 0.15) / (scale * 0.5));
      const w = wY * side;
      if (w > 0.001) {
        x += (dm.cheek - 1) * w * (x - a.centerX) * 0.5;
        z += (dm.cheek - 1) * w * 0.35 * scale * 0.3;
      }
    }

    // ── Нос: мащабиране около върха ──
    if (dm.nose !== 1) {
      const d2 = (x - a.nose[0]) ** 2 + (y - a.nose[1]) ** 2 + (z - a.nose[2]) ** 2;
      const w = Math.exp(-d2 / sig2Nose);
      if (w > 0.001) {
        x += (dm.nose - 1) * w * (x - a.nose[0]);
        y += (dm.nose - 1) * w * (y - a.nose[1]);
        z += (dm.nose - 1) * w * (z - a.nose[2]);
      }
    }

    out[o] = x;
    out[o + 1] = y;
    out[o + 2] = z;
  }
}
