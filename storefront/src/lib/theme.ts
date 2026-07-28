import { apiGetTenant } from './api';
import { type ThemeConfig, baseTheme, DEFAULT_SECTIONS, normalizeTheme, contrastText, FONT_OPTIONS } from '@tiendafy/types';

/* ============================================================
   El schema de tema vive en @tiendafy/types (fuente única, compartida
   con el admin). Acá sólo quedan las piezas propias del storefront:
   defaults sembrados, fetch del backend y mapeo a CSS vars.
   ============================================================ */

// Re-export para que el resto del storefront siga importando desde '@/lib/theme'.
export type {
  ThemeColors,
  ThemeFonts,
  ThemeHeader,
  ThemeAnnouncement,
  ComingSoonConfig,
  SectionType,
  ThemeSection,
  ProductListConfig,
  ProductDetailConfig,
  CartConfig,
  ContactConfig,
  FooterConfig,
  IconKit,
  ThemeConfig,
} from '@tiendafy/types';

/** Defaults del storefront: incluye las secciones iniciales sembradas. */
export const defaultTheme: ThemeConfig = { ...baseTheme, sections: DEFAULT_SECTIONS };

/** Mergea una config parcial; en el storefront el fallback son las secciones iniciales. */
export function mergeTheme(raw: Partial<ThemeConfig> | null): ThemeConfig {
  return normalizeTheme(raw, DEFAULT_SECTIONS);
}

export async function fetchPublishedTheme(tenantId: string): Promise<ThemeConfig> {
  // no-store: tras publicar, el cambio se ve en el primer reload (sin caché ISR
  // que obligue a recargar dos veces). La home ya es force-dynamic.
  const cfg = await apiGetTenant<ThemeConfig>('/api/v1/theme', tenantId, {
    cache: 'no-store',
  });
  return mergeTheme(cfg);
}

/**
 * Tema del borrador para el preview del editor. `previewToken` es el token
 * firmado que el editor pasa en la URL del iframe (?pt=…) — el backend lo exige
 * porque el draft no es público. Sin token válido (o ante cualquier error) cae
 * al tema publicado, y en última instancia a los defaults: el preview nunca
 * debe quedar en blanco (el postMessage del editor pinta el draft igual).
 */
export async function fetchDraftTheme(tenantId: string, previewToken?: string): Promise<ThemeConfig> {
  const cfg = await apiGetTenant<ThemeConfig>('/api/v1/theme/draft', tenantId, {
    cache: 'no-store',
    headers: previewToken ? { 'X-Preview-Token': previewToken } : undefined,
  }).catch(() => null);
  if (cfg) return mergeTheme(cfg);
  return fetchPublishedTheme(tenantId).catch(() => mergeTheme(null));
}

const FONT_FAMILIES: Record<string, string> = {
  sans: 'var(--font-sans)',
  serif: 'Georgia, "Times New Roman", serif',
  display: 'var(--font-fraunces, Georgia, serif)',
  mono: 'var(--font-mono)',
  poppins: "'Poppins', sans-serif",
  montserrat: "'Montserrat', sans-serif",
  dmsans: "'DM Sans', sans-serif",
  manrope: "'Manrope', sans-serif",
  worksans: "'Work Sans', sans-serif",
  spacegrotesk: "'Space Grotesk', sans-serif",
  playfair: "'Playfair Display', serif",
  lora: "'Lora', serif",
  cormorant: "'Cormorant Garamond', serif",
  dmserif: "'DM Serif Display', serif",
  bebas: "'Bebas Neue', sans-serif",
  archivoblack: "'Archivo Black', sans-serif",
};

/** Texto legible (blanco u oscuro) según la luminancia del color de fondo "R G B".
 *  Fuente única en @tiendafy/types; se mantiene el nombre `contrastFg` para consumidores. */
export const contrastFg = contrastText;

/** Mapa de columnas de grilla del listado (compartido por sections + CatalogBrowser). */
export const colClass: Record<number, string> = {
  2: 'grid-cols-2',
  3: 'grid-cols-2 sm:grid-cols-3',
  4: 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-4',
};

/** Config de tema → CSS custom properties para el wrapper del storefront. */
export function themeToStyle(theme: ThemeConfig): Record<string, string> {
  const c = theme.colors;
  return {
    '--color-primary': c.primary,
    '--color-primary-hover': c.primary,
    // Texto sobre el color primario: oscuro si el primario es claro (lima, cian…), blanco si no.
    '--color-primary-fg': contrastFg(c.primary),
    '--color-accent': c.useAccent ? c.accent : c.primary,
    '--color-bg': c.bg,
    '--color-surface': c.bg,
    '--color-fg': c.text,
    '--color-fg-muted': c.text,
    '--store-header-bg': theme.header.bg,
    '--font-heading': FONT_FAMILIES[theme.fonts.heading] ?? FONT_FAMILIES.sans!,
    '--font-body': FONT_FAMILIES[theme.fonts.body] ?? FONT_FAMILIES.sans!,
  };
}

/** Catálogo de fuentes: fuente única en @tiendafy/types (se conserva el nombre `fontOptions`). */
export const fontOptions = FONT_OPTIONS;
