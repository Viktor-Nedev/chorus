import { useState } from 'react';
import { Landing } from './pages/Landing';
import { SoloCanvas } from './pages/SoloCanvas';
import { CollectiveCanvas } from './pages/CollectiveCanvas';
import { Gallery } from './pages/Gallery';
import { useTheme } from './hooks/useTheme';

export default function App() {
  const [screen, setScreen] = useState('landing');
  // 'landing' | 'solo' | 'collective' | 'gallery'
  const { theme, toggleTheme } = useTheme();

  return (
    <div className="h-full w-full">
      {screen === 'landing' && <Landing navigate={setScreen} theme={theme} toggleTheme={toggleTheme} />}
      {screen === 'solo' && <SoloCanvas navigate={setScreen} theme={theme} toggleTheme={toggleTheme} />}
      {screen === 'collective' && (
        <CollectiveCanvas navigate={setScreen} theme={theme} toggleTheme={toggleTheme} />
      )}
      {screen === 'gallery' && <Gallery navigate={setScreen} theme={theme} toggleTheme={toggleTheme} />}
    </div>
  );
}
