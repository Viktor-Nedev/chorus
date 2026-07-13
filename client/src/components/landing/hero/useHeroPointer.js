import { useEffect, useRef } from 'react';
import * as THREE from 'three';

// Следи мишката на window ниво (canvas-ът е pointer-events:none) и връща
// refs, които се четат в useFrame без React re-render.
export function useHeroPointer() {
  const target = useRef(new THREE.Vector2()); // NDC -1..1
  const smoothed = useRef(new THREE.Vector2());
  const force = useRef(0);
  const lastMove = useRef(0);

  useEffect(() => {
    const onMove = (e) => {
      target.current.set(
        (e.clientX / window.innerWidth) * 2 - 1,
        -(e.clientY / window.innerHeight) * 2 + 1
      );
      lastMove.current = performance.now();
    };
    window.addEventListener('pointermove', onMove, { passive: true });
    return () => window.removeEventListener('pointermove', onMove);
  }, []);

  return { target, smoothed, force, lastMove };
}
