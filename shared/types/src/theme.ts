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

/**
 * Una preferencia del comercio sobre un ítem del menú del encabezado.
 *
 * Es una lista de PREFERENCIAS, no la fuente de verdad de qué existe: los
 * ítems reales los arma el storefront (los fijos + las páginas publicadas) y
 * después aplica esto. Así, una página nueva aparece sola al final —publicar y
 * que no se vea sería desconcertante— y una borrada deja un id que
 * simplemente no coincide con nada.
 *
 * `id` es 'home' | 'products' | 'categories' | 'contact' | 'page:<id>'.
 */
export interface ThemeMenuItem {
  id: string;
  visible: boolean;
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
  border: 'none' | 'line' | 'shadow';
  /**
   * Qué se muestra en el menú y en qué orden. Vacío = todo visible en el orden
   * natural. El orden importa de verdad: lo que no entra a lo ancho se va a un
   * desplegable "Más", así que el orden decide qué queda a la vista.
   */
  menu: ThemeMenuItem[];
}

/** Un anuncio de la barra superior: texto + link opcional. */
interface AnnouncementItem {
  text: string;
  link: string;
}
export interface ThemeAnnouncement {
  show: boolean;
  /** 'static' = texto(s) fijo(s) centrado(s); 'marquee' = se desplazan de derecha a izquierda. */
  animation: 'static' | 'marquee';
  /** Uno o varios anuncios (cada uno con su link). */
  items: AnnouncementItem[];
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
  | 'newsletter'
  | 'testimonials'
  | 'faq'
  | 'brands';

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
  // Filtros del sidebar del listado (se ocultan si no hay datos igual).
  filterCategories: boolean;
  filterPrice: boolean;
  filterBrand: boolean;
  filterOptions: boolean;
  // Cards: precio con transferencia/efectivo (usa cashDiscountPercent) + cuotas + stock.
  showCashPrice: boolean;
  installmentsCount: number; // 0 = no mostrar cuotas
  showStockBadge: boolean;
  /** Con qué orden abre el listado. El visitante lo puede cambiar igual. */
  defaultSort: 'newest' | 'price_asc' | 'price_desc' | 'name';
  /** Cuántos productos por página. Más productos = página más lenta en celular. */
  pageSize: number;
  /** Proporción de las fotos en la grilla. Vertical favorece indumentaria. */
  imageRatio: 'square' | 'portrait' | 'wide';
  /** Cada producto suelto sobre el fondo, o dentro de una tarjeta con marco. */
  cardStyle: 'plain' | 'boxed';
}
export interface ProductDetailConfig {
  /** Cuotas sin interés a mostrar bajo el precio. 0 = no mostrar. */
  installmentsCount: number;
  /** Logos de medios de pago al lado del botón de comprar (usa los del pie). */
  showPaymentLogos: boolean;
  /** Botón "Consultar por este producto" con el número del botón de WhatsApp. */
  askWhatsApp: boolean;
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
  /** Mensaje para el cliente en el carrito (vacío = no se muestra). */
  notice: string;
}
export interface ContactConfig {
  showForm: boolean;
  address: string;
  phone: string;
  email: string;
  whatsapp: string;
}
/** Botón flotante de WhatsApp (abajo a la derecha del storefront). */
interface WhatsAppButtonConfig {
  enabled: boolean;
  phone: string;
  message: string;
  /** Al pasar el mouse, muestra un mini-preview estilo chat de WhatsApp del mensaje. */
  showPreview: boolean;
}
export interface FooterConfig {
  text: string;
  showSocial: boolean;
  instagram: string;
  facebook: string;
  showPaymentLogos: boolean;
  /** Slugs de logos de medios de pago a mostrar (ver PAYMENT_LOGOS). Vacío = ninguno. */
  paymentLogos: string[];
  /** Contactos (uno o varios). */
  whatsapps: string[];
  addresses: string[];
  phones: string[];
  emails: string[];
}

/**
 * Catálogo de logos de medios de pago / bancos disponibles.
 * `slug` = nombre del archivo en /payment-logos/<slug>.svg (servido por
 * storefront y admin desde sus carpetas public). Fuente única para el
 * selector del admin y el render del footer.
 */
export interface PaymentLogo {
  slug: string;
  label: string;
}
export const PAYMENT_LOGOS: PaymentLogo[] = [
  { slug: 'mercadopago', label: 'Mercado Pago' },
  { slug: 'mercadocredito', label: 'Mercado Crédito' },
  { slug: 'visa', label: 'Visa' },
  { slug: 'mastercard', label: 'Mastercard' },
  { slug: 'american-express', label: 'American Express' },
  { slug: 'cabal', label: 'Cabal' },
  { slug: 'naranja', label: 'Naranja' },
  { slug: 'cordobesa', label: 'Cordobesa' },
  { slug: 'pago-facil', label: 'Pago Fácil' },
  { slug: 'santander', label: 'Santander' },
  { slug: 'galicia', label: 'Galicia' },
  { slug: 'bbva', label: 'BBVA' },
  { slug: 'banco-nacion', label: 'Banco Nación' },
  { slug: 'banco-hipotecario', label: 'Banco Hipotecario' },
  { slug: 'icbc', label: 'ICBC' },
  { slug: 'hsbc', label: 'HSBC' },
  { slug: 'citi', label: 'Citi' },
  { slug: 'cencosud', label: 'Cencosud' },
];
/** Slugs válidos (para filtrar selecciones viejas/erróneas). */
export const PAYMENT_LOGO_SLUGS: string[] = PAYMENT_LOGOS.map((l) => l.slug);

/** Estilo de bordes global (cards, botones, imágenes, inputs). */
export type BorderRadiusStyle = 'rounded' | 'soft' | 'sharp';
/** Intensidad de las animaciones de entrada del storefront. */
export type MotionStyle = 'none' | 'subtle' | 'dynamic';
/** Densidad de espaciado del storefront. */
export type DensityStyle = 'compact' | 'cozy' | 'spacious';
/** Kit de íconos: cada uno usa una librería distinta (cambian todos a la vez). */
export type IconKit = 'lucide' | 'phosphor' | 'tabler' | 'heroicons' | 'feather';

export interface ThemeConfig {
  logo: string;
  favicon: string;
  shareImage: string;
  /** Título SEO de la home (<title> y og:title). Vacío = "{tienda} — Tienda online". */
  seoTitle: string;
  /** Meta description de la home. Vacío = texto por defecto de la plataforma. */
  seoDescription: string;
  /** Redondeado (default) / Suave / Cuadrado. */
  borderRadius: BorderRadiusStyle;
  /** Animaciones de entrada: ninguna / sutil (default) / dinámica. */
  motion: MotionStyle;
  /** Espaciado: compacto / cómodo (default) / amplio. */
  density: DensityStyle;
  /** Kit de íconos del storefront (cambia el estilo de todos los íconos a la vez). */
  iconKit: IconKit;
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
  whatsappButton: WhatsAppButtonConfig;
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
  seoTitle: '',
  seoDescription: '',
  borderRadius: 'rounded',
  motion: 'subtle',
  density: 'cozy',
  iconKit: 'lucide',
  colors: { primary: '232 80 30', accent: '27 21 16', useAccent: false, bg: '255 255 255', text: '17 24 39' },
  fonts: { heading: 'sans', body: 'sans' },
  header: {
    bg: '27 21 16',
    sticky: true,
    logoSize: 'md',
    showTabsMobile: true,
    layout: 'classic',
    textColor: '',
    transparentOnHome: false,
    transparentLevel: 'full',
    showSearch: false,
    showCart: true,
    cartStyle: 'icon',
    border: 'none',
    menu: [],
  },
  announcement: { show: false, animation: 'static', items: [{ text: '', link: '' }] },
  comingSoon: {
    enabled: false,
    title: 'Estamos en construcción',
    message: 'Volvemos muy pronto con la tienda. ¡Gracias por tu paciencia!',
  },
  sections: [],
  productList: {
    columns: 4,
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
  },
  productDetail: {
    installmentsCount: 0,
    showPaymentLogos: false,
    askWhatsApp: false,
    showSku: false,
    showStock: true,
    galleryStyle: 'thumbs',
    showRelated: true,
    cashDiscountPercent: 0,
  },
  cart: {
    freeShippingBar: false,
    freeShippingThreshold: 5000000,
    checkoutButtonText: 'Iniciar compra',
    showSuggested: true,
    notice: '',
  },
  contact: { showForm: true, address: '', phone: '', email: '', whatsapp: '' },
  footer: {
    text: '',
    showSocial: true,
    instagram: '',
    facebook: '',
    showPaymentLogos: true,
    paymentLogos: ['mercadopago', 'visa', 'mastercard'],
    whatsapps: [],
    addresses: [],
    phones: [],
    emails: [],
  },
  whatsappButton: { enabled: false, phone: '', message: '¡Hola! Tengo una consulta.', showPreview: true },
  customCss: '',
};

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
 * Barra de anuncio: arma items[] desde el formato nuevo o migra el legacy
 * { message, link } a un único item. Nunca devuelve items vacío con animación,
 * pero sí puede quedar [] (el storefront no renderiza nada si no hay texto).
 */
function normalizeAnnouncement(raw?: Partial<ThemeAnnouncement>): ThemeAnnouncement {
  const base = baseTheme.announcement;
  if (!raw) return { ...base, items: base.items.map((i) => ({ ...i })) };

  let items: AnnouncementItem[] = [];
  if (Array.isArray(raw.items)) {
    items = raw.items
      .filter((it): it is AnnouncementItem => !!it && typeof it.text === 'string')
      .map((it) => ({ text: it.text, link: typeof it.link === 'string' ? it.link : '' }));
  }
  // Compat de lectura: temas persistidos con el shape v1 { message, link } (un
  // solo texto). El schema ya no expone esos campos, pero los datos viejos
  // siguen en la DB hasta que el merchant vuelva a guardar.
  const legacy = raw as { message?: unknown; link?: unknown };
  if (items.length === 0 && typeof legacy.message === 'string' && legacy.message.trim()) {
    items = [{ text: legacy.message, link: typeof legacy.link === 'string' ? legacy.link : '' }];
  }
  if (items.length === 0) items = [{ text: '', link: '' }];

  return {
    show: typeof raw.show === 'boolean' ? raw.show : base.show,
    animation: raw.animation === 'marquee' ? 'marquee' : 'static',
    items,
  };
}

/**
 * Mergea una config parcial sobre los defaults para que nunca falten campos.
 * `fallbackSections` define qué secciones usar cuando el tema no trae ninguna
 * (storefront pasa DEFAULT_SECTIONS; el editor pasa []).
 */
export function normalizeTheme(
  raw: Partial<ThemeConfig> | null,
  fallbackSections: ThemeSection[] = [],
): ThemeConfig {
  if (!raw) return { ...baseTheme, sections: fallbackSections };
  return {
    logo: typeof raw.logo === 'string' ? raw.logo : baseTheme.logo,
    favicon: typeof raw.favicon === 'string' ? raw.favicon : baseTheme.favicon,
    shareImage: typeof raw.shareImage === 'string' ? raw.shareImage : baseTheme.shareImage,
    seoTitle: typeof raw.seoTitle === 'string' ? raw.seoTitle : baseTheme.seoTitle,
    seoDescription: typeof raw.seoDescription === 'string' ? raw.seoDescription : baseTheme.seoDescription,
    borderRadius:
      raw.borderRadius === 'soft' || raw.borderRadius === 'sharp' ? raw.borderRadius : baseTheme.borderRadius,
    motion: raw.motion === 'none' || raw.motion === 'dynamic' ? raw.motion : baseTheme.motion,
    density: raw.density === 'compact' || raw.density === 'spacious' ? raw.density : baseTheme.density,
    iconKit: (['lucide', 'phosphor', 'tabler', 'heroicons', 'feather'] as const).includes(
      raw.iconKit as IconKit,
    )
      ? raw.iconKit!
      : baseTheme.iconKit,
    colors: { ...baseTheme.colors, ...raw.colors },
    fonts: { ...baseTheme.fonts, ...raw.fonts },
    header: {
      ...baseTheme.header,
      ...raw.header,
      // El menú puede venir de una config guardada antes de que existiera.
      menu: Array.isArray(raw.header?.menu)
        ? raw.header!.menu.filter(
            (m): m is ThemeMenuItem => typeof m?.id === 'string' && typeof m?.visible === 'boolean',
          )
        : [],
    },
    announcement: normalizeAnnouncement(raw.announcement),
    comingSoon: { ...baseTheme.comingSoon, ...raw.comingSoon },
    sections: Array.isArray(raw.sections) && raw.sections.length > 0 ? raw.sections : fallbackSections,
    productList: { ...baseTheme.productList, ...raw.productList },
    productDetail: { ...baseTheme.productDetail, ...raw.productDetail },
    cart: { ...baseTheme.cart, ...raw.cart },
    contact: { ...baseTheme.contact, ...raw.contact },
    footer: {
      ...baseTheme.footer,
      ...raw.footer,
      paymentLogos: Array.isArray(raw.footer?.paymentLogos)
        ? raw.footer!.paymentLogos.filter((s) => PAYMENT_LOGO_SLUGS.includes(s))
        : baseTheme.footer.paymentLogos,
      whatsapps: Array.isArray(raw.footer?.whatsapps) ? raw.footer!.whatsapps : baseTheme.footer.whatsapps,
      addresses: Array.isArray(raw.footer?.addresses) ? raw.footer!.addresses : baseTheme.footer.addresses,
      phones: Array.isArray(raw.footer?.phones) ? raw.footer!.phones : baseTheme.footer.phones,
      emails: Array.isArray(raw.footer?.emails) ? raw.footer!.emails : baseTheme.footer.emails,
    },
    whatsappButton: { ...baseTheme.whatsappButton, ...raw.whatsappButton },
    customCss: typeof raw.customCss === 'string' ? raw.customCss : baseTheme.customCss,
  };
}
