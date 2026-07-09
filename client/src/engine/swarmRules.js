// Колективни поведения — как чуждите emotion states влияят на моите частици.

function getCentroid(particles) {
  if (!particles || particles.length === 0) return null;
  const avg = (arr) => arr.reduce((s, v) => s + v, 0) / arr.length;
  return {
    x: avg(particles.map((p) => p.x)),
    y: avg(particles.map((p) => p.y)),
  };
}

export function applySwarmRules(mySystem, myEmotion, myAudioLevel, otherUsers, canvasW, canvasH) {
  const users = Object.values(otherUsers);
  if (users.length === 0) return;

  users.forEach((other) => {
    if (!other.particles || other.particles.length === 0) return;
    const otherCentroid = getCentroid(other.particles);
    if (!otherCentroid) return;

    // Тъга привлича тъга
    if (myEmotion === 'sad' && other.emotion === 'sad') {
      mySystem.applyExternalGravity(otherCentroid.x, otherCentroid.y, 0.0015);
    }

    // Радост бяга от гняв
    if (myEmotion === 'happy' && other.emotion === 'angry') {
      mySystem.applyExternalGravity(otherCentroid.x, otherCentroid.y, -0.002);
    }

    // Мълчание + мълчание = сближаване
    if (myAudioLevel < 0.02 && (other.audioLevel ?? 0) < 0.02) {
      mySystem.applyExternalGravity(otherCentroid.x, otherCentroid.y, 0.001);
    }
  });

  // Колективна експлозия — всички викат едновременно
  const avgAudio =
    (users.reduce((s, u) => s + (u.audioLevel ?? 0), 0) + myAudioLevel) / (users.length + 1);
  if (avgAudio > 0.75) {
    mySystem.particles.forEach((p) => {
      const dx = p.x - canvasW / 2;
      const dy = p.y - canvasH / 2;
      const dist = Math.sqrt(dx * dx + dy * dy) || 1;
      p.vx += (dx / dist) * 6;
      p.vy += (dy / dist) * 6;
    });
  }
}
