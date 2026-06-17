'use client';

import { useContext, useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { ShoppingCart, Search, MessageCircle, MapPin, Phone, Mail, Menu, X, Pencil, Heart } from 'lucide-react';
import { CartProvider, CartDrawer, useCart } from './cart';
import { FavoritesProvider, useFavorites } from './favorites';
import { AuthProvider } from './auth';
import { AccountButton } from './AccountButton';
import { HomeSections, type StoreProduct } from './sections';
import { EditableRegion } from './EditableRegion';
import { Analytics } from './Analytics';
import { CategoryMenu, CategoryMenuMobile } from './CategoryMenu';
import { PagesNav } from './PagesNav';
import { PreviewContext, LiveThemeContext, usePreviewHref } from './preview';
import { mergeTheme, themeToStyle, type ThemeConfig } from '@/lib/theme';
import { toStoreProduct } from '@/lib/catalog';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:5080';

interface StorefrontViewProps {
  tenantId: string;
  tenantName: string;
  theme: ThemeConfig;
  products: StoreProduct[];
  live?: boolean;
  children?: React.ReactNode;
}

const logoSizeClass = { sm: 'text-base', md: 'text-lg', lg: 'text-2xl' };

function Header({ theme, tenantName }: { theme: ThemeConfig; tenantName: string }) {
  const h = theme.header;
  const { count, setOpen } = useCart();
  const fav = useFavorites();
  const href = usePreviewHref();
  const preview = useContext(PreviewContext);
  const pathname = usePathname();
  const router = useRouter();
  const [scrolled, setScrolled] = useState(false);
  const [q, setQ] = useState('');
  const [mobileOpen, setMobileOpen] = useState(false);
  const [editHover, setEditHover] = useState(false);
  const [annHover, setAnnHover] = useState(false);

  // Cerrar el menú mobile al navegar.
  useEffect(() => { setMobileOpen(false); }, [pathname]);

  const isHome = pathname === '/' || pathname === '/preview';
  const transparent = h.transparentOnHome && isHome && !scrolled;

  useEffect(() => {
    if (!h.transparentOnHome) return;
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [h.transparentOnHome]);

  const textColor = h.textColor ? `rgb(${h.textColor})` : '#fff';
  // Nivel de transparencia elegible: 'full' = totalmente transparente; 'light'/'medium' dejan un tinte del color del header.
  const transparentAlpha = h.transparentLevel === 'medium' ? 0.5 : h.transparentLevel === 'light' ? 0.25 : 0;
  const bg = transparent ? `rgb(${h.bg} / ${transparentAlpha})` : `rgb(${h.bg})`;
  const borderClass = h.border === 'line' ? 'border-b border-white/15' : h.border === 'shadow' ? 'shadow-lg' : '';

  const submitSearch = (e: React.FormEvent) => {
    e.preventDefault();
    router.push(href(`/productos${q.trim() ? `?q=${encodeURIComponent(q.trim())}` : ''}`));
  };

  const logo = (
    <Link href={href('/')} className="flex min-w-0 items-center gap-2">
      {theme.logo ? (
        <img src={theme.logo} alt={tenantName} className={h.logoSize === 'lg' ? 'h-10' : h.logoSize === 'sm' ? 'h-6' : 'h-8'} />
      ) : (
        <span className={`truncate font-bold ${logoSizeClass[h.logoSize]}`} style={{ fontFamily: 'var(--font-heading)' }}>{tenantName}</span>
      )}
    </Link>
  );

  const navLinks = [
    { href: href('/'), label: 'Inicio' },
    { href: href('/productos'), label: 'Productos' },
    { href: href('/contacto'), label: 'Contacto' },
  ];
  const nav = (
    <nav className="flex items-center gap-6 text-sm">
      <Link href={navLinks[0].href} className="opacity-90 hover:opacity-100">{navLinks[0].label}</Link>
      <Link href={navLinks[1].href} className="opacity-90 hover:opacity-100">{navLinks[1].label}</Link>
      <CategoryMenu />
      <Link href={navLinks[2].href} className="opacity-90 hover:opacity-100">{navLinks[2].label}</Link>
      <PagesNav />
    </nav>
  );

  const search = h.showSearch ? (
    <form onSubmit={submitSearch} className="flex items-center gap-1.5 rounded-full bg-white/10 px-3">
      <button type="submit" aria-label="Buscar" className="opacity-70 hover:opacity-100"><Search className="h-4 w-4" /></button>
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Buscar"
        className="h-8 w-32 bg-transparent text-sm outline-none placeholder:opacity-60 lg:w-44"
        style={{ color: 'currentColor' }}
      />
    </form>
  ) : null;

  const cartBtn = h.showCart ? (
    <button onClick={() => setOpen(true)} className="inline-flex items-center gap-1.5 text-sm" aria-label="Abrir carrito">
      <ShoppingCart className="h-5 w-5" />
      {h.cartStyle === 'text' && <span className="hidden sm:inline">Carrito</span>}
      <span className="rounded-full px-1.5 text-xs font-bold text-primary-fg" style={{ background: 'rgb(var(--color-primary))' }}>{count}</span>
    </button>
  ) : null;

  // Login de comprador: siempre disponible (es funcionalidad core, no decorativa).
  const accountBtn = <AccountButton />;

  const favBtn = (
    <Link href={href('/favoritos')} className="relative inline-flex items-center opacity-90 hover:opacity-100" aria-label="Favoritos" title="Favoritos">
      <Heart className="h-5 w-5" />
      {fav.count > 0 && (
        <span className="absolute -right-2 -top-2 rounded-full px-1.5 text-[0.65rem] font-bold text-primary-fg" style={{ background: 'rgb(var(--color-primary))' }}>{fav.count}</span>
      )}
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
  switch (h.layout) {
    case 'logo-center':
      inner = (
        <div className="py-2.5">
          <div className="flex items-center">
            <div className="flex-1">{search}</div>
            <div className="flex justify-center">{logo}</div>
            <div className="flex flex-1 items-center justify-end gap-3">{accountBtn}{favBtn}{cartBtn}</div>
          </div>
          <div className="mt-1.5 flex justify-center">{nav}</div>
        </div>
      );
      break;
    case 'menu-left':
      inner = (
        <div className="flex h-16 items-center gap-6">
          {logo}
          {nav}
          <div className="ml-auto">{icons}</div>
        </div>
      );
      break;
    case 'menu-right':
      inner = (
        <div className="flex h-16 items-center justify-between gap-4">
          {logo}
          <div className="flex items-center gap-6">{nav}{icons}</div>
        </div>
      );
      break;
    default: // classic
      inner = (
        <div className="flex h-16 items-center justify-between gap-4">
          {logo}
          <div className="hidden flex-1 justify-center md:flex">{nav}</div>
          {icons}
        </div>
      );
  }

  return (
    <>
      {theme.announcement.show && theme.announcement.message && (
        <div
          className="relative px-4 py-2 text-center text-sm font-semibold text-primary-fg"
          style={{ background: 'rgb(var(--color-primary))' }}
          onMouseEnter={preview ? () => setAnnHover(true) : undefined}
          onMouseLeave={preview ? () => setAnnHover(false) : undefined}
        >
          {preview && annHover && (
            <>
              <div className="pointer-events-none absolute inset-0 z-[55] ring-2 ring-inset ring-white/70" />
              <button
                onClick={(e) => { e.stopPropagation(); window.parent?.postMessage({ type: 'tiendafy:edit-section', target: 'announcement' }, '*'); }}
                className="absolute right-3 top-1/2 z-[56] inline-flex -translate-y-1/2 items-center gap-1.5 rounded-md bg-black/30 px-2.5 py-1 text-xs font-semibold text-white shadow-lg hover:bg-black/40"
              >
                <Pencil className="h-3.5 w-3.5" /> Editar barra de anuncio
              </button>
            </>
          )}
          {theme.announcement.link ? <a href={theme.announcement.link}>{theme.announcement.message}</a> : theme.announcement.message}
        </div>
      )}
      <header
        className={cn(h.sticky && 'sticky top-0 z-40', !h.sticky && preview && 'relative', borderClass, 'transition-colors')}
        style={{ background: bg, color: textColor }}
        onMouseEnter={preview ? () => setEditHover(true) : undefined}
        onMouseLeave={preview ? () => setEditHover(false) : undefined}
      >
        {preview && editHover && (
          <>
            <div className="pointer-events-none absolute inset-0 z-[55] ring-2 ring-inset ring-[rgb(var(--color-primary))]" />
            <button
              onClick={(e) => { e.stopPropagation(); window.parent?.postMessage({ type: 'tiendafy:edit-section', target: 'header' }, '*'); }}
              className="absolute right-3 top-2 z-[56] inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-semibold text-primary-fg shadow-lg"
              style={{ background: 'rgb(var(--color-primary))' }}
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
            {h.showTabsMobile ? (
              <button type="button" onClick={() => setMobileOpen((o) => !o)} aria-label="Menú" className="shrink-0 opacity-90 hover:opacity-100">
                {mobileOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
              </button>
            ) : (
              <span className="w-6 shrink-0" />
            )}
            {logo}
            <div className="flex shrink-0 items-center gap-3">{accountBtn}{favBtn}{cartBtn}</div>
          </div>
        </div>

        {/* Mobile: panel desplegable con buscador + links */}
        {h.showTabsMobile && mobileOpen && (
          <div className="border-t border-white/10 px-4 py-3 md:hidden" style={{ background: `rgb(${h.bg})` }}>
            {h.showSearch && (
              <form onSubmit={submitSearch} className="mb-3 flex items-center gap-1.5 rounded-full bg-white/10 px-3">
                <button type="submit" aria-label="Buscar" className="opacity-70 hover:opacity-100"><Search className="h-4 w-4" /></button>
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar" className="h-9 w-full bg-transparent text-sm outline-none placeholder:opacity-60" style={{ color: 'currentColor' }} />
              </form>
            )}
            {/* Mismos ítems que el desktop: Inicio · Productos · Categorías · Contacto · páginas */}
            <nav className="flex flex-col gap-0.5 text-sm">
              <Link href={navLinks[0].href} className="py-1.5 opacity-90 hover:opacity-100">{navLinks[0].label}</Link>
              <Link href={navLinks[1].href} className="py-1.5 opacity-90 hover:opacity-100">{navLinks[1].label}</Link>
              <CategoryMenuMobile onNavigate={() => setMobileOpen(false)} />
              <Link href={navLinks[2].href} className="py-1.5 opacity-90 hover:opacity-100">{navLinks[2].label}</Link>
              <div className="flex flex-col [&>a]:py-1.5 [&>a]:opacity-90 [&>a:hover]:opacity-100">
                <PagesNav />
              </div>
            </nav>
          </div>
        )}
      </header>
    </>
  );
}

function cn(...parts: Array<string | false | undefined>) {
  return parts.filter(Boolean).join(' ');
}

function Footer({ theme, tenantName }: { theme: ThemeConfig; tenantName: string }) {
  const f = theme.footer;
  return (
    <footer className="mt-8 border-t border-black/10">
      <div className="mx-auto max-w-container px-4 py-10">
        {f.text && <p className="mx-auto max-w-xl text-center text-sm opacity-70">{f.text}</p>}
        {f.showSocial && (f.instagram || f.facebook) && (
          <div className="mt-4 flex justify-center gap-4 text-sm">
            {f.instagram && <a href={f.instagram} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 opacity-70 hover:opacity-100"><InstagramIcon /> Instagram</a>}
            {f.facebook && <a href={f.facebook} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 opacity-70 hover:opacity-100"><FacebookIcon /> Facebook</a>}
          </div>
        )}
        {[...f.whatsapps, ...f.addresses, ...f.phones, ...f.emails].some(Boolean) && (
          <div className="mt-5 flex flex-wrap justify-center gap-x-6 gap-y-2 text-sm opacity-75">
            {f.whatsapps.filter(Boolean).map((w, i) => (
              <a key={`w${i}`} href={`https://wa.me/${w.replace(/\D/g, '')}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 hover:opacity-100">
                <MessageCircle className="h-4 w-4" /> {w}
              </a>
            ))}
            {f.phones.filter(Boolean).map((p, i) => (
              <a key={`p${i}`} href={`tel:${p.replace(/\s/g, '')}`} className="inline-flex items-center gap-1.5 hover:opacity-100">
                <Phone className="h-4 w-4" /> {p}
              </a>
            ))}
            {f.emails.filter(Boolean).map((e, i) => (
              <a key={`e${i}`} href={`mailto:${e}`} className="inline-flex items-center gap-1.5 hover:opacity-100">
                <Mail className="h-4 w-4" /> {e}
              </a>
            ))}
            {f.addresses.filter(Boolean).map((a, i) => (
              <span key={`a${i}`} className="inline-flex items-center gap-1.5">
                <MapPin className="h-4 w-4" /> {a}
              </span>
            ))}
          </div>
        )}
        {f.showPaymentLogos && f.paymentLogos.length > 0 && (
          <div className="mt-5 flex flex-wrap items-center justify-center gap-2.5">
            {f.paymentLogos.map((slug) => (
              <img
                key={slug}
                src={`/payment-logos/${slug}.svg`}
                alt=""
                className="h-7 w-auto rounded border border-black/10 bg-white object-contain px-1.5 py-1"
              />
            ))}
          </div>
        )}
        <div className="mt-6 text-center text-xs opacity-50">© {tenantName} · Powered by Tiendafy</div>
      </div>
    </footer>
  );
}

// lucide-react quitó los iconos de marca; SVGs propios (heredan currentColor).
function InstagramIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="2" y="2" width="20" height="20" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.5" cy="6.5" r="0.5" fill="currentColor" />
    </svg>
  );
}

function FacebookIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true">
      <path d="M14 9h3l.4-3H14V4.5c0-.8.3-1.5 1.5-1.5H17.5V.2C17.1.1 16 0 14.9 0 12.5 0 11 1.4 11 4v2H8v3h3v9h3V9z" />
    </svg>
  );
}

/** En preview, abre/cierra el carrito según los mensajes del editor (panel "Carrito"). */
function PreviewCartSync() {
  const preview = useContext(PreviewContext);
  const { setOpen } = useCart();
  useEffect(() => {
    if (!preview) return;
    const h = (e: MessageEvent) => {
      if (e.data?.type === 'tiendafy:preview-cart') setOpen(e.data.open !== false);
    };
    window.addEventListener('message', h);
    return () => window.removeEventListener('message', h);
  }, [preview, setOpen]);
  return null;
}

function Inner({ tenantName, theme, products, children }: Omit<StorefrontViewProps, 'live' | 'tenantId'>) {
  return (
    <div className="min-h-screen overflow-x-clip" style={{ background: 'rgb(var(--color-bg))', color: 'rgb(var(--color-fg))', fontFamily: 'var(--font-body)' }}>
      <PreviewCartSync />
      <Header theme={theme} tenantName={tenantName} />
      {children ?? (
        <HomeSections sections={theme.sections} products={products} storeName={tenantName} productList={theme.productList} />
      )}
      <EditableRegion target="footer" label="el pie de página">
        <Footer theme={theme} tenantName={tenantName} />
      </EditableRegion>
      <CartDrawer cart={theme.cart} suggested={theme.cart.showSuggested ? products.slice(0, 3) : []} />
    </div>
  );
}

export function StorefrontView({ tenantId, tenantName, theme: initialTheme, products: initialProducts, live, children }: StorefrontViewProps) {
  const [theme, setTheme] = useState<ThemeConfig>(initialTheme);
  const [products, setProducts] = useState<StoreProduct[]>(initialProducts);

  useEffect(() => {
    if (!live) return;
    const handler = (e: MessageEvent) => {
      // mergeTheme: el editor puede postear un draft viejo sin campos nuevos.
      if (e.data?.type === 'tiendafy:theme' && e.data.theme) setTheme(mergeTheme(e.data.theme));
    };
    window.addEventListener('message', handler);
    window.parent?.postMessage({ type: 'tiendafy:preview-ready' }, '*');
    return () => window.removeEventListener('message', handler);
  }, [live]);

  // Live: el theme se actualiza por postMessage pero `products` es el snapshot
  // inicial. Un destacado recién agregado puede no estar en ese set → lo traemos
  // por id al vuelo, así aparece sin recargar el preview.
  useEffect(() => {
    if (!live) return;
    const referenced = new Set<string>();
    for (const s of theme.sections) {
      const ids = (s.data as { productIds?: unknown }).productIds;
      if (Array.isArray(ids)) ids.forEach((id) => typeof id === 'string' && referenced.add(id));
    }
    const present = new Set(products.map((p) => p.id));
    const missing = [...referenced].filter((id) => !present.has(id));
    if (missing.length === 0) return;

    let cancelled = false;
    Promise.all(
      missing.map((id) =>
        fetch(`${API_BASE}/api/v1/products/${id}`, { headers: { 'X-Tenant-Id': tenantId, Accept: 'application/json' } })
          .then((r) => (r.ok ? r.json() : null))
          .catch(() => null),
      ),
    ).then((dtos) => {
      if (cancelled) return;
      const extra = dtos.map((d) => (d ? toStoreProduct(d) : null)).filter((p): p is StoreProduct => p !== null);
      if (extra.length) setProducts((prev) => [...prev, ...extra]);
    });
    return () => { cancelled = true; };
  }, [live, theme, tenantId, products]);

  // Favicon de la tienda en la pestaña del navegador (y en vivo en el preview).
  useEffect(() => {
    if (!theme.favicon) return;
    let link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
    if (!link) {
      link = document.createElement('link');
      link.rel = 'icon';
      document.head.appendChild(link);
    }
    const previous = link.href;
    link.href = theme.favicon;
    return () => { if (link) link.href = previous; };
  }, [theme.favicon]);

  return (
    <div data-store-radius={theme.borderRadius} style={themeToStyle(theme) as React.CSSProperties}>
      {theme.customCss && <style dangerouslySetInnerHTML={{ __html: theme.customCss }} />}
      {!live && tenantId && <Analytics tenantId={tenantId} />}
      <PreviewContext.Provider value={!!live}>
        <LiveThemeContext.Provider value={live ? theme : null}>
          <AuthProvider storeKey={tenantId}>
            <FavoritesProvider storeKey={tenantId}>
              <CartProvider storeKey={tenantId}>
                <Inner tenantName={tenantName} theme={theme} products={products}>
                  {children}
                </Inner>
              </CartProvider>
            </FavoritesProvider>
          </AuthProvider>
        </LiveThemeContext.Provider>
      </PreviewContext.Provider>
      {theme.whatsappButton?.enabled && theme.whatsappButton.phone && (
        <a
          href={`https://wa.me/${theme.whatsappButton.phone.replace(/\D/g, '')}?text=${encodeURIComponent(theme.whatsappButton.message || '')}`}
          target="_blank"
          rel="noreferrer"
          aria-label="Escribinos por WhatsApp"
          className="fixed bottom-5 right-5 z-[70] flex h-14 w-14 items-center justify-center rounded-full text-white shadow-lg transition-transform hover:scale-110"
          style={{ background: '#25D366' }}
        >
          <svg viewBox="0 0 24 24" className="h-8 w-8" fill="currentColor" aria-hidden="true">
            <path d="M.057 24l1.687-6.163a11.867 11.867 0 01-1.587-5.945C.16 5.335 5.495 0 12.05 0a11.817 11.817 0 018.413 3.488 11.824 11.824 0 013.48 8.414c-.003 6.557-5.338 11.892-11.893 11.892a11.9 11.9 0 01-5.688-1.448L.057 24zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884a9.86 9.86 0 001.519 5.262l-.999 3.648 3.97-1.04zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.5-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413z" />
          </svg>
        </a>
      )}
    </div>
  );
}
