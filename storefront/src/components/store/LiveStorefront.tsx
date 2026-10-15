'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { EDITOR_MSG } from '@tiendafy/types';
import { mergeTheme, type ThemeConfig } from '@/lib/theme';
import { applyStoreOffers, offersOf } from '@/lib/store-offers';
import { fetchSectionProductsClient } from '@/lib/catalog-client';
import {
  productsBySection,
  resolvePlans,
  sectionPlans,
  type SectionProductsMap,
} from '@/lib/section-products';
import type { StoreProduct } from './ProductCard';
import { HomeSections } from './HomeSections';
import { ComingSoon } from './ComingSoon';
import { ADMIN_ORIGIN } from './preview';
import { StoreChrome } from './StoreChrome';
import { StoreRoot } from './StoreRoot';
import { StoreWhatsApp } from './StoreWhatsApp';

/*
 * La tienda dentro del editor de diseño: el tema llega por postMessage y se
 * redibuja todo en el navegador sin recargar el iframe (secciones, encabezado,
 * pie, carrito). Es la única forma en que la tienda entera corre del lado del
 * cliente; la publicada la arma el servidor (ver StorefrontView). Se carga
 * solo en la vista previa.
 */

export interface LiveStorefrontProps {
  tenantId: string;
  tenantName: string;
  theme: ThemeConfig;
  products: StoreProduct[];
  /** Productos de las secciones de la portada, ya resueltos en el servidor (ver loadHomeSectionProducts). */
  sectionProducts?: SectionProductsMap;
  children?: React.ReactNode;
}

export function LiveStorefront({
  tenantId,
  tenantName,
  theme: initialTheme,
  products,
  sectionProducts: initialSectionProducts,
  children,
}: LiveStorefrontProps) {
  const [theme, setTheme] = useState<ThemeConfig>(initialTheme);
  // Vista previa del editor con el panel "Tienda en construcción" abierto: se
  // ve la página que verían los visitantes, no la tienda.
  const [comingSoon, setComingSoon] = useState(false);
  // Lo resuelto de cada sección de productos, por plan (origen + límite).
  const [resolved, setResolved] = useState<SectionProductsMap>(initialSectionProducts ?? {});
  // Planes ya pedidos (o que vinieron del servidor): cada uno se pide una vez.
  const requested = useRef(new Set(Object.keys(initialSectionProducts ?? {})));

  useEffect(() => {
    const handler = (e: MessageEvent) => {
      // Solo mensajes del panel admin: un tercero que embeba el preview no
      // debe poder inyectar un theme (llegaría con customCss sin sanear).
      if (e.origin !== ADMIN_ORIGIN) return;
      // mergeTheme: el editor puede postear un draft viejo sin campos nuevos.
      // Las ofertas de la tienda (descuento, cuotas, envío gratis) no son del
      // diseño: se vuelven a aplicar sobre lo que manda el editor.
      if (e.data?.type === EDITOR_MSG.theme && e.data.theme)
        setTheme(applyStoreOffers(mergeTheme(e.data.theme), offersOf(initialTheme)));
      if (e.data?.type === EDITOR_MSG.previewComingSoon) {
        setComingSoon(e.data.show === true);
        window.scrollTo({ top: 0 });
      }
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
  }, [initialTheme]);

  // El tema llega por postMessage y una sección puede cambiar de origen
  // (otros elegidos, otra categoría…). Se pide solo lo que no se pidió nunca,
  // un pedido por origen. Antes se pedía por id lo que faltara en cada cambio
  // del tema: un producto borrado nunca aparecía, así que se volvía a pedir
  // con cada tecla que se tocaba en el editor.
  const plans = useMemo(() => sectionPlans(theme.sections.filter((s) => s.visible)), [theme.sections]);
  useEffect(() => {
    const pending = [...plans].filter(([key]) => !requested.current.has(key));
    if (pending.length === 0) return;
    for (const [key] of pending) requested.current.add(key);
    void resolvePlans(new Map(pending), (source, limit) =>
      fetchSectionProductsClient(tenantId, source, limit),
    ).then((found) => {
      if (Object.keys(found).length > 0) setResolved((prev) => ({ ...prev, ...found }));
    });
  }, [plans, tenantId]);

  // Lo resuelto, por id de sección: cada renderer de productos lo lee con
  // useSectionProducts.
  const bySection = useMemo(() => productsBySection(theme.sections, resolved), [theme.sections, resolved]);

  // En la tienda, el favicon sale del servidor (metadata del layout). Acá solo
  // se cambia en vivo, cuando el comercio sube otro en el editor.
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
    <StoreRoot theme={theme}>
      <StoreChrome
        live
        tenantId={tenantId}
        tenantName={tenantName}
        theme={theme}
        products={products}
        sectionProducts={bySection}
        replace={
          comingSoon ? (
            <>
              <ComingSoon theme={theme} tenantName={tenantName} tenantId={tenantId} />
              {/* Que no se confunda con "ya está activa". */}
              <div className="fixed left-1/2 top-3 z-[80] -translate-x-1/2 rounded-full bg-black/75 px-3.5 py-1.5 text-xs font-semibold text-white shadow-lg">
                {theme.comingSoon.enabled
                  ? 'Activada: al publicar, tus visitantes ven esta página'
                  : 'Apagada: tus visitantes siguen viendo la tienda'}
              </div>
            </>
          ) : undefined
        }
      >
        {children ?? (
          <HomeSections
            sections={theme.sections}
            products={products}
            storeName={tenantName}
            productList={theme.productList}
          />
        )}
      </StoreChrome>
      {/* En la vista previa aparece aunque falte el número: así se ve dónde
          va y cómo queda mientras se completa el panel. */}
      {!comingSoon && <StoreWhatsApp theme={theme} tenantName={tenantName} live />}
    </StoreRoot>
  );
}
