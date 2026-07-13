import { useState } from 'react';
import { Landing } from './pages/Landing';
import { SoloCanvas } from './pages/SoloCanvas';
import { CollectiveCanvas } from './pages/CollectiveCanvas';
import { Gallery } from './pages/Gallery';
import { useTheme } from './hooks/useTheme';

export default function App() {
  const [screen, setScreen] = useState('landing');
  // 'landing' | 'solo' | 'collective' | 'gallery'
  const [editArtwork, setEditArtwork] = useState(null);
  const { theme, toggleTheme } = useTheme();

  // navigate(screen) за обикновена смяна на екрана; navigate(screen, payload)
  // за да пренесеш данни към следващия екран (напр. Gallery → Solo за редакция)
  const navigate = (nextScreen, payload) => {
    if (payload !== undefined) setEditArtwork(payload);
    setScreen(nextScreen);
  };

  return (
    <div className="h-full w-full">
      {screen === 'landing' && <Landing navigate={navigate} theme={theme} toggleTheme={toggleTheme} />}
      {screen === 'solo' && (
        <SoloCanvas
          navigate={navigate}
          theme={theme}
          toggleTheme={toggleTheme}
          artworkToEdit={editArtwork}
          onArtworkConsumed={() => setEditArtwork(null)}
        />
      )}
      {screen === 'collective' && (
        <CollectiveCanvas navigate={navigate} theme={theme} toggleTheme={toggleTheme} />
      )}
      {screen === 'gallery' && <Gallery navigate={navigate} theme={theme} toggleTheme={toggleTheme} />}
    </div>
  );
}
