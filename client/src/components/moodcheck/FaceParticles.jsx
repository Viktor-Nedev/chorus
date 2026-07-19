import { useMemo, useRef, useEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { makeSharedSamples, buildFaceFormation, buildAmbient, buildJitter, buildTriangleBinding, EMOTION_FACE_PARAMS } from './faceFormations';
import { mapLandmarksToWorld, createMappingState, LM_COUNT } from './landmarkMapping';
import { moodVertex, moodFragment } from './moodShaders';
import { FACE_TRIANGULATION } from './faceTriangulation';
import { EMOTION_HEX } from '../../constants/emotions';
import { AVATAR_MAP, DEFAULT_AVATAR } from './avatars';
import { computeAnchors, deformLandmarks, applyBlink } from './faceDeform';
import { updateAccessories, ACCESSORY_COUNT } from './accessories';
import { buildCharacter, REGION } from './characterFaces';
import { createEmitterState, updateEmitter, hideEmitter, EMITTER_COUNT } from './talkEffects';
import { updateHands, updateTrail, createTrailState, initTrailHidden, clearTrail, HANDS_COUNT, TRAIL_COUNT } from './handParticles';

const FACE_COUNT = 24576;
const ACC_OFFSET = FACE_COUNT;
const EMITTER_OFFSET = ACC_OFFSET + ACCESSORY_COUNT;
const HANDS_OFFSET = EMITTER_OFFSET + EMITTER_COUNT;
const TRAIL_OFFSET = HANDS_OFFSET + HANDS_COUNT;
const TOTAL = TRAIL_OFFSET + TRAIL_COUNT;

const PRESENCE_TIMEOUT_MS = 500;
const HAND_TIMEOUT_MS = 400;
const REBIND_AFTER_FRAMES = 45;

const EMOTION_COLORS = Object.fromEntries(Object.entries(EMOTION_HEX).map(([k, hex]) => [k, new THREE.Color(hex)]));
const IDLE_COLOR = new THREE.Color(EMOTION_HEX.neutral).multiplyScalar(0.6);

function triAreaFromTex(data, ia, ib, ic) {
  const ax = data[ia * 4], ay = data[ia * 4 + 1], az = data[ia * 4 + 2];
  const bx = data[ib * 4] - ax, by = data[ib * 4 + 1] - ay, bz = data[ib * 4 + 2] - az;
  const cx = data[ic * 4] - ax, cy = data[ic * 4 + 1] - ay, cz = data[ic * 4 + 2] - az;
  const nx = by * cz - bz * cy, ny = bz * cx - bx * cz, nz = bx * cy - by * cx;
  return Math.sqrt(nx * nx + ny * ny + nz * nz) / 2;
}

const norm = (v) => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

export function FaceParticles({
  emotionRef, landmarksBufRef, landmarkStampRef, avatarRef, emotionColorRef,
  blendshapesRef, handBufRef, handStampRef, effectsRef, clearSignalRef,
}) {
  const { gl } = useThree();

  const { geometry } = useMemo(() => {
    const samples = makeSharedSamples(FACE_COUNT);
    const neutral = buildFaceFormation(EMOTION_FACE_PARAMS.neutral, samples);
    const ambientF = buildAmbient(FACE_COUNT);
    const jitterF = buildJitter(FACE_COUNT);
    const { tri, bary } = buildTriangleBinding(FACE_COUNT, FACE_TRIANGULATION);

    const position = new Float32Array(TOTAL * 3);
    const ambient = new Float32Array(TOTAL * 3);
    const jitter = new Float32Array(TOTAL * 3);
    const triA = new Float32Array(TOTAL * 3);
    const baryA = new Float32Array(TOTAL * 3);
    const charPos = new Float32Array(TOTAL * 3);
    const region = new Float32Array(TOTAL);
    const seeds = new Float32Array(TOTAL);
    const direct = new Float32Array(TOTAL);

    position.set(neutral, 0);
    ambient.set(ambientF, 0);
    jitter.set(jitterF, 0);
    triA.set(tri, 0);
    baryA.set(bary, 0);
    for (let i = 0; i < FACE_COUNT; i++) seeds[i] = Math.random();

    // Direct блокове (accessory/emitter/hands/trail): скрити, разпръснат ambient
    for (let i = FACE_COUNT; i < TOTAL; i++) {
      const j = i * 3;
      position[j] = 0; position[j + 1] = 0; position[j + 2] = -1000;
      ambient[j] = (Math.random() - 0.5) * 12;
      ambient[j + 1] = (Math.random() - 0.5) * 12;
      ambient[j + 2] = (Math.random() - 0.5) * 6;
      seeds[i] = Math.random();
      direct[i] = 1;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(position, 3));
    geo.setAttribute('aAmbient', new THREE.BufferAttribute(ambient, 3));
    geo.setAttribute('aJitter', new THREE.BufferAttribute(jitter, 3));
    geo.setAttribute('aTri', new THREE.BufferAttribute(triA, 3));
    geo.setAttribute('aBary', new THREE.BufferAttribute(baryA, 3));
    geo.setAttribute('aCharPos', new THREE.BufferAttribute(charPos, 3));
    geo.setAttribute('aRegion', new THREE.BufferAttribute(region, 1));
    geo.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1));
    geo.setAttribute('aDirect', new THREE.BufferAttribute(direct, 1));
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), 80);
    return { geometry: geo };
  }, []);

  const landmarkTex = useMemo(() => {
    const data = new Float32Array(LM_COUNT * 4);
    const tex = new THREE.DataTexture(data, LM_COUNT, 1, THREE.RGBAFormat, THREE.FloatType);
    tex.minFilter = THREE.NearestFilter; tex.magFilter = THREE.NearestFilter;
    tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.generateMipmaps = false; tex.flipY = false; tex.needsUpdate = true;
    return tex;
  }, []);
  useEffect(() => () => landmarkTex.dispose(), [landmarkTex]);

  const uniforms = useMemo(() => {
    const a0 = AVATAR_MAP[DEFAULT_AVATAR];
    return {
      uTime: { value: 0 }, uPresence: { value: 0 }, uSize: { value: 26.0 },
      uSizeMul: { value: a0.particleSize }, uPixelRatio: { value: gl.getPixelRatio() },
      uColor: { value: new THREE.Color(EMOTION_HEX.neutral) }, uGlow: { value: a0.glow },
      uLandmarks: { value: landmarkTex },
      uAvatarMode: { value: 0 },
      uHeadPos: { value: new THREE.Vector3() },
      uHeadR: { value: new THREE.Vector3(1, 0, 0) },
      uHeadU: { value: new THREE.Vector3(0, 1, 0) },
      uHeadF: { value: new THREE.Vector3(0, 0, 1) },
      uHeadScale: { value: 1 },
      uJaw: { value: 0 }, uBlinkL: { value: 0 }, uBlinkR: { value: 0 }, uSmile: { value: 0 },
      uEyeLC: { value: new THREE.Vector2(-0.5, 0.05) },
      uEyeRC: { value: new THREE.Vector2(0.5, 0.05) },
      uMouthC: { value: new THREE.Vector2(0, -0.6) },
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const st = useRef({
    mappingState: createMappingState(), stableFrames: 0, rebindDone: false,
    emitter: createEmitterState(), trail: createTrailState(),
    loadedKey: null, prevAcc: 'none', lastClear: 0, trailInit: false,
  });

  // Зарежда character/drawn форма в aCharPos + aRegion при смяна на аватара
  const loadShape = (avatar) => {
    const s = st.current;
    const charPos = geometry.attributes.aCharPos.array;
    const region = geometry.attributes.aRegion.array;
    if (avatar.type === 'character') {
      const key = 'char:' + avatar.character;
      if (s.loadedKey === key) return;
      const built = buildCharacter(avatar.character, FACE_COUNT);
      if (built) {
        charPos.set(built.positions, 0);
        region.set(built.regions, 0);
        geometry.attributes.aCharPos.needsUpdate = true;
        geometry.attributes.aRegion.needsUpdate = true;
        uniforms.uEyeLC.value.set(built.rig.eyeL[0], built.rig.eyeL[1]);
        uniforms.uEyeRC.value.set(built.rig.eyeR[0], built.rig.eyeR[1]);
        uniforms.uMouthC.value.set(built.rig.mouth[0], built.rig.mouth[1]);
      }
      s.loadedKey = key;
    } else if (avatar.type === 'drawn') {
      const key = 'drawn:' + (avatar.id || avatar.label);
      if (s.loadedKey === key) return;
      const pts = avatar.points || [];
      const mouthY = -0.15;
      for (let i = 0; i < FACE_COUNT; i++) {
        const src = pts.length ? pts[i % pts.length] : [0, 0];
        // лек шум за плътност около нарисуваната точка
        const x = src[0] + (Math.random() - 0.5) * 0.02;
        const y = src[1] + (Math.random() - 0.5) * 0.02;
        charPos[i * 3] = x * 1.3;
        charPos[i * 3 + 1] = y * 1.3;
        charPos[i * 3 + 2] = (Math.random() - 0.5) * 0.15;
        region[i] = y < mouthY ? REGION.MOUTH : REGION.SKIN; // долна половина "диша"
      }
      geometry.attributes.aCharPos.needsUpdate = true;
      geometry.attributes.aRegion.needsUpdate = true;
      uniforms.uEyeLC.value.set(-0.4, 0.25);
      uniforms.uEyeRC.value.set(0.4, 0.25);
      uniforms.uMouthC.value.set(0, mouthY);
      s.loadedKey = key;
    } else {
      s.loadedKey = 'live';
    }
  };

  useFrame((state, delta) => {
    const s = st.current;
    uniforms.uTime.value = state.clock.elapsedTime % 3600;
    uniforms.uPixelRatio.value = gl.getPixelRatio();

    const emotion = emotionRef?.current ?? 'neutral';
    const avatar = avatarRef?.current || AVATAR_MAP[DEFAULT_AVATAR];
    const bs = blendshapesRef?.current || {};
    const fx = effectsRef?.current || {};
    uniforms.uSizeMul.value = avatar.particleSize ?? 1;
    uniforms.uGlow.value = avatar.glow ?? 0.4;

    loadShape(avatar);
    const isLive = avatar.type === 'live' || !avatar.type;

    // Rig сигнали (гладко)
    const k = 1 - Math.exp(-delta / 0.08);
    uniforms.uJaw.value += ((bs.jawOpen || 0) - uniforms.uJaw.value) * k;
    uniforms.uBlinkL.value += ((bs.blinkL || 0) - uniforms.uBlinkL.value) * k;
    uniforms.uBlinkR.value += ((bs.blinkR || 0) - uniforms.uBlinkR.value) * k;
    uniforms.uSmile.value += ((bs.smile || 0) - uniforms.uSmile.value) * k;

    const now = performance.now();
    const stamp = landmarkStampRef?.current ?? 0;
    const fresh = stamp > 0 && now - stamp < PRESENCE_TIMEOUT_MS;
    const handFresh = (handStampRef?.current ?? 0) > 0 && now - (handStampRef?.current ?? 0) < HAND_TIMEOUT_MS;

    // Clear drawing сигнал
    if (clearSignalRef && clearSignalRef.current !== s.lastClear) {
      s.lastClear = clearSignalRef.current;
      clearTrail(geometry.attributes.position.array, TRAIL_OFFSET, s.trail);
      geometry.attributes.position.needsUpdate = true;
    }
    if (!s.trailInit) { initTrailHidden(geometry.attributes.position.array, TRAIL_OFFSET); s.trailInit = true; }

    if (fresh && landmarksBufRef?.current) {
      const data = landmarkTex.image.data;
      mapLandmarksToWorld(landmarksBufRef.current, data, s.mappingState, delta);
      const anchors = computeAnchors(data);
      const posArr = geometry.attributes.position.array;
      let mouthWorld;

      if (isLive) {
        if (avatar.deform) deformLandmarks(data, avatar.deform, anchors);
        applyBlink(data, anchors, uniforms.uBlinkL.value, uniforms.uBlinkR.value);
        landmarkTex.needsUpdate = true;
        // Устата (за talk effects) — горна устна ~13
        mouthWorld = [data[13 * 4], data[13 * 4 + 1], data[13 * 4 + 2]];
      } else {
        // Head pose basis от живите очи
        const right = norm([anchors.eyeR[0] - anchors.eyeL[0], anchors.eyeR[1] - anchors.eyeL[1], anchors.eyeR[2] - anchors.eyeL[2]]);
        const fwd = norm(cross(right, [0, 1, 0]));
        const up = norm(cross(fwd, right));
        uniforms.uHeadR.value.set(right[0], right[1], right[2]);
        uniforms.uHeadU.value.set(up[0], up[1], up[2]);
        uniforms.uHeadF.value.set(fwd[0], fwd[1], fwd[2]);
        uniforms.uHeadScale.value = anchors.eyeDist;
        const ox = anchors.centerX, oy = anchors.eyeCenterY, oz = (anchors.eyeL[2] + anchors.eyeR[2]) / 2;
        uniforms.uHeadPos.value.set(ox, oy, oz);
        // Устата в world (от rig центъра)
        const mc = uniforms.uMouthC.value, sc = anchors.eyeDist;
        mouthWorld = [
          ox + (right[0] * mc.x + up[0] * mc.y + fwd[0] * 0.5) * sc,
          oy + (right[1] * mc.x + up[1] * mc.y + fwd[1] * 0.5) * sc,
          oz + (right[2] * mc.x + up[2] * mc.y + fwd[2] * 0.5) * sc,
        ];
      }

      // Accessories (само за live custom с accessory; character/drawn → none)
      const acc = isLive ? avatar.accessory || 'none' : 'none';
      if (acc !== 'none') {
        updateAccessories(posArr, ACC_OFFSET, acc, anchors, { jaw: uniforms.uJaw.value });
      } else if (s.prevAcc !== 'none') {
        for (let i = ACC_OFFSET; i < EMITTER_OFFSET; i++) posArr[i * 3 + 2] = -1000;
      }
      s.prevAcc = acc;

      // Talk effects
      updateEmitter(posArr, EMITTER_OFFSET, s.emitter, delta, {
        mouthWorld, jaw: uniforms.uJaw.value, kind: fx.talkKind, scale: anchors.eyeDist,
      });

      // Ръце + рисуване
      updateHands(posArr, HANDS_OFFSET, handBufRef?.current, s.mappingState, handFresh && fx.showHands);
      updateTrail(posArr, TRAIL_OFFSET, s.trail, handBufRef?.current, s.mappingState, handFresh, fx.drawOn);

      geometry.attributes.position.needsUpdate = true;

      // Area-weighted rebind (само live)
      if (isLive && !s.rebindDone) {
        s.stableFrames++;
        if (s.stableFrames >= REBIND_AFTER_FRAMES) {
          const triCount = FACE_TRIANGULATION.length / 3;
          const areas = new Float32Array(triCount);
          for (let t = 0; t < triCount; t++) areas[t] = triAreaFromTex(data, FACE_TRIANGULATION[t * 3], FACE_TRIANGULATION[t * 3 + 1], FACE_TRIANGULATION[t * 3 + 2]);
          const { tri: triB, bary: baryB } = buildTriangleBinding(Math.floor(FACE_COUNT * 0.6), FACE_TRIANGULATION, 555, areas);
          geometry.attributes.aTri.array.set(triB, 0);
          geometry.attributes.aBary.array.set(baryB, 0);
          geometry.attributes.aTri.needsUpdate = true;
          geometry.attributes.aBary.needsUpdate = true;
          s.rebindDone = true;
        }
      }
    } else {
      hideEmitter(geometry.attributes.position.array, EMITTER_OFFSET);
      geometry.attributes.position.needsUpdate = true;
    }

    // Presence + avatar mode damp
    const presenceTarget = fresh ? 1 : 0;
    const lambda = presenceTarget > uniforms.uPresence.value ? 2.5 : 1.0;
    uniforms.uPresence.value = THREE.MathUtils.damp(uniforms.uPresence.value, presenceTarget, lambda, delta);
    uniforms.uAvatarMode.value = THREE.MathUtils.damp(uniforms.uAvatarMode.value, isLive ? 0 : 1, 6, delta);

    // Цвят
    let target;
    if (emotionColorRef?.current) target = fresh ? EMOTION_COLORS[emotion] ?? EMOTION_COLORS.neutral : IDLE_COLOR;
    else target = avatar.fixedColorObj || EMOTION_COLORS.neutral;
    uniforms.uColor.value.lerp(target, 1 - Math.exp(-delta / 0.4));
  });

  return (
    <points geometry={geometry} frustumCulled={false} raycast={() => null}>
      <shaderMaterial vertexShader={moodVertex} fragmentShader={moodFragment} uniforms={uniforms} transparent blending={THREE.AdditiveBlending} depthWrite={false} depthTest={false} />
    </points>
  );
}
