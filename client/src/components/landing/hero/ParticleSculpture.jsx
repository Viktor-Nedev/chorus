import { useMemo, useRef, useEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { buildFormations } from './formations';
import { sculptureVertex, sculptureFragment } from './shaders';

const MAX_PARTICLES = 30000;
// Скулптурата дипва леко надолу ПО ВРЕМЕ на прехода между секции (усещане за
// "пътуване"), но се връща в центъра, когато секцията е установена — така
// всяка фигура стои вертикално центрирана до съдържанието на своята секция.
const TRANSITION_DIP = 0.9;
// Хоризонтално отместване = дял от полу-ширината на viewport-а, за да седи
// фигурата в ЦЕНТЪРА на празната половина при всякаква ширина на екрана.
// Редува се ляво/дясно на всяка секция (срещуположно на текста).
const SIDE_FRACTION = 0.5;

// Цветова палитра по формация/секция — Hero (неутрално) → About (мента) →
// Modes (виолетово) → Instruments (златно) → Footer (розово).
// Дължината на масива = брой активни секции (clamp-ът долу зависи от нея).
const PALETTE = [
  { base: new THREE.Color('#F5F5F5'), dim: new THREE.Color('#D9D9D9') },
  { base: new THREE.Color('#B9FFDD'), dim: new THREE.Color('#64FFB4') },
  { base: new THREE.Color('#C9BBFF'), dim: new THREE.Color('#8B7BFA') },
  { base: new THREE.Color('#FFE3B0'), dim: new THREE.Color('#FFB86B') },
  { base: new THREE.Color('#FFD1E8'), dim: new THREE.Color('#FF8FC7') },
];

// Страна на скулптурата по индекс на секция: Hero центрирано; после се
// редува ляво/дясно/ляво/дясно...
function sideSign(idx) {
  if (idx <= 0) return 0;
  return idx % 2 === 1 ? -1 : 1;
}

export function ParticleSculpture({ drawCount, pointer, scrollProgressRef, reducedMotion }) {
  const pointsRef = useRef(null);
  const groupRef = useRef(null);
  const { viewport, gl } = useThree();

  // Геометрия — алокира се веднъж, tier-овете само сменят drawRange
  const geometry = useMemo(() => {
    const { posA, posB, posC, posD, posE, posF, rand, dir } = buildFormations(MAX_PARTICLES);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(posA, 3));
    geo.setAttribute('aPosB', new THREE.BufferAttribute(posB, 3));
    geo.setAttribute('aPosC', new THREE.BufferAttribute(posC, 3));
    geo.setAttribute('aPosD', new THREE.BufferAttribute(posD, 3));
    geo.setAttribute('aPosE', new THREE.BufferAttribute(posE, 3));
    geo.setAttribute('aPosF', new THREE.BufferAttribute(posF, 3));
    geo.setAttribute('aRand', new THREE.BufferAttribute(rand, 4));
    geo.setAttribute('aDir', new THREE.BufferAttribute(dir, 3));
    // Bounding sphere ръчно — изчисляването върху 30k точки е излишно,
    // а frustum culling не бива да скрива скулптурата при разпръскване
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), 50);
    return geo;
  }, []);

  useEffect(() => {
    geometry.setDrawRange(0, drawCount);
  }, [geometry, drawCount]);

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uMorph: { value: 0 },
      uScatter: { value: 0 },
      uMouse: { value: new THREE.Vector3() },
      uMouseForce: { value: 0 },
      uSize: { value: 26.0 },
      uPixelRatio: { value: gl.getPixelRatio() },
      uColorBase: { value: new THREE.Color('#F5F5F5') },
      uColorDim: { value: new THREE.Color('#D9D9D9') },
      uColorCyan: { value: new THREE.Color('#67E8F9') },
      uColorViolet: { value: new THREE.Color('#A78BFA') },
      uColorGold: { value: new THREE.Color('#FFD27F') },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  useFrame((state, delta) => {
    if (reducedMotion) return;
    const elapsed = state.clock.elapsedTime % 3600;
    uniforms.uTime.value = elapsed;
    uniforms.uPixelRatio.value = gl.getPixelRatio();

    // sectionProgress: непрекъснат индекс 0..5 — колко "секции напред" е
    // скролнал потребителят (дробна част = позиция вътре в текущата секция)
    const sIdx = THREE.MathUtils.clamp(scrollProgressRef?.current ?? 0, 0, PALETTE.length - 1);
    const floorIdx = Math.floor(sIdx);
    const frac = sIdx - floorIdx;

    // Формата се "заключва" бързо в началото на секцията (~28%) и остава
    // стабилна, докато потребителят чете съдържанието ѝ.
    const quick = THREE.MathUtils.smoothstep(frac, 0.0, 0.28);
    const targetMorph = floorIdx + quick;
    uniforms.uMorph.value = THREE.MathUtils.damp(uniforms.uMorph.value, targetMorph, 6, delta);

    // Пулс на разпръскване точно при влизане във всяка секция — "разтваря
    // се и се преформира", вместо мигновена смяна.
    const pulseIn = THREE.MathUtils.smoothstep(frac, 0.0, 0.14);
    const pulseOut = 1.0 - THREE.MathUtils.smoothstep(frac, 0.14, 0.32);
    const pulse = pulseIn * pulseOut * 0.55;
    uniforms.uScatter.value = THREE.MathUtils.damp(uniforms.uScatter.value, pulse, 5, delta);

    // ПОКАЗВАНА секция: формата се сменя на ~14% от прехода (quick минава 0.5),
    // точно по време на scatter пулса. Страната, цветът И позицията се ключат
    // към нея — иначе спиралата (напр.) се появява, но още стои на страната на
    // предишната секция.
    const nextIdx = Math.min(floorIdx + 1, PALETTE.length - 1);
    const shownIdx = quick >= 0.5 ? nextIdx : floorIdx;

    // Цветова палитра — преход синхронен с формата (по quick, не по frac)
    uniforms.uColorBase.value.copy(PALETTE[floorIdx].base).lerp(PALETTE[nextIdx].base, quick);
    uniforms.uColorDim.value.copy(PALETTE[floorIdx].dim).lerp(PALETTE[nextIdx].dim, quick);

    // Мишка → world координати на z=0 равнината
    pointer.smoothed.current.x = THREE.MathUtils.damp(
      pointer.smoothed.current.x, pointer.target.current.x, 2.5, delta
    );
    pointer.smoothed.current.y = THREE.MathUtils.damp(
      pointer.smoothed.current.y, pointer.target.current.y, 2.5, delta
    );
    uniforms.uMouse.value.set(
      (pointer.smoothed.current.x * viewport.width) / 2,
      (pointer.smoothed.current.y * viewport.height) / 2,
      0
    );
    const moving = performance.now() - pointer.lastMove.current < 120;
    pointer.force.current = THREE.MathUtils.damp(
      pointer.force.current, moving ? 1 : 0.25, 1.5, delta
    );
    uniforms.uMouseForce.value = pointer.force.current;

    // Хоризонтално: центрирай фигурата в празната половина (срещу текста),
    // мащабирано спрямо реалната ширина на viewport-а. Вертикално: центрирано
    // до секцията, с лек dip само по средата на прехода (frac≈0.5).
    if (groupRef.current) {
      const halfW = viewport.width / 2;
      const targetX = sideSign(shownIdx) * halfW * SIDE_FRACTION;
      const targetY = -Math.sin(Math.min(frac, 1) * Math.PI) * TRANSITION_DIP;
      groupRef.current.position.x = THREE.MathUtils.damp(
        groupRef.current.position.x, targetX, 3.5, delta
      );
      groupRef.current.position.y = THREE.MathUtils.damp(
        groupRef.current.position.y, targetY, 4, delta
      );
    }
  });

  return (
    <group ref={groupRef}>
      <points ref={pointsRef} geometry={geometry} renderOrder={1} raycast={() => null}>
        <shaderMaterial
          vertexShader={sculptureVertex}
          fragmentShader={sculptureFragment}
          uniforms={uniforms}
          transparent
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          depthTest={false}
        />
      </points>
    </group>
  );
}
