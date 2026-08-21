'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { Icon } from './Icon';

export interface NavLinkItem {
  key: string;
  label: string;
  href: string;
}

/** `useLayoutEffect` avisa en el render del servidor; en el servidor no hay nada que medir. */
const useIsomorphicLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

/** Separación entre ítems, en píxeles. Tiene que coincidir con el `gap-x-5` de abajo. */
const GAP = 20;

/**
 * Menú del encabezado en UNA sola línea.
 *
 * El problema es que la cantidad de ítems la decide el comercio: cada página de
 * contenido que crea suma uno, y con nombres como "Términos y condiciones" no
 * hay ancho que alcance siempre. Dejarlos envolver a un segundo renglón se ve
 * desprolijo, y partir el texto al medio se lee como un error de la página.
 *
 * Así que se mide cuánto entra de verdad y lo que sobra se va a un "Más". No se
 * esconde nada —sigue estando todo, a un clic— y el encabezado no cambia de
 * alto según cuántas páginas tenga la tienda.
 */
export function HeaderNav({
  fixed,
  items,
  align = 'center',
}: {
  /** Ítems que no se mueven nunca: Inicio, Productos, el menú de categorías. */
  fixed: ReactNode;
  /** Los que pueden irse a "Más" si no entran. */
  items: NavLinkItem[];
  align?: 'center' | 'start';
}) {
  const navRef = useRef<HTMLElement>(null);
  const fixedRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(items.length);

  const recompute = useCallback(() => {
    const nav = navRef.current;
    const fixedBox = fixedRef.current;
    const measure = measureRef.current;
    if (!nav || !fixedBox || !measure) return;

    const available = nav.clientWidth;
    const kids = Array.from(measure.children) as HTMLElement[];
    // El último hijo del medidor es el botón "Más".
    const moreWidth = kids[kids.length - 1]?.offsetWidth ?? 0;
    const widths = kids.slice(0, items.length).map((el) => el.offsetWidth);

    const fixedWidth = fixedBox.offsetWidth;
    const everything = widths.reduce((sum, w) => sum + w + GAP, fixedWidth);
    if (everything <= available) {
      setShown(items.length);
      return;
    }

    // No entran todos: hay que reservar el lugar del "Más" antes de repartir.
    let used = fixedWidth + moreWidth + GAP;
    let count = 0;
    for (const width of widths) {
      if (used + width + GAP > available) break;
      used += width + GAP;
      count += 1;
    }
    setShown(count);
  }, [items.length]);

  useIsomorphicLayoutEffect(() => {
    recompute();
    const nav = navRef.current;
    if (!nav) return;
    const observer = new ResizeObserver(recompute);
    observer.observe(nav);
    return () => observer.disconnect();
  }, [recompute]);

  const visible = items.slice(0, shown);
  const hidden = items.slice(shown);

  return (
    <nav
      ref={navRef}
      // Sin `overflow-hidden`: recortaría el propio desplegable de "Más", que
      // cuelga por fuera del menú. Lo que sobra se recorta cambiando qué se
      // dibuja, no tapándolo.
      className={`relative flex min-w-0 flex-1 items-center gap-x-5 whitespace-nowrap text-sm ${
        align === 'center' ? 'justify-center' : 'justify-start'
      }`}
    >
      {/* Medidor: mismo texto y mismo tamaño, fuera de la vista. Sin esto no hay
          forma de saber cuánto ocupa un nombre sin dibujarlo. */}
      <div
        ref={measureRef}
        aria-hidden
        className="pointer-events-none absolute -left-[9999px] top-0 flex gap-x-5 whitespace-nowrap text-sm"
      >
        {items.map((item) => (
          <span key={item.key}>{item.label}</span>
        ))}
        <span>Más</span>
      </div>

      <div ref={fixedRef} className="flex shrink-0 items-center gap-x-5">
        {fixed}
      </div>

      {visible.map((item) => (
        <Link key={item.key} href={item.href} className="shrink-0 opacity-90 hover:opacity-100">
          {item.label}
        </Link>
      ))}

      {hidden.length > 0 && <MoreMenu items={hidden} />}
    </nav>
  );
}

/** Lo que no entró. Mismo aspecto que el menú de categorías. */
function MoreMenu({ items }: { items: NavLinkItem[] }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative shrink-0" onMouseLeave={() => setOpen(false)}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        onMouseEnter={() => setOpen(true)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex items-center gap-1 whitespace-nowrap opacity-90 hover:opacity-100"
      >
        Más
        <Icon name="chevronDown" className={`h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        // `pt-2`: puente transparente para no perder el hover al bajar el mouse.
        <div className="absolute right-0 top-full z-50 pt-2">
          <div className="min-w-52 rounded-lg border border-black/10 bg-bg p-1.5 text-fg shadow-xl">
            {items.map((item) => (
              <Link
                key={item.key}
                href={item.href}
                onClick={() => setOpen(false)}
                className="block rounded-md px-3 py-2 text-sm hover:bg-fg/5"
              >
                {item.label}
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
