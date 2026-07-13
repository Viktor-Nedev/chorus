import { useEffect, useRef, useState } from 'react';
import gsap from 'gsap';

// Custom cursor: малка бяла точка (следва мигновено) + изоставащ пръстен
// (GSAP quickTo). Пръстенът се разширява над интерактивни елементи и се
// свива при натискане. Скрит на touch устройства.
export function Cursor({ active }) {
  const dotRef = useRef(null);
  const ringRef = useRef(null);
  const [hoverState, setHoverState] = useState(false);
  const [downState, setDownState] = useState(false);
  const [isTouch] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches
  );

  useEffect(() => {
    if (!active || isTouch) return;
    const dot = dotRef.current;
    const ring = ringRef.current;
    if (!dot || !ring) return;

    const dotX = gsap.quickTo(dot, 'x', { duration: 0.08, ease: 'power2.out' });
    const dotY = gsap.quickTo(dot, 'y', { duration: 0.08, ease: 'power2.out' });
    const ringX = gsap.quickTo(ring, 'x', { duration: 0.35, ease: 'power3.out' });
    const ringY = gsap.quickTo(ring, 'y', { duration: 0.35, ease: 'power3.out' });

    const isInteractive = (el) =>
      !!el.closest?.('button, a, input, select, textarea, [data-magnetic], [role="button"]');

    const onMove = (e) => {
      dotX(e.clientX);
      dotY(e.clientY);
      ringX(e.clientX);
      ringY(e.clientY);
      setHoverState(isInteractive(e.target));
    };
    const onDown = () => setDownState(true);
    const onUp = () => setDownState(false);

    window.addEventListener('pointermove', onMove, { passive: true });
    window.addEventListener('pointerdown', onDown);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointerup', onUp);
    };
  }, [active, isTouch]);

  if (!active || isTouch) return null;

  return (
    <>
      <div ref={dotRef} className="custom-cursor-dot" />
      <div
        ref={ringRef}
        className={`custom-cursor-ring ${downState ? 'is-down' : hoverState ? 'is-hover' : ''}`}
      />
    </>
  );
}
