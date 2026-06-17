import { apiGet } from './api';
import { type ThemeConfig, baseTheme, DEFAULT_SECTIONS, normalizeTheme } from '@tiendafy/types';

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
  const cfg = await apiGet<ThemeConfig>('/api/v1/theme', {
    headers: { 'X-Tenant-Id': tenantId },
    cache: 'no-store',
  });
  return mergeTheme(cfg);
}

export async function fetchDraftTheme(tenantId: string): Promise<ThemeConfig> {
  const cfg = await apiGet<ThemeConfig>('/api/v1/theme/draft', {
    headers: { 'X-Tenant-Id': tenantId },
    cache: 'no-store',
  });
  return mergeTheme(cfg);
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

/** Texto legible (blanco u oscuro) según la luminancia del color de fondo "R G B". */
function contrastFg(rgbRaw: string): string {
  const [r, g, b] = rgbRaw.trim().split(/\s+/).map(Number);
  const lum = (0.2126 * (r ?? 0) + 0.7152 * (g ?? 0) + 0.0722 * (b ?? 0)) / 255;
  return lum > 0.6 ? '17 24 39' : '255 255 255';
}

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

export const fontOptions = [
  { value: 'sans', label: 'Sans (moderna)' },
  { value: 'serif', label: 'Serif (clásica)' },
  { value: 'display', label: 'Display (con carácter)' },
  { value: 'mono', label: 'Mono (técnica)' },
  { value: 'poppins', label: 'Poppins' },
  { value: 'montserrat', label: 'Montserrat' },
  { value: 'dmsans', label: 'DM Sans' },
  { value: 'manrope', label: 'Manrope' },
  { value: 'worksans', label: 'Work Sans' },
  { value: 'spacegrotesk', label: 'Space Grotesk' },
  { value: 'playfair', label: 'Playfair Display' },
  { value: 'lora', label: 'Lora' },
  { value: 'cormorant', label: 'Cormorant' },
  { value: 'dmserif', label: 'DM Serif Display' },
  { value: 'bebas', label: 'Bebas Neue' },
  { value: 'archivoblack', label: 'Archivo Black' },
];
