import { useState, useRef, useCallback } from 'react';
import { Landing } from './pages/Landing';
import { SoloCanvas } from './pages/SoloCanvas';
import { CollectiveCanvas } from './pages/CollectiveCanvas';
import { Gallery } from './pages/Gallery';
import { MoodCheck } from './pages/MoodCheck';
import { WebForge } from './pages/WebForge';
import { TransitionVeil } from './components/TransitionVeil';
import { Cursor } from './components/Cursor';

const VEIL_IN_MS = 340;
const VEIL_OUT_MS = 380;

export default function App() {
  const [screen, setScreen] = useState('landing');
  // 'landing' | 'solo' | 'collective' | 'gallery' | 'moodcheck'
  const [editArtwork, setEditArtwork] = useState(null);
  const [veilPhase, setVeilPhase] = useState(null); // null | 'in' | 'out'
  const transitioningRef = useRef(false);

  // navigate(screen) за смяна на екрана; navigate(screen, payload) пренася
  // данни (Gallery → Solo за редакция). Смяната минава през воала:
  // veil-in → swap по средата → veil-out.
  const navigate = useCallback((nextScreen, payload) => {
    if (transitioningRef.current) return;
    transitioningRef.current = true;
    if (payload !== undefined) setEditArtwork(payload);
    setVeilPhase('in');
    setTimeout(() => {
      setScreen(nextScreen);
      setVeilPhase('out');
      setTimeout(() => {
        setVeilPhase(null);
        transitioningRef.current = false;
      }, VEIL_OUT_MS);
    }, VEIL_IN_MS);
  }, []);

  // Custom cursor само на "витринните" екрани — не върху работните платна
  const cursorActive = screen === 'landing' || screen === 'gallery';

  return (
    <div className={`h-full w-full ${cursorActive ? 'cursor-none-zone' : ''}`}>
      {screen === 'landing' && <Landing navigate={navigate} />}
      {screen === 'solo' && (
        <SoloCanvas
          navigate={navigate}
          artworkToEdit={editArtwork}
          onArtworkConsumed={() => setEditArtwork(null)}
        />
      )}
      {screen === 'collective' && <CollectiveCanvas navigate={navigate} />}
      {screen === 'gallery' && <Gallery navigate={navigate} />}
      {screen === 'moodcheck' && <MoodCheck navigate={navigate} />}
      {screen === 'webforge' && <WebForge navigate={navigate} />}

      <TransitionVeil phase={veilPhase} />
      <Cursor active={cursorActive} />
      <div className="grain-overlay" />
    </div>
  );
}
