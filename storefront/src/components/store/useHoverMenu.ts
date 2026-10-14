import { useId, useRef, useState, type FocusEvent, type KeyboardEvent, type MouseEvent } from 'react';
import { flushSync } from 'react-dom';

/** Lo que se puede enfocar adentro del desplegable, en orden. */
function focusables(panel: HTMLElement | null): HTMLElement[] {
  if (!panel) return [];
  // Lo que está adentro de una rama plegada (subcategorías sin abrir) no cuenta.
  return Array.from(panel.querySelectorAll<HTMLElement>('a[href], button:not([disabled])')).filter(
    (el) => !el.closest('[hidden]'),
  );
}

/**
 * Desplegable del encabezado que abre con el mouse encima y con un clic.
 *
 * El clic (o el tap) abre y no alterna: el mismo gesto ya disparó el
 * mouseenter, y alternar lo cerraba en el acto — con el mouse se cerraba al
 * hacer clic, y en una tablet el tap no lo abría nunca. Con el teclado
 * (detail 0, sin hover) sí alterna. Cierra al salir con el mouse o al elegir.
 *
 * Teclado (patrón "disclosure": un botón que muestra una lista de links):
 * flecha abajo abre y entra al primer link, las flechas recorren la lista,
 * Escape cierra y devuelve el foco al botón, y salir con Tab cierra. Sin esto,
 * quien navega con teclado abría el menú y no tenía cómo cerrarlo.
 */
export function useHoverMenu() {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();
  const panel = () => (typeof document === 'undefined' ? null : document.getElementById(panelId));

  const focusAt = (index: number) => {
    const items = focusables(panel());
    if (items.length === 0) return;
    items[(index + items.length) % items.length]?.focus();
  };
  const openAndFocus = (index: number) => {
    // flushSync: el panel tiene que estar visible antes de poder enfocarlo.
    flushSync(() => setOpen(true));
    focusAt(index);
  };

  return {
    open,
    close: () => setOpen(false),
    container: {
      onMouseLeave: () => setOpen(false),
      onKeyDown: (e: KeyboardEvent) => {
        // defaultPrevented: la flecha ya la resolvió el botón (abrir y entrar).
        if (!open || e.defaultPrevented) return;
        if (e.key === 'Escape') {
          e.preventDefault();
          setOpen(false);
          triggerRef.current?.focus();
          return;
        }
        const items = focusables(panel());
        const current = items.indexOf(document.activeElement as HTMLElement);
        if (current < 0) return;
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          focusAt(current + 1);
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          if (current === 0) triggerRef.current?.focus();
          else focusAt(current - 1);
        } else if (e.key === 'Home') {
          e.preventDefault();
          focusAt(0);
        } else if (e.key === 'End') {
          e.preventDefault();
          focusAt(-1);
        }
      },
      // Salir del desplegable con Tab lo cierra: abierto y sin foco tapa la página.
      onBlur: (e: FocusEvent<HTMLElement>) => {
        if (open && !e.currentTarget.contains(e.relatedTarget as Node | null)) setOpen(false);
      },
    },
    trigger: {
      ref: triggerRef,
      onClick: (e: MouseEvent) => setOpen((o) => (e.detail === 0 ? !o : true)),
      onMouseEnter: () => setOpen(true),
      onKeyDown: (e: KeyboardEvent) => {
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          openAndFocus(0);
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          openAndFocus(-1);
        }
      },
      'aria-expanded': open,
      'aria-controls': panelId,
    },
    panel: { id: panelId, hidden: !open },
  };
}
