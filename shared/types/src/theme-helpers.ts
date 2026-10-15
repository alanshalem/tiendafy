/*
 * Lo del tema que la tienda usa en el navegador en cada página (el
 * encabezado, el CSS propio, el listado por defecto), aparte de theme.ts: ese
 * módulo arrastra el registro de secciones y las migraciones —lo que hace
 * falta para normalizar un tema— y el navegador no normaliza nada. Sin
 * dependencias (solo tipos), así importar esto no suma el resto.
 */
import type { ThemeSection } from './sections/envelope';
import type {
  FooterColumn,
  FooterConfig,
  HeaderPageColor,
  HeaderPageKind,
  ProductListConfig,
  ThemeHeader,
} from './theme';

/** El listado de productos de un tema sin configurar ("Diseño → Listado"). */
export const DEFAULT_PRODUCT_LIST: ProductListConfig = {
  columns: 4,
  mobileColumns: 2,
  showPrice: true,
  showBuyButton: true,
  showCompareAt: true,
  filterCategories: true,
  filterPrice: true,
  filterBrand: true,
  filterOptions: true,
  showCashPrice: false,
  installmentsCount: 0,
  showStockBadge: false,
  defaultSort: 'newest',
  pageSize: 24,
  imageRatio: 'square',
  cardStyle: 'plain',
};

/**
 * ¿El inicio arranca con una foto o un video a todo el ancho? Es lo único sobre
 * lo que un encabezado transparente se lee: sobre el fondo liso de la tienda
 * (o sobre una grilla de productos) el menú blanco desaparecía. Una sección
 * escondida en un dispositivo no cuenta: en ese dispositivo arrancaría con otra.
 */
export function heroUnderHeader(sections: ThemeSection[]): boolean {
  const first = sections.find((s) => s.visible && s.type !== 'promo-popup');
  if (!first || first.hideOn) return false;
  if (first.type === 'hero-video') return true;
  if (first.type !== 'carousel') return false;
  const slides = (first.data as { slides?: { image?: unknown }[] }).slides;
  return Array.isArray(slides) && slides.some((s) => typeof s?.image === 'string' && !!s.image);
}

/**
 * Saneo del CSS custom del merchant — espejo del SanitizeCss del backend.
 * El backend lo aplica al guardar/publicar; esto cubre el camino "live" del
 * preview (postMessage → <style> sin pasar por el backend). Quita lo que
 * permitiría romper el <style> e inyectar HTML/JS.
 */
export function sanitizeCss(css: string): string {
  if (!css) return css;
  let cleaned = css.replace(/</g, '');
  for (const bad of ['expression\\(', 'javascript:', 'behavior:', '-moz-binding', '@import']) {
    cleaned = cleaned.replace(new RegExp(bad, 'gi'), '');
  }
  return cleaned;
}

/**
 * El fondo y el texto del encabezado en un tipo de página: los propios de esa
 * página, o los generales. Con fondo propio y texto en automático, el texto es
 * el que se lee sobre ESE fondo (no el elegido para el general, que pudo
 * pensarse para otro color). `textColor` vacío = automático.
 */
export function headerColorsFor(
  header: Pick<ThemeHeader, 'bg' | 'textColor' | 'pageColors'>,
  kind: HeaderPageKind | null,
): HeaderPageColor {
  const own = kind ? header.pageColors?.[kind] : undefined;
  return own ? { bg: own.bg, textColor: own.textColor } : { bg: header.bg, textColor: header.textColor };
}

/** El título que se ve de una columna: el propio, o el de siempre de su tipo (vacío = sin título). */
export function footerColumnTitle(
  column: FooterColumn,
  footer: Pick<FooterConfig, 'newsletterTitle'>,
): string {
  const own = column.title?.trim();
  if (own) return own;
  switch (column.kind) {
    case 'links':
    case 'pages':
      return 'Información';
    case 'contact':
      return 'Contacto';
    case 'newsletter':
      return footer.newsletterTitle?.trim() || 'Recibí novedades';
    case 'social':
      // Con la marca, el logo hace de título; sin ella, las redes solas lo necesitan.
      return column.hideBrand ? 'Seguinos' : '';
    case 'text':
      return '';
  }
}
