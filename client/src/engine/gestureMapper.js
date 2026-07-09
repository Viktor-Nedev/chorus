// Hand landmarks → gesture класификация.
// MediaPipe HandLandmarker връща 21 landmark точки (normalized 0..1).
// Индекси: 0=wrist, 4=thumb tip, 8=index tip, 12=middle tip, 16=ring tip, 20=pinky tip

export function classifyGesture(landmarks) {
  // Пръст е "вдигнат" когато tip е над PIP става (по-малко y = по-нагоре)
  const fingerUp = (tip, pip) => landmarks[tip].y < landmarks[pip].y;

  const index = fingerUp(8, 6);
  const middle = fingerUp(12, 10);
  const ring = fingerUp(16, 14);
  const pinky = fingerUp(20, 18);

  if (index && middle && ring && pinky) return 'OPEN_PALM';
  if (!index && !middle && !ring && !pinky) return 'FIST';
  if (index && middle && !ring && !pinky) return 'PEACE';
  if (index && !middle && !ring && !pinky) return 'POINT';
  return 'NEUTRAL';
}
