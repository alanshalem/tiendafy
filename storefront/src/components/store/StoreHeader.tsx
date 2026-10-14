'use client';

import { useContext, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { EDITOR_MSG, contrastText, headerColorsFor, heroUnderHeader } from '@tiendafy/types';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Pencil } from 'lucide-react';
import { cn } from '@tiendafy/ui';
import { Icon } from './Icon';
import { useCart } from './cart';
import { useFavorites } from './favorites';
import { AccountButton } from './AccountButton';
import { CategoryBranchMobile, CategoryMenuMobile, useHasSubcategories } from './CategoryMenu';
import { usePublishedPagesState } from './PagesNav';
import { HeaderNav } from './HeaderNav';
import { buildHeaderMenu, type NavItem } from './header-menu';
import { StoreLink } from './StoreLink';
import { ADMIN_ORIGIN, PreviewContext, usePreviewHref } from './preview';
import { type ThemeConfig } from '@/lib/theme';
import { headerPageKind } from '@/lib/header-page';
import { AnnouncementBar } from './AnnouncementBar';

/**
 * Tamaños del logo: cada paso tiene que notarse. Antes iban de 16 a 24 px de
 * texto (y de 24 a 40 de imagen) y "chico" y "predeterminado" se confundían.
 * En el celular, un escalón menos: la barra mide 56 px.
 */
const LOGO_TEXT = { sm: 'text-base md:text-lg', md: 'text-lg md:text-2xl', lg: 'text-xl md:text-3xl' };
const LOGO_IMG = { sm: 'h-6 md:h-7', md: 'h-8 md:h-10', lg: 'h-10 md:h-14' };

/** `useLayoutEffect` avisa en el render del servidor; ahí no hay nada que medir. */
const useIsomorphicLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

/**
 * Fondo del encabezado mientras está transparente sobre la portada. Un velo
 * oscuro arriba, siempre: sin él, una foto clara se comía el menú blanco. Los
 * niveles "leve" y "medio" suman el color del encabezado.
 */
function transparentBackground(header: ThemeConfig['header']): string {
  const veil = 'linear-gradient(to bottom, rgb(0 0 0 / 0.4), rgb(0 0 0 / 0))';
  const alpha = header.transparentLevel === 'medium' ? 0.5 : header.transparentLevel === 'light' ? 0.25 : 0;
  return alpha > 0 ? `${veil}, rgb(${header.bg} / ${alpha})` : veil;
}

/** Badge numérico (carrito / favoritos) sobre el ícono del header. */
function CountBadge({ count }: { count: number }) {
  return (
    <span className="absolute right-0.5 top-0.5 inline-flex h-[1.15rem] min-w-[1.15rem] items-center justify-center rounded-full bg-primary px-1 text-[0.65rem] font-bold leading-none text-primary-fg ring-2 ring-[rgb(var(--store-header-bg))]">
      {count}
    </span>
  );
}

/** Ids que unen cada botón del celular con lo que abre (aria-controls). */
const MOBILE_MENU_ID = 'menu-movil';
const MOBILE_SEARCH_ID = 'buscar-movil';

/**
 * Mobile: la búsqueda, a la vista con su propio botón en la barra. Antes
 * vivía adentro del menú hamburguesa, y con el menú apagado el celular no
 * tenía cómo buscar.
 */
function MobileSearch({
  header,
  q,
  setQ,
  submitSearch,
}: {
  header: ThemeConfig['header'];
  q: string;
  setQ: (v: string) => void;
  submitSearch: (e: React.FormEvent) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  // Se abre para escribir: el foco va directo a la caja.
  useEffect(() => input.current?.focus(), []);
  return (
    <div
      id={MOBILE_SEARCH_ID}
      className="border-t border-current/10 px-4 py-3 md:hidden"
      style={{ background: `rgb(${header.bg})` }}
    >
      <form
        onSubmit={submitSearch}
        role="search"
        className="flex items-center gap-1.5 rounded-full bg-current/10 px-3"
      >
        <input
          ref={input}
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar"
          aria-label="Buscar"
          enterKeyHint="search"
          className="h-10 w-full bg-transparent text-base outline-none placeholder:opacity-60"
          style={{ color: 'currentColor' }}
        />
        <button type="submit" aria-label="Buscar" className="-m-2 p-2 opacity-70 hover:opacity-100">
          <Icon name="search" className="h-4 w-4" />
        </button>
      </form>
    </div>
  );
}

/** Mobile: un ítem con subítems o subcategorías, como acordeón (el link y su flechita). */
function MobileGroup({ item, onClose }: { item: NavItem; onClose: () => void }) {
  const [open, setOpen] = useState(false);
  const hasBranch = useHasSubcategories(item.categoryId);
  const groupId = `menu-movil-${item.id.replace(/[^\w-]/g, '-')}`;
  if (!hasBranch && !item.children?.length)
    return (
      <StoreLink href={item.href} newTab={item.newTab} className="py-2.5 opacity-90 hover:opacity-100">
        {item.label}
      </StoreLink>
    );
  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <StoreLink
          href={item.href}
          newTab={item.newTab}
          onClick={onClose}
          className="flex-1 py-2.5 opacity-90 hover:opacity-100"
        >
          {item.label}
        </StoreLink>
        {/* 44 px de alto: se toca con el dedo sin acertarle al link de al lado. */}
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-controls={groupId}
          aria-label={`${open ? 'Cerrar' : 'Abrir'} ${item.label}`}
          className="-mr-2 flex h-11 w-11 shrink-0 items-center justify-center opacity-80 hover:opacity-100"
        >
          <Icon name="chevronDown" className={`h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>
      </div>
      <div id={groupId} hidden={!open} className="border-l border-current/15 pb-1 pl-3">
        {item.categoryId && <CategoryBranchMobile categoryId={item.categoryId} onNavigate={onClose} />}
        {item.children?.map((child) => (
          <StoreLink
            key={child.id}
            href={child.href}
            newTab={child.newTab}
            onClick={onClose}
            className="block py-2 text-sm opacity-90 hover:opacity-100"
          >
            {child.label}
          </StoreLink>
        ))}
      </div>
    </div>
  );
}

/**
 * Mobile: panel desplegable con los links. Los mismos ítems y en el mismo
 * orden que el desktop (antes el celular tenía su orden fijo e ignoraba lo
 * que el comercio armó); los desplegables se vuelven acordeones.
 */
function MobilePanel({
  header,
  items,
  onClose,
}: {
  header: ThemeConfig['header'];
  items: NavItem[];
  onClose: () => void;
}) {
  return (
    <div
      id={MOBILE_MENU_ID}
      className="border-t border-current/10 px-4 py-3 md:hidden"
      style={{ background: `rgb(${header.bg})` }}
    >
      <nav aria-label="Menú" className="flex flex-col gap-0.5 text-sm">
        {items.map((item) =>
          item.kind === 'categories' ? (
            <CategoryMenuMobile key={item.id} label={item.label} onNavigate={onClose} />
          ) : (
            <MobileGroup key={item.id} item={item} onClose={onClose} />
          ),
        )}
      </nav>
    </div>
  );
}

export function Header({ theme, tenantName }: { theme: ThemeConfig; tenantName: string }) {
  const pathname = usePathname();
  const pageKind = headerPageKind(pathname);
  // Los colores de esta página: los propios de su tipo (inicio, listado,
  // producto…) o los generales. De acá para abajo `header` ya los trae, así
  // el panel del celular, la búsqueda y el globito del carrito los siguen.
  const header = { ...theme.header, ...headerColorsFor(theme.header, pageKind) };
  const { count, setOpen } = useCart();
  const fav = useFavorites();
  const href = usePreviewHref();
  const preview = useContext(PreviewContext);
  const router = useRouter();
  const [scrolled, setScrolled] = useState(false);
  const [q, setQ] = useState('');
  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [editHover, setEditHover] = useState(false);

  // Cerrar el menú y la búsqueda del celular al navegar.
  useEffect(() => {
    setMobileOpen(false);
    setSearchOpen(false);
  }, [pathname]);

  // Transparente solo encima de una foto o un video de portada: sobre el fondo
  // liso de la tienda el menú (blanco) no se leía, y el encabezado desaparecía.
  // El encabezado se superpone a la portada (no la empuja hacia abajo). Gana
  // sobre el color propio del inicio mientras se está arriba; al bajar, el
  // encabezado se vuelve sólido con ese color.
  const overlay = header.transparentOnHome && pageKind === 'home' && heroUnderHeader(theme.sections);
  const transparent = overlay && !scrolled;

  useEffect(() => {
    if (!overlay) return;
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [overlay]);

  // Superpuesto: el contenido sube lo que mide el encabezado. Hasta medirlo
  // (en el HTML del servidor) va el alto de la barra simple.
  const headerRef = useRef<HTMLElement>(null);
  const [height, setHeight] = useState<number | null>(null);
  useIsomorphicLayoutEffect(() => {
    const el = headerRef.current;
    if (!overlay || !el) return;
    const measure = () => setHeight(el.offsetHeight);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [overlay]);

  // Sin color elegido, el que se lee sobre el fondo (antes: blanco siempre, y
  // un encabezado claro quedaba con el menú invisible). Sobre la foto, blanco.
  const textColor = transparent ? '#fff' : `rgb(${header.textColor || contrastText(header.bg)})`;
  const bg = transparent ? transparentBackground(header) : `rgb(${header.bg})`;
  // La línea es del color del texto (antes blanca: en un encabezado claro no se veía).
  const borderClass = transparent
    ? ''
    : header.border === 'line'
      ? 'border-b border-current/15'
      : header.border === 'shadow'
        ? 'shadow-lg'
        : '';
  // Logo propio para la foto (suele ser la versión blanca); si no hay, el de siempre.
  const logoSrc = transparent && header.transparentLogo ? header.transparentLogo : theme.logo;
  const size = header.logoSize in LOGO_IMG ? header.logoSize : 'md';

  const submitSearch = (e: React.FormEvent) => {
    e.preventDefault();
    router.push(href(`/productos${q.trim() ? `?q=${encodeURIComponent(q.trim())}` : ''}`));
  };

  const logo = (
    <Link href={href('/')} className="flex min-w-0 items-center gap-2">
      {logoSrc ? (
        <img
          src={logoSrc}
          alt={tenantName}
          className={`${LOGO_IMG[size]} w-auto max-w-[45vw] object-contain md:max-w-[16rem]`}
        />
      ) : (
        <span
          className={`truncate font-bold leading-tight ${LOGO_TEXT[size]}`}
          style={{ fontFamily: 'var(--font-heading)' }}
        >
          {tenantName}
        </span>
      )}
    </Link>
  );

  // El menú del encabezado: lo que armó el comercio en el editor de diseño
  // (orden, nombres, ocultos, anidado, links propios) sobre lo que existe de
  // verdad. Ver buildHeaderMenu. Las páginas llegan desde el navegador; hasta
  // entonces se dibujan las que el comercio guardó con su destino.
  const pages = usePublishedPagesState();
  const navItems = buildHeaderMenu(header.menu ?? [], pages);

  const navFor = (align: 'center' | 'start' | 'end') => <HeaderNav align={align} items={navItems} />;
  const nav = navFor('center');

  const search = header.showSearch ? (
    <form onSubmit={submitSearch} className="flex items-center gap-1.5 rounded-full bg-current/10 px-3">
      <button type="submit" aria-label="Buscar" className="opacity-70 hover:opacity-100">
        <Icon name="search" className="h-4 w-4" />
      </button>
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Buscar"
        aria-label="Buscar"
        className="h-8 w-32 bg-transparent text-sm outline-none placeholder:opacity-60 lg:w-44"
        style={{ color: 'currentColor' }}
      />
    </form>
  ) : null;

  // El número del globito no lo lee un lector de pantalla si el botón tiene
  // aria-label: va en el label ("Abrir carrito, 3 productos").
  const cartLabel =
    count > 0 ? `Abrir carrito, ${count} ${count === 1 ? 'producto' : 'productos'}` : 'Abrir carrito';
  const cartBtn = header.showCart ? (
    <button
      onClick={() => setOpen(true)}
      className="relative -m-2.5 inline-flex items-center gap-1.5 p-2.5 text-sm"
      aria-label={cartLabel}
    >
      <Icon name="cart" className="h-5 w-5" />
      {header.cartStyle === 'text' && <span className="hidden sm:inline">Carrito</span>}
      {count > 0 && <CountBadge count={count} />}
    </button>
  ) : null;

  // Login de comprador: siempre disponible (es funcionalidad core, no decorativa).
  const accountBtn = <AccountButton />;

  const favBtn = (
    <Link
      href={href('/favoritos')}
      className="relative -m-2.5 inline-flex items-center p-2.5 opacity-90 hover:opacity-100"
      aria-label="Favoritos"
      title="Favoritos"
    >
      <Icon name="heart" className="h-5 w-5" />
      {fav.count > 0 && <CountBadge count={fav.count} />}
    </Link>
  );

  const icons = (
    <div className="flex items-center gap-3">
      {search}
      {accountBtn}
      {favBtn}
      {cartBtn}
    </div>
  );

  let inner: React.ReactNode;
  switch (header.layout) {
    case 'logo-center':
      inner = (
        <div className="py-2.5">
          <div className="flex items-center gap-4">
            <div className="flex min-w-0 flex-1 items-center">{search}</div>
            <div className="flex shrink-0 justify-center">{logo}</div>
            <div className="flex min-w-0 flex-1 items-center justify-end gap-3">
              {accountBtn}
              {favBtn}
              {cartBtn}
            </div>
          </div>
          <div className="mt-1.5 flex min-w-0 justify-center">{nav}</div>
        </div>
      );
      break;
    case 'menu-left':
      inner = (
        <div className="flex min-h-16 items-center gap-6 py-2">
          {logo}
          {navFor('start')}
          <div className="shrink-0">{icons}</div>
        </div>
      );
      break;
    case 'menu-right':
      inner = (
        <div className="flex min-h-16 items-center justify-between gap-4 py-2">
          {logo}
          <div className="flex min-w-0 flex-1 items-center justify-end gap-6">
            {/* 'end': el menú pegado a los íconos. Centrado (como antes) era igual al clásico. */}
            {navFor('end')}
            <div className="shrink-0">{icons}</div>
          </div>
        </div>
      );
      break;
    default: // classic
      inner = (
        <div className="flex min-h-16 items-center justify-between gap-4 py-2">
          {logo}
          <div className="hidden min-w-0 flex-1 justify-center md:flex">{nav}</div>
          {icons}
        </div>
      );
  }

  return (
    <>
      <AnnouncementBar ann={theme.announcement} preview={preview} />
      <header
        ref={headerRef}
        data-tf-focus="header"
        className={cn(
          header.sticky && 'sticky top-0 z-40',
          !header.sticky && (preview || overlay) && 'relative',
          !header.sticky && overlay && 'z-40',
          overlay && height === null && '-mb-14 md:-mb-16',
          // Sobre una foto clara, una sombra mínima despega el menú blanco.
          transparent && '[text-shadow:0_1px_3px_rgb(0_0_0/0.45)]',
          borderClass,
          'transition-colors',
        )}
        style={{
          background: bg,
          color: textColor,
          // El aro de los globitos (carrito, favoritos) recorta contra el fondo de ESTA página.
          ['--store-header-bg' as string]: header.bg,
          ...(overlay && height !== null ? { marginBottom: -height } : {}),
        }}
        onMouseEnter={preview ? () => setEditHover(true) : undefined}
        onMouseLeave={preview ? () => setEditHover(false) : undefined}
      >
        {preview && editHover && (
          <>
            <div className="pointer-events-none absolute inset-0 z-[55] ring-2 ring-inset ring-primary" />
            <button
              onClick={(e) => {
                e.stopPropagation();
                window.parent?.postMessage({ type: EDITOR_MSG.editSection, target: 'header' }, ADMIN_ORIGIN);
              }}
              // data-tf-plain: es un control del editor, no un botón de la tienda (no sigue el estilo de botones).
              data-tf-plain
              className="absolute right-3 top-2 z-[56] inline-flex items-center gap-1.5 rounded-md bg-primary px-2.5 py-1 text-xs font-semibold text-primary-fg shadow-lg"
            >
              <Pencil className="h-3.5 w-3.5" /> Editar encabezado
            </button>
          </>
        )}
        <div className="mx-auto max-w-container px-4">
          {/* Desktop: la disposición elegida (clásico / centrado / menú izq/der) */}
          <div className="hidden md:block">{inner}</div>

          {/* Mobile: barra compacta con hamburguesa */}
          <div className="flex h-14 items-center justify-between gap-3 md:hidden">
            {header.showTabsMobile ? (
              // -m-2.5 p-2.5: el ícono mide 24 px pero se toca un área de 44,
              // sin correr nada (igual que los otros botones del encabezado).
              <button
                type="button"
                onClick={() => setMobileOpen((o) => !o)}
                aria-label="Menú"
                aria-expanded={mobileOpen}
                aria-controls={MOBILE_MENU_ID}
                className="-m-2.5 shrink-0 p-2.5 opacity-90 hover:opacity-100"
              >
                {mobileOpen ? (
                  <Icon name="close" className="h-6 w-6" />
                ) : (
                  <Icon name="menu" className="h-6 w-6" />
                )}
              </button>
            ) : (
              <span className="w-6 shrink-0" />
            )}
            {logo}
            <div className="flex shrink-0 items-center gap-3">
              {header.showSearch && (
                <button
                  type="button"
                  onClick={() => setSearchOpen((o) => !o)}
                  aria-label="Buscar productos"
                  aria-expanded={searchOpen}
                  aria-controls={MOBILE_SEARCH_ID}
                  className="-m-2.5 inline-flex p-2.5 opacity-90 hover:opacity-100"
                >
                  <Icon name="search" className="h-5 w-5" />
                </button>
              )}
              {accountBtn}
              {favBtn}
              {cartBtn}
            </div>
          </div>
        </div>

        {/* Mobile: la búsqueda y el panel con los links */}
        {header.showSearch && searchOpen && (
          <MobileSearch header={header} q={q} setQ={setQ} submitSearch={submitSearch} />
        )}
        {header.showTabsMobile && mobileOpen && (
          <MobilePanel header={header} items={navItems} onClose={() => setMobileOpen(false)} />
        )}
      </header>
    </>
  );
}
