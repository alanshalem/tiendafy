'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Icon } from './Icon';
import { CategoryMenu } from './CategoryMenu';
import { useHoverMenu } from './useHoverMenu';

export interface NavItem {
  id: string;
  label: string;
  href: string;
  /** El de categorías se dibuja como desplegable cuando entra. */
  kind?: 'link' | 'categories';
}

/** `useLayoutEffect` avisa en el render del servidor; ahí no hay nada que medir. */
const useIsomorphicLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

/** Separación entre ítems, en píxeles. Tiene que coincidir con el `gap-x-5` de abajo. */
const GAP = 20;

/**
 * Menú del encabezado en UNA sola línea.
 *
 * La cantidad de ítems y el largo de cada nombre los decide el comercio: cada
 * página de contenido que crea suma uno, y con nombres como "Términos y
 * condiciones" no hay ancho que alcance siempre. Envolver a un segundo renglón
 * se ve desprolijo y partir el texto al medio se lee como un error.
 *
 * Así que se mide cuánto entra de verdad y lo que sobra se va a un "Más". Nada
 * se esconde: sigue estando todo, a un clic. Y como el que sobra es el último,
 * el orden que elige el comercio en el editor de diseño decide qué queda a la
 * vista.
 */
export function HeaderNav({ items, align = 'center' }: { items: NavItem[]; align?: 'center' | 'start' }) {
  const navRef = useRef<HTMLElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(items.length);

  const recompute = useCallback(() => {
    const nav = navRef.current;
    const measure = measureRef.current;
    if (!nav || !measure) return;

    const available = nav.clientWidth;
    const kids = Array.from(measure.children) as HTMLElement[];
    // El último hijo del medidor es el botón "Más".
    const moreWidth = kids[kids.length - 1]?.offsetWidth ?? 0;
    const widths = kids.slice(0, items.length).map((el) => el.offsetWidth);

    const everything = widths.reduce((sum, w) => sum + w + GAP, 0);
    if (everything <= available) {
      setShown(items.length);
      return;
    }

    // No entran todos: hay que reservar el lugar del "Más" antes de repartir.
    let used = moreWidth + GAP;
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
      // cuelga por fuera del menú. Lo que sobra se resuelve cambiando qué se
      // dibuja, no tapándolo.
      className={`relative flex min-w-0 flex-1 items-center gap-x-5 whitespace-nowrap text-sm ${
        align === 'center' ? 'justify-center' : 'justify-start'
      }`}
    >
      {/* Medidor: una copia fiel de cada ítem, fuera de la vista. Sin esto no
          hay forma de saber cuánto ocupa un nombre sin dibujarlo. */}
      <div
        ref={measureRef}
        aria-hidden
        className="pointer-events-none absolute -left-[9999px] top-0 flex gap-x-5 whitespace-nowrap text-sm"
      >
        {items.map((item) => (
          <span key={item.id} className="flex items-center gap-1">
            {item.label}
            {item.kind === 'categories' && <span className="h-4 w-4" />}
          </span>
        ))}
        <span className="flex items-center gap-1">
          Más
          <span className="h-4 w-4" />
        </span>
      </div>

      {visible.map((item) =>
        item.kind === 'categories' ? (
          <CategoryMenu key={item.id} label={item.label} />
        ) : (
          <Link key={item.id} href={item.href} className="shrink-0 opacity-90 hover:opacity-100">
            {item.label}
          </Link>
        ),
      )}

      {hidden.length > 0 && <MoreMenu items={hidden} />}
    </nav>
  );
}

/**
 * Lo que no entró. Adentro va todo como link plano, incluso el de categorías:
 * un desplegable dentro de otro no se maneja bien con el dedo ni con el
 * teclado, y el listado de productos ya muestra las categorías al costado.
 */
function MoreMenu({ items }: { items: NavItem[] }) {
  const { open, close, container, trigger } = useHoverMenu();

  return (
    <div className="relative shrink-0" {...container}>
      <button
        type="button"
        {...trigger}
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
                key={item.id}
                href={item.href}
                onClick={close}
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
