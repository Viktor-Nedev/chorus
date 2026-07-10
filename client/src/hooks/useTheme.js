import { useState, useEffect, useCallback } from 'react';

const STORAGE_KEY = 'chorus-theme';

export const CANVAS_BG = {
  dark: { r: 10, g: 10, b: 15 },
  light: { r: 245, g: 245, b: 250 },
};

export function useTheme() {
  const [theme, setTheme] = useState(() => localStorage.getItem(STORAGE_KEY) || 'dark');

  useEffect(() => {
    document.documentElement.classList.toggle('light', theme === 'light');
    localStorage.setItem(STORAGE_KEY, theme);
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setTheme((t) => (t === 'light' ? 'dark' : 'light'));
  }, []);

  return { theme, toggleTheme };
}
