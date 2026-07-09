// FFT данни → bass/mid/treble нива (0..1).
// fftSize 512 → 256 честотни bins. При 48kHz sample rate:
// bins 0-15  ≈ 0-1.4kHz  (bass + ниски гласови честоти)
// bins 15-80 ≈ 1.4-7.5kHz (говор, среден диапазон)
// bins 80+   ≈ 7.5kHz+   (високи)

export function analyzeFrequencyData(data) {
  const avgRange = (from, to) => {
    let sum = 0;
    for (let i = from; i < to && i < data.length; i++) sum += data[i];
    return sum / (to - from) / 255;
  };

  const bassLevel = avgRange(0, 15);
  const midLevel = avgRange(15, 80);
  const trebleLevel = avgRange(80, 256);
  const totalLevel = (bassLevel + midLevel + trebleLevel) / 3;

  return { bassLevel, midLevel, trebleLevel, totalLevel };
}

export const SILENT_AUDIO = { bassLevel: 0, midLevel: 0, trebleLevel: 0, totalLevel: 0 };
