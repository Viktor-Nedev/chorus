import { useEffect, useRef } from 'react';
import { SculptEngine } from '../../engine/sculpt/SculptEngine';

// Тънка обвивка: SculptEngine се създава ВЕДНЪЖ; callbacks идват през
// refs, за да не re-mount-ва engine-а при re-render.
export function SculptCanvas({ onReady, onSelectionChanged, onSceneChanged, onToolDone }) {
  const hostRef = useRef(null);
  const cbRef = useRef({});
  cbRef.current = { onReady, onSelectionChanged, onSceneChanged, onToolDone };

  useEffect(() => {
    const engine = new SculptEngine(hostRef.current, {
      onSelectionChanged: (info) => cbRef.current.onSelectionChanged?.(info),
      onSceneChanged: () => cbRef.current.onSceneChanged?.(),
      onToolDone: (tool) => cbRef.current.onToolDone?.(tool),
    });
    cbRef.current.onReady?.(engine);
    return () => engine.dispose();
  }, []);

  return <div ref={hostRef} className="absolute inset-0" />;
}
