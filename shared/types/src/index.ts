export type { TenantId, Money, ApiError, IsoDateTime } from './common';

// NOTA: los tipos de dominio de órdenes/checkout/pagos se removieron de acá:
// estaban hand-written, drifteados respecto del DTO real del backend y sin uso
// (admin y storefront definen sus interfaces inline según el DTO real). Si se
// quiere un contrato compartido, generarlo desde el OpenAPI del backend
// (openapi-typescript ya está como dependencia) en vez de mantenerlo a mano.

export type { Tenant } from './tenancy';

// Origen de los productos de una sección de la portada (editor ↔ tienda ↔ API).
export type {
  ProductSource,
  ProductSourceKind,
  ProductSourceSort,
  ProductSectionType,
  SectionProductPlan,
} from './product-source';
export {
  PRODUCT_SOURCE_LIMIT,
  BEST_SELLERS_DAYS,
  PRODUCT_SECTION_TYPES,
  clampProductLimit,
  normalizeProductSource,
  productSourceQuery,
  defaultProductSource,
  sectionProductPlan,
  productSourceListingHref,
} from './product-source';
// Videos de YouTube, Vimeo e Instagram: qué link se puede embeber y cómo.
export type { VideoEmbed, PlayableVideo } from './video-embed';
export { parseVideoEmbed, parsePlayableVideo, videoAutoplaySrc, videoThumbnail } from './video-embed';
// Título y descripción de la portada en Google (tienda y vista previa del editor).
export {
  SEO_TITLE_IDEAL,
  SEO_DESCRIPTION_IDEAL,
  SEO_DESCRIPTION_SHORT,
  homeSeoTitle,
  homeSeoDescription,
  truncateForSnippet,
} from './seo';

// Schema de tema del merchant (fuente única para storefront + admin).
export type {
  ThemeColors,
  ThemeFonts,
  ThemeHeader,
  ThemeMenuItem,
  ThemeAnnouncement,
  ComingSoonConfig,
  ProductListConfig,
  ProductDetailConfig,
  CartConfig,
  ContactConfig,
  FooterConfig,
  IconKit,
  BorderRadiusStyle,
  MotionStyle,
  DensityStyle,
  ThemeConfig,
} from './theme';
export {
  DEFAULT_SECTIONS,
  baseTheme,
  normalizeTheme,
  sanitizeCss,
  PAYMENT_LOGOS,
  heroUnderHeader,
} from './theme';
export * from './sections';
export { formatMoney, formatNumber, formatDate, formatDateTime } from './format';
export { EDITOR_MSG } from './editor-messages';
export { contrastText, contrastRatio, mixRgb, readableOn } from './color';
export { FONT_OPTIONS, FONT_FAMILY_CSS } from './fonts';
export type { FontOptionValue } from './fonts';
export type { MoneyDto } from './wire';
// Opciones globales del tema: menú armable, links del pie y estilo de botones.
export type { ThemeMenuItemKind, FooterLink, ButtonStyle } from './theme';
export { BUILTIN_MENU_IDS } from './theme';
// Columnas del pie: tipos, topes y cómo se arman las de un tema viejo.
export type { FooterColumn, FooterColumnKind } from './theme';
export {
  FOOTER_COLUMNS_MAX,
  FOOTER_COLUMN_LINKS_MAX,
  FOOTER_TITLE_MAX,
  FOOTER_TEXT_MAX,
  FOOTER_COLUMN_KINDS,
  FOOTER_SINGLE_KINDS,
  deriveFooterColumns,
  footerFlagsFromColumns,
  footerColumnTitle,
} from './theme';
// Links que escribe el comercio: validación y destinos de la tienda.
export {
  normalizeLink,
  safeHref,
  isExternalHref,
  describeLink,
  whatsappLink,
  productLink,
  pageLink,
  categoryLink,
  STORE_PAGES,
} from './links';
export type { LinkKind, NormalizedLink, LinkTarget } from './links';
