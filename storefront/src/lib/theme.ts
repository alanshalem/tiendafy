import { apiGetTenant } from './api';
import {
  type ThemeConfig,
  baseTheme,
  DEFAULT_SECTIONS,
  normalizeTheme,
  contrastText,
  mixRgb,
  readableOn,
  FONT_FAMILY_CSS,
} from '@tiendafy/types';

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

// Catálogo compartido, con las fuentes que la tienda ya carga como variables.
const FONT_FAMILIES: Record<string, string> = {
  ...FONT_FAMILY_CSS,
  sans: 'var(--font-sans)',
  display: 'var(--font-fraunces, Georgia, serif)',
  mono: 'var(--font-mono)',
};

/** Texto legible (blanco u oscuro) según la luminancia del fondo "R G B" (fuente única en @tiendafy/types). */
const contrastFg = contrastText;

/** Mapa de columnas de grilla del listado (compartido por sections + CatalogBrowser). */
/** Proporción de la foto en la grilla del listado. */
export const ratioClass: Record<string, string> = {
  square: 'aspect-square',
  portrait: 'aspect-[3/4]',
  wide: 'aspect-[4/3]',
};

export const colClass: Record<number, string> = {
  2: 'grid-cols-2',
  3: 'grid-cols-2 sm:grid-cols-3',
  4: 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-4',
};

/** El color de la marca para texto: se lee a 4,5:1 sobre el fondo y sobre un tinte de hasta 15%. */
export function primaryInk(theme: ThemeConfig): string {
  const { primary, bg } = theme.colors;
  return readableOn(primary, [bg, mixRgb(bg, primary, 0.15)]);
}

/**
 * Texto secundario (descripciones, pies, títulos de filtro): el color del texto
 * aclarado hacia el fondo, pero nunca por debajo de 4,5:1 —ni sobre el fondo
 * ni sobre las superficies apenas sombreadas (`bg-black/5`)—. Antes era
 * `opacity-60` sobre el texto, y con los grises de algunas marcas no se leía.
 */
export function mutedText(theme: ThemeConfig): string {
  const { text, bg } = theme.colors;
  return readableOn(mixRgb(text, bg, 0.4), [bg, mixRgb(bg, '0 0 0', 0.05)]);
}

/** Config de tema → CSS custom properties para el wrapper del storefront. */
export function themeToStyle(theme: ThemeConfig): Record<string, string> {
  const c = theme.colors;
  return {
    '--color-primary': c.primary,
    '--color-primary-hover': c.primary,
    // Texto sobre el color primario: oscuro si el primario es claro (lima, cian…), blanco si no.
    '--color-primary-fg': contrastFg(c.primary),
    // El primary como texto: legible sobre el fondo y sobre su propio tinte (chips, badges).
    '--color-primary-ink': primaryInk(theme),
    '--color-accent': c.useAccent ? c.accent : c.primary,
    '--color-bg': c.bg,
    '--color-surface': c.bg,
    '--color-fg': c.text,
    '--color-fg-muted': mutedText(theme),
    '--store-header-bg': theme.header.bg,
    '--font-heading': FONT_FAMILIES[theme.fonts.heading] ?? FONT_FAMILIES.sans!,
    '--font-body': FONT_FAMILIES[theme.fonts.body] ?? FONT_FAMILIES.sans!,
  };
}
