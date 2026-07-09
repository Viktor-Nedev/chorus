// Blendshapes → emotion класификация.
// MediaPipe FaceLandmarker връща 52 blendshape категории (0..1).

export function classifyEmotionFromBlendshapes(blendshapes) {
  const get = (name) => blendshapes.find((b) => b.categoryName === name)?.score ?? 0;

  const smileLeft = get('mouthSmileLeft');
  const smileRight = get('mouthSmileRight');
  const browDown = get('browDownLeft') + get('browDownRight');
  const browUp = get('browInnerUp');
  const eyeWide = get('eyeWideLeft') + get('eyeWideRight');
  const jawOpen = get('jawOpen');
  const mouthFrown = get('mouthFrownLeft') + get('mouthFrownRight');
  const eyeSquint = get('eyeSquintLeft') + get('eyeSquintRight');

  if (smileLeft > 0.5 && smileRight > 0.5) return 'happy';
  if (browDown > 0.8) return 'angry';
  if (eyeWide > 0.6 && jawOpen > 0.3) return 'surprised';
  if (mouthFrown > 0.5 || (browUp > 0.5 && jawOpen < 0.1)) return 'sad';
  if (eyeSquint > 0.7 && browDown > 0.3) return 'focused';
  return 'neutral';
}

export function majorityVote(arr) {
  if (arr.length === 0) return 'neutral';
  const counts = {};
  arr.forEach((e) => (counts[e] = (counts[e] || 0) + 1));
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
}
