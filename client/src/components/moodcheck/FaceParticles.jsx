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

const PARTICLE_COUNT = 24576;
const SWAP_DEBOUNCE_MS = 600;
const PRESENCE_TIMEOUT_MS = 500;
// След колко кадъра стабилна детекция правим еднократния area-weighted
// rebind (равномерно покритие по реалната площ на лицето)
const REBIND_AFTER_FRAMES = 45;

// Преалокирани Color обекти — нула алокации в useFrame
const EMOTION_COLORS = Object.fromEntries(
  Object.entries(EMOTION_HEX).map(([k, hex]) => [k, new THREE.Color(hex)])
);
const IDLE_COLOR = new THREE.Color(EMOTION_HEX.neutral).multiplyScalar(0.6);

const easeBlend = (b) => b * b * (3 - 2 * b);

// Площ на триъгълник по 3 world-space точки от texture буфера (RGBA layout)
function triAreaFromTex(data, ia, ib, ic) {
  const ax = data[ia * 4];
  const ay = data[ia * 4 + 1];
  const az = data[ia * 4 + 2];
  const bx = data[ib * 4] - ax;
  const by = data[ib * 4 + 1] - ay;
  const bz = data[ib * 4 + 2] - az;
  const cx = data[ic * 4] - ax;
  const cy = data[ic * 4 + 1] - ay;
  const cz = data[ic * 4 + 2] - az;
  const nx = by * cz - bz * cy;
  const ny = bz * cx - bx * cz;
  const nz = bx * cy - by * cx;
  return Math.sqrt(nx * nx + ny * ny + nz * nz) / 2;
}

/**
 * FaceParticles — 24k частици, оркестрирани в два режима:
 *  - Aura (modeTarget=0): 6 emotion формации, from/to attribute rewrite при
 *    смяна на емоция (с mid-morph retargeting за безшевни any→any преходи)
 *  - Mirror (modeTarget=1): истинска 1:1 повърхност — barycentric семплиране
 *    върху 880-те триъгълника на живия MediaPipe face mesh (DataTexture)
 */
export function FaceParticles({ modeTarget, emotionRef, landmarksBufRef, landmarkStampRef }) {
  const { gl } = useThree();

  // ── Bake на геометрията (веднъж)
  const { geometry, formations } = useMemo(() => {
    const samples = makeSharedSamples(PARTICLE_COUNT);
    const formations = {};
    for (const [emotion, params] of Object.entries(EMOTION_FACE_PARAMS)) {
      formations[emotion] = buildFaceFormation(params, samples);
    }
    const ambient = buildAmbient(PARTICLE_COUNT);
    const jitter = buildJitter(PARTICLE_COUNT);
    // Начално binding: равномерно по триъгълници (малките триъгълници около
    // очи/устни излизат по-плътни → фичърите се четат). След първата
    // детекция се прави еднократен 60/40 area-weighted rebind за по-
    // равномерна кожа при запазен акцент върху фичърите.
    const { tri, bary } = buildTriangleBinding(PARTICLE_COUNT, FACE_TRIANGULATION);

    const seeds = new Float32Array(PARTICLE_COUNT);
    for (let i = 0; i < PARTICLE_COUNT; i++) seeds[i] = Math.random();

    const geo = new THREE.BufferGeometry();
    // position играе ролята на aPosFrom — стартираме от neutral
    geo.setAttribute('position', new THREE.BufferAttribute(formations.neutral.slice(), 3));
    geo.setAttribute('aPosTo', new THREE.BufferAttribute(formations.neutral.slice(), 3));
    geo.setAttribute('aAmbient', new THREE.BufferAttribute(ambient, 3));
    geo.setAttribute('aJitter', new THREE.BufferAttribute(jitter, 3));
    geo.setAttribute('aTri', new THREE.BufferAttribute(tri, 3));
    geo.setAttribute('aBary', new THREE.BufferAttribute(bary, 3));
    geo.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1));
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), 50);
    return { geometry: geo, formations };
  }, []);

  // ── Landmark DataTexture (нулирана — mirror клонът чете безопасно преди детекция)
  const landmarkTex = useMemo(() => {
    const data = new Float32Array(LM_COUNT * 4);
    const tex = new THREE.DataTexture(data, LM_COUNT, 1, THREE.RGBAFormat, THREE.FloatType);
    tex.minFilter = THREE.NearestFilter; // ЗАДЪЛЖИТЕЛНО: Linear+Float = мълчаливо нули
    tex.magFilter = THREE.NearestFilter;
    tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.generateMipmaps = false;
    tex.flipY = false;
    tex.needsUpdate = true;
    return tex;
  }, []);

  // Ръчно disposal — текстури в uniforms НЕ се release-ват от R3F автоматично
  useEffect(() => () => landmarkTex.dispose(), [landmarkTex]);

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uMode: { value: 0 },
      uBlend: { value: 1 },
      uPresence: { value: 0 },
      uColor: { value: new THREE.Color(EMOTION_HEX.neutral) },
      uLandmarks: { value: landmarkTex },
      uSize: { value: 26.0 },
      uPixelRatio: { value: gl.getPixelRatio() },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  // ── Morph state (в refs, не React state)
  const morphState = useRef({
    currentEmotion: 'neutral',
    lastSwapAt: 0,
    mappingState: createMappingState(),
    stableFrames: 0,
    rebindDone: false,
  });

  useFrame((state, delta) => {
    const st = morphState.current;
    const elapsed = state.clock.elapsedTime % 3600;
    uniforms.uTime.value = elapsed;
    uniforms.uPixelRatio.value = gl.getPixelRatio();

    // ── Aura: blend анимация + emotion swap (debounce ≥600ms)
    uniforms.uBlend.value = Math.min(1, uniforms.uBlend.value + delta / 0.9);

    const emotion = emotionRef?.current ?? 'neutral';
    const now = performance.now();
    if (
      emotion !== st.currentEmotion &&
      formations[emotion] &&
      now - st.lastSwapAt > SWAP_DEBOUNCE_MS
    ) {
      // Mid-morph retarget: замрази текущата eased поза като нова from-позиция,
      // после насочи to-масива към новата формация — any→any без телепорт.
      const fromArr = geometry.attributes.position.array;
      const toArr = geometry.attributes.aPosTo.array;
      const b = easeBlend(uniforms.uBlend.value);
      const next = formations[emotion];
      for (let i = 0; i < fromArr.length; i++) {
        fromArr[i] = fromArr[i] + (toArr[i] - fromArr[i]) * b;
        toArr[i] = next[i];
      }
      geometry.attributes.position.needsUpdate = true;
      geometry.attributes.aPosTo.needsUpdate = true;
      uniforms.uBlend.value = 0;
      st.currentEmotion = emotion;
      st.lastSwapAt = now;
    }

    // ── Mirror: landmark mapping → texture (само при свежи данни)
    const stamp = landmarkStampRef?.current ?? 0;
    const fresh = stamp > 0 && now - stamp < PRESENCE_TIMEOUT_MS;
    if (fresh && landmarksBufRef?.current) {
      mapLandmarksToWorld(landmarksBufRef.current, landmarkTex.image.data, st.mappingState, delta);
      landmarkTex.needsUpdate = true;

      // Еднократен area-weighted rebind: след стабилна детекция изчисли
      // реалните площи на триъгълниците и пре-семплирай 60% от binding-а
      // пропорционално на площ (равномерна кожа) + 40% равномерно по
      // триъгълници (акцент върху фините фичъри с малки триъгълници).
      if (!st.rebindDone) {
        st.stableFrames++;
        if (st.stableFrames >= REBIND_AFTER_FRAMES) {
          const data = landmarkTex.image.data;
          const triCount = FACE_TRIANGULATION.length / 3;
          const areas = new Float32Array(triCount);
          for (let t = 0; t < triCount; t++) {
            areas[t] = triAreaFromTex(
              data,
              FACE_TRIANGULATION[t * 3],
              FACE_TRIANGULATION[t * 3 + 1],
              FACE_TRIANGULATION[t * 3 + 2]
            );
          }
          const areaCount = Math.floor(PARTICLE_COUNT * 0.6);
          const { tri: triA, bary: baryA } = buildTriangleBinding(
            areaCount, FACE_TRIANGULATION, 555, areas
          );
          const triArr = geometry.attributes.aTri.array;
          const baryArr = geometry.attributes.aBary.array;
          triArr.set(triA, 0);
          baryArr.set(baryA, 0);
          geometry.attributes.aTri.needsUpdate = true;
          geometry.attributes.aBary.needsUpdate = true;
          st.rebindDone = true;
        }
      }
    }

    // ── Damped uniforms
    uniforms.uMode.value = THREE.MathUtils.damp(uniforms.uMode.value, modeTarget, 4, delta);

    // Presence: асиметрично damping (бързо появяване, бавно изчезване)
    const presenceTarget = fresh ? 1 : 0;
    const lambda = presenceTarget > uniforms.uPresence.value ? 2.5 : 1.0;
    uniforms.uPresence.value = THREE.MathUtils.damp(
      uniforms.uPresence.value, presenceTarget, lambda, delta
    );

    // Цвят по емоция (или приглушен, ако няма лице)
    const targetColor = fresh ? EMOTION_COLORS[emotion] ?? EMOTION_COLORS.neutral : IDLE_COLOR;
    uniforms.uColor.value.lerp(targetColor, 1 - Math.exp(-delta / 0.4));
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
