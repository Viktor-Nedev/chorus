export function ThemeToggle({ theme, onToggle, className = '' }) {
  return (
    <button
      onClick={onToggle}
      title={theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'}
      className={`flex items-center justify-center rounded-lg border border-ink-line bg-ink-soft/70 backdrop-blur w-9 h-9 text-base text-gray-300 hover:text-white hover:border-gray-500 transition ${className}`}
    >
      {theme === 'light' ? '🌙' : '☀️'}
    </button>
  );
}
