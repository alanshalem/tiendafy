'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Icon } from './Icon';
import { CategoryMegaMenu, CategoryMenu } from './CategoryMenu';
import { StoreLink } from './StoreLink';
import { useHoverMenu } from './useHoverMenu';
import type { NavItem } from './header-menu';

export type { NavItem } from './header-menu';

/** `useLayoutEffect` avisa en el render del servidor; ahí no hay nada que medir. */
const useIsomorphicLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

/** Separación entre ítems, en píxeles. Tiene que coincidir con el `gap-x-5` de abajo. */
const GAP = 20;

/** ¿Se dibuja como desplegable? (lleva flechita: el medidor le reserva el lugar). */
const hasDropdown = (item: NavItem) =>
  item.kind === 'categories' || !!item.categoryId || (item.children?.length ?? 0) > 0;

/** Dónde se apoyan los ítems: al centro (clásico), contra el logo o contra los íconos. */
const JUSTIFY = { center: 'justify-center', start: 'justify-start', end: 'justify-end' } as const;

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
 *
 * En el servidor se dibujan TODOS (todavía no hay nada que medir): los links
 * del menú, incluidos los de los desplegables, llegan en el HTML.
 */
export function HeaderNav({ items, align = 'center' }: { items: NavItem[]; align?: keyof typeof JUSTIFY }) {
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
      className={`relative flex min-w-0 flex-1 items-center gap-x-5 whitespace-nowrap text-sm ${JUSTIFY[align]}`}
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
            {hasDropdown(item) && <span className="h-4 w-4" />}
          </span>
        ))}
        <span className="flex items-center gap-1">
          Más
          <span className="h-4 w-4" />
        </span>
      </div>

      {visible.map((item) => (
        <NavEntry key={item.id} item={item} />
      ))}

      {hidden.length > 0 && <MoreMenu items={hidden} />}
    </nav>
  );
}

/** Un ítem del primer nivel: link, desplegable de categorías, mega-menú o desplegable propio. */
function NavEntry({ item }: { item: NavItem }) {
  if (item.kind === 'categories') return <CategoryMenu label={item.label} />;
  if (item.categoryId)
    return (
      <CategoryMegaMenu
        categoryId={item.categoryId}
        label={item.label}
        href={item.href}
        extra={item.children}
      />
    );
  if (item.children?.length) return <DropdownMenu item={item} />;
  return (
    <StoreLink href={item.href} newTab={item.newTab} className="shrink-0 opacity-90 hover:opacity-100">
      {item.label}
    </StoreLink>
  );
}

/**
 * Un ítem con subítems que armó el comercio. El botón abre la lista; adentro
 * va primero el propio destino del ítem (sino quedaría inalcanzable: el clic
 * abre el desplegable en vez de navegar) y después los anidados.
 */
function DropdownMenu({ item }: { item: NavItem }) {
  const { open, close, container, trigger, panel } = useHoverMenu();
  return (
    <div className="relative shrink-0" {...container}>
      <button
        type="button"
        {...trigger}
        className="flex items-center gap-1 whitespace-nowrap opacity-90 hover:opacity-100"
      >
        {item.label}
        <Icon name="chevronDown" className={`h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {/* En el HTML aunque esté cerrado (los links llegan a Google). `pt-2`: puente para el hover. */}
      <div className="absolute left-0 top-full z-50 pt-2" {...panel}>
        <ul className="min-w-52 rounded-lg border border-fg/10 bg-bg p-1.5 text-fg shadow-xl">
          <li>
            <StoreLink
              href={item.href}
              newTab={item.newTab}
              onClick={close}
              className="block rounded-md px-3 py-2 text-sm font-semibold hover:bg-fg/5"
            >
              {item.label}
            </StoreLink>
          </li>
          {item.children!.map((child) => (
            <li key={child.id}>
              <StoreLink
                href={child.href}
                newTab={child.newTab}
                onClick={close}
                className="block rounded-md px-3 py-2 text-sm hover:bg-fg/5"
              >
                {child.label}
              </StoreLink>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/**
 * Lo que no entró. Adentro va todo como link plano, incluso el de categorías:
 * un desplegable dentro de otro no se maneja bien con el dedo ni con el
 * teclado, y el listado de productos ya muestra las categorías al costado. Los
 * subítems van debajo de su padre, con sangría.
 */
function MoreMenu({ items }: { items: NavItem[] }) {
  const { open, close, container, trigger, panel } = useHoverMenu();

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

      {/* `pt-2`: puente transparente para no perder el hover al bajar el mouse. */}
      <div className="absolute right-0 top-full z-50 pt-2" {...panel}>
        <div className="min-w-52 rounded-lg border border-fg/10 bg-bg p-1.5 text-fg shadow-xl">
          {items.map((item) => (
            <div key={item.id}>
              <StoreLink
                href={item.href}
                newTab={item.newTab}
                onClick={close}
                className="block rounded-md px-3 py-2 text-sm hover:bg-fg/5"
              >
                {item.label}
              </StoreLink>
              {item.children?.map((child) => (
                <StoreLink
                  key={child.id}
                  href={child.href}
                  newTab={child.newTab}
                  onClick={close}
                  className="block rounded-md py-2 pl-6 pr-3 text-sm opacity-80 hover:bg-fg/5"
                >
                  {child.label}
                </StoreLink>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
