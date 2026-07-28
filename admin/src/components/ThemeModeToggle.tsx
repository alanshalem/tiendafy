import { useEffect, useState } from 'react';
import { getInitialMode, toggleMode, type ThemeMode } from '../lib/themeMode';

/** Switch sol/luna con reveal circular animado. */
export function ThemeModeToggle({ className }: { className?: string }) {
  const [mode, setMode] = useState<ThemeMode>('light');

  useEffect(() => {
    setMode((document.documentElement.dataset.theme as ThemeMode) || getInitialMode());
  }, []);

  return (
    <button
      type="button"
      onClick={(e) => setMode(toggleMode(mode, { clientX: e.clientX, clientY: e.clientY }))}
      aria-label={mode === 'dark' ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
      title={mode === 'dark' ? 'Modo claro' : 'Modo oscuro'}
      className={
        'flex h-9 w-9 items-center justify-center rounded-full border border-border text-fg-muted transition-colors hover:bg-bg-muted hover:text-fg ' +
        (className ?? '')
      }
    >
      {mode === 'dark' ? (
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="4" />
          <path
            strokeLinecap="round"
            d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5L19 19M19 5l-1.5 1.5M6.5 17.5L5 19"
          />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor">
          <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
        </svg>
      )}
    </button>
  );
}
