// Blendshapes → emotion класификация.
// MediaPipe FaceLandmarker връща 52 blendshape категории (0..1).
//
// ВАЖНО ЗА КАЛИБРАЦИЯТА: различните blendshapes имат много различни
// динамични диапазони — усмивката лесно стига 0.7+, докато mouthFrown
// рядко надхвърля 0.3, а browDown ~0.5 при силно мръщене. Затова
// класификацията е ТОЧКОВА СИСТЕМА с тегла, компенсиращи диапазоните
// (не if-верига с еднакви прагове — така "happy" доминираше всичко).

export function classifyEmotionFromBlendshapes(blendshapes) {
  const get = (name) => blendshapes.find((b) => b.categoryName === name)?.score ?? 0;

  const smile = (get('mouthSmileLeft') + get('mouthSmileRight')) / 2;
  const frown = (get('mouthFrownLeft') + get('mouthFrownRight')) / 2;
  const browDown = (get('browDownLeft') + get('browDownRight')) / 2;
  const browInnerUp = get('browInnerUp');
  const browOuterUp = (get('browOuterUpLeft') + get('browOuterUpRight')) / 2;
  const eyeWide = (get('eyeWideLeft') + get('eyeWideRight')) / 2;
  const eyeSquint = (get('eyeSquintLeft') + get('eyeSquintRight')) / 2;
  const jawOpen = get('jawOpen');
  const cheekSquint = (get('cheekSquintLeft') + get('cheekSquintRight')) / 2;
  const noseSneer = (get('noseSneerLeft') + get('noseSneerRight')) / 2;
  const mouthPress = (get('mouthPressLeft') + get('mouthPressRight')) / 2;
  const mouthPucker = get('mouthPucker');

  const scores = {
    // Усмивката е силен сигнал сама по себе си — но да не изяжда всичко,
    // изисква реална усмивка (~0.35+), а не остатъчен шум
    happy: smile * 1.0 + cheekSquint * 0.35 - browDown * 0.3,

    // Изненада: отворена уста + вдигнати вежди + широки очи (всеки от
    // трите може да я задейства при достатъчна сила)
    surprised: jawOpen * 0.75 + (browInnerUp + browOuterUp) * 0.45 + eyeWide * 0.9 - smile * 0.4,

    // Гняв: смръщени вежди са ключът (диапазон ~0.2-0.6 → тегло 1.5)
    angry:
      browDown * 1.5 + noseSneer * 0.7 + mouthPress * 0.4 + eyeSquint * 0.25 - smile * 0.6 - jawOpen * 0.3,

    // Тъга: увиснали ъгли на устата (слаб сигнал ~0.1-0.3 → тегло 2.2)
    // и/или вдигнати вътрешни вежди без усмивка
    sad: frown * 2.2 + browInnerUp * 0.55 + mouthPucker * 0.3 - smile * 0.8 - jawOpen * 0.4,

    // Фокус: присвити очи без мръщене на устата (припокрива се с гняв —
    // гневът печели при силен browDown заради по-високото си тегло там)
    focused: eyeSquint * 0.85 + browDown * 0.35 - jawOpen * 0.5 - smile * 0.4 - frown * 0.8,

    // Неутрален праг — емоция се регистрира само ако надмине този под
    neutral: 0.3,
  };

  let best = 'neutral';
  let bestScore = scores.neutral;
  for (const [emotion, score] of Object.entries(scores)) {
    if (score > bestScore) {
      best = emotion;
      bestScore = score;
    }
  }
  return best;
}

export function majorityVote(arr) {
  if (arr.length === 0) return 'neutral';
  const counts = {};
  arr.forEach((e) => (counts[e] = (counts[e] || 0) + 1));
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
}
