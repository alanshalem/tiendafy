'use client';

import { useContext, useEffect, useRef, useState } from 'react';
import { EDITOR_MSG } from '@tiendafy/types';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Pencil } from 'lucide-react';
import { cn } from '@tiendafy/ui';
import { Icon } from './Icon';
import { useCart } from './cart';
import { useFavorites } from './favorites';
import { AccountButton } from './AccountButton';
import { CategoryMenuMobile } from './CategoryMenu';
import { PagesNav, usePublishedPages } from './PagesNav';
import { HeaderNav, type NavItem } from './HeaderNav';
import { ADMIN_ORIGIN, PreviewContext, usePreviewHref } from './preview';
import { type ThemeConfig } from '@/lib/theme';
import { MarqueeTrack } from './MarqueeTrack';

const logoSizeClass = { sm: 'text-base', md: 'text-lg', lg: 'text-2xl' };

/** Badge numérico (carrito / favoritos) sobre el ícono del header. */
function CountBadge({ count }: { count: number }) {
  return (
    <span className="absolute right-0.5 top-0.5 inline-flex h-[1.15rem] min-w-[1.15rem] items-center justify-center rounded-full bg-primary px-1 text-[0.65rem] font-bold leading-none text-primary-fg ring-2 ring-[rgb(var(--store-header-bg))]">
      {count}
    </span>
  );
}

/**
 * Barra de anuncio: uno o varios textos (cada uno con link opcional), fija o
 * desplazándose (marquee). Sólo se muestra si hay al menos un texto con contenido.
 */
function AnnouncementBar({ ann, preview }: { ann: ThemeConfig['announcement']; preview: boolean }) {
  const [annHover, setAnnHover] = useState(false);
  const annItems = (ann.items ?? []).filter((i) => i.text.trim());
  const annMarquee = ann.animation === 'marquee';
  if (!(ann.show && annItems.length > 0)) return null;
  return (
    <div
      data-tf-focus="announcement"
      className="relative overflow-hidden bg-primary px-4 py-2 text-sm font-semibold text-primary-fg"
      onMouseEnter={preview ? () => setAnnHover(true) : undefined}
      onMouseLeave={preview ? () => setAnnHover(false) : undefined}
    >
      {preview && annHover && (
        <>
          <div className="pointer-events-none absolute inset-0 z-[55] ring-2 ring-inset ring-white/70" />
          <button
            onClick={(e) => {
              e.stopPropagation();
              window.parent?.postMessage(
                { type: EDITOR_MSG.editSection, target: 'announcement' },
                ADMIN_ORIGIN,
              );
            }}
            className="absolute right-3 top-1/2 z-[56] inline-flex -translate-y-1/2 items-center gap-1.5 rounded-md bg-black/30 px-2.5 py-1 text-xs font-semibold text-white shadow-lg hover:bg-black/40"
          >
            <Pencil className="h-3.5 w-3.5" /> Editar barra de anuncio
          </button>
        </>
      )}
      {annMarquee ? (
        // Marquee: la pista se duplica para un loop continuo sin saltos.
        <MarqueeTrack className="whitespace-nowrap">
          {annItems.map((it, i) => (
            <span key={i} className="flex items-center">
              {it.link ? (
                <a href={it.link} className="px-6 hover:underline">
                  {it.text}
                </a>
              ) : (
                <span className="px-6">{it.text}</span>
              )}
              <span className="opacity-50">•</span>
            </span>
          ))}
        </MarqueeTrack>
      ) : (
        <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-center">
          {annItems.map((it, i) => (
            <span key={i} className="flex items-center gap-3">
              {i > 0 && <span className="opacity-50">•</span>}
              {it.link ? (
                <a href={it.link} className="hover:underline">
                  {it.text}
                </a>
              ) : (
                <span>{it.text}</span>
              )}
            </span>
          ))}
        </div>
      )}
    </div>
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
      className="border-t border-white/10 px-4 py-3 md:hidden"
      style={{ background: `rgb(${header.bg})` }}
    >
      <form
        onSubmit={submitSearch}
        role="search"
        className="flex items-center gap-1.5 rounded-full bg-white/10 px-3"
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

/** Mobile: panel desplegable con los links (mismos ítems que el desktop). */
function MobilePanel({
  header,
  navLinks,
  onClose,
}: {
  header: ThemeConfig['header'];
  navLinks: { href: string; label: string }[];
  onClose: () => void;
}) {
  return (
    <div
      id={MOBILE_MENU_ID}
      className="border-t border-white/10 px-4 py-3 md:hidden"
      style={{ background: `rgb(${header.bg})` }}
    >
      {/* Mismos ítems que el desktop: Inicio · Productos · Categorías · Contacto · páginas */}
      <nav className="flex flex-col gap-0.5 text-sm">
        <Link href={navLinks[0].href} className="py-1.5 opacity-90 hover:opacity-100">
          {navLinks[0].label}
        </Link>
        <Link href={navLinks[1].href} className="py-1.5 opacity-90 hover:opacity-100">
          {navLinks[1].label}
        </Link>
        <CategoryMenuMobile onNavigate={onClose} />
        <Link href={navLinks[2].href} className="py-1.5 opacity-90 hover:opacity-100">
          {navLinks[2].label}
        </Link>
        <div className="flex flex-col [&>a]:py-1.5 [&>a]:opacity-90 [&>a:hover]:opacity-100">
          <PagesNav />
        </div>
      </nav>
    </div>
  );
}

export function Header({ theme, tenantName }: { theme: ThemeConfig; tenantName: string }) {
  const header = theme.header;
  const { count, setOpen } = useCart();
  const fav = useFavorites();
  const href = usePreviewHref();
  const preview = useContext(PreviewContext);
  const pathname = usePathname();
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

  const isHome = pathname === '/' || pathname === '/preview';
  const transparent = header.transparentOnHome && isHome && !scrolled;

  useEffect(() => {
    if (!header.transparentOnHome) return;
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [header.transparentOnHome]);

  const textColor = header.textColor ? `rgb(${header.textColor})` : '#fff';
  // Nivel de transparencia elegible: 'full' = totalmente transparente; 'light'/'medium' dejan un tinte del color del header.
  const transparentAlpha =
    header.transparentLevel === 'medium' ? 0.5 : header.transparentLevel === 'light' ? 0.25 : 0;
  const bg = transparent ? `rgb(${header.bg} / ${transparentAlpha})` : `rgb(${header.bg})`;
  const borderClass =
    header.border === 'line' ? 'border-b border-white/15' : header.border === 'shadow' ? 'shadow-lg' : '';

  const submitSearch = (e: React.FormEvent) => {
    e.preventDefault();
    router.push(href(`/productos${q.trim() ? `?q=${encodeURIComponent(q.trim())}` : ''}`));
  };

  const logo = (
    <Link href={href('/')} className="flex min-w-0 items-center gap-2">
      {theme.logo ? (
        <img
          src={theme.logo}
          alt={tenantName}
          className={header.logoSize === 'lg' ? 'h-10' : header.logoSize === 'sm' ? 'h-6' : 'h-8'}
        />
      ) : (
        <span
          className={`truncate font-bold ${logoSizeClass[header.logoSize]}`}
          style={{ fontFamily: 'var(--font-heading)' }}
        >
          {tenantName}
        </span>
      )}
    </Link>
  );

  const navLinks = [
    { href: href('/'), label: 'Inicio' },
    { href: href('/productos'), label: 'Productos' },
    { href: href('/contacto'), label: 'Contacto' },
  ];
  // El menú del encabezado: los ítems fijos + las páginas de contenido, en el
  // orden y con la visibilidad que el comercio eligió en el editor de diseño.
  //
  // El tema guarda PREFERENCIAS, no la lista: acá se arma lo que existe de
  // verdad y después se aplica. Una página nueva aparece sola al final —
  // publicarla y que no se vea sería desconcertante— y una borrada deja una
  // preferencia que no coincide con nada.
  const pages = usePublishedPages();
  const allItems: NavItem[] = [
    { id: 'home', label: 'Inicio', href: href('/') },
    { id: 'products', label: 'Productos', href: href('/productos') },
    { id: 'categories', label: 'Categorías', href: href('/productos'), kind: 'categories' },
    { id: 'contact', label: 'Contacto', href: href('/contacto') },
    ...pages.map((p) => ({ id: `page:${p.id}`, label: p.title, href: href(`/paginas/${p.slug}`) })),
  ];

  const prefs = header.menu ?? [];
  const rank = new Map(prefs.map((m, i) => [m.id, i]));
  const hiddenIds = new Set(prefs.filter((m) => !m.visible).map((m) => m.id));
  const navItems = allItems
    .filter((item) => !hiddenIds.has(item.id))
    .sort(
      (a, b) => (rank.get(a.id) ?? Number.MAX_SAFE_INTEGER) - (rank.get(b.id) ?? Number.MAX_SAFE_INTEGER),
    );

  const navFor = (align: 'center' | 'start') => <HeaderNav align={align} items={navItems} />;
  const nav = navFor('center');

  const search = header.showSearch ? (
    <form onSubmit={submitSearch} className="flex items-center gap-1.5 rounded-full bg-white/10 px-3">
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
            {nav}
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
        data-tf-focus="header"
        className={cn(
          header.sticky && 'sticky top-0 z-40',
          !header.sticky && preview && 'relative',
          borderClass,
          'transition-colors',
        )}
        style={{ background: bg, color: textColor }}
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
          <MobilePanel header={header} navLinks={navLinks} onClose={() => setMobileOpen(false)} />
        )}
      </header>
    </>
  );
}
