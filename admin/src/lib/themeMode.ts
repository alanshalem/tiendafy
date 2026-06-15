export type ThemeMode = 'light' | 'dark';

const STORAGE_KEY = 'tiendafy.themeMode';

export function getInitialMode(): ThemeMode {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved === 'light' || saved === 'dark') return saved;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function applyMode(mode: ThemeMode) {
  document.documentElement.dataset.theme = mode;
  localStorage.setItem(STORAGE_KEY, mode);
}

/**
 * Cambia el modo con un reveal circular (View Transitions API) que se expande
 * desde el punto del click. Fallback: transición CSS suave.
 */
export function toggleMode(current: ThemeMode, e?: { clientX: number; clientY: number }): ThemeMode {
  const next: ThemeMode = current === 'dark' ? 'light' : 'dark';
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const doc = document as Document & {
    startViewTransition?: (cb: () => void) => { ready: Promise<void> };
  };
  const startVT = doc.startViewTransition?.bind(doc);

  if (!startVT || reduce || !e) {
    document.documentElement.classList.add('theme-transition');
    applyMode(next);
    window.setTimeout(() => document.documentElement.classList.remove('theme-transition'), 400);
    return next;
  }

  const x = e.clientX;
  const y = e.clientY;
  const endRadius = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y));

  const transition = startVT(() => applyMode(next));
  transition.ready.then(() => {
    document.documentElement.animate(
      {
        clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${endRadius}px at ${x}px ${y}px)`],
      },
      { duration: 480, easing: 'ease-in-out', pseudoElement: '::view-transition-new(root)' },
    );
  });
  return next;
}
