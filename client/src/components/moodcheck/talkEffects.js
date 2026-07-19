// Ефекти при говорене — бурстове с форма (нота/сърце/звезда/искра), които
// излитат от устата когато отвориш уста. CPU-писани световни координати в
// EMITTER блока. HIDDEN когато е Off.
export const EMITTER_BURSTS = 12;
export const BURST_SIZE = 32;
export const EMITTER_COUNT = EMITTER_BURSTS * BURST_SIZE;
const HIDDEN_Z = -1000;
const LIFE = 1.6;

// Форми: списък от [x,y] offset-и (нормализирани ~[-1..1]), после мащабирани
function noteShape() {
  // Осмина нота: главичка + стъбло + флагче
  const pts = [];
  for (let i = 0; i < 14; i++) { const a = (i / 14) * Math.PI * 2; pts.push([-0.25 + Math.cos(a) * 0.28, -0.4 + Math.sin(a) * 0.2]); }
  for (let i = 0; i < 10; i++) pts.push([0.02, -0.35 + i * 0.11]); // стъбло
  for (let i = 0; i < 8; i++) pts.push([0.02 + i * 0.04, 0.7 - i * 0.05]); // флагче
  return pts;
}
function heartShape() {
  const pts = [];
  for (let i = 0; i < BURST_SIZE; i++) {
    const t = (i / BURST_SIZE) * Math.PI * 2;
    pts.push([16 * Math.sin(t) ** 3 / 17, (13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)) / 17]);
  }
  return pts;
}
function starShape() {
  const pts = [];
  for (let i = 0; i < BURST_SIZE; i++) {
    const t = (i / BURST_SIZE) * Math.PI * 2;
    const r = 0.5 + 0.5 * Math.pow(Math.abs(Math.cos(t * 2.5)), 3);
    pts.push([Math.cos(t) * r, Math.sin(t) * r]);
  }
  return pts;
}
function sparkShape() {
  const pts = [];
  for (let i = 0; i < BURST_SIZE; i++) { const a = Math.random() * Math.PI * 2, r = Math.random(); pts.push([Math.cos(a) * r, Math.sin(a) * r]); }
  return pts;
}

const SHAPES = { notes: noteShape(), hearts: heartShape(), stars: starShape(), sparks: sparkShape() };

export function createEmitterState() {
  return { bursts: Array.from({ length: EMITTER_BURSTS }, () => ({ life: 0, x: 0, y: 0, z: 0, vx: 0, vy: 0 })), lastSpawn: 0 };
}

// mouthWorld: [x,y,z] позиция на устата (световна); jaw: 0..1; kind: notes/hearts/...
export function updateEmitter(pos, baseIndex, state, dt, { mouthWorld, jaw, kind, scale }) {
  const base = baseIndex * 3;
  const now = performance.now();
  const active = kind && kind !== 'off' && SHAPES[kind];

  // Spawn при отворена уста (~на 350ms)
  if (active && mouthWorld && jaw > 0.25 && now - state.lastSpawn > 350) {
    const b = state.bursts.find((x) => x.life <= 0);
    if (b) {
      b.life = LIFE;
      b.x = mouthWorld[0] + (Math.random() - 0.5) * 0.3;
      b.y = mouthWorld[1];
      b.z = mouthWorld[2] + 0.1;
      b.vx = (Math.random() - 0.5) * 0.6;
      b.vy = 1.4 + Math.random() * 0.6;
      state.lastSpawn = now;
    }
  }

  const shape = active ? SHAPES[kind] : null;
  const sc = (scale || 1) * 0.5;
  for (let bi = 0; bi < EMITTER_BURSTS; bi++) {
    const b = state.bursts[bi];
    if (b.life > 0) {
      b.life -= dt;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.vy -= dt * 0.6; // леко забавяне
    }
    const fade = Math.max(0, b.life / LIFE);
    for (let k = 0; k < BURST_SIZE; k++) {
      const idx = base + (bi * BURST_SIZE + k) * 3;
      if (b.life > 0 && shape) {
        const [ox, oy] = shape[k % shape.length];
        pos[idx] = b.x + ox * sc * (0.5 + fade * 0.5);
        pos[idx + 1] = b.y + oy * sc * (0.5 + fade * 0.5);
        pos[idx + 2] = b.z;
      } else {
        pos[idx + 2] = HIDDEN_Z;
      }
    }
  }
}

export function hideEmitter(pos, baseIndex) {
  const base = baseIndex * 3;
  for (let i = 0; i < EMITTER_COUNT; i++) pos[base + i * 3 + 2] = HIDDEN_Z;
}
