import { Canvas } from '@react-three/fiber';
import { FaceParticles } from './FaceParticles';

/**
 * MoodParticleScene — R3F Canvas за Mood Check, по HeroScene конвенциите.
 * preserveDrawingBuffer е включен САМО тук (нужен за snapshot toDataURL).
 * onSnapshotReady получава функция, връщаща PNG dataURL на текущия кадър.
 */
export function MoodParticleScene({
  modeTarget,
  emotionRef,
  landmarksBufRef,
  landmarkStampRef,
  onSnapshotReady,
}) {
  return (
    <Canvas
      dpr={[1, 1.75]}
      flat
      gl={{
        antialias: false,
        alpha: false,
        stencil: false,
        powerPreference: 'high-performance',
        preserveDrawingBuffer: true, // за snapshot
      }}
      camera={{ fov: 50, position: [0, 0, 7], near: 0.1, far: 30 }}
      style={{ pointerEvents: 'none' }}
      onCreated={({ gl }) => {
        gl.setClearColor('#050505', 1);
        onSnapshotReady?.(() => gl.domElement.toDataURL('image/png'));
      }}
    >
      <FaceParticles
        modeTarget={modeTarget}
        emotionRef={emotionRef}
        landmarksBufRef={landmarksBufRef}
        landmarkStampRef={landmarkStampRef}
      />
    </Canvas>
  );
}
