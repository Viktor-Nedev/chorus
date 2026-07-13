import { useMemo, useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { dustVertex, dustFragment } from './shaders';

const MAX_DUST = 400;

// Атмосферен прах — дребни дрейфащи точки на различни дълбочини.
export function DustField({ drawCount, scrollProgressRef, reducedMotion }) {
  const { gl } = useThree();

  const geometry = useMemo(() => {
    const pos = new Float32Array(MAX_DUST * 3);
    const scale = new Float32Array(MAX_DUST);
    const phase = new Float32Array(MAX_DUST);
    for (let i = 0; i < MAX_DUST; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 14;
      pos[i * 3 + 1] = (Math.random() - 0.5) * 8;
      pos[i * 3 + 2] = -6 + Math.random() * 7.5;
      scale[i] = 0.5 + Math.random();
      phase[i] = Math.random() * Math.PI * 2;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aScale', new THREE.BufferAttribute(scale, 1));
    geo.setAttribute('aPhase', new THREE.BufferAttribute(phase, 1));
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), 50);
    return geo;
  }, []);

  useEffect(() => {
    geometry.setDrawRange(0, drawCount);
  }, [geometry, drawCount]);

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uScatter: { value: 0 },
      uPixelRatio: { value: gl.getPixelRatio() },
      uColorDim: { value: new THREE.Color('#D9D9D9') },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  useFrame((state, delta) => {
    if (reducedMotion) return;
    uniforms.uTime.value = state.clock.elapsedTime % 3600;
    uniforms.uPixelRatio.value = gl.getPixelRatio();
    const raw = scrollProgressRef?.current ?? 0;
    uniforms.uScatter.value = THREE.MathUtils.damp(
      uniforms.uScatter.value, THREE.MathUtils.clamp(raw / 5, 0, 1), 4, delta
    );
  });

  return (
    <points geometry={geometry} renderOrder={0} raycast={() => null}>
      <shaderMaterial
        vertexShader={dustVertex}
        fragmentShader={dustFragment}
        uniforms={uniforms}
        transparent
        blending={THREE.AdditiveBlending}
        depthWrite={false}
        depthTest={false}
      />
    </points>
  );
}
