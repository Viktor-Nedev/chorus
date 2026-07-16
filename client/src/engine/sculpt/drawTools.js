// Геометрии от нарисувани точки: 3D писалка (тръба по крива), lathe
// (револвиран профил) и extrude (изтеглена 2D форма). Точките-източник се
// пазят в userData за сериализация/re-edit.
import * as THREE from 'three';

// Приятни цветове за нови обекти — в тон с акцентите на CHORUS
export const OBJECT_PALETTE = [
  '#8B7BFA', '#67E8F9', '#3DDC97', '#FFD27F', '#FF8FC7',
  '#FF8A3D', '#4A9EFF', '#E8E8EE', '#B39DFF', '#7FE3C3',
];

export const randomColor = () =>
  OBJECT_PALETTE[Math.floor(Math.random() * OBJECT_PALETTE.length)];

export function makeStandardMaterial(color = randomColor()) {
  return new THREE.MeshStandardMaterial({
    color,
    metalness: 0.1,
    roughness: 0.55,
  });
}

// Прорежда точки, които са твърде близо една до друга (шум от mousemove)
export function decimatePoints(points, minDist = 0.08) {
  const out = [];
  for (const p of points) {
    if (!out.length || out[out.length - 1].distanceTo(p) >= minDist) out.push(p.clone());
  }
  return out;
}

// ── 3D Pen: точки в пространството → гладка тръба
export function makeTubeGeometry(points, radius = 0.12) {
  const pts = points.map((p) => (p.isVector3 ? p : new THREE.Vector3(p[0], p[1], p[2])));
  if (pts.length < 2) return null;
  const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
  const segments = Math.min(400, Math.max(16, pts.length * 6));
  return new THREE.TubeGeometry(curve, segments, radius, 10, false);
}

// ── Lathe: 2D профил (x = радиус ≥ 0, y = височина) → тяло на въртене
export function makeLatheGeometry(profile) {
  const pts = profile.map(([x, y]) => new THREE.Vector2(Math.max(0.001, x), y));
  if (pts.length < 3) return null;
  const geo = new THREE.LatheGeometry(pts, 48);
  geo.computeVertexNormals();
  return geo;
}

// ── Extrude: затворена 2D форма → обем с дълбочина и фаска
export function makeExtrudeGeometry(outline, { depth = 0.8, bevel = 0.06 } = {}) {
  if (outline.length < 3) return null;
  const shape = new THREE.Shape(outline.map(([x, y]) => new THREE.Vector2(x, y)));
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: bevel > 0,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 2,
    curveSegments: 24,
  });
  geo.center();
  return geo;
}

// ── Примитиви
export const PRIMITIVES = {
  box: () => new THREE.BoxGeometry(1.4, 1.4, 1.4),
  sphere: () => new THREE.SphereGeometry(0.9, 40, 28),
  cylinder: () => new THREE.CylinderGeometry(0.7, 0.7, 1.6, 36),
  cone: () => new THREE.ConeGeometry(0.85, 1.7, 36),
  torus: () => new THREE.TorusGeometry(0.8, 0.3, 20, 48),
  knot: () => new THREE.TorusKnotGeometry(0.65, 0.22, 128, 20),
  plane: () => new THREE.PlaneGeometry(2.2, 2.2, 1, 1),
  ico: () => new THREE.IcosahedronGeometry(0.95, 0),
};

export const PRIMITIVE_LIST = [
  { id: 'box', label: 'Cube', icon: '▧' },
  { id: 'sphere', label: 'Sphere', icon: '●' },
  { id: 'cylinder', label: 'Cylinder', icon: '⬮' },
  { id: 'cone', label: 'Cone', icon: '▲' },
  { id: 'torus', label: 'Torus', icon: '◎' },
  { id: 'knot', label: 'Torus Knot', icon: '✾' },
  { id: 'plane', label: 'Plane', icon: '▱' },
  { id: 'ico', label: 'Icosahedron', icon: '◆' },
];
