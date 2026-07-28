import { useLayoutEffect, useRef } from 'react';

/**
 * Anima reordenamientos con la técnica FLIP (First-Last-Invert-Play).
 *
 * Cada item de la lista debe llevar `data-flip-key="<id-estable>"`. Cuando el
 * orden cambia, los elementos se deslizan suavemente de su posición anterior a
 * la nueva (subida/bajada) en vez de saltar. Usa Web Animations API — sin libs.
 *
 * @param orderKey string que cambia cuando cambia el orden (ej: ids.join(',')).
 * @returns ref para el contenedor de los items.
 */
export function useFlipList<T extends HTMLElement = HTMLElement>(orderKey: string) {
  const containerRef = useRef<T | null>(null);
  const prevRects = useRef<Map<string, DOMRect>>(new Map());

  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const nodes = el.querySelectorAll<HTMLElement>('[data-flip-key]');
    const nextRects = new Map<string, DOMRect>();

    nodes.forEach((node) => {
      const key = node.dataset.flipKey;
      if (!key) return;
      const rect = node.getBoundingClientRect();
      nextRects.set(key, rect);

      const prev = prevRects.current.get(key);
      if (!prev || reduce) return;

      const dy = prev.top - rect.top;
      const dx = prev.left - rect.left;
      if (dy === 0 && dx === 0) return;

      node.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'translate(0, 0)' }], {
        duration: 280,
        easing: 'cubic-bezier(0.2, 0, 0, 1)',
      });
    });

    prevRects.current = nextRects;
  }, [orderKey]);

  return containerRef;
}
