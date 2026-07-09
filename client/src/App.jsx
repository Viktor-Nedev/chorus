import { useState } from 'react';
import { Landing } from './pages/Landing';
import { SoloCanvas } from './pages/SoloCanvas';
import { CollectiveCanvas } from './pages/CollectiveCanvas';
import { Gallery } from './pages/Gallery';

export default function App() {
  const [screen, setScreen] = useState('landing');
  // 'landing' | 'solo' | 'collective' | 'gallery'

  return (
    <div className="h-full w-full">
      {screen === 'landing' && <Landing navigate={setScreen} />}
      {screen === 'solo' && <SoloCanvas navigate={setScreen} />}
      {screen === 'collective' && <CollectiveCanvas navigate={setScreen} />}
      {screen === 'gallery' && <Gallery navigate={setScreen} />}
    </div>
  );
}
