import { Canvas } from '@react-three/fiber';
import { FaceParticles } from './FaceParticles';

/**
 * MoodParticleScene — R3F Canvas за Mood Check, по HeroScene конвенциите.
 * preserveDrawingBuffer е включен САМО тук (нужен за snapshot toDataURL).
 * onSnapshotReady получава функция, връщаща PNG dataURL на текущия кадър.
 */
export function MoodParticleScene({
  emotionRef,
  landmarksBufRef,
  landmarkStampRef,
  avatarRef,
  emotionColorRef,
  onSnapshotReady,
  onCanvasReady,
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
        preserveDrawingBuffer: true, // за snapshot + captureStream запис
      }}
      camera={{ fov: 50, position: [0, 0, 7], near: 0.1, far: 30 }}
      style={{ pointerEvents: 'none' }}
      onCreated={({ gl }) => {
        gl.setClearColor('#050505', 1);
        onSnapshotReady?.(() => gl.domElement.toDataURL('image/png'));
        onCanvasReady?.(gl.domElement);
      }}
    >
      <FaceParticles
        emotionRef={emotionRef}
        landmarksBufRef={landmarksBufRef}
        landmarkStampRef={landmarkStampRef}
        avatarRef={avatarRef}
        emotionColorRef={emotionColorRef}
      />
    </Canvas>
  );
}
