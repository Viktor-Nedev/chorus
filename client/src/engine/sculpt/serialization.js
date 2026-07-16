// Сцена ⇄ JSON v1. Обектите пазят точките-източник (tube/lathe/extrude),
// теренът пази params + heights само ако е ръчно скулптиран (иначе се
// регенерира от seed-а), scatter е компактен [x,y,z,ry,s] на инстанция.
const r3 = (v) => Math.round(v * 1000) / 1000;

export function serializeScene(engine) {
  const objects = engine.objects.map((mesh) => {
    const u = mesh.userData;
    const m = mesh.material;
    return {
      id: u.id,
      name: u.name,
      kind: u.kind, // primitive | tube | lathe | extrude
      prim: u.prim,
      points: u.points, // за tube (3D) / lathe, extrude (2D)
      opts: u.opts,
      position: mesh.position.toArray().map(r3),
      rotation: [mesh.rotation.x, mesh.rotation.y, mesh.rotation.z].map(r3),
      scale: mesh.scale.toArray().map(r3),
      visible: mesh.visible,
      material: {
        color: '#' + m.color.getHexString(),
        metalness: r3(m.metalness),
        roughness: r3(m.roughness),
        emissive: '#' + (u.baseEmissive || '000000'),
        opacity: r3(m.opacity),
        flatShading: !!m.flatShading,
        wireframe: !!m.wireframe,
      },
    };
  });

  const t = engine.terrain;
  const terrain = t
    ? {
        params: { ...t.userData.params, heights: undefined },
        heights: t.userData.sculpted ? Array.from(t.userData.heights, r3) : null,
      }
    : null;

  const scatter = Object.entries(engine.scatterMeshes).map(([kind, mesh]) => ({
    kind,
    items: mesh.userData.items.map((it) => it.map(r3)),
  }));

  return {
    version: 1,
    objects,
    terrain,
    scatter,
    env: { ...engine.env },
    camera: {
      position: engine.camera.position.toArray().map(r3),
      target: engine.controls.target.toArray().map(r3),
    },
  };
}
