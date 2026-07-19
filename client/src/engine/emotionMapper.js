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
  const jawForward = get('jawForward');
  const cheekSquint = (get('cheekSquintLeft') + get('cheekSquintRight')) / 2;
  const noseSneer = (get('noseSneerLeft') + get('noseSneerRight')) / 2;
  const mouthPress = (get('mouthPressLeft') + get('mouthPressRight')) / 2;
  const mouthPucker = get('mouthPucker');
  const mouthShrugLower = get('mouthShrugLower');
  const mouthLowerDown = (get('mouthLowerDownLeft') + get('mouthLowerDownRight')) / 2;

  // "Furrow" — вежди свити НАДОЛУ И НАВЪТРЕ (browDown, но БЕЗ browInnerUp).
  // Това е най-чистият сигнал за гняв и го отделя от фокус/изненада.
  const furrow = Math.max(0, browDown - browInnerUp * 0.6);

  const scores = {
    // Усмивката е силен сигнал сама по себе си — но да не изяжда всичко.
    happy: smile * 1.0 + cheekSquint * 0.35 - browDown * 0.3,

    // Изненада: отворена уста + вдигнати вежди + широки очи.
    surprised:
      jawOpen * 0.7 + (browInnerUp + browOuterUp) * 0.45 + eyeWide * 0.9 - smile * 0.4 - browDown * 0.6,

    // Гняв — обогатен: свъсване (furrow) е ядрото, плюс носово сбръчкване,
    // стиснати устни, издадена челюст, присвити очи/бузи. БЕЗ наказание за
    // отворена уста (викането също е гняв). По-ниска граница за задействане.
    angry:
      furrow * 1.9 +
      browDown * 0.5 +
      noseSneer * 1.1 +
      mouthPress * 0.9 +
      jawForward * 0.7 +
      eyeSquint * 0.3 +
      cheekSquint * 0.25 -
      smile * 1.0 -
      browInnerUp * 0.3,

    // Тъга — обогатена: увиснали ъгли (frown, слаб сигнал → голямо тегло),
    // вдигнати вътрешни вежди (класика при тъга, но БЕЗ широки очи — иначе е
    // изненада), нацупена долна устна (mouthShrugLower/LowerDown = цупене).
    sad:
      frown * 2.6 +
      browInnerUp * 0.9 +
      mouthShrugLower * 0.8 +
      mouthLowerDown * 0.5 +
      mouthPucker * 0.3 -
      smile * 1.0 -
      jawOpen * 0.4 -
      browDown * 0.4 -
      eyeWide * 0.8,

    // Фокус: присвити очи БЕЗ силно свъсване (иначе печели гневът).
    focused: eyeSquint * 0.9 - furrow * 1.2 - jawOpen * 0.5 - smile * 0.4 - frown * 0.8,

    // Неутрален праг — по-нисък, за да не потиска умерения гняв/фокус.
    neutral: 0.22,
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
