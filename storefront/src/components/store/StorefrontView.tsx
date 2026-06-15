'use client';

import { useContext, useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { ShoppingCart, Search, User, MessageCircle, MapPin, Phone, Mail, Menu, X, Pencil } from 'lucide-react';
import { CartProvider, CartDrawer, useCart } from './cart';
import { HomeSections, type StoreProduct } from './sections';
import { EditableRegion } from './EditableRegion';
import { PreviewContext, LiveThemeContext, usePreviewHref } from './preview';
import { mergeTheme, themeToStyle, type ThemeConfig } from '@/lib/theme';

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
      {navLinks.map((l) => (
        <Link key={l.label} href={l.href} className="opacity-90 hover:opacity-100">{l.label}</Link>
      ))}
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

  const accountBtn = h.showAccount ? (
    <button type="button" aria-label="Mi cuenta" title="Mi cuenta" className="opacity-90 hover:opacity-100"><User className="h-5 w-5" /></button>
  ) : null;

  const icons = (
    <div className="flex items-center gap-3">
      {search}
      {accountBtn}
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
            <div className="flex flex-1 items-center justify-end gap-3">{accountBtn}{cartBtn}</div>
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
        <div className="px-4 py-2 text-center text-sm font-semibold text-primary-fg" style={{ background: 'rgb(var(--color-primary))' }}>
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
            <div className="flex shrink-0 items-center gap-3">{accountBtn}{cartBtn}</div>
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
            <nav className="flex flex-col gap-0.5 text-sm">
              {navLinks.map((l) => (
                <Link key={l.label} href={l.href} className="py-1.5 opacity-90 hover:opacity-100">{l.label}</Link>
              ))}
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
        {f.showPaymentLogos && (
          <div className="mt-5 flex flex-wrap justify-center gap-2 text-xs opacity-60">
            {['Mercado Pago', 'Visa', 'Mastercard', 'Transferencia'].map((p) => (
              <span key={p} className="rounded border border-black/15 px-2 py-1">{p}</span>
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
      <EditableRegion target="footer" label="el pie">
        <Footer theme={theme} tenantName={tenantName} />
      </EditableRegion>
      <CartDrawer cart={theme.cart} suggested={theme.cart.showSuggested ? products.slice(0, 3) : []} />
    </div>
  );
}

export function StorefrontView({ tenantId, tenantName, theme: initialTheme, products, live, children }: StorefrontViewProps) {
  const [theme, setTheme] = useState<ThemeConfig>(initialTheme);

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
    <div style={themeToStyle(theme) as React.CSSProperties}>
      {theme.customCss && <style dangerouslySetInnerHTML={{ __html: theme.customCss }} />}
      <PreviewContext.Provider value={!!live}>
        <LiveThemeContext.Provider value={live ? theme : null}>
          <CartProvider storeKey={tenantId}>
            <Inner tenantName={tenantName} theme={theme} products={products}>
              {children}
            </Inner>
          </CartProvider>
        </LiveThemeContext.Provider>
      </PreviewContext.Provider>
    </div>
  );
}
