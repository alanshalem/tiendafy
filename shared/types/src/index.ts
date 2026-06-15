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
  ThemeConfig,
} from './theme';
export { DEFAULT_SECTIONS, baseTheme, normalizeTheme } from './theme';
