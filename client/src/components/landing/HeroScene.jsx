import { useState, useMemo, Suspense } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { PerformanceMonitor } from '@react-three/drei';
import * as THREE from 'three';
import { ParticleSculpture } from './hero/ParticleSculpture';
import { FlowingLines } from './hero/FlowingLines';
import { DustField } from './hero/DustField';
import { useHeroPointer } from './hero/useHeroPointer';

// Перформанс нива — никога не преалокираме геометрия, само drawRange/DPR
const TIERS = [
  { particles: 8000, dust: 150, lines: false, dpr: 1.25 },
  { particles: 14000, dust: 250, lines: true, dpr: 1.5 },
  { particles: 24000, dust: 400, lines: true, dpr: 1.75 },
];

// Камера parallax — фини стойности, "луксозно" а не gamey усещане
function CameraRig({ pointer, reducedMotion }) {
  const { camera } = useThree();
  useFrame((state, delta) => {
    if (reducedMotion) return;
    camera.position.x = THREE.MathUtils.damp(
      camera.position.x, pointer.smoothed.current.x * 0.35, 1.8, delta
    );
    camera.position.y = THREE.MathUtils.damp(
      camera.position.y, pointer.smoothed.current.y * 0.22, 1.8, delta
    );
    camera.lookAt(0, 0, 0);
  });
  return null;
}

function SceneContents({ tier, pointer, scrollProgressRef, reducedMotion }) {
  const t = TIERS[tier];
  return (
    <>
      <CameraRig pointer={pointer} reducedMotion={reducedMotion} />
      {t.lines && (
        <FlowingLines scrollProgressRef={scrollProgressRef} reducedMotion={reducedMotion} />
      )}
      <DustField
        drawCount={t.dust}
        scrollProgressRef={scrollProgressRef}
        reducedMotion={reducedMotion}
      />
      <ParticleSculpture
        drawCount={t.particles}
        pointer={pointer}
        scrollProgressRef={scrollProgressRef}
        reducedMotion={reducedMotion}
      />
    </>
  );
}

/**
 * HeroScene — WebGL частична инсталация за Landing hero-то.
 * - scrollProgressRef: { current: 0..1 } — мутиран от Lenis, чете се per-frame
 * - Никаква интерактивност през canvas-а (pointer-events: none) — мишката се
 *   слуша на window, скролът минава свободно към Lenis.
 */
export function HeroScene({ scrollProgressRef, className = '' }) {
  const pointer = useHeroPointer();
  const [webglFailed, setWebglFailed] = useState(false);

  const reducedMotion = useMemo(
    () =>
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    []
  );

  const [tier, setTier] = useState(() => {
    const lowEnd =
      typeof navigator !== 'undefined' &&
      (navigator.hardwareConcurrency <= 4 || /Android|iPhone|iPad/.test(navigator.userAgent));
    return lowEnd ? 1 : 2;
  });

  if (webglFailed) {
    return (
      <div
        className={className}
        style={{
          background: 'radial-gradient(ellipse at 50% 45%, #0a0a12 0%, #050505 70%)',
        }}
      />
    );
  }

  return (
    <div className={className} style={{ pointerEvents: 'none' }}>
      <Canvas
        dpr={TIERS[tier].dpr}
        flat
        frameloop={reducedMotion ? 'demand' : 'always'}
        gl={{
          antialias: false,
          alpha: false,
          stencil: false,
          powerPreference: 'high-performance',
        }}
        camera={{ fov: 50, position: [0, 0, 7], near: 0.1, far: 30 }}
        style={{ pointerEvents: 'none' }}
        onCreated={({ gl }) => gl.setClearColor('#050505', 1)}
        onError={() => setWebglFailed(true)}
      >
        <Suspense fallback={null}>
          <PerformanceMonitor
            bounds={() => [45, 60]}
            flipflops={3}
            onDecline={() => setTier((t) => Math.max(0, t - 1))}
            onFallback={() => setTier(0)}
          >
            <SceneContents
              tier={tier}
              pointer={pointer}
              scrollProgressRef={scrollProgressRef}
              reducedMotion={reducedMotion}
            />
          </PerformanceMonitor>
        </Suspense>
      </Canvas>
    </div>
  );
}
