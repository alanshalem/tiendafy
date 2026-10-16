'use client';

import { useContext, useEffect, useState, type ReactNode } from 'react';
import dynamic from 'next/dynamic';
import { usePathname } from 'next/navigation';
import { EDITOR_MSG } from '@tiendafy/types';
import type { ThemeConfig } from '@/lib/theme';
import { isDarkTheme } from '@/lib/theme-style';
import { offersOf } from '@/lib/store-offers';
import { fetchCartSuggestionsClient } from '@/lib/catalog-client';
import { IconKitContext } from './Icon';
import { CartProvider, useCart } from './cart-context';
import { FavoritesProvider } from './favorites';
import { AuthProvider } from './auth';
import { CashDiscountContext, type StoreProduct } from './ProductCard';
import { EditableRegion } from './EditableRegion';
import { Analytics } from './Analytics';
import { PreviewContext, LiveThemeContext } from './preview';
import { isFromEditor } from '@/lib/editor-bridge';
import { StoreOffersContext } from './store-offers-context';
import { SectionProductsContext } from './SectionProductsContext';
import { DarkPageContext } from './section-context';
import { Header } from './StoreHeader';
import { Footer } from './StoreFooter';
import { ProductListContext } from './ProductListContext';
import { StoreErrorBoundary } from './StoreErrorBoundary';
import { CONTENT_ID, SkipLink } from './StoreRoot';

/*
 * Lo interactivo del marco de la tienda: la sesión, los favoritos y el
 * carrito (con su cajón), el encabezado (menús, buscador, contadores) y el
 * pie. El contenido de cada página llega como `children` y, en la tienda
 * publicada, ya viene dibujado del servidor (ver StorefrontView).
 */

// Lo que no hace falta para pintar ni para la primera interacción va aparte:
// se baja después de hidratar. El cajón del carrito está cerrado al abrir la
// página y las etiquetas de medición no dibujan nada hasta tener su config.
const CartDrawer = dynamic(() => import('./cart').then((m) => m.CartDrawer), { ssr: false });
const TrackingTags = dynamic(() => import('./TrackingTags').then((m) => m.TrackingTags), { ssr: false });

/** En preview, abre/cierra el carrito según los mensajes del editor (panel "Carrito"). */
function PreviewCartSync() {
  const preview = useContext(PreviewContext);
  const { setOpen } = useCart();
  useEffect(() => {
    if (!preview) return;
    const onMsg = (e: MessageEvent) => {
      if (!isFromEditor(e)) return; // solo mensajes del editor
      if (e.data?.type === EDITOR_MSG.previewCart) setOpen(e.data.open !== false);
    };
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, [preview, setOpen]);
  return null;
}

/** Cuántos sugiere el carrito. */
const CART_SUGGESTIONS = 3;

/**
 * "También te puede gustar" del carrito según lo que tiene adentro: de las
 * mismas categorías, después lo más vendido (lo arma la API). Antes eran
 * siempre los tres primeros productos de la tienda, aunque ya estuvieran en
 * el carrito. Se pide al abrirlo (no en cada página) y una vez por cada
 * contenido distinto; mientras llega, o si la API no responde, los de antes
 * sin lo que ya se lleva.
 */
function useCartSuggestions(enabled: boolean, fallback: StoreProduct[]): StoreProduct[] {
  const { lines, open, tenantId } = useCart();
  const key = lines
    .map((l) => l.variantId)
    .sort()
    .join(',');
  const [loaded, setLoaded] = useState<{ key: string; items: StoreProduct[] } | null>(null);

  useEffect(() => {
    if (!enabled || !open || !tenantId || loaded?.key === key) return;
    let current = true;
    void fetchCartSuggestionsClient(tenantId, key ? key.split(',') : [], CART_SUGGESTIONS).then((items) => {
      if (current && items) setLoaded({ key, items });
    });
    return () => {
      current = false;
    };
  }, [enabled, open, tenantId, key, loaded?.key]);

  if (!enabled) return [];
  const inCart = new Set(lines.map((l) => l.variantId));
  return (loaded?.items ?? fallback).filter((p) => !inCart.has(p.variantId)).slice(0, CART_SUGGESTIONS);
}

/** El límite de errores del contenido: vuelve a cero al cambiar de página (como la de Next). */
function ContentBoundary({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  return <StoreErrorBoundary key={pathname}>{children}</StoreErrorBoundary>;
}

function Frame({
  tenantName,
  theme,
  products,
  children,
}: {
  tenantName: string;
  theme: ThemeConfig;
  products: StoreProduct[];
  children: ReactNode;
}) {
  const suggested = useCartSuggestions(theme.cart.showSuggested, products);
  return (
    <div className="min-h-screen overflow-x-clip bg-bg text-fg" style={{ fontFamily: 'var(--font-body)' }}>
      <SkipLink />
      <PreviewCartSync />
      <Header theme={theme} tenantName={tenantName} />
      {/* tabIndex -1: el salto mueve el foco acá (no solo el scroll), así el
          próximo Tab sigue desde el contenido. Envuelve el <main> de cada página. */}
      <div id={CONTENT_ID} tabIndex={-1} className="outline-none">
        <ContentBoundary>{children}</ContentBoundary>
      </div>
      <EditableRegion target="footer" label="el pie de página">
        <Footer theme={theme} tenantName={tenantName} />
      </EditableRegion>
      <CartDrawer
        cart={theme.cart}
        suggested={suggested}
        sample={products[0]}
        whatsapp={theme.whatsappButton.phone || theme.contact.whatsapp}
      />
    </div>
  );
}

interface StoreChromeProps {
  tenantId: string;
  tenantName: string;
  theme: ThemeConfig;
  /** Los del catálogo: respaldo de los sugeridos del carrito y producto de muestra de la vista previa. */
  products: StoreProduct[];
  /** Los productos de cada sección de la portada, por id de sección. */
  sectionProducts?: Record<string, StoreProduct[]>;
  /** Vista previa del editor (LiveStorefront). */
  live?: boolean;
  /** Lo que se ve en lugar de la tienda (la vista previa de "en construcción"). */
  replace?: ReactNode;
  children: ReactNode;
}

const NO_SECTION_PRODUCTS: Record<string, StoreProduct[]> = {};

export function StoreChrome({
  tenantId,
  tenantName,
  theme,
  products,
  sectionProducts = NO_SECTION_PRODUCTS,
  live = false,
  replace,
  children,
}: StoreChromeProps) {
  return (
    <IconKitContext.Provider value={theme.iconKit}>
      <CashDiscountContext.Provider value={theme.productDetail.cashDiscountPercent || 0}>
        <StoreOffersContext.Provider value={offersOf(theme)}>
          {/* En la vista previa del editor no: son datos de prueba, y ensuciarían
              la medición de la tienda con las visitas de quien la está armando. */}
          {!live && tenantId && <Analytics tenantId={tenantId} />}
          {!live && tenantId && <TrackingTags tenantId={tenantId} />}
          <PreviewContext.Provider value={live}>
            <LiveThemeContext.Provider value={live ? theme : null}>
              <AuthProvider storeKey={tenantId}>
                <FavoritesProvider storeKey={tenantId}>
                  <CartProvider storeKey={tenantId}>
                    <SectionProductsContext.Provider value={sectionProducts}>
                      <DarkPageContext.Provider value={isDarkTheme(theme)}>
                        {replace ?? (
                          <ProductListContext.Provider value={theme.productList}>
                            <Frame tenantName={tenantName} theme={theme} products={products}>
                              {children}
                            </Frame>
                          </ProductListContext.Provider>
                        )}
                      </DarkPageContext.Provider>
                    </SectionProductsContext.Provider>
                  </CartProvider>
                </FavoritesProvider>
              </AuthProvider>
            </LiveThemeContext.Provider>
          </PreviewContext.Provider>
        </StoreOffersContext.Provider>
      </CashDiscountContext.Provider>
    </IconKitContext.Provider>
  );
}
