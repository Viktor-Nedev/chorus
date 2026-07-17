import { useState, useRef, useCallback } from 'react';
import { Landing } from './pages/Landing';
import { SoloCanvas } from './pages/SoloCanvas';
import { CollectiveCanvas } from './pages/CollectiveCanvas';
import { Gallery } from './pages/Gallery';
import { MoodCheck } from './pages/MoodCheck';
import { WebForge } from './pages/WebForge';
import { Sculpt } from './pages/Sculpt';
import { Auth } from './pages/Auth';
import { Profile } from './pages/Profile';
import { Compete } from './pages/Compete';
import { TransitionVeil } from './components/TransitionVeil';
import { Cursor } from './components/Cursor';
import { useAuth } from './hooks/useAuth';

const VEIL_IN_MS = 340;
const VEIL_OUT_MS = 380;

// Режимите изискват акаунт — гост се пренасочва към Auth и после обратно
const PROTECTED = new Set(['solo', 'collective', 'moodcheck', 'webforge', 'sculpt', 'profile', 'compete']);

export default function App() {
  const { user } = useAuth();
  const userRef = useRef(null);
  userRef.current = user;

  const [screen, setScreen] = useState('landing');
  const screenRef = useRef('landing');
  screenRef.current = screen;
  const [editArtwork, setEditArtwork] = useState(null);
  const [postAuthTarget, setPostAuthTarget] = useState(null);
  const [veilPhase, setVeilPhase] = useState(null); // null | 'in' | 'out'
  const transitioningRef = useRef(false);

  // navigate(screen) за смяна на екрана; navigate(screen, payload) пренася
  // данни (Gallery → Solo за редакция). Смяната минава през воала:
  // veil-in → swap по средата → veil-out.
  const navigate = useCallback((nextScreen, payload) => {
    if (transitioningRef.current) return;
    transitioningRef.current = true;
    let target = nextScreen;
    // Гейт за гости — но не когато тръгваме ОТ auth екрана: там навигацията
    // идва след успешен login, а userRef още не е обновен (React batching)
    if (PROTECTED.has(nextScreen) && !userRef.current && screenRef.current !== 'auth') {
      setPostAuthTarget(nextScreen);
      target = 'auth';
    }
    if (payload !== undefined) setEditArtwork(payload);
    setVeilPhase('in');
    setTimeout(() => {
      setScreen(target);
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
      {screen === 'sculpt' && (
        <Sculpt
          navigate={navigate}
          artworkToEdit={editArtwork}
          onArtworkConsumed={() => setEditArtwork(null)}
        />
      )}
      {screen === 'auth' && <Auth navigate={navigate} postAuthTarget={postAuthTarget} />}
      {screen === 'profile' && <Profile navigate={navigate} />}
      {screen === 'compete' && <Compete navigate={navigate} />}

      <TransitionVeil phase={veilPhase} />
      <Cursor active={cursorActive} />
      <div className="grain-overlay" />
    </div>
  );
}
