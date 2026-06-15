/* ============================================================
   Fuente única de verdad del schema de tema del merchant.
   Lo consumen el storefront (render) y el admin (editor). Antes
   estaba duplicado en ambos: cada campo nuevo había que tocarlo
   en 2-3 lugares. Acá vive una sola vez.

   Colores en canal RGB crudo "R G B" (para alpha de Tailwind).
   ============================================================ */

export interface ThemeColors {
  primary: string;
  accent: string;
  useAccent: boolean;
  bg: string;
  text: string;
}

export interface ThemeFonts {
  heading: string; // 'sans' | 'serif' | 'display' | 'mono' | ...
  body: string;
}

export interface ThemeHeader {
  bg: string;
  sticky: boolean;
  logoSize: 'sm' | 'md' | 'lg';
  showTabsMobile: boolean;
  /** Disposición de logo + menú + íconos. */
  layout: 'classic' | 'logo-center' | 'menu-left' | 'menu-right';
  /** Color del texto del menú en "R G B". Vacío = automático (blanco). */
  textColor: string;
  /** Transparente sobre el hero del inicio; sólido al scrollear. */
  transparentOnHome: boolean;
  /** Nivel de transparencia del header en el inicio. */
  transparentLevel: 'full' | 'light' | 'medium';
  showSearch: boolean;
  showCart: boolean;
  cartStyle: 'icon' | 'text';
  showAccount: boolean;
  border: 'none' | 'line' | 'shadow';
}

export interface ThemeAnnouncement {
  show: boolean;
  message: string;
  link: string;
}

export interface ComingSoonConfig {
  enabled: boolean;
  title: string;
  message: string;
}

export type SectionType =
  | 'hero-video'
  | 'carousel'
  | 'featured'
  | 'promo-banners'
  | 'institutional'
  | 'category-banners'
  | 'new-products'
  | 'image-text'
  | 'sale-products'
  | 'instagram'
  | 'info-bar'
  | 'newsletter';

export interface ThemeSection {
  id: string;
  type: SectionType;
  visible: boolean;
  data: Record<string, unknown>;
}

export interface ProductListConfig {
  columns: number;
  showPrice: boolean;
  showBuyButton: boolean;
  showCompareAt: boolean;
}
export interface ProductDetailConfig {
  showSku: boolean;
  showStock: boolean;
  galleryStyle: 'thumbs' | 'thumbs-left' | 'stacked';
  showRelated: boolean;
  /** % de descuento pagando en efectivo/transferencia. 0 = desactivado. */
  cashDiscountPercent: number;
}
export interface CartConfig {
  freeShippingBar: boolean;
  freeShippingThreshold: number;
  checkoutButtonText: string;
  showSuggested: boolean;
}
export interface ContactConfig {
  showForm: boolean;
  address: string;
  phone: string;
  email: string;
  whatsapp: string;
}
export interface FooterConfig {
  text: string;
  showSocial: boolean;
  instagram: string;
  facebook: string;
  showPaymentLogos: boolean;
  /** Contactos (uno o varios). */
  whatsapps: string[];
  addresses: string[];
  phones: string[];
  emails: string[];
}

export interface ThemeConfig {
  logo: string;
  favicon: string;
  shareImage: string;
  colors: ThemeColors;
  fonts: ThemeFonts;
  header: ThemeHeader;
  announcement: ThemeAnnouncement;
  comingSoon: ComingSoonConfig;
  sections: ThemeSection[];
  productList: ProductListConfig;
  productDetail: ProductDetailConfig;
  cart: CartConfig;
  contact: ContactConfig;
  footer: FooterConfig;
  customCss: string;
}

/** Secciones iniciales de un home recién creado (las usa el storefront como fallback). */
export const DEFAULT_SECTIONS: ThemeSection[] = [
  { id: 'carousel', type: 'carousel', visible: true, data: { images: [], fullHeightMobile: false } },
  { id: 'featured', type: 'featured', visible: true, data: { title: 'Destacados', carousel: true } },
  { id: 'info-bar', type: 'info-bar', visible: true, data: {} },
];

/**
 * Defaults "neutros" del tema. `sections` queda vacío a propósito: cada
 * consumidor decide su fallback de secciones vía `normalizeTheme`
 * (storefront siembra DEFAULT_SECTIONS; el editor arranca sin secciones).
 */
export const baseTheme: ThemeConfig = {
  logo: '',
  favicon: '',
  shareImage: '',
  colors: { primary: '232 80 30', accent: '27 21 16', useAccent: false, bg: '255 255 255', text: '17 24 39' },
  fonts: { heading: 'sans', body: 'sans' },
  header: {
    bg: '27 21 16', sticky: true, logoSize: 'md', showTabsMobile: true,
    layout: 'classic', textColor: '', transparentOnHome: false, transparentLevel: 'full',
    showSearch: false, showCart: true, cartStyle: 'icon', showAccount: false, border: 'none',
  },
  announcement: { show: false, message: '', link: '' },
  comingSoon: { enabled: false, title: 'Estamos en construcción', message: 'Volvemos muy pronto con la tienda. ¡Gracias por tu paciencia!' },
  sections: [],
  productList: { columns: 4, showPrice: true, showBuyButton: true, showCompareAt: true },
  productDetail: { showSku: false, showStock: true, galleryStyle: 'thumbs', showRelated: true, cashDiscountPercent: 0 },
  cart: { freeShippingBar: false, freeShippingThreshold: 5000000, checkoutButtonText: 'Iniciar compra', showSuggested: true },
  contact: { showForm: true, address: '', phone: '', email: '', whatsapp: '' },
  footer: { text: '', showSocial: true, instagram: '', facebook: '', showPaymentLogos: true, whatsapps: [], addresses: [], phones: [], emails: [] },
  customCss: '',
};

/**
 * Mergea una config parcial sobre los defaults para que nunca falten campos.
 * `fallbackSections` define qué secciones usar cuando el tema no trae ninguna
 * (storefront pasa DEFAULT_SECTIONS; el editor pasa []).
 */
export function normalizeTheme(raw: Partial<ThemeConfig> | null, fallbackSections: ThemeSection[] = []): ThemeConfig {
  if (!raw) return { ...baseTheme, sections: fallbackSections };
  return {
    logo: typeof raw.logo === 'string' ? raw.logo : baseTheme.logo,
    favicon: typeof raw.favicon === 'string' ? raw.favicon : baseTheme.favicon,
    shareImage: typeof raw.shareImage === 'string' ? raw.shareImage : baseTheme.shareImage,
    colors: { ...baseTheme.colors, ...raw.colors },
    fonts: { ...baseTheme.fonts, ...raw.fonts },
    header: { ...baseTheme.header, ...raw.header },
    announcement: { ...baseTheme.announcement, ...raw.announcement },
    comingSoon: { ...baseTheme.comingSoon, ...raw.comingSoon },
    sections: Array.isArray(raw.sections) && raw.sections.length > 0 ? raw.sections : fallbackSections,
    productList: { ...baseTheme.productList, ...raw.productList },
    productDetail: { ...baseTheme.productDetail, ...raw.productDetail },
    cart: { ...baseTheme.cart, ...raw.cart },
    contact: { ...baseTheme.contact, ...raw.contact },
    footer: {
      ...baseTheme.footer,
      ...raw.footer,
      whatsapps: Array.isArray(raw.footer?.whatsapps) ? raw.footer!.whatsapps : baseTheme.footer.whatsapps,
      addresses: Array.isArray(raw.footer?.addresses) ? raw.footer!.addresses : baseTheme.footer.addresses,
      phones: Array.isArray(raw.footer?.phones) ? raw.footer!.phones : baseTheme.footer.phones,
      emails: Array.isArray(raw.footer?.emails) ? raw.footer!.emails : baseTheme.footer.emails,
    },
    customCss: typeof raw.customCss === 'string' ? raw.customCss : baseTheme.customCss,
  };
}
