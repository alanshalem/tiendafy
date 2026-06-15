'use client';

import { useEffect, useState } from 'react';

type Mode = 'light' | 'dark';
const KEY = 'tiendafy.landingMode';

function apply(mode: Mode) {
  document.documentElement.dataset.ldMode = mode;
  localStorage.setItem(KEY, mode);
}

/** Switch sol/luna de la landing con reveal circular animado. */
export function LandingThemeToggle() {
  const [mode, setMode] = useState<Mode>('light');

  useEffect(() => {
    const saved = localStorage.getItem(KEY) as Mode | null;
    const initial = saved ?? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    apply(initial);
    setMode(initial);
  }, []);

  const toggle = (e: React.MouseEvent) => {
    const next: Mode = mode === 'dark' ? 'light' : 'dark';
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const doc = document as Document & { startViewTransition?: (cb: () => void) => { ready: Promise<void> } };
    const start = doc.startViewTransition?.bind(doc);

    if (!start || reduce) {
      document.documentElement.classList.add('ld-mode-transition');
      apply(next);
      setMode(next);
      window.setTimeout(() => document.documentElement.classList.remove('ld-mode-transition'), 450);
      return;
    }

    const x = e.clientX;
    const y = e.clientY;
    const r = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
    const t = start(() => {
      apply(next);
      setMode(next);
    });
    t.ready.then(() => {
      document.documentElement.animate(
        { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${r}px at ${x}px ${y}px)`] },
        { duration: 480, easing: 'ease-in-out', pseudoElement: '::view-transition-new(root)' },
      );
    });
  };

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={mode === 'dark' ? 'Modo claro' : 'Modo oscuro'}
      className="ld-mode-toggle"
    >
      {mode === 'dark' ? (
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="4" />
          <path strokeLinecap="round" d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5L19 19M19 5l-1.5 1.5M6.5 17.5L5 19" />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
          <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
        </svg>
      )}
    </button>
  );
}
