// SCULPT engine — чист three.js (без R3F), създава се ВЕДНЪЖ и излага
// императивен API (същият идиом като P5Canvas/ForgeCanvas). Реактивните
// панели четат състоянието през getters и се нотифицират чрез callbacks.
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { EMOTION_HEX } from '../../constants/emotions';
import { viewPresetOffset, audioPulse } from './sculptMath';
import {
  PRIMITIVES, makeStandardMaterial, makeTubeGeometry, makeLatheGeometry,
  makeExtrudeGeometry, decimatePoints, randomColor,
} from './drawTools';

export { viewPresetOffset, audioPulse };
import {
  createTerrainMesh, sculptTerrain, createScatterMesh, paintScatter,
  generateHeights, applyHeightsToGeometry, DEFAULT_TERRAIN_PARAMS,
  rebuildScatterMatrices, TERRAIN_SIZE,
} from './terrain';
import { serializeScene } from './serialization';

let idSeq = 1;
const newId = () => 'o' + idSeq++ + Date.now().toString(36).slice(-3);

export const ENV_PRESETS = {
  studio: {
    bg: '#101016', fog: null, sun: '#ffffff', sunIntensity: 2.4,
    hemi: ['#8888a0', '#1a1a22'], hemiIntensity: 0.7, elevation: 50, azimuth: 35,
  },
  day: {
    bg: '#9ec4e2', fog: { color: '#9ec4e2', far: 160 }, sun: '#fff2d0', sunIntensity: 2.6,
    hemi: ['#cfe6ff', '#4a5a44'], hemiIntensity: 1.0, elevation: 58, azimuth: 40,
  },
  sunset: {
    bg: '#2e1a2e', fog: { color: '#4a2438', far: 120 }, sun: '#ff9a4d', sunIntensity: 2.2,
    hemi: ['#b06a8a', '#221426'], hemiIntensity: 0.6, elevation: 10, azimuth: 100,
  },
  night: {
    bg: '#070a16', fog: { color: '#0a0e20', far: 110 }, sun: '#7d95e0', sunIntensity: 0.9,
    hemi: ['#26304e', '#05060c'], hemiIntensity: 0.35, elevation: 40, azimuth: -60,
  },
};

const HIGHLIGHT = new THREE.Color('#2a2050');

export class SculptEngine {
  constructor(host, callbacks = {}) {
    this.host = host;
    this.cb = callbacks; // { onSelectionChanged, onSceneChanged, onToolDone }
    this.objects = [];
    this.terrain = null;
    this.scatterMeshes = {};
    this.selected = null;
    this.tool = 'select'; // select | pen | sculpt | scatter
    this.penOptions = { radius: 0.12, color: null, surface: 'ground' };
    this.brush = { mode: 'raise', radius: 3, strength: 1.2 };
    this.scatterOptions = { kind: 'tree', radius: 2, density: 3, erase: false };
    this.env = { preset: 'studio', elevation: 50, azimuth: 35, water: false, grid: true, turntable: false };
    this._undo = [];
    this._redo = [];
    this._restoring = false;

    // Rendered look + Live (audio/emotion) режим
    this.renderMode = 'solid'; // 'solid' | 'rendered' | 'wireframe'
    this.live = false;
    this.liveIntensity = 1;
    this.audioGetter = null; // () => { bassLevel, totalLevel, ... }
    this.emotionGetter = null; // () => 'happy' | ...
    this._perform = null; // performGroup докато Live е активен
    this._emoColor = new THREE.Color('#ffffff');
    this.usingOrtho = false;
    this.orthoCamera = null;

    // ── Renderer / scene / camera
    const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(host.clientWidth, host.clientHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    host.appendChild(renderer.domElement);
    this.renderer = renderer;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(55, host.clientWidth / host.clientHeight, 0.1, 600);
    this.camera.position.set(9, 7, 12);

    this.controls = new OrbitControls(this.camera, renderer.domElement);
    this.controls.target.set(0, 1, 0);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.maxPolarAngle = Math.PI * 0.495;
    this.controls.minDistance = 2;
    this.controls.maxDistance = 140;

    // ── Хелпъри
    this.grid = new THREE.GridHelper(40, 40, 0x34343f, 0x1e1e26);
    this.grid.position.y = 0.001;
    this.scene.add(this.grid);
    this.axes = new THREE.AxesHelper(1.8);
    this.scene.add(this.axes);

    // ── Светлини
    this.hemi = new THREE.HemisphereLight('#8888a0', '#1a1a22', 0.7);
    this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight('#ffffff', 2.4);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera;
    sc.left = -28; sc.right = 28; sc.top = 28; sc.bottom = -28; sc.far = 160;
    this.scene.add(this.sun);
    this.scene.add(this.sun.target);

    // ── Post-processing (bloom) + image-based environment за реалистични
    // отражения по metalness/roughness. Bloom върви само в „Rendered".
    this.composer = new EffectComposer(renderer);
    this._renderPass = new RenderPass(this.scene, this.camera);
    this.composer.addPass(this._renderPass);
    this._bloomBase = 0.6;
    this.bloom = new UnrealBloomPass(
      new THREE.Vector2(host.clientWidth || 1, host.clientHeight || 1),
      this._bloomBase, 0.4, 0.85
    );
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());

    const pmrem = new THREE.PMREMGenerator(renderer);
    this._envRT = pmrem.fromScene(new RoomEnvironment(), 0.04);
    this.scene.environment = this._envRT.texture;
    this.scene.environmentIntensity = 0.35;
    pmrem.dispose();

    // ── Гизмо
    this.transform = new TransformControls(this.camera, renderer.domElement);
    this.transform.setSize(0.9);
    this.scene.add(this.transform.getHelper()); // r169+: контролът вече не е Object3D
    this.transform.addEventListener('dragging-changed', (e) => {
      this.controls.enabled = !e.value;
      if (!e.value) {
        this._pushUndo();
        this._notifySelection(); // обнови числата в панела
      }
    });

    // ── Вода
    this.water = new THREE.Mesh(
      new THREE.PlaneGeometry(TERRAIN_SIZE * 1.6, TERRAIN_SIZE * 1.6),
      new THREE.MeshStandardMaterial({
        color: '#2e6f9e', transparent: true, opacity: 0.72, roughness: 0.15, metalness: 0.4,
      })
    );
    this.water.rotation.x = -Math.PI / 2;
    this.water.visible = false;
    this.scene.add(this.water);

    // ── Индикатор на четката (пръстен върху терена)
    this.brushRing = new THREE.Mesh(
      new THREE.TorusGeometry(1, 0.035, 8, 48),
      new THREE.MeshBasicMaterial({ color: '#67E8F9', transparent: true, opacity: 0.85 })
    );
    this.brushRing.rotation.x = -Math.PI / 2;
    this.brushRing.visible = false;
    this.scene.add(this.brushRing);

    // ── Interaction state
    this.raycaster = new THREE.Raycaster();
    this._pointer = new THREE.Vector2();
    this._down = null;
    this._penPoints = [];
    this._penPreview = null;
    this._painting = false;
    this._groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    this._viewPlane = new THREE.Plane();

    const el = renderer.domElement;
    el.style.touchAction = 'none';
    this._onPointerDown = (e) => this._pointerDown(e);
    this._onPointerMove = (e) => this._pointerMove(e);
    this._onPointerUp = (e) => this._pointerUp(e);
    el.addEventListener('pointerdown', this._onPointerDown);
    el.addEventListener('pointermove', this._onPointerMove);
    window.addEventListener('pointerup', this._onPointerUp);

    this._onKeyDown = (e) => this._keyDown(e);
    window.addEventListener('keydown', this._onKeyDown);

    // ── Resize / loop
    this._ro = new ResizeObserver(() => {
      const w = host.clientWidth, h = host.clientHeight;
      if (!w || !h) return;
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
      if (this.orthoCamera) this._updateOrthoFrustum(w, h);
      renderer.setSize(w, h);
      this.composer.setSize(w, h);
      this.bloom.setSize(w, h);
    });
    this._ro.observe(host);

    this._clock = new THREE.Clock();
    this._raf = 0;
    const loop = () => {
      this._raf = requestAnimationFrame(loop);
      const dt = this._clock.getDelta();
      const cam = this.usingOrtho ? this.orthoCamera : this.camera;

      // Live пулс (звук + емоция) — не-деструктивно
      let spin = 0.25;
      if (this.live) spin = 0.25 + this._applyLive(dt);

      if (this.env.turntable && !this.transform.dragging) {
        const angle = dt * spin;
        const p = cam.position.clone().sub(this.controls.target);
        p.applyAxisAngle(new THREE.Vector3(0, 1, 0), angle);
        cam.position.copy(this.controls.target).add(p);
      }
      this.controls.update();
      if (this.renderMode === 'rendered') this.composer.render();
      else renderer.render(this.scene, cam);
    };
    loop();

    this.setEnv({});
    this._pushUndo(); // начално състояние
  }

  // ═══════════ Pointer / tools ═══════════

  activeCamera() {
    return this.usingOrtho && this.orthoCamera ? this.orthoCamera : this.camera;
  }

  _updatePointer(e) {
    const r = this.renderer.domElement.getBoundingClientRect();
    this._pointer.set(
      ((e.clientX - r.left) / r.width) * 2 - 1,
      -((e.clientY - r.top) / r.height) * 2 + 1
    );
    this.raycaster.setFromCamera(this._pointer, this.activeCamera());
  }

  _penSurfacePoint() {
    const out = new THREE.Vector3();
    if (this.penOptions.surface === 'view') {
      const n = new THREE.Vector3();
      this.activeCamera().getWorldDirection(n);
      const anchor = this.controls.target;
      this._viewPlane.setFromNormalAndCoplanarPoint(n, anchor);
      return this.raycaster.ray.intersectPlane(this._viewPlane, out);
    }
    return this.raycaster.ray.intersectPlane(this._groundPlane, out);
  }

  _terrainHit() {
    if (!this.terrain) return null;
    const hits = this.raycaster.intersectObject(this.terrain, false);
    return hits[0]?.point || null;
  }

  _pointerDown(e) {
    if (e.button !== 0 || this.live) return; // Live е performance режим — без редакция
    this._updatePointer(e);
    this._down = { x: e.clientX, y: e.clientY, onGizmo: !!this.transform.axis };

    if (this.tool === 'pen') {
      const p = this._penSurfacePoint();
      if (!p) return;
      this.controls.enabled = false;
      this._penPoints = [p.clone()];
      this._startPenPreview();
    } else if (this.tool === 'sculpt' || this.tool === 'scatter') {
      if (this.tool === 'sculpt' && !this.terrain) return;
      this.controls.enabled = false;
      this._painting = true;
      this._applyBrush(e);
    }
  }

  _pointerMove(e) {
    this._updatePointer(e);

    if (this.tool === 'pen' && this._penPoints.length) {
      const p = this._penSurfacePoint();
      if (p && p.distanceTo(this._penPoints[this._penPoints.length - 1]) > 0.06) {
        this._penPoints.push(p.clone());
        this._updatePenPreview();
      }
      return;
    }

    // Индикатор + рисуване за terrain четките
    if (this.tool === 'sculpt' || this.tool === 'scatter') {
      const hit = this.tool === 'sculpt'
        ? this._terrainHit()
        : this._terrainHit() || this._penSurfacePoint();
      if (hit) {
        this.brushRing.visible = true;
        this.brushRing.position.copy(hit).add(new THREE.Vector3(0, 0.06, 0));
        const r = this.tool === 'sculpt' ? this.brush.radius : this.scatterOptions.radius;
        this.brushRing.scale.setScalar(r);
      } else {
        this.brushRing.visible = false;
      }
      if (this._painting) this._applyBrush(e);
    }
  }

  _pointerUp(e) {
    if (this.tool === 'pen' && this._penPoints.length) {
      this._finalizePen();
      this.controls.enabled = true;
      return;
    }
    if (this._painting) {
      this._painting = false;
      this.controls.enabled = true;
      this._pushUndo();
      this._notifyScene();
      return;
    }
    // Селекция с клик (не drag, не върху гизмото)
    if (this.tool === 'select' && this._down && !this._down.onGizmo) {
      const moved = Math.hypot(e.clientX - this._down.x, e.clientY - this._down.y);
      if (moved < 6) {
        this._updatePointer(e);
        const hits = this.raycaster.intersectObjects(this.objects, false);
        this.select(hits[0]?.object || null);
      }
    }
    this._down = null;
  }

  _applyBrush(e) {
    if (this.tool === 'sculpt') {
      const p = this._terrainHit();
      if (!p) return;
      const mode = e.shiftKey && this.brush.mode === 'raise' ? 'lower' : this.brush.mode;
      sculptTerrain(this.terrain, p, { ...this.brush, mode, dt: 0.016 });
    } else {
      const p = this._terrainHit() || this._penSurfacePoint();
      if (!p) return;
      const kind = this.scatterOptions.kind;
      if (!this.scatterMeshes[kind]) {
        this.scatterMeshes[kind] = createScatterMesh(kind);
        this.scene.add(this.scatterMeshes[kind]);
      }
      paintScatter(this.scatterMeshes[kind], this.terrain, p, {
        ...this.scatterOptions,
        erase: this.scatterOptions.erase || e.altKey,
      });
    }
  }

  // ── 3D Pen
  _startPenPreview() {
    const geo = new THREE.BufferGeometry();
    const mat = new THREE.LineBasicMaterial({ color: '#67E8F9' });
    this._penPreview = new THREE.Line(geo, mat);
    this.scene.add(this._penPreview);
  }

  _updatePenPreview() {
    if (!this._penPreview) return;
    this._penPreview.geometry.dispose();
    this._penPreview.geometry = new THREE.BufferGeometry().setFromPoints(this._penPoints);
  }

  _finalizePen() {
    if (this._penPreview) {
      this._penPreview.geometry.dispose();
      this._penPreview.material.dispose();
      this.scene.remove(this._penPreview);
      this._penPreview = null;
    }
    const pts = decimatePoints(this._penPoints, 0.07);
    this._penPoints = [];
    if (pts.length < 2) return;
    const radius = this.penOptions.radius;
    const geo = makeTubeGeometry(pts, radius);
    if (!geo) return;
    const color = this.penOptions.color || randomColor();
    const mesh = new THREE.Mesh(geo, makeStandardMaterial(color));
    mesh.userData = {
      id: newId(), name: 'Stroke ' + idSeq, kind: 'tube',
      points: pts.map((p) => [p.x, p.y, p.z].map((v) => Math.round(v * 1000) / 1000)),
      opts: { radius },
    };
    this._registerMesh(mesh);
    this.cb.onToolDone?.('pen');
  }

  // ═══════════ Object CRUD ═══════════

  _registerMesh(mesh, { select = true, undo = true } = {}) {
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.objects.push(mesh);
    this.scene.add(mesh);
    if (select) this.select(mesh);
    if (undo) this._pushUndo();
    this._notifyScene();
    return mesh;
  }

  addPrimitive(prim) {
    const factory = PRIMITIVES[prim];
    if (!factory) return null;
    const geo = factory();
    const mesh = new THREE.Mesh(geo, makeStandardMaterial());
    if (prim === 'plane') {
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.y = 0.01;
    } else {
      geo.computeBoundingBox();
      mesh.position.y = -geo.boundingBox.min.y;
    }
    mesh.userData = { id: newId(), name: prim.charAt(0).toUpperCase() + prim.slice(1), kind: 'primitive', prim };
    return this._registerMesh(mesh);
  }

  addLathe(profile) {
    const geo = makeLatheGeometry(profile);
    if (!geo) return null;
    geo.computeBoundingBox();
    const mesh = new THREE.Mesh(geo, makeStandardMaterial());
    mesh.material.side = THREE.DoubleSide;
    mesh.position.y = -geo.boundingBox.min.y;
    mesh.userData = { id: newId(), name: 'Lathe', kind: 'lathe', points: profile };
    return this._registerMesh(mesh);
  }

  addExtrude(outline, opts = {}) {
    const geo = makeExtrudeGeometry(outline, opts);
    if (!geo) return null;
    geo.computeBoundingBox();
    const mesh = new THREE.Mesh(geo, makeStandardMaterial());
    mesh.position.y = -geo.boundingBox.min.y + 0.01;
    mesh.userData = { id: newId(), name: 'Extrude', kind: 'extrude', points: outline, opts };
    return this._registerMesh(mesh);
  }

  select(mesh) {
    if (this.selected === mesh) return;
    // Свали highlight-а от стария
    if (this.selected) {
      this.selected.material.emissive?.set('#' + (this.selected.userData.baseEmissive || '000000'));
    }
    this.selected = mesh;
    if (mesh) {
      mesh.userData.baseEmissive = mesh.material.emissive?.getHexString() || '000000';
      mesh.material.emissive?.copy(HIGHLIGHT);
      this.transform.attach(mesh);
    } else {
      this.transform.detach();
    }
    this._notifySelection();
  }

  selectById(id) {
    this.select(this.objects.find((o) => o.userData.id === id) || null);
  }

  deleteSelected() {
    const mesh = this.selected;
    if (!mesh) return;
    this.select(null);
    this.objects = this.objects.filter((o) => o !== mesh);
    this.scene.remove(mesh);
    mesh.geometry.dispose();
    mesh.material.dispose();
    this._pushUndo();
    this._notifyScene();
  }

  duplicateSelected() {
    const src = this.selected;
    if (!src) return;
    const mesh = new THREE.Mesh(src.geometry.clone(), src.material.clone());
    mesh.position.copy(src.position).add(new THREE.Vector3(0.8, 0, 0.8));
    mesh.rotation.copy(src.rotation);
    mesh.scale.copy(src.scale);
    mesh.userData = {
      ...JSON.parse(JSON.stringify({ ...src.userData, baseEmissive: undefined })),
      id: newId(),
      name: src.userData.name + ' copy',
    };
    mesh.material.emissive?.set('#000000');
    this._registerMesh(mesh);
  }

  setObjectVisible(id, visible) {
    const o = this.objects.find((m) => m.userData.id === id);
    if (o) {
      o.visible = visible;
      this._notifyScene();
    }
  }

  renameObject(id, name) {
    const o = this.objects.find((m) => m.userData.id === id);
    if (o) {
      o.userData.name = String(name).slice(0, 40);
      this._notifyScene();
    }
  }

  updateSelectedTransform(patch) {
    const m = this.selected;
    if (!m) return;
    if (patch.position) m.position.fromArray(patch.position);
    if (patch.rotation) m.rotation.set(...patch.rotation);
    if (patch.scale) m.scale.fromArray(patch.scale);
    this._pushUndoDebounced();
  }

  updateSelectedMaterial(patch) {
    const m = this.selected;
    if (!m) return;
    const mat = m.material;
    if (patch.color !== undefined) mat.color.set(patch.color);
    if (patch.metalness !== undefined) mat.metalness = patch.metalness;
    if (patch.roughness !== undefined) mat.roughness = patch.roughness;
    if (patch.emissive !== undefined) {
      m.userData.baseEmissive = patch.emissive.replace('#', '');
      mat.emissive.set(patch.emissive);
      if (this.selected === m) mat.emissive.add(HIGHLIGHT);
    }
    if (patch.opacity !== undefined) {
      mat.opacity = patch.opacity;
      mat.transparent = patch.opacity < 1;
    }
    if (patch.flatShading !== undefined) {
      mat.flatShading = patch.flatShading;
      mat.needsUpdate = true;
    }
    if (patch.wireframe !== undefined) mat.wireframe = patch.wireframe;
    this._pushUndoDebounced();
  }

  setTransformMode(mode) {
    this.transform.setMode(mode);
  }

  setTool(tool) {
    this.tool = tool;
    this.brushRing.visible = false;
    if (tool !== 'select') this.select(null);
  }

  focusSelected() {
    if (!this.selected) return;
    this.controls.target.copy(this.selected.position);
  }

  // ═══════════ Viewport: render mode / space / snap / view / stats ═══════════

  setRenderMode(mode) {
    const wire = mode === 'wireframe';
    const mats = [...this.objects.map((o) => o.material), this.terrain?.material].filter(Boolean);
    for (const m of mats) {
      if (wire) {
        if (m.userData._wireSaved === undefined) m.userData._wireSaved = m.wireframe;
        m.wireframe = true;
      } else if (m.userData._wireSaved !== undefined) {
        m.wireframe = m.userData._wireSaved;
        delete m.userData._wireSaved;
      }
    }
    this.renderMode = mode;
  }

  setTransformSpace(space) {
    this.transform.setSpace(space); // 'local' | 'world'
  }

  setSnapping(on) {
    this.transform.setTranslationSnap(on ? 0.25 : null);
    this.transform.setRotationSnap(on ? THREE.MathUtils.degToRad(15) : null);
    this.transform.setScaleSnap(on ? 0.1 : null);
  }

  setView(name) {
    const off = viewPresetOffset(name);
    const dir = new THREE.Vector3(off[0], off[1], off[2]).normalize();
    const target = this.controls.target;
    const cam = this.activeCamera();
    const dist = cam.position.distanceTo(target) || 14;
    cam.position.copy(target).addScaledVector(dir, dist);
    cam.lookAt(target);
    this.controls.update();
  }

  frameAll() {
    const box = new THREE.Box3();
    let has = false;
    for (const o of this.objects) if (o.visible) { box.expandByObject(o); has = true; }
    if (this.terrain) { box.expandByObject(this.terrain); has = true; }
    if (!has) return;
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3()).length() || 6;
    this.controls.target.copy(center);
    const cam = this.activeCamera();
    let dir = cam.position.clone().sub(center);
    if (dir.lengthSq() < 0.001) dir.set(1, 0.7, 1);
    dir.normalize();
    cam.position.copy(center).addScaledVector(dir, size * 0.9 + 2);
    if (this.usingOrtho) this._updateOrthoFrustum(this.host.clientWidth, this.host.clientHeight, size);
    this.controls.update();
  }

  _updateOrthoFrustum(w, h, span) {
    if (!this.orthoCamera) return;
    const aspect = (w || 1) / (h || 1);
    const s = (span != null ? span : this.orthoCamera.position.distanceTo(this.controls.target) || 14) * 0.55;
    this.orthoCamera.left = -s * aspect;
    this.orthoCamera.right = s * aspect;
    this.orthoCamera.top = s;
    this.orthoCamera.bottom = -s;
    this.orthoCamera.near = 0.1;
    this.orthoCamera.far = 2000;
    this.orthoCamera.updateProjectionMatrix();
  }

  toggleOrtho() {
    const w = this.host.clientWidth, h = this.host.clientHeight;
    if (!this.usingOrtho) {
      if (!this.orthoCamera) this.orthoCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 2000);
      this.orthoCamera.position.copy(this.camera.position);
      this.orthoCamera.up.copy(this.camera.up);
      this._updateOrthoFrustum(w, h);
      this.orthoCamera.lookAt(this.controls.target);
      this.usingOrtho = true;
    } else {
      this.camera.position.copy(this.orthoCamera.position);
      this.usingOrtho = false;
    }
    const cam = this.activeCamera();
    this.controls.object = cam;
    this.transform.camera = cam;
    this._renderPass.camera = cam;
    this.controls.update();
    return this.usingOrtho;
  }

  getStats() {
    let vertices = 0;
    let triangles = 0;
    const count = (geo, instances = 1) => {
      if (!geo) return;
      const pos = geo.getAttribute('position');
      if (pos) vertices += pos.count * instances;
      const tris = geo.index ? geo.index.count / 3 : (pos ? pos.count / 3 : 0);
      triangles += tris * instances;
    };
    for (const o of this.objects) if (o.visible) count(o.geometry);
    if (this.terrain) count(this.terrain.geometry);
    let scatter = 0;
    for (const m of Object.values(this.scatterMeshes)) {
      const n = m.userData.items?.length || 0;
      scatter += n;
      count(m.geometry, n);
    }
    return { objects: this.objects.length, vertices: Math.round(vertices), triangles: Math.round(triangles), scatter };
  }

  // ═══════════ Live (audio + emotion) performance ═══════════

  setLive(on) {
    if (on === this.live) return;
    this.live = on;
    if (on) {
      this.select(null);
      this._perform = new THREE.Group();
      this._perform.position.copy(this.controls.target);
      this.scene.add(this._perform);
      for (const o of [...this.objects]) {
        if (o.material) {
          o.userData._baseEmi = o.material.emissiveIntensity ?? 1;
          o.userData._baseEmiCol = o.material.emissive.getHex();
          o.material.emissive.copy(o.material.color); // свети в собствения си цвят
        }
        this._perform.attach(o); // пази world transform
      }
      this.renderMode = 'rendered';
    } else {
      if (this._perform) {
        for (const o of [...this.objects]) this.scene.attach(o);
        this.scene.remove(this._perform);
        this._perform = null;
      }
      for (const o of this.objects) {
        if (o.material && o.userData._baseEmi !== undefined) {
          o.material.emissiveIntensity = o.userData._baseEmi;
          o.material.emissive.setHex(o.userData._baseEmiCol ?? 0x000000);
          delete o.userData._baseEmi;
          delete o.userData._baseEmiCol;
        }
      }
      this.bloom.strength = this._bloomBase;
      this.setEnv({}); // върни осветлението
    }
  }

  // Извиква се всеки кадър при Live; връща допълнителна turntable скорост.
  _applyLive() {
    const audio = this.audioGetter?.() || {};
    const level = audioPulse(audio.totalLevel || 0) * this.liveIntensity;
    const bass = Math.max(0, Math.min(1, audio.bassLevel || 0)) * this.liveIntensity;

    if (this._perform) {
      const s = 1 + level * 0.14;
      this._perform.scale.lerp(new THREE.Vector3(s, s, s), 0.3);
    }
    for (const o of this.objects) {
      if (o.material && 'emissiveIntensity' in o.material) {
        const base = o.userData._baseEmi ?? 1;
        o.material.emissiveIntensity = base + level * 1.8;
      }
    }
    this.bloom.strength = this._bloomBase + level * 1.1 + bass * 0.5;

    const emo = this.emotionGetter?.();
    if (emo && EMOTION_HEX[emo]) {
      this._emoColor.lerp(new THREE.Color(EMOTION_HEX[emo]), 0.02);
      this.hemi.color.copy(this._emoColor);
    }
    return level * 0.9;
  }

  // ═══════════ Terrain / Environment ═══════════

  addTerrain(params = {}) {
    this.removeTerrain({ notify: false });
    this.terrain = createTerrainMesh({ ...DEFAULT_TERRAIN_PARAMS, ...params });
    this.scene.add(this.terrain);
    this._updateWater();
    this._pushUndo();
    this._notifyScene();
  }

  updateTerrain(params) {
    if (!this.terrain) return;
    const p = { ...this.terrain.userData.params, ...params };
    this.terrain.userData.params = p;
    const heights = generateHeights(p);
    this.terrain.userData.heights = heights;
    this.terrain.userData.sculpted = false;
    applyHeightsToGeometry(this.terrain.geometry, heights, p.height);
    this._updateWater();
    this._pushUndoDebounced();
  }

  removeTerrain({ notify = true } = {}) {
    if (this.terrain) {
      this.scene.remove(this.terrain);
      this.terrain.geometry.dispose();
      this.terrain.material.dispose();
      this.terrain = null;
    }
    for (const mesh of Object.values(this.scatterMeshes)) {
      this.scene.remove(mesh);
      mesh.geometry.dispose();
      mesh.material.dispose();
    }
    this.scatterMeshes = {};
    this._updateWater();
    if (notify) {
      this._pushUndo();
      this._notifyScene();
    }
  }

  _updateWater() {
    const p = this.terrain?.userData.params;
    this.water.visible = this.env.water;
    this.water.position.y = p ? p.seaLevel * p.height : 0.4;
  }

  setEnv(patch) {
    this.env = { ...this.env, ...patch };
    const preset = ENV_PRESETS[this.env.preset] || ENV_PRESETS.studio;
    if (patch.preset) {
      this.env.elevation = preset.elevation;
      this.env.azimuth = preset.azimuth;
    }
    this.scene.background = new THREE.Color(preset.bg);
    this.scene.fog = preset.fog ? new THREE.Fog(preset.fog.color, 30, preset.fog.far) : null;
    this.hemi.color.set(preset.hemi[0]);
    this.hemi.groundColor.set(preset.hemi[1]);
    this.hemi.intensity = preset.hemiIntensity;
    this.sun.color.set(preset.sun);
    this.sun.intensity = preset.sunIntensity;
    const el = THREE.MathUtils.degToRad(this.env.elevation);
    const az = THREE.MathUtils.degToRad(this.env.azimuth);
    this.sun.position.set(
      Math.cos(el) * Math.sin(az) * 40,
      Math.sin(el) * 40,
      Math.cos(el) * Math.cos(az) * 40
    );
    this.grid.visible = this.env.grid;
    this.axes.visible = this.env.grid;
    this._updateWater();
  }

  // ═══════════ Undo / redo ═══════════

  _pushUndo() {
    if (this._restoring) return;
    this._undo.push(JSON.stringify(serializeScene(this)));
    if (this._undo.length > 15) this._undo.shift();
    this._redo = [];
  }

  _pushUndoDebounced() {
    clearTimeout(this._undoTimer);
    this._undoTimer = setTimeout(() => this._pushUndo(), 600);
  }

  undo() {
    if (this._undo.length <= 1) return;
    this._redo.push(this._undo.pop());
    this.loadScene(JSON.parse(this._undo[this._undo.length - 1]), { asUndo: true });
  }

  redo() {
    if (!this._redo.length) return;
    const s = this._redo.pop();
    this._undo.push(s);
    this.loadScene(JSON.parse(s), { asUndo: true });
  }

  // ═══════════ Serialize / load ═══════════

  serialize() {
    return serializeScene(this);
  }

  loadScene(json, { asUndo = false } = {}) {
    this._restoring = true;
    this.select(null);
    // Изчисти
    for (const o of this.objects) {
      this.scene.remove(o);
      o.geometry.dispose();
      o.material.dispose();
    }
    this.objects = [];
    this.removeTerrain({ notify: false });

    // Обекти
    for (const spec of json.objects || []) {
      let geo = null;
      if (spec.kind === 'primitive') geo = PRIMITIVES[spec.prim]?.();
      else if (spec.kind === 'tube') geo = makeTubeGeometry(spec.points, spec.opts?.radius ?? 0.12);
      else if (spec.kind === 'lathe') geo = makeLatheGeometry(spec.points);
      else if (spec.kind === 'extrude') geo = makeExtrudeGeometry(spec.points, spec.opts);
      if (!geo) continue;
      const mesh = new THREE.Mesh(geo, makeStandardMaterial(spec.material?.color));
      const mm = spec.material || {};
      mesh.material.metalness = mm.metalness ?? 0.1;
      mesh.material.roughness = mm.roughness ?? 0.55;
      mesh.material.emissive.set(mm.emissive || '#000000');
      mesh.material.opacity = mm.opacity ?? 1;
      mesh.material.transparent = mesh.material.opacity < 1;
      mesh.material.flatShading = !!mm.flatShading;
      mesh.material.wireframe = !!mm.wireframe;
      if (spec.kind === 'lathe') mesh.material.side = THREE.DoubleSide;
      mesh.position.fromArray(spec.position || [0, 0, 0]);
      mesh.rotation.set(...(spec.rotation || [0, 0, 0]));
      mesh.scale.fromArray(spec.scale || [1, 1, 1]);
      mesh.visible = spec.visible !== false;
      mesh.userData = {
        id: spec.id || newId(), name: spec.name || spec.kind, kind: spec.kind,
        prim: spec.prim, points: spec.points, opts: spec.opts,
        baseEmissive: (mm.emissive || '#000000').replace('#', ''),
      };
      this._registerMesh(mesh, { select: false, undo: false });
    }

    // Терен
    if (json.terrain) {
      const p = { ...json.terrain.params };
      if (json.terrain.heights) p.heights = json.terrain.heights;
      this.terrain = createTerrainMesh(p);
      if (json.terrain.heights) this.terrain.userData.sculpted = true;
      this.scene.add(this.terrain);
    }

    // Scatter
    for (const s of json.scatter || []) {
      if (!s.items?.length) continue;
      const mesh = createScatterMesh(s.kind);
      mesh.userData.items = s.items.map((it) => [...it]);
      rebuildScatterMatrices(mesh);
      this.scatterMeshes[s.kind] = mesh;
      this.scene.add(mesh);
    }

    // Env + камера
    if (json.env) this.env = { ...this.env, ...json.env };
    this.setEnv({});
    if (json.camera && !asUndo) {
      this.camera.position.fromArray(json.camera.position);
      this.controls.target.fromArray(json.camera.target);
    }

    this._restoring = false;
    if (!asUndo) {
      this._undo = [JSON.stringify(serializeScene(this))];
      this._redo = [];
    }
    this._notifyScene();
  }

  // ═══════════ Export / misc ═══════════

  snapshotPng(scale = 2) {
    const prev = this.renderer.getPixelRatio();
    const w = this.host.clientWidth, h = this.host.clientHeight;
    const pr = Math.min(window.devicePixelRatio * scale, 3);
    const cam = this.activeCamera();
    this.renderer.setPixelRatio(pr);
    if (this.renderMode === 'rendered') {
      this.composer.setPixelRatio(pr);
      this.composer.setSize(w, h);
      this.composer.render();
    } else {
      this.renderer.render(this.scene, cam);
    }
    const dataURL = this.renderer.domElement.toDataURL('image/png');
    this.renderer.setPixelRatio(prev);
    this.composer.setPixelRatio(prev);
    this.composer.setSize(w, h);
    this.renderer.render(this.scene, cam);
    return dataURL;
  }

  getObjectList() {
    return this.objects.map((o) => ({
      id: o.userData.id,
      name: o.userData.name,
      kind: o.userData.kind,
      visible: o.visible,
    }));
  }

  getSelectedInfo() {
    const m = this.selected;
    if (!m) return null;
    return {
      id: m.userData.id,
      name: m.userData.name,
      kind: m.userData.kind,
      position: m.position.toArray(),
      rotation: [m.rotation.x, m.rotation.y, m.rotation.z],
      scale: m.scale.toArray(),
      material: {
        color: '#' + m.material.color.getHexString(),
        metalness: m.material.metalness,
        roughness: m.material.roughness,
        emissive: '#' + (m.userData.baseEmissive || '000000'),
        opacity: m.material.opacity,
        flatShading: !!m.material.flatShading,
        wireframe: !!m.material.wireframe,
      },
    };
  }

  clearAll() {
    this.loadScene({ version: 1, objects: [], terrain: null, scatter: [], env: this.env });
    this._pushUndo();
  }

  _notifyScene() {
    this.cb.onSceneChanged?.();
  }

  _notifySelection() {
    this.cb.onSelectionChanged?.(this.getSelectedInfo());
  }

  _keyDown(e) {
    const ae = document.activeElement;
    if (ae && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA' || ae.isContentEditable)) return;
    const k = e.key.toLowerCase();
    if ((e.ctrlKey || e.metaKey) && k === 'z') { e.preventDefault(); this.undo(); return; }
    if ((e.ctrlKey || e.metaKey) && k === 'y') { e.preventDefault(); this.redo(); return; }
    if ((e.ctrlKey || e.metaKey) && k === 'd') { e.preventDefault(); this.duplicateSelected(); return; }
    if (k === 'delete' || k === 'backspace') { this.deleteSelected(); return; }
    if (k === 'escape') { this.select(null); return; }
    if (k === 'g') this.setTransformMode('translate');
    if (k === 'r') this.setTransformMode('rotate');
    if (k === 's') this.setTransformMode('scale');
    if (k === 'f') this.focusSelected();
  }

  dispose() {
    cancelAnimationFrame(this._raf);
    clearTimeout(this._undoTimer);
    this._ro.disconnect();
    const el = this.renderer.domElement;
    el.removeEventListener('pointerdown', this._onPointerDown);
    el.removeEventListener('pointermove', this._onPointerMove);
    window.removeEventListener('pointerup', this._onPointerUp);
    window.removeEventListener('keydown', this._onKeyDown);
    // r169: TransformControls.dispose() вика this.traverse (бъг, оправен в
    // по-късни версии) — правим същото ръчно през helper-а
    this.transform.disconnect();
    this.transform.getHelper().traverse((child) => {
      child.geometry?.dispose();
      child.material?.dispose();
    });
    this.controls.dispose();
    for (const o of this.objects) {
      o.geometry.dispose();
      o.material.dispose();
    }
    this.removeTerrain({ notify: false });
    this.composer?.dispose?.();
    this._envRT?.dispose?.();
    this.renderer.dispose();
    el.remove();
  }
}
