// Експорт на сцената: GLB / OBJ / STL / PLY / USDZ + PNG snapshot.
// Всичко е клиентско — three.js exporters + blob download.
import * as THREE from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { OBJExporter } from 'three/examples/jsm/exporters/OBJExporter.js';
import { STLExporter } from 'three/examples/jsm/exporters/STLExporter.js';
import { PLYExporter } from 'three/examples/jsm/exporters/PLYExporter.js';
import { USDZExporter } from 'three/examples/jsm/exporters/USDZExporter.js';

export const EXPORT_FORMATS = [
  { id: 'glb', label: 'GLB (.glb)', hint: 'Blender, Unity, three.js — colors & materials' },
  { id: 'obj', label: 'OBJ (.obj)', hint: 'universal geometry format' },
  { id: 'stl', label: 'STL (.stl)', hint: '3D printing' },
  { id: 'ply', label: 'PLY (.ply)', hint: 'point/mesh with vertex colors' },
  { id: 'usdz', label: 'USDZ (.usdz)', hint: 'iPhone/iPad AR Quick Look' },
  { id: 'png', label: 'PNG snapshot', hint: 'current view as image' },
];

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

// Клонира export-ната група без хелпъри/гизмота — engine.getExportScene()
// вече връща чиста група с меshoвете.
export async function exportScene(group, format, filename = 'chorus-sculpt') {
  if (format === 'glb') {
    const gltf = await new GLTFExporter().parseAsync(group, { binary: true });
    downloadBlob(new Blob([gltf], { type: 'model/gltf-binary' }), `${filename}.glb`);
    return;
  }
  if (format === 'obj') {
    const text = new OBJExporter().parse(group);
    downloadBlob(new Blob([text], { type: 'text/plain' }), `${filename}.obj`);
    return;
  }
  if (format === 'stl') {
    const data = new STLExporter().parse(group, { binary: true });
    downloadBlob(new Blob([data], { type: 'model/stl' }), `${filename}.stl`);
    return;
  }
  if (format === 'ply') {
    await new Promise((resolve) => {
      new PLYExporter().parse(
        group,
        (result) => {
          downloadBlob(new Blob([result], { type: 'text/plain' }), `${filename}.ply`);
          resolve();
        },
        { binary: false }
      );
    });
    return;
  }
  if (format === 'usdz') {
    const data = await new USDZExporter().parseAsync(group);
    downloadBlob(new Blob([data], { type: 'model/vnd.usdz+zip' }), `${filename}.usdz`);
    return;
  }
  throw new Error('Unknown format: ' + format);
}

// InstancedMesh не се поддържа от някои exporters (OBJ/STL/PLY) —
// разгъваме инстанциите в обикновени мешове за екпорта.
export function bakeGroupForExport(meshes, terrain, scatterMeshes) {
  const group = new THREE.Group();
  group.name = 'chorus-sculpt';
  for (const m of meshes) {
    if (!m.visible) continue;
    const clone = new THREE.Mesh(m.geometry.clone(), m.material.clone());
    clone.position.copy(m.position);
    clone.rotation.copy(m.rotation);
    clone.scale.copy(m.scale);
    clone.name = m.userData.name || 'object';
    group.add(clone);
  }
  if (terrain) {
    const t = new THREE.Mesh(terrain.geometry.clone(), terrain.material.clone());
    t.rotation.copy(terrain.rotation);
    t.name = 'terrain';
    group.add(t);
  }
  for (const mesh of Object.values(scatterMeshes || {})) {
    const { items } = mesh.userData;
    if (!items.length) continue;
    const sub = new THREE.Group();
    sub.name = mesh.userData.scatterKind;
    const mat = mesh.material.clone();
    for (const [x, y, z, ry, s] of items) {
      const inst = new THREE.Mesh(mesh.geometry, mat);
      inst.position.set(x, y, z);
      inst.rotation.y = ry;
      inst.scale.setScalar(s);
      sub.add(inst);
    }
    group.add(sub);
  }
  return group;
}
