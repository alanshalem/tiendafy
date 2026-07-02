'use client';

import { useEffect, useRef } from 'react';

// Elementos que pueden recibir foco por teclado dentro del diálogo.
const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Accesibilidad de modales. Cuando `active` pasa a true:
 *  - enfoca el primer interactivo del diálogo (en nuestros modales es "Cerrar",
 *    así se evita el salto del teclado mobile que provocaría enfocar un input),
 *  - atrapa el Tab/Shift+Tab dentro del contenedor (no se escapa al fondo),
 *  - al cerrar (o desmontar) restaura el foco al elemento que lo tenía antes
 *    de abrir — típicamente el botón que disparó el modal.
 *
 * `active` gatea todo, así sirve tanto para modales montados condicionalmente
 * (pasar `true`) como para paneles siempre-montados que sólo se muestran con un
 * flag, p.ej. un drawer (pasar `open`). NO maneja Escape: cada modal decide su
 * cierre (varios ya lo tienen). Depende sólo de `active` para no re-enfocar en
 * cada render.
 */
export function useFocusTrap<T extends HTMLElement = HTMLDivElement>(active: boolean) {
  const ref = useRef<T>(null);

  useEffect(() => {
    if (!active) return;
    const container = ref.current;
    if (!container) return;

    const previouslyFocused = document.activeElement as HTMLElement | null;
    const focusables = () =>
      Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => el.getClientRects().length > 0,
      );

    (focusables()[0] ?? container).focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      const items = focusables();
      if (items.length === 0) {
        e.preventDefault();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const activeEl = document.activeElement;
      if (e.shiftKey) {
        if (activeEl === first || !container.contains(activeEl)) {
          e.preventDefault();
          last.focus();
        }
      } else if (activeEl === last || !container.contains(activeEl)) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      previouslyFocused?.focus?.();
    };
  }, [active]);

  return ref;
}
