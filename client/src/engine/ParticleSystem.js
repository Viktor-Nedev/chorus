import { EMOTION_CONFIGS } from '../constants/emotions';

const TRAIL_LENGTH = 10;

export class Particle {
  constructor(id, x, y, baseColor) {
    this.id = id;
    this.x = x;
    this.y = y;
    this.vx = (Math.random() - 0.5) * 2;
    this.vy = (Math.random() - 0.5) * 2;
    this.targetX = x;
    this.targetY = y;
    this.size = 8;
    this.baseSize = 8;
    this.color = { r: baseColor.r, g: baseColor.g, b: baseColor.b, a: 255 };
    this.targetColor = { ...this.color };
    this.shape = 'circle'; // 'circle' | 'triangle' | 'spike' | 'burst'
    this.trail = []; // последните позиции {x, y}
    this.age = 0;
    this.movementStyle = 'wander';
    this.orbitAngle = Math.random() * Math.PI * 2;
  }

  update(audioData, emotionProps, gestureData, canvasW, canvasH, centroid) {
    this.age++;

    // Lerp към target позиция — FIST стяга по-силно
    const lerpFactor = gestureData.gesture === 'FIST' ? 0.15 : 0.05;
    this.vx += (this.targetX - this.x) * lerpFactor;
    this.vy += (this.targetY - this.y) * lerpFactor;

    // Случайно блуждаене
    this.vx += (Math.random() - 0.5) * 0.4;
    this.vy += (Math.random() - 0.5) * 0.4;

    // Movement style от емоцията
    switch (this.movementStyle) {
      case 'wave':
        this.vx += Math.sin(this.age * 0.05 + this.id) * 0.15;
        this.vy += Math.cos(this.age * 0.04 + this.id * 0.7) * 0.1;
        break;
      case 'fall':
        this.vy += 0.08;
        break;
      case 'chaotic':
        this.vx += (Math.random() - 0.5) * 1.6;
        this.vy += (Math.random() - 0.5) * 1.6;
        break;
      case 'explode':
        if (centroid) {
          const dx = this.x - centroid.x;
          const dy = this.y - centroid.y;
          const dist = Math.sqrt(dx * dx + dy * dy) || 1;
          this.vx += (dx / dist) * 0.3;
          this.vy += (dy / dist) * 0.3;
        }
        break;
      case 'orbit':
        if (centroid) {
          this.orbitAngle += 0.03;
          const dx = this.x - centroid.x;
          const dy = this.y - centroid.y;
          // тангенциална сила — върти около centroid
          this.vx += -dy * 0.004;
          this.vy += dx * 0.004;
        }
        break;
      default:
        break;
    }

    // Аудио влияние — mid честоти раздвижват
    this.vx += (Math.random() - 0.5) * audioData.midLevel * 3;
    this.vy += (Math.random() - 0.5) * audioData.midLevel * 3;

    // Триене
    this.vx *= 0.92;
    this.vy *= 0.92;

    // Приложи скорост
    this.x += this.vx;
    this.y += this.vy;

    // Bounce от стените
    if (this.x < 0 || this.x > canvasW) this.vx *= -1;
    if (this.y < 0 || this.y > canvasH) this.vy *= -1;
    this.x = Math.max(0, Math.min(canvasW, this.x));
    this.y = Math.max(0, Math.min(canvasH, this.y));

    // Lerp цвят към target
    this.color.r += (this.targetColor.r - this.color.r) * 0.05;
    this.color.g += (this.targetColor.g - this.color.g) * 0.05;
    this.color.b += (this.targetColor.b - this.color.b) * 0.05;

    // Размер от бас
    this.size = this.baseSize * (1 + audioData.bassLevel * 2);

    // Запази trail
    this.trail.unshift({ x: this.x, y: this.y });
    if (this.trail.length > TRAIL_LENGTH) this.trail.pop();
  }
}

export class ParticleSystem {
  constructor(count, canvasW, canvasH, baseColor) {
    this.baseColor = baseColor;
    this.particles = Array.from(
      { length: count },
      (_, i) =>
        new Particle(
          i,
          canvasW / 2 + (Math.random() - 0.5) * 100,
          canvasH / 2 + (Math.random() - 0.5) * 100,
          baseColor
        )
    );
    this.canvasW = canvasW;
    this.canvasH = canvasH;
    this.anchor = null; // за CHORUS brush — закотвяне около cursor
  }

  resize(w, h) {
    this.canvasW = w;
    this.canvasH = h;
  }

  applyEmotion(emotion) {
    const props = EMOTION_CONFIGS[emotion] || EMOTION_CONFIGS.neutral;
    this.particles.forEach((p) => {
      // neutral използва базовия цвят на потребителя
      p.targetColor = props.color ? { ...props.color } : { ...this.baseColor, a: 255 };
      p.shape = props.shape;
      p.baseSize = props.baseSize;
      p.movementStyle = props.movementStyle;
    });
  }

  applyGesture(gestureData) {
    const { gesture, handX, handY } = gestureData;
    const cx = handX * this.canvasW;
    const cy = handY * this.canvasH;

    this.particles.forEach((p, i) => {
      switch (gesture) {
        case 'OPEN_PALM':
          p.targetX = cx + (Math.random() - 0.5) * 60;
          p.targetY = cy + (Math.random() - 0.5) * 60;
          break;
        case 'FIST':
          p.targetX = cx + (Math.random() - 0.5) * 15;
          p.targetY = cy + (Math.random() - 0.5) * 15;
          break;
        case 'PEACE':
          p.targetX = cx + (i % 2 === 0 ? -150 : 150);
          p.targetY = cy;
          break;
        case 'POINT':
          p.targetX = cx + (i - this.particles.length / 2) * 6;
          p.targetY = cy;
          break;
        case 'NEUTRAL':
          p.targetX = cx + (Math.random() - 0.5) * 120;
          p.targetY = cy + (Math.random() - 0.5) * 120;
          break;
        default: {
          // NO_HAND: ако има anchor (CHORUS brush) — стой около него,
          // иначе блуждай около текущата зона
          if (this.anchor) {
            p.targetX = this.anchor.x + (Math.random() - 0.5) * 80;
            p.targetY = this.anchor.y + (Math.random() - 0.5) * 80;
          } else if (p.age % 60 === 0) {
            p.targetX = p.x + (Math.random() - 0.5) * 200;
            p.targetY = p.y + (Math.random() - 0.5) * 200;
          }
        }
      }
    });
  }

  // CHORUS brush: закотви частиците около точка (cursor)
  setAnchor(x, y) {
    this.anchor = { x, y };
    this.particles.forEach((p) => {
      p.targetX = x + (Math.random() - 0.5) * 60;
      p.targetY = y + (Math.random() - 0.5) * 60;
    });
  }

  clearAnchor() {
    this.anchor = null;
  }

  applyExternalGravity(otherX, otherY, force) {
    this.particles.forEach((p) => {
      const dx = otherX - p.x;
      const dy = otherY - p.y;
      p.vx += dx * force;
      p.vy += dy * force;
    });
  }

  update(audioData, emotionProps, gestureData) {
    const centroid = this.getCentroid();
    this.particles.forEach((p) =>
      p.update(audioData, emotionProps, gestureData, this.canvasW, this.canvasH, centroid)
    );
  }

  getCentroid() {
    if (this.particles.length === 0) return { x: this.canvasW / 2, y: this.canvasH / 2 };
    const avg = (arr) => arr.reduce((s, v) => s + v, 0) / arr.length;
    return {
      x: avg(this.particles.map((p) => p.x)),
      y: avg(this.particles.map((p) => p.y)),
    };
  }

  // Snapshot за WebSocket (Collective режим)
  getSnapshot() {
    return this.particles.map((p) => ({
      x: Math.round(p.x),
      y: Math.round(p.y),
      color: {
        r: Math.round(p.color.r),
        g: Math.round(p.color.g),
        b: Math.round(p.color.b),
      },
    }));
  }
}
