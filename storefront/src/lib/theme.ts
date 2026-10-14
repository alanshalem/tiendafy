import { apiGetTenant } from './api';
import { REVALIDATE } from './cache';
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
  ButtonStyle,
  // Secciones del inicio (registro compartido).
  SectionStyle,
  SectionSpacing,
  SectionHideOn,
  SectionDataMap,
  BannerItem,
  BannersData,
  BrandsData,
  CarouselData,
  FaqData,
  FaqItem,
  HeroVideoData,
  ImageTextData,
  InfoBarData,
  InfoItemData,
  InstagramData,
  InstitutionalData,
  NewsletterData,
  ProductsData,
  TestimonialItem,
  TestimonialsData,
} from '@tiendafy/types';
import type { ButtonStyle, ProductListConfig } from '@tiendafy/types';

/** Defaults del storefront: incluye las secciones iniciales sembradas. */
export const defaultTheme: ThemeConfig = { ...baseTheme, sections: DEFAULT_SECTIONS };

/** Mergea una config parcial; en el storefront el fallback son las secciones iniciales. */
export function mergeTheme(raw: Partial<ThemeConfig> | null): ThemeConfig {
  return normalizeTheme(raw, DEFAULT_SECTIONS);
}

export async function fetchPublishedTheme(tenantId: string): Promise<ThemeConfig> {
  // Data Cache corta, por tienda (apiGetTenant pone el tenant en la URL). Antes
  // era no-store y cada vista de página pedía el diseño entero. Lo publicado
  // tarda hasta REVALIDATE.theme en verse; el borrador del editor no pasa por
  // acá (fetchDraftTheme, siempre fresco).
  const cfg = await apiGetTenant<ThemeConfig>('/api/v1/theme', tenantId, {
    next: { revalidate: REVALIDATE.theme },
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
// Las del catálogo las sirve la propia tienda (app/store-fonts.ts): cada una
// vive en su variable CSS; si faltara, cae a la familia por nombre.
const SELF_HOSTED: Record<string, string> = {
  poppins: "var(--font-poppins, 'Poppins'), sans-serif",
  inter: "var(--font-inter, 'Inter'), sans-serif",
  montserrat: "var(--font-montserrat, 'Montserrat'), sans-serif",
  barlow: "var(--font-barlow, 'Barlow'), sans-serif",
  barlowcondensed:
    "var(--font-barlow-condensed, 'Barlow Condensed'), var(--font-barlow, 'Barlow'), sans-serif",
  dmsans: "var(--font-dm-sans, 'DM Sans'), sans-serif",
  manrope: "var(--font-manrope, 'Manrope'), sans-serif",
  worksans: "var(--font-work-sans, 'Work Sans'), sans-serif",
  spacegrotesk: "var(--font-space-grotesk, 'Space Grotesk'), sans-serif",
  playfair: "var(--font-playfair, 'Playfair Display'), serif",
  lora: "var(--font-lora, 'Lora'), serif",
  cormorant: "var(--font-cormorant, 'Cormorant Garamond'), serif",
  dmserif: "var(--font-dm-serif, 'DM Serif Display'), serif",
  bebas: "var(--font-bebas, 'Bebas Neue'), sans-serif",
  archivoblack: "var(--font-archivo-black, 'Archivo Black'), sans-serif",
};

const FONT_FAMILIES: Record<string, string> = {
  ...FONT_FAMILY_CSS,
  ...SELF_HOSTED,
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

/** Lo mismo con una sola columna en el celular (una foto grande por fila). */
const colClassOneMobile: Record<number, string> = {
  2: 'grid-cols-1 sm:grid-cols-2',
  3: 'grid-cols-1 sm:grid-cols-3',
  4: 'grid-cols-1 sm:grid-cols-3 lg:grid-cols-4',
};

/**
 * Las columnas de la grilla de productos según el diseño: las de escritorio y
 * cuántas en el celular. Las clases van escritas enteras (Tailwind solo genera
 * las que encuentra literales en el código).
 */
export function productGridClass(list: Pick<ProductListConfig, 'columns' | 'mobileColumns'>): string {
  const map = list.mobileColumns === 1 ? colClassOneMobile : colClass;
  return map[list.columns] ?? map[4]!;
}

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

/** Radio de cada forma de botón. 'auto' no define nada: sigue a los bordes globales. */
const BUTTON_RADIUS: Record<ButtonStyle['shape'], string | null> = {
  auto: null,
  square: '0px',
  rounded: '0.5rem',
  pill: '9999px',
};

/**
 * Estilo global de botones → variables CSS que lee globals.css (regla de los
 * botones primarios: `bg-primary text-primary-fg`). Así cada botón de la
 * tienda lo hereda sin tocar su componente. Lo que está en su valor de
 * siempre no se define: globals.css cae a lo que ya tenía el botón.
 */
export function buttonVars(buttons: ButtonStyle): Record<string, string> {
  const vars: Record<string, string> = {};
  const radius = BUTTON_RADIUS[buttons.shape];
  if (radius) vars['--btn-radius'] = radius;
  if (buttons.variant === 'outline') {
    vars['--btn-bg'] = 'transparent';
    vars['--btn-bg-hover'] = 'rgb(var(--color-primary) / 0.08)';
    vars['--btn-fg'] = 'rgb(var(--color-primary-ink))';
    vars['--btn-border-width'] = '1.5px';
  }
  if (buttons.textCase === 'uppercase') {
    vars['--btn-case'] = 'uppercase';
    vars['--btn-tracking'] = '0.06em';
  }
  return vars;
}

/** Config de tema → CSS custom properties para el wrapper del storefront. */
export function themeToStyle(theme: ThemeConfig): Record<string, string> {
  const c = theme.colors;
  return {
    ...buttonVars(theme.buttons ?? baseTheme.buttons),
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
