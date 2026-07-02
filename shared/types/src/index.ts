export type {
  TenantId,
  Money,
  ApiError,
  CursorPage,
  IsoDateTime,
} from './common';

export type {
  Product,
  ProductStatus,
  ProductOption,
  Variant,
  ProductImage,
  Category,
} from './catalog';

export type {
  Order,
  OrderStatus,
  OrderItem,
  OrderCustomer,
  Address,
  OrderEvent,
} from './orders';

export type {
  CheckoutSession,
  CheckoutStatus,
  CheckoutItem,
  Payment,
  PaymentStatus,
  PaymentIntent,
} from './checkout';

export type {
  Tenant,
  TenantStatus,
  PlanTier,
} from './tenancy';

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
export { DEFAULT_SECTIONS, baseTheme, normalizeTheme, PAYMENT_LOGOS, PAYMENT_LOGO_SLUGS } from './theme';
export { formatMoney, formatDate, formatDateTime } from './format';
export { EDITOR_MSG, type EditorMsgType } from './editor-messages';
export { contrastText } from './color';
export { FONT_OPTIONS, type FontOptionValue } from './fonts';
export type { MoneyDto } from './wire';
