'use client';

import { useContext, useEffect, useState } from 'react';
import { EDITOR_MSG } from '@tiendafy/types';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Pencil } from 'lucide-react';
import { cn } from '@tiendafy/ui';
import { Icon, IconKitContext } from './Icon';
import { CartProvider, CartDrawer, useCart } from './cart';
import { FavoritesProvider, useFavorites } from './favorites';
import { AuthProvider } from './auth';
import { AccountButton } from './AccountButton';
import { HomeSections, CashDiscountContext, type StoreProduct } from './sections';
import { EditableRegion } from './EditableRegion';
import { Analytics } from './Analytics';
import { CategoryMenu, CategoryMenuMobile } from './CategoryMenu';
import { PagesNav } from './PagesNav';
import { WhatsAppFab } from './WhatsAppFab';
import { ADMIN_ORIGIN, PreviewContext, LiveThemeContext, usePreviewHref } from './preview';
import { sanitizeCss } from '@tiendafy/types';
import { mergeTheme, themeToStyle, type ThemeConfig } from '@/lib/theme';
import { toStoreProduct, type ProductDto } from '@/lib/catalog';

import { clientJson } from '@/lib/api-client';

interface StorefrontViewProps {
  tenantId: string;
  tenantName: string;
  theme: ThemeConfig;
  products: StoreProduct[];
  live?: boolean;
  children?: React.ReactNode;
}

const logoSizeClass = { sm: 'text-base', md: 'text-lg', lg: 'text-2xl' };

/** Badge numérico (carrito / favoritos) sobre el ícono del header. */
function CountBadge({ count }: { count: number }) {
  return (
    <span className="absolute -right-2 -top-2 inline-flex h-[1.15rem] min-w-[1.15rem] items-center justify-center rounded-full bg-primary px-1 text-[0.65rem] font-bold leading-none text-primary-fg ring-2 ring-[rgb(var(--store-header-bg))]">{count}</span>
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
            onClick={(e) => { e.stopPropagation(); window.parent?.postMessage({ type: EDITOR_MSG.editSection, target: 'announcement' }, ADMIN_ORIGIN); }}
            className="absolute right-3 top-1/2 z-[56] inline-flex -translate-y-1/2 items-center gap-1.5 rounded-md bg-black/30 px-2.5 py-1 text-xs font-semibold text-white shadow-lg hover:bg-black/40"
          >
            <Pencil className="h-3.5 w-3.5" /> Editar barra de anuncio
          </button>
        </>
      )}
      {annMarquee ? (
        // Marquee: la pista se duplica para un loop continuo sin saltos.
        <div className="tf-marquee flex w-max whitespace-nowrap will-change-transform">
          {[0, 1].map((dup) => (
            <div key={dup} className="flex shrink-0 items-center" aria-hidden={dup === 1}>
              {annItems.map((it, i) => (
                <span key={i} className="flex items-center">
                  {it.link ? <a href={it.link} className="px-6 hover:underline">{it.text}</a> : <span className="px-6">{it.text}</span>}
                  <span className="opacity-50">•</span>
                </span>
              ))}
            </div>
          ))}
        </div>
      ) : (
        <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-center">
          {annItems.map((it, i) => (
            <span key={i} className="flex items-center gap-3">
              {i > 0 && <span className="opacity-50">•</span>}
              {it.link ? <a href={it.link} className="hover:underline">{it.text}</a> : <span>{it.text}</span>}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/** Mobile: panel desplegable con buscador + links (mismos ítems que el desktop). */
function MobilePanel({ header, q, setQ, submitSearch, navLinks, onClose }: {
  header: ThemeConfig['header'];
  q: string;
  setQ: (v: string) => void;
  submitSearch: (e: React.FormEvent) => void;
  navLinks: { href: string; label: string }[];
  onClose: () => void;
}) {
  return (
    <div className="border-t border-white/10 px-4 py-3 md:hidden" style={{ background: `rgb(${header.bg})` }}>
      {header.showSearch && (
        <form onSubmit={submitSearch} className="mb-3 flex items-center gap-1.5 rounded-full bg-white/10 px-3">
          <button type="submit" aria-label="Buscar" className="opacity-70 hover:opacity-100"><Icon name="search" className="h-4 w-4" /></button>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar" aria-label="Buscar" className="h-9 w-full bg-transparent text-sm outline-none placeholder:opacity-60" style={{ color: 'currentColor' }} />
        </form>
      )}
      {/* Mismos ítems que el desktop: Inicio · Productos · Categorías · Contacto · páginas */}
      <nav className="flex flex-col gap-0.5 text-sm">
        <Link href={navLinks[0].href} className="py-1.5 opacity-90 hover:opacity-100">{navLinks[0].label}</Link>
        <Link href={navLinks[1].href} className="py-1.5 opacity-90 hover:opacity-100">{navLinks[1].label}</Link>
        <CategoryMenuMobile onNavigate={onClose} />
        <Link href={navLinks[2].href} className="py-1.5 opacity-90 hover:opacity-100">{navLinks[2].label}</Link>
        <div className="flex flex-col [&>a]:py-1.5 [&>a]:opacity-90 [&>a:hover]:opacity-100">
          <PagesNav />
        </div>
      </nav>
    </div>
  );
}

function Header({ theme, tenantName }: { theme: ThemeConfig; tenantName: string }) {
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
  const [editHover, setEditHover] = useState(false);

  // Cerrar el menú mobile al navegar.
  useEffect(() => { setMobileOpen(false); }, [pathname]);

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
  const transparentAlpha = header.transparentLevel === 'medium' ? 0.5 : header.transparentLevel === 'light' ? 0.25 : 0;
  const bg = transparent ? `rgb(${header.bg} / ${transparentAlpha})` : `rgb(${header.bg})`;
  const borderClass = header.border === 'line' ? 'border-b border-white/15' : header.border === 'shadow' ? 'shadow-lg' : '';

  const submitSearch = (e: React.FormEvent) => {
    e.preventDefault();
    router.push(href(`/productos${q.trim() ? `?q=${encodeURIComponent(q.trim())}` : ''}`));
  };

  const logo = (
    <Link href={href('/')} className="flex min-w-0 items-center gap-2">
      {theme.logo ? (
        <img src={theme.logo} alt={tenantName} className={header.logoSize === 'lg' ? 'h-10' : header.logoSize === 'sm' ? 'h-6' : 'h-8'} />
      ) : (
        <span className={`truncate font-bold ${logoSizeClass[header.logoSize]}`} style={{ fontFamily: 'var(--font-heading)' }}>{tenantName}</span>
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

  const search = header.showSearch ? (
    <form onSubmit={submitSearch} className="flex items-center gap-1.5 rounded-full bg-white/10 px-3">
      <button type="submit" aria-label="Buscar" className="opacity-70 hover:opacity-100"><Icon name="search" className="h-4 w-4" /></button>
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

  const cartBtn = header.showCart ? (
    <button onClick={() => setOpen(true)} className="relative inline-flex items-center gap-1.5 text-sm" aria-label="Abrir carrito">
      <Icon name="cart" className="h-5 w-5" />
      {header.cartStyle === 'text' && <span className="hidden sm:inline">Carrito</span>}
      {count > 0 && <CountBadge count={count} />}
    </button>
  ) : null;

  // Login de comprador: siempre disponible (es funcionalidad core, no decorativa).
  const accountBtn = <AccountButton />;

  const favBtn = (
    <Link href={href('/favoritos')} className="relative inline-flex items-center opacity-90 hover:opacity-100" aria-label="Favoritos" title="Favoritos">
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
            <div className="flex min-w-0 flex-1 items-center justify-end gap-3">{accountBtn}{favBtn}{cartBtn}</div>
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
      <AnnouncementBar ann={theme.announcement} preview={preview} />
      <header
        data-tf-focus="header"
        className={cn(header.sticky && 'sticky top-0 z-40', !header.sticky && preview && 'relative', borderClass, 'transition-colors')}
        style={{ background: bg, color: textColor }}
        onMouseEnter={preview ? () => setEditHover(true) : undefined}
        onMouseLeave={preview ? () => setEditHover(false) : undefined}
      >
        {preview && editHover && (
          <>
            <div className="pointer-events-none absolute inset-0 z-[55] ring-2 ring-inset ring-primary" />
            <button
              onClick={(e) => { e.stopPropagation(); window.parent?.postMessage({ type: EDITOR_MSG.editSection, target: 'header' }, ADMIN_ORIGIN); }}
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
              <button type="button" onClick={() => setMobileOpen((o) => !o)} aria-label="Menú" className="shrink-0 opacity-90 hover:opacity-100">
                {mobileOpen ? <Icon name="close" className="h-6 w-6" /> : <Icon name="menu" className="h-6 w-6" />}
              </button>
            ) : (
              <span className="w-6 shrink-0" />
            )}
            {logo}
            <div className="flex shrink-0 items-center gap-3">{accountBtn}{favBtn}{cartBtn}</div>
          </div>
        </div>

        {/* Mobile: panel desplegable con buscador + links */}
        {header.showTabsMobile && mobileOpen && (
          <MobilePanel
            header={header}
            q={q}
            setQ={setQ}
            submitSearch={submitSearch}
            navLinks={navLinks}
            onClose={() => setMobileOpen(false)}
          />
        )}
      </header>
    </>
  );
}


function Footer({ theme, tenantName }: { theme: ThemeConfig; tenantName: string }) {
  const footer = theme.footer;
  return (
    <footer className="mt-8 border-t border-black/10">
      <div className="mx-auto max-w-container px-4 py-10">
        {footer.text && <p className="mx-auto max-w-xl text-center text-sm opacity-70">{footer.text}</p>}
        {footer.showSocial && (footer.instagram || footer.facebook) && (
          <div className="mt-4 flex justify-center gap-4 text-sm">
            {footer.instagram && <a href={footer.instagram} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 opacity-70 hover:opacity-100"><InstagramIcon /> Instagram</a>}
            {footer.facebook && <a href={footer.facebook} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 opacity-70 hover:opacity-100"><FacebookIcon /> Facebook</a>}
          </div>
        )}
        {[...footer.whatsapps, ...footer.addresses, ...footer.phones, ...footer.emails].some(Boolean) && (
          <div className="mt-5 flex flex-wrap justify-center gap-x-6 gap-y-2 text-sm opacity-75">
            {footer.whatsapps.filter(Boolean).map((w, i) => (
              <a key={`w${i}`} href={`https://wa.me/${w.replace(/\D/g, '')}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 hover:opacity-100">
                <Icon name="chat" className="h-4 w-4" /> {w}
              </a>
            ))}
            {footer.phones.filter(Boolean).map((p, i) => (
              <a key={`p${i}`} href={`tel:${p.replace(/\s/g, '')}`} className="inline-flex items-center gap-1.5 hover:opacity-100">
                <Icon name="phone" className="h-4 w-4" /> {p}
              </a>
            ))}
            {footer.emails.filter(Boolean).map((e, i) => (
              <a key={`e${i}`} href={`mailto:${e}`} className="inline-flex items-center gap-1.5 hover:opacity-100">
                <Icon name="mail" className="h-4 w-4" /> {e}
              </a>
            ))}
            {footer.addresses.filter(Boolean).map((a, i) => (
              <span key={`a${i}`} className="inline-flex items-center gap-1.5">
                <Icon name="mapPin" className="h-4 w-4" /> {a}
              </span>
            ))}
          </div>
        )}
        {footer.showPaymentLogos && footer.paymentLogos.length > 0 && (
          <div className="mt-5 flex flex-wrap items-center justify-center gap-2.5">
            {footer.paymentLogos.map((slug) => (
              <img
                key={slug}
                src={`/payment-logos/${slug}.svg`}
                alt=""
                className="h-7 w-auto rounded border border-black/10 bg-white object-contain px-1.5 py-1"
              />
            ))}
          </div>
        )}
        {/* Links legales fijos: el Botón de Arrepentimiento es obligatorio (Res. 424/2020). */}
        <div className="mt-6 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs opacity-60">
          <Link href="/terminos" className="hover:underline">Términos y condiciones</Link>
          <span aria-hidden>·</span>
          <Link href="/privacidad" className="hover:underline">Privacidad</Link>
          <span aria-hidden>·</span>
          <Link href="/arrepentimiento" className="font-semibold hover:underline">Botón de arrepentimiento</Link>
        </div>
        <div className="mt-3 text-center text-xs opacity-50">© {tenantName} · Powered by Tiendafy</div>
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
    const onMsg = (e: MessageEvent) => {
      if (e.origin !== ADMIN_ORIGIN) return; // solo mensajes del editor
      if (e.data?.type === EDITOR_MSG.previewCart) setOpen(e.data.open !== false);
    };
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, [preview, setOpen]);
  return null;
}

function Inner({ tenantName, theme, products, children }: Omit<StorefrontViewProps, 'live' | 'tenantId'>) {
  return (
    <div className="min-h-screen overflow-x-clip bg-bg text-fg" style={{ fontFamily: 'var(--font-body)' }}>
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
      // Solo mensajes del panel admin: un tercero que embeba el preview no
      // debe poder inyectar un theme (llegaría con customCss sin sanear).
      if (e.origin !== ADMIN_ORIGIN) return;
      // mergeTheme: el editor puede postear un draft viejo sin campos nuevos.
      if (e.data?.type === EDITOR_MSG.theme && e.data.theme) setTheme(mergeTheme(e.data.theme));
      // Al abrir un panel, el editor pide enfocar su sección: scroll + flash.
      if (e.data?.type === EDITOR_MSG.focusSection) {
        const key = e.data.sectionId ? `section:${e.data.sectionId}` : e.data.target;
        const el = key && document.querySelector<HTMLElement>(`[data-tf-focus="${key}"]`);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          el.classList.remove('tf-focus-flash');
          void el.offsetWidth; // reinicia la animación si ya estaba
          el.classList.add('tf-focus-flash');
          window.setTimeout(() => el.classList.remove('tf-focus-flash'), 1400);
        }
      }
    };
    window.addEventListener('message', handler);
    if (window.parent && window.parent !== window) {
      window.parent.postMessage({ type: EDITOR_MSG.previewReady }, ADMIN_ORIGIN);
    }
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
        clientJson<ProductDto>(`/api/v1/products/${id}`, { headers: { 'X-Tenant-Id': tenantId, Accept: 'application/json' } }),
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
    <div data-store-radius={theme.borderRadius} data-store-motion={theme.motion} data-store-density={theme.density} style={themeToStyle(theme) as React.CSSProperties}>
      <IconKitContext.Provider value={theme.iconKit}>
      <CashDiscountContext.Provider value={theme.productDetail.cashDiscountPercent || 0}>
      {/* sanitizeCss también acá: el theme puede venir del postMessage live (no pasó por el backend). */}
      {theme.customCss && <style dangerouslySetInnerHTML={{ __html: sanitizeCss(theme.customCss) }} />}
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
        <WhatsAppFab
          phone={theme.whatsappButton.phone}
          message={theme.whatsappButton.message}
          storeName={tenantName}
          logo={theme.logo}
          showPreview={theme.whatsappButton.showPreview !== false}
        />
      )}
      </CashDiscountContext.Provider>
      </IconKitContext.Provider>
    </div>
  );
}
