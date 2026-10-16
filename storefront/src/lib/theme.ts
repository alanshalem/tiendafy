import { cache } from 'react';
import { apiGetTenant } from './api';
import { cacheFor } from './cache';
import { type ThemeConfig, baseTheme, DEFAULT_SECTIONS, normalizeTheme } from '@tiendafy/types';

/* ============================================================
   El schema de tema vive en @tiendafy/types (fuente única, compartida
   con el admin). Acá sólo quedan las piezas propias del storefront:
   defaults sembrados, fetch del backend y mapeo a CSS vars.
   ============================================================ */

// Re-export para que el resto del storefront siga importando desde '@/lib/theme'.
export type {
  SectionType,
  ThemeSection,
  ProductListConfig,
  ContactConfig,
  IconKit,
  ThemeConfig,
  // Secciones del inicio (registro compartido).
  SectionStyle,
  SectionSpacing,
  SectionDataMap,
  InfoItemData,
  InstagramData,
  ProductsData,
  TestimonialItem,
} from '@tiendafy/types';
import { applyStoreOffers, type StoreOffers } from './store-offers';

/** Defaults del storefront: incluye las secciones iniciales sembradas. */
export const defaultTheme: ThemeConfig = { ...baseTheme, sections: DEFAULT_SECTIONS };

/** Mergea una config parcial; en el storefront el fallback son las secciones iniciales. */
export function mergeTheme(raw: Partial<ThemeConfig> | null): ThemeConfig {
  return normalizeTheme(raw, DEFAULT_SECTIONS);
}

/**
 * `cache` (de React): dentro de un mismo pedido, quien lo pida recibe el MISMO
 * objeto. La página y la pantalla de 404 —que Next arma en cada página, por
 * si hace falta— pasan así el diseño una sola vez en la respuesta (React no
 * repite un objeto que ya mandó) en vez de dos.
 */
export const fetchPublishedTheme = cache(async function fetchPublishedTheme(
  tenantId: string,
): Promise<ThemeConfig> {
  // Data Cache corta, por tienda (apiGetTenant pone el tenant en la URL). Antes
  // era no-store y cada vista de página pedía el diseño entero. Al publicar, el
  // backend avisa y la etiqueta se vence al toque; REVALIDATE.theme queda de
  // respaldo. El borrador del editor no pasa por acá (fetchDraftTheme).
  const [cfg, offers] = await Promise.all([
    apiGetTenant<ThemeConfig>('/api/v1/theme', tenantId, cacheFor('theme', tenantId)),
    fetchStoreOffers(tenantId),
  ]);
  return applyStoreOffers(mergeTheme(cfg), offers);
});

/**
 * Descuento por transferencia, cuotas y envío gratis de la tienda (ver
 * lib/store-offers). Viajan con el tema porque son lo que el tema muestra; un
 * error acá no tumba la página: el tema sigue con sus propios números. Misma
 * etiqueta que el diseño: guardar las opciones de pago o un medio de envío
 * la vence desde el backend.
 */
async function fetchStoreOffers(tenantId: string): Promise<StoreOffers | null> {
  return apiGetTenant<StoreOffers>('/api/v1/store-offers', tenantId, cacheFor('theme', tenantId)).catch(
    () => null,
  );
}

/**
 * Tema del borrador para el preview del editor. `previewToken` es el token
 * firmado que el editor pasa en la URL del iframe (?pt=…) — el backend lo exige
 * porque el draft no es público. Sin token, con uno vencido o ante cualquier
 * error devuelve null: quien llama trata la visita como la de cualquiera.
 * Antes caía en silencio al tema publicado y la página seguía en modo vista
 * previa, así que `?preview=1` a secas salteaba "Tienda en construcción".
 */
export async function fetchDraftTheme(tenantId: string, previewToken?: string): Promise<ThemeConfig | null> {
  if (!previewToken) return null;
  const cfg = await apiGetTenant<ThemeConfig>('/api/v1/theme/draft', tenantId, {
    cache: 'no-store',
    headers: { 'X-Preview-Token': previewToken },
  }).catch(() => null);
  return cfg ? applyStoreOffers(mergeTheme(cfg), await fetchStoreOffers(tenantId)) : null;
}

/**
 * El tema de una página y si se ve como vista previa del editor. La vista
 * previa (sin "en construcción", con los recuadros "Editar…" y el carrito de
 * muestra) solo se habilita si el borrador llegó con un token válido; si no,
 * la página es la del visitante, con el tema publicado.
 */
export async function resolvePageTheme(
  tenantId: string,
  sp: { preview?: string; pt?: string },
): Promise<{ theme: ThemeConfig; preview: boolean }> {
  const draft = sp.preview === '1' ? await fetchDraftTheme(tenantId, sp.pt) : null;
  if (draft) return { theme: draft, preview: true };
  return { theme: await fetchPublishedTheme(tenantId), preview: false };
}

// Lo que se usa también en el navegador (colores, columnas, variables CSS)
// vive en theme-style: re-exportado para quien lo importaba de acá.
export { buttonVars, colClass, mutedText, primaryInk, productGridClass, themeToStyle } from './theme-style';
