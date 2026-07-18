import { useMemo, useRef, useEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import {
  makeSharedSamples,
  buildFaceFormation,
  buildAmbient,
  buildJitter,
  buildTriangleBinding,
  EMOTION_FACE_PARAMS,
} from './faceFormations';
import { mapLandmarksToWorld, createMappingState, LM_COUNT } from './landmarkMapping';
import { moodVertex, moodFragment } from './moodShaders';
import { FACE_TRIANGULATION } from './faceTriangulation';
import { EMOTION_HEX } from '../../constants/emotions';
import { AVATAR_MAP, DEFAULT_AVATAR } from './avatars';
import { computeAnchors, deformLandmarks } from './faceDeform';
import { updateAccessories, ACCESSORY_COUNT } from './accessories';

const FACE_COUNT = 24576;
const TOTAL_COUNT = FACE_COUNT + ACCESSORY_COUNT;
const PRESENCE_TIMEOUT_MS = 500;
const REBIND_AFTER_FRAMES = 45;

const EMOTION_COLORS = Object.fromEntries(
  Object.entries(EMOTION_HEX).map(([k, hex]) => [k, new THREE.Color(hex)])
);
const IDLE_COLOR = new THREE.Color(EMOTION_HEX.neutral).multiplyScalar(0.6);

// Площ на триъгълник по 3 world-space точки от texture буфера (RGBA layout)
function triAreaFromTex(data, ia, ib, ic) {
  const ax = data[ia * 4], ay = data[ia * 4 + 1], az = data[ia * 4 + 2];
  const bx = data[ib * 4] - ax, by = data[ib * 4 + 1] - ay, bz = data[ib * 4 + 2] - az;
  const cx = data[ic * 4] - ax, cy = data[ic * 4 + 1] - ay, cz = data[ic * 4 + 2] - az;
  const nx = by * cz - bz * cy, ny = bz * cx - bx * cz, nz = bx * cy - by * cx;
  return Math.sqrt(nx * nx + ny * ny + nz * nz) / 2;
}

/**
 * FaceParticles — Mirror-only particle аватар. Живото лице се реконструира
 * barycentric върху MediaPipe mesh-а; avatarRef.deform преоформя формата на
 * лицето (все още твоето лице), а accessory добавя частици на герой. Цветът
 * следва емоцията (ако emotionColorRef е ON) или фиксирания цвят на аватара.
 */
export function FaceParticles({ emotionRef, landmarksBufRef, landmarkStampRef, avatarRef, emotionColorRef }) {
  const { gl } = useThree();

  const { geometry } = useMemo(() => {
    const samples = makeSharedSamples(FACE_COUNT);
    const neutral = buildFaceFormation(EMOTION_FACE_PARAMS.neutral, samples);
    const ambient = buildAmbient(FACE_COUNT);
    const jitter = buildJitter(FACE_COUNT);
    const { tri, bary } = buildTriangleBinding(FACE_COUNT, FACE_TRIANGULATION);

    // Пълни буфери за FACE + ACCESSORY блоковете
    const position = new Float32Array(TOTAL_COUNT * 3);
    const posTo = new Float32Array(TOTAL_COUNT * 3);
    const ambientA = new Float32Array(TOTAL_COUNT * 3);
    const jitterA = new Float32Array(TOTAL_COUNT * 3);
    const triA = new Float32Array(TOTAL_COUNT * 3);
    const baryA = new Float32Array(TOTAL_COUNT * 3);
    const seeds = new Float32Array(TOTAL_COUNT);
    const accFlag = new Float32Array(TOTAL_COUNT);

    position.set(neutral, 0);
    posTo.set(neutral, 0);
    ambientA.set(ambient, 0);
    jitterA.set(jitter, 0);
    triA.set(tri, 0);
    baryA.set(bary, 0);
    for (let i = 0; i < FACE_COUNT; i++) seeds[i] = Math.random();

    // Accessory блок: скрит по подразбиране (зад far-равнината), ambient scatter
    for (let i = FACE_COUNT; i < TOTAL_COUNT; i++) {
      const j = i * 3;
      position[j] = 0; position[j + 1] = 0; position[j + 2] = -1000;
      ambientA[j] = (Math.random() - 0.5) * 12;
      ambientA[j + 1] = (Math.random() - 0.5) * 12;
      ambientA[j + 2] = (Math.random() - 0.5) * 6;
      seeds[i] = Math.random();
      accFlag[i] = 1;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(position, 3));
    geo.setAttribute('aPosTo', new THREE.BufferAttribute(posTo, 3));
    geo.setAttribute('aAmbient', new THREE.BufferAttribute(ambientA, 3));
    geo.setAttribute('aJitter', new THREE.BufferAttribute(jitterA, 3));
    geo.setAttribute('aTri', new THREE.BufferAttribute(triA, 3));
    geo.setAttribute('aBary', new THREE.BufferAttribute(baryA, 3));
    geo.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1));
    geo.setAttribute('aAccessory', new THREE.BufferAttribute(accFlag, 1));
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), 60);
    return { geometry: geo };
  }, []);

  const landmarkTex = useMemo(() => {
    const data = new Float32Array(LM_COUNT * 4);
    const tex = new THREE.DataTexture(data, LM_COUNT, 1, THREE.RGBAFormat, THREE.FloatType);
    tex.minFilter = THREE.NearestFilter;
    tex.magFilter = THREE.NearestFilter;
    tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.generateMipmaps = false;
    tex.flipY = false;
    tex.needsUpdate = true;
    return tex;
  }, []);

  useEffect(() => () => landmarkTex.dispose(), [landmarkTex]);

  const uniforms = useMemo(() => {
    const a0 = AVATAR_MAP[DEFAULT_AVATAR];
    return {
      uTime: { value: 0 },
      uMode: { value: 1 }, // винаги Mirror
      uBlend: { value: 1 },
      uPresence: { value: 0 },
      uColor: { value: new THREE.Color(EMOTION_HEX.neutral) },
      uGlow: { value: a0.glow },
      uSizeMul: { value: a0.particleSize },
      uLandmarks: { value: landmarkTex },
      uSize: { value: 26.0 },
      uPixelRatio: { value: gl.getPixelRatio() },
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const st = useRef({
    mappingState: createMappingState(),
    stableFrames: 0,
    rebindDone: false,
    prevAccessory: 'none',
  });

  useFrame((state, delta) => {
    const s = st.current;
    uniforms.uTime.value = state.clock.elapsedTime % 3600;
    uniforms.uPixelRatio.value = gl.getPixelRatio();

    const emotion = emotionRef?.current ?? 'neutral';
    const avatar = avatarRef?.current || AVATAR_MAP[DEFAULT_AVATAR];
    uniforms.uSizeMul.value = avatar.particleSize ?? 1;
    uniforms.uGlow.value = avatar.glow ?? 0.4;

    const now = performance.now();
    const stamp = landmarkStampRef?.current ?? 0;
    const fresh = stamp > 0 && now - stamp < PRESENCE_TIMEOUT_MS;

    if (fresh && landmarksBufRef?.current) {
      mapLandmarksToWorld(landmarksBufRef.current, landmarkTex.image.data, s.mappingState, delta);

      // ── Деформация на формата на лицето (no-op за "Real") ──
      const data = landmarkTex.image.data;
      const anchors = computeAnchors(data);
      if (avatar.deform) deformLandmarks(data, avatar.deform, anchors);
      landmarkTex.needsUpdate = true;

      // ── Аксесоари на героя (закотвени към главата) ──
      const acc = avatar.accessory || 'none';
      const posAttr = geometry.attributes.position;
      if (acc !== 'none') {
        updateAccessories(posAttr.array, FACE_COUNT, acc, anchors);
        posAttr.needsUpdate = true;
      } else if (s.prevAccessory !== 'none') {
        // Еднократно скриване при връщане към лице без аксесоар
        const arr = posAttr.array;
        for (let i = FACE_COUNT; i < TOTAL_COUNT; i++) arr[i * 3 + 2] = -1000;
        posAttr.needsUpdate = true;
      }
      s.prevAccessory = acc;

      // ── Еднократен area-weighted rebind (равномерна кожа) ──
      if (!s.rebindDone) {
        s.stableFrames++;
        if (s.stableFrames >= REBIND_AFTER_FRAMES) {
          const triCount = FACE_TRIANGULATION.length / 3;
          const areas = new Float32Array(triCount);
          for (let t = 0; t < triCount; t++) {
            areas[t] = triAreaFromTex(
              data, FACE_TRIANGULATION[t * 3], FACE_TRIANGULATION[t * 3 + 1], FACE_TRIANGULATION[t * 3 + 2]
            );
          }
          const areaCount = Math.floor(FACE_COUNT * 0.6);
          const { tri: triB, bary: baryB } = buildTriangleBinding(areaCount, FACE_TRIANGULATION, 555, areas);
          geometry.attributes.aTri.array.set(triB, 0);
          geometry.attributes.aBary.array.set(baryB, 0);
          geometry.attributes.aTri.needsUpdate = true;
          geometry.attributes.aBary.needsUpdate = true;
          s.rebindDone = true;
        }
      }
    }

    // Presence: бързо появяване, бавно изчезване
    const presenceTarget = fresh ? 1 : 0;
    const lambda = presenceTarget > uniforms.uPresence.value ? 2.5 : 1.0;
    uniforms.uPresence.value = THREE.MathUtils.damp(uniforms.uPresence.value, presenceTarget, lambda, delta);

    // Цвят: емоция (ако е включено) или фиксиран цвят на аватара
    let target;
    if (emotionColorRef?.current) {
      target = fresh ? EMOTION_COLORS[emotion] ?? EMOTION_COLORS.neutral : IDLE_COLOR;
    } else {
      target = avatar.fixedColorObj || EMOTION_COLORS.neutral;
    }
    uniforms.uColor.value.lerp(target, 1 - Math.exp(-delta / 0.4));
  });

  return (
    <points geometry={geometry} frustumCulled={false} raycast={() => null}>
      <shaderMaterial
        vertexShader={moodVertex}
        fragmentShader={moodFragment}
        uniforms={uniforms}
        transparent
        blending={THREE.AdditiveBlending}
        depthWrite={false}
        depthTest={false}
      />
    </points>
  );
}
