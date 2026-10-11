import { useState, type MouseEvent } from 'react';

/**
 * Desplegable del encabezado que abre con el mouse encima y con un clic.
 *
 * El clic (o el tap) abre y no alterna: el mismo gesto ya disparó el
 * mouseenter, y alternar lo cerraba en el acto — con el mouse se cerraba al
 * hacer clic, y en una tablet el tap no lo abría nunca. Con el teclado
 * (detail 0, sin hover) sí alterna. Cierra al salir con el mouse o al elegir.
 */
export function useHoverMenu() {
  const [open, setOpen] = useState(false);
  return {
    open,
    close: () => setOpen(false),
    container: { onMouseLeave: () => setOpen(false) },
    trigger: {
      onClick: (e: MouseEvent) => setOpen((o) => (e.detail === 0 ? !o : true)),
      onMouseEnter: () => setOpen(true),
      'aria-haspopup': 'menu' as const,
      'aria-expanded': open,
    },
  };
}
