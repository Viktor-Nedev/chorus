// Terrain: fBm simplex височини + оцветяване по височина/наклон,
// скулптиране с четка (raise/lower/smooth/flatten) и scatter на
// инстансирани дървета/скали/трева.
import * as THREE from 'three';
import { createNoise2D } from 'simplex-noise';

export const TERRAIN_SIZE = 36; // световни единици
export const TERRAIN_SEGS = 200; // сегменти на страна

// PlaneGeometry реди редовете с НАМАЛЯВАЩО localY (ред 0 = +Y). Затова
// картографирането localY→ред е (SIZE/2 − localY). Чиста ф-я за unit-тест.
export function terrainColFromLocalX(localX) {
  return ((localX + TERRAIN_SIZE / 2) / TERRAIN_SIZE) * TERRAIN_SEGS;
}
export function terrainRowFromLocalY(localY) {
  return ((TERRAIN_SIZE / 2 - localY) / TERRAIN_SIZE) * TERRAIN_SEGS;
}

export const DEFAULT_TERRAIN_PARAMS = {
  seed: 7,
  scale: 0.9, // честота на шума
  height: 4.2, // амплитуда
  octaves: 4,
  seaLevel: 0.35, // 0..1 от амплитудата
};

// Детерминистичен PRNG за seed-нат шум
function mulberry32(a) {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function generateHeights(params) {
  const { seed, scale, height, octaves } = { ...DEFAULT_TERRAIN_PARAMS, ...params };
  const noise = createNoise2D(mulberry32(seed));
  const n = TERRAIN_SEGS + 1;
  const heights = new Float32Array(n * n);
  for (let iy = 0; iy < n; iy++) {
    for (let ix = 0; ix < n; ix++) {
      const x = (ix / TERRAIN_SEGS - 0.5) * scale * 6;
      const y = (iy / TERRAIN_SEGS - 0.5) * scale * 6;
      let amp = 1, freq = 1, v = 0, norm = 0;
      for (let o = 0; o < octaves; o++) {
        v += noise(x * freq, y * freq) * amp;
        norm += amp;
        amp *= 0.5;
        freq *= 2.1;
      }
      v /= norm;
      // Леко "островно" затихване към ръбовете
      const dx = ix / TERRAIN_SEGS - 0.5;
      const dy = iy / TERRAIN_SEGS - 0.5;
      const edge = 1 - Math.min(1, (dx * dx + dy * dy) * 2.6);
      heights[iy * n + ix] = ((v + 1) / 2) * height * Math.max(0.05, edge);
    }
  }
  return heights;
}

// Цветови спирки по нормализирана височина
const STOPS = [
  { h: 0.0, c: new THREE.Color('#2a5d8f') },  // дълбока вода (дъно)
  { h: 0.28, c: new THREE.Color('#d9c58a') }, // пясък
  { h: 0.38, c: new THREE.Color('#4f8f4a') }, // трева
  { h: 0.62, c: new THREE.Color('#6e6a5e') }, // скала
  { h: 0.82, c: new THREE.Color('#f2f2f0') }, // сняг
  { h: 1.0, c: new THREE.Color('#ffffff') },
];

const smoothstep = (x) => x * x * (3 - 2 * x);

function heightColor(t, out) {
  for (let i = 1; i < STOPS.length; i++) {
    if (t <= STOPS[i].h) {
      const a = STOPS[i - 1], b = STOPS[i];
      const k = smoothstep(Math.max(0, Math.min(1, (t - a.h) / (b.h - a.h))));
      return out.copy(a.c).lerp(b.c, k);
    }
  }
  return out.copy(STOPS[STOPS.length - 1].c);
}

export function applyHeightsToGeometry(geometry, heights, maxHeight) {
  const pos = geometry.attributes.position;
  const n = TERRAIN_SEGS + 1;
  let colors = geometry.attributes.color;
  if (!colors) {
    colors = new THREE.BufferAttribute(new Float32Array(pos.count * 3), 3);
    geometry.setAttribute('color', colors);
  }
  const c = new THREE.Color();
  const hMax = Math.max(0.001, maxHeight);
  for (let i = 0; i < pos.count; i++) {
    const h = heights[i] ?? 0; // защита срещу несъответстващ по дължина запис
    pos.setZ(i, h); // плоскостта е XY, ротирана -90° по X → Z е "нагоре"
    heightColor(Math.min(1, h / hMax), c);
    colors.setXYZ(i, c.r, c.g, c.b);
  }
  pos.needsUpdate = true;
  colors.needsUpdate = true;
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  void n;
}

export function createTerrainMesh(params) {
  const p = { ...DEFAULT_TERRAIN_PARAMS, ...params };
  const geometry = new THREE.PlaneGeometry(TERRAIN_SIZE, TERRAIN_SIZE, TERRAIN_SEGS, TERRAIN_SEGS);
  const expected = (TERRAIN_SEGS + 1) * (TERRAIN_SEGS + 1);
  // Ползвай запазените височини само ако съвпадат с текущата резолюция —
  // иначе регенерирай (стари записи с различен TERRAIN_SEGS не чупят терена).
  const heights = p.heights && p.heights.length === expected
    ? Float32Array.from(p.heights)
    : generateHeights(p);
  applyHeightsToGeometry(geometry, heights, p.height);
  const material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.92,
    metalness: 0.02,
    envMapIntensity: 0.5,
    flatShading: false,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.rotation.x = -Math.PI / 2;
  mesh.receiveShadow = true;
  mesh.userData = { kind: 'terrain', params: p, heights, name: 'Terrain' };
  return mesh;
}

// ── Скулптираща четка. point е в световни координати върху терена.
export function sculptTerrain(mesh, point, { mode = 'raise', radius = 3, strength = 1, dt = 0.016 }) {
  const { heights, params } = mesh.userData;
  const n = TERRAIN_SEGS + 1;
  const local = mesh.worldToLocal(point.clone()); // XY план, Z = височина
  const cx = terrainColFromLocalX(local.x);
  const cy = terrainRowFromLocalY(local.y); // фикс: редът е (SIZE/2 − localY), не огледален
  const rGrid = (radius / TERRAIN_SIZE) * TERRAIN_SEGS;
  const amt = strength * dt * 6;

  // Средна височина в областта (за smooth/flatten)
  let avg = 0, cnt = 0;
  if (mode === 'smooth' || mode === 'flatten') {
    for (let iy = Math.max(0, Math.ceil(cy - rGrid)); iy <= Math.min(TERRAIN_SEGS, cy + rGrid); iy++) {
      for (let ix = Math.max(0, Math.ceil(cx - rGrid)); ix <= Math.min(TERRAIN_SEGS, cx + rGrid); ix++) {
        avg += heights[iy * n + ix];
        cnt++;
      }
    }
    avg /= Math.max(1, cnt);
  }

  for (let iy = Math.max(0, Math.ceil(cy - rGrid)); iy <= Math.min(TERRAIN_SEGS, cy + rGrid); iy++) {
    for (let ix = Math.max(0, Math.ceil(cx - rGrid)); ix <= Math.min(TERRAIN_SEGS, cx + rGrid); ix++) {
      const d = Math.hypot(ix - cx, iy - cy) / rGrid;
      if (d > 1) continue;
      const fall = Math.cos((d * Math.PI) / 2) ** 2; // мек falloff
      const i = iy * n + ix;
      if (mode === 'raise') heights[i] += amt * fall;
      else if (mode === 'lower') heights[i] = Math.max(0, heights[i] - amt * fall);
      else if (mode === 'smooth') heights[i] += (avg - heights[i]) * Math.min(1, amt * fall * 2);
      else if (mode === 'flatten') heights[i] += (avg - heights[i]) * Math.min(1, fall);
    }
  }
  mesh.userData.sculpted = true;
  applyHeightsToGeometry(mesh.geometry, heights, params.height);
}

// Височина на терена в световна точка (за scatter/вода)
export function terrainHeightAt(mesh, wx, wz) {
  const { heights } = mesh.userData;
  const n = TERRAIN_SEGS + 1;
  const gx = terrainColFromLocalX(wx); // localX = worldX
  const gy = terrainRowFromLocalY(-wz); // localY = -worldZ (същото картографиране като sculpt)
  if (gx < 0 || gy < 0 || gx > TERRAIN_SEGS || gy > TERRAIN_SEGS) return null;
  const ix = Math.round(gx), iy = Math.round(gy);
  return heights[iy * n + ix];
}

// ── Scatter: нискополи растителност/скали като InstancedMesh
export const SCATTER_KINDS = {
  tree: { label: 'Trees', icon: '🌲' },
  rock: { label: 'Rocks', icon: '🪨' },
  grass: { label: 'Grass', icon: '🌿' },
};
const SCATTER_CAP = 1500;

function makeScatterTemplate(kind) {
  if (kind === 'tree') {
    const geo = new THREE.ConeGeometry(0.42, 1.15, 7);
    geo.translate(0, 1.0, 0);
    const trunk = new THREE.CylinderGeometry(0.09, 0.11, 0.5, 6);
    trunk.translate(0, 0.25, 0);
    const merged = mergeGeometries([
      { geo: trunk, color: new THREE.Color('#6b4a32') },
      { geo, color: new THREE.Color('#2f7a44') },
    ]);
    return { geometry: merged, material: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 }) };
  }
  if (kind === 'rock') {
    const geo = new THREE.IcosahedronGeometry(0.32, 0);
    geo.scale(1, 0.7, 1);
    return { geometry: geo, material: new THREE.MeshStandardMaterial({ color: '#8b8b90', roughness: 0.95, flatShading: true }) };
  }
  // grass — туфа от заострени остриета с вертикален градиент (тъмна основа → светъл връх)
  const blades = 6;
  const baseCol = new THREE.Color('#356b33');
  const tipCol = new THREE.Color('#8fd66a');
  const pos = [];
  const col = [];
  for (let b = 0; b < blades; b++) {
    const ang = (b / blades) * Math.PI * 2 + (Math.random() - 0.5) * 0.5;
    const dist = 0.02 + Math.random() * 0.06;
    const bx = Math.cos(ang) * dist;
    const bz = Math.sin(ang) * dist;
    const w = 0.028 + Math.random() * 0.018; // полу-ширина на основата
    const h = 0.26 + Math.random() * 0.2; // височина
    const lean = 0.05 + Math.random() * 0.05;
    const lx = Math.cos(ang) * lean;
    const lz = Math.sin(ang) * lean;
    const px = -Math.sin(ang) * w; // перпендикуляр за ширината
    const pz = Math.cos(ang) * w;
    // заострено острие: основа ляво/дясно → връх
    pos.push(bx - px, 0, bz - pz, bx + px, 0, bz + pz, bx + lx, h, bz + lz);
    col.push(
      baseCol.r, baseCol.g, baseCol.b,
      baseCol.r, baseCol.g, baseCol.b,
      tipCol.r, tipCol.g, tipCol.b
    );
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.computeVertexNormals();
  return {
    geometry: geo,
    material: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, side: THREE.DoubleSide }),
  };
}

// Малък merge helper с vertex цвят на парче (избягва external BufferGeometryUtils)
function mergeGeometries(parts) {
  const geos = parts.map(({ geo, color }) => {
    const g = geo.index ? geo.toNonIndexed() : geo;
    const count = g.attributes.position.count;
    const colors = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      colors[i * 3] = color.r;
      colors[i * 3 + 1] = color.g;
      colors[i * 3 + 2] = color.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    return g;
  });
  const total = geos.reduce((s, g) => s + g.attributes.position.count, 0);
  const pos = new Float32Array(total * 3);
  const nor = new Float32Array(total * 3);
  const col = new Float32Array(total * 3);
  let off = 0;
  for (const g of geos) {
    pos.set(g.attributes.position.array, off * 3);
    nor.set(g.attributes.normal.array, off * 3);
    col.set(g.attributes.color.array, off * 3);
    off += g.attributes.position.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return out;
}

export function createScatterMesh(kind) {
  const { geometry, material } = makeScatterTemplate(kind);
  const mesh = new THREE.InstancedMesh(geometry, material, SCATTER_CAP);
  mesh.count = 0;
  mesh.castShadow = true;
  mesh.userData = { kind: 'scatter', scatterKind: kind, items: [] }; // items: [x,y,z,ry,s]
  mesh.frustumCulled = false;
  return mesh;
}

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _v = new THREE.Vector3();
const _s = new THREE.Vector3();

export function rebuildScatterMatrices(mesh) {
  const { items } = mesh.userData;
  mesh.count = Math.min(items.length, SCATTER_CAP);
  for (let i = 0; i < mesh.count; i++) {
    const [x, y, z, ry, s] = items[i];
    _q.setFromEuler(_e.set(0, ry, 0));
    _m.compose(_v.set(x, y, z), _q, _s.set(s, s, s));
    mesh.setMatrixAt(i, _m);
  }
  mesh.instanceMatrix.needsUpdate = true;
}

export function paintScatter(mesh, terrainMesh, point, { radius = 2, density = 3, erase = false }) {
  const items = mesh.userData.items;
  if (erase) {
    mesh.userData.items = items.filter(([x, , z]) => Math.hypot(x - point.x, z - point.z) > radius);
    rebuildScatterMatrices(mesh);
    return;
  }
  for (let k = 0; k < density; k++) {
    if (items.length >= SCATTER_CAP) break;
    const a = Math.random() * Math.PI * 2;
    const r = Math.sqrt(Math.random()) * radius;
    const x = point.x + Math.cos(a) * r;
    const z = point.z + Math.sin(a) * r;
    let y = point.y;
    if (terrainMesh) {
      const h = terrainHeightAt(terrainMesh, x, z);
      if (h === null) continue;
      y = h;
    }
    items.push([x, y, z, Math.random() * Math.PI * 2, 0.7 + Math.random() * 0.8]);
  }
  rebuildScatterMatrices(mesh);
}
