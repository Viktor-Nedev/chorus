import { useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { linesVertex, linesFragment } from './shaders';

// Фонови "течащи линии" — една frustum-запълваща равнина с процедурен
// fragment shader (iso-линии от warped fbm), по референтния album-cover look.
export function FlowingLines({ scrollProgressRef, reducedMotion }) {
  const meshRef = useRef(null);
  const { viewport, camera } = useThree();

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uScatter: { value: 0 },
      uAspect: { value: 1 },
      uColorDim: { value: new THREE.Color('#8A8A92') },
      uColorBase: { value: new THREE.Color('#F5F5F5') },
      uColorCyan: { value: new THREE.Color('#67E8F9') },
      uColorViolet: { value: new THREE.Color('#A78BFA') },
    }),
    []
  );

  useFrame((state, delta) => {
    if (reducedMotion) return;
    uniforms.uTime.value = state.clock.elapsedTime % 3600;
    uniforms.uAspect.value = viewport.aspect;

    // scrollProgressRef е 0..4 (непрекъснат "секция-индекс") — нормализирай
    // за бавно нарастващо завихряне през цялото пътуване надолу по страницата
    const raw = scrollProgressRef?.current ?? 0;
    const c = THREE.MathUtils.clamp(raw / 5, 0, 1);
    uniforms.uScatter.value = THREE.MathUtils.damp(
      uniforms.uScatter.value, c * c * (3 - 2 * c), 4, delta
    );

    // Мащабирай равнината да запълва frustum-а на нейната дълбочина (+10% bleed)
    const mesh = meshRef.current;
    if (mesh) {
      const dist = camera.position.z - mesh.position.z;
      const h = 2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2) * dist;
      mesh.scale.set(h * viewport.aspect * 1.1, h * 1.1, 1);
    }
  });

  return (
    <mesh ref={meshRef} position={[0, 0, -3.5]} renderOrder={-1} raycast={() => null}>
      <planeGeometry args={[1, 1]} />
      <shaderMaterial
        vertexShader={linesVertex}
        fragmentShader={linesFragment}
        uniforms={uniforms}
        transparent
        blending={THREE.AdditiveBlending}
        depthWrite={false}
        depthTest={false}
      />
    </mesh>
  );
}
