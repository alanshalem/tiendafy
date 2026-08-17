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
import { CashDiscountContext, type StoreProduct } from './sections';
import { HomeSections } from './HomeSections';
import { EditableRegion } from './EditableRegion';
import { Analytics } from './Analytics';
import { CategoryMenu, CategoryMenuMobile } from './CategoryMenu';
import { PagesNav } from './PagesNav';
import { WhatsAppFab } from './WhatsAppFab';
import { ADMIN_ORIGIN, PreviewContext, LiveThemeContext, usePreviewHref } from './preview';
import { sanitizeCss } from '@tiendafy/types';
import { mergeTheme, themeToStyle, type ThemeConfig } from '@/lib/theme';
import { fetchProductsByIdsClient } from '@/lib/catalog-client';
import { Header } from './StoreHeader';
import { Footer } from './StoreFooter';

interface StorefrontViewProps {
  tenantId: string;
  tenantName: string;
  theme: ThemeConfig;
  products: StoreProduct[];
  live?: boolean;
  children?: React.ReactNode;
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
        <HomeSections
          sections={theme.sections}
          products={products}
          storeName={tenantName}
          productList={theme.productList}
        />
      )}
      <EditableRegion target="footer" label="el pie de página">
        <Footer theme={theme} tenantName={tenantName} />
      </EditableRegion>
      <CartDrawer cart={theme.cart} suggested={theme.cart.showSuggested ? products.slice(0, 3) : []} />
    </div>
  );
}

export function StorefrontView({
  tenantId,
  tenantName,
  theme: initialTheme,
  products: initialProducts,
  live,
  children,
}: StorefrontViewProps) {
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
    fetchProductsByIdsClient(missing, tenantId).then((extra) => {
      if (cancelled) return;
      if (extra.length) setProducts((prev) => [...prev, ...extra]);
    });
    return () => {
      cancelled = true;
    };
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
    return () => {
      if (link) link.href = previous;
    };
  }, [theme.favicon]);

  return (
    <div
      data-store-radius={theme.borderRadius}
      data-store-motion={theme.motion}
      data-store-density={theme.density}
      style={themeToStyle(theme) as React.CSSProperties}
    >
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
