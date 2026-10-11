export type { TenantId, Money, ApiError, IsoDateTime } from './common';

// NOTA: los tipos de dominio de órdenes/checkout/pagos se removieron de acá:
// estaban hand-written, drifteados respecto del DTO real del backend y sin uso
// (admin y storefront definen sus interfaces inline según el DTO real). Si se
// quiere un contrato compartido, generarlo desde el OpenAPI del backend
// (openapi-typescript ya está como dependencia) en vez de mantenerlo a mano.

export type { Tenant } from './tenancy';

// Schema de tema del merchant (fuente única para storefront + admin).
export type {
  ThemeColors,
  ThemeFonts,
  ThemeHeader,
  ThemeMenuItem,
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
  BorderRadiusStyle,
  MotionStyle,
  DensityStyle,
  ThemeConfig,
} from './theme';
export { DEFAULT_SECTIONS, baseTheme, normalizeTheme, sanitizeCss, PAYMENT_LOGOS } from './theme';
export { formatMoney, formatDate, formatDateTime } from './format';
export { EDITOR_MSG } from './editor-messages';
export { contrastText, contrastRatio } from './color';
export { FONT_OPTIONS, FONT_FAMILY_CSS } from './fonts';
export type { FontOptionValue } from './fonts';
export type { MoneyDto } from './wire';
