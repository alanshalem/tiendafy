'use client';

import { useContext, useEffect, useState } from 'react';
import { EDITOR_MSG, sanitizeCss } from '@tiendafy/types';
import { IconKitContext } from './Icon';
import { CartProvider, CartDrawer, useCart } from './cart';
import { FavoritesProvider } from './favorites';
import { AuthProvider } from './auth';
import { CashDiscountContext, type StoreProduct } from './sections';
import { HomeSections } from './HomeSections';
import { EditableRegion } from './EditableRegion';
import { Analytics } from './Analytics';
import { TrackingTags } from './TrackingTags';
import { WhatsAppFab } from './WhatsAppFab';
import { ADMIN_ORIGIN, PreviewContext, LiveThemeContext } from './preview';
import { mergeTheme, themeToStyle, type ThemeConfig } from '@/lib/theme';
import { fetchProductsByIdsClient } from '@/lib/catalog-client';
import { referencedProductIds } from '@/lib/catalog-map';
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

/** Adonde lleva "Saltar al contenido": lo que hay entre el encabezado y el pie. */
export const CONTENT_ID = 'contenido';

function Inner({ tenantName, theme, products, children }: Omit<StorefrontViewProps, 'live' | 'tenantId'>) {
  return (
    <div className="min-h-screen overflow-x-clip bg-bg text-fg" style={{ fontFamily: 'var(--font-body)' }}>
      {/* Lo primero que alcanza el Tab: con teclado o lector de pantalla, saltea
          la barra de anuncio y el menú entero (invisible hasta tener foco). */}
      <a
        href={`#${CONTENT_ID}`}
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-md focus:bg-primary focus:px-4 focus:py-2.5 focus:text-sm focus:font-semibold focus:text-primary-fg focus:shadow-lg"
      >
        Saltar al contenido
      </a>
      <PreviewCartSync />
      <Header theme={theme} tenantName={tenantName} />
      {/* tabIndex -1: el salto mueve el foco acá (no solo el scroll), así el
          próximo Tab sigue desde el contenido. Envuelve el <main> de cada página. */}
      <div id={CONTENT_ID} tabIndex={-1} className="outline-none">
        {children ?? (
          <HomeSections
            sections={theme.sections}
            products={products}
            storeName={tenantName}
            productList={theme.productList}
          />
        )}
      </div>
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
    const present = new Set(products.map((p) => p.id));
    const missing = referencedProductIds(theme.sections).filter((id) => !present.has(id));
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

  // En la tienda, el favicon sale del servidor (metadata del layout). Acá solo
  // se cambia en vivo en el preview, cuando el comercio sube otro en el editor.
  useEffect(() => {
    if (!live || !theme.favicon) return;
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
  }, [live, theme.favicon]);

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
          {/* En la vista previa del editor no: son datos de prueba, y ensuciarían
              la medición de la tienda con las visitas de quien la está armando. */}
          {!live && tenantId && <TrackingTags tenantId={tenantId} />}
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
