export type { TenantId, Money, ApiError, CursorPage, IsoDateTime } from './common';

// NOTA: los tipos de dominio de órdenes/checkout/pagos se removieron de acá:
// estaban hand-written, drifteados respecto del DTO real del backend y sin uso
// (admin y storefront definen sus interfaces inline según el DTO real). Si se
// quiere un contrato compartido, generarlo desde el OpenAPI del backend
// (openapi-typescript ya está como dependencia) en vez de mantenerlo a mano.

export type { Tenant, TenantStatus, PlanTier } from './tenancy';

// Schema de tema del merchant (fuente única para storefront + admin).
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
  PaymentLogo,
  BorderRadiusStyle,
  MotionStyle,
  DensityStyle,
  IconKit,
  ThemeConfig,
} from './theme';
export {
  DEFAULT_SECTIONS,
  baseTheme,
  normalizeTheme,
  sanitizeCss,
  PAYMENT_LOGOS,
  PAYMENT_LOGO_SLUGS,
} from './theme';
export { formatMoney, formatDate, formatDateTime } from './format';
export { EDITOR_MSG, type EditorMsgType } from './editor-messages';
export { contrastText } from './color';
export { FONT_OPTIONS, type FontOptionValue } from './fonts';
export type { MoneyDto } from './wire';
