/* ============================================================
   Fuente única de verdad del schema de tema del merchant.
   Lo consumen el storefront (render) y el admin (editor). Antes
   estaba duplicado en ambos: cada campo nuevo había que tocarlo
   en 2-3 lugares. Acá vive una sola vez.

   Colores en canal RGB crudo "R G B" (para alpha de Tailwind).
   ============================================================ */

import type { ThemeSection } from './sections/envelope';
import { normalizeSections } from './sections/registry';
import { migrateTheme, THEME_SCHEMA_VERSION } from './sections/migrations';

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

/** Qué es un ítem del menú del encabezado. */
export type ThemeMenuItemKind = 'builtin' | 'page' | 'category' | 'product' | 'link';

/**
 * Un ítem del menú del encabezado.
 *
 * Para los fijos y las páginas sigue siendo una PREFERENCIA, no la fuente de
 * verdad de qué existe: el storefront arma los fijos + las páginas publicadas
 * y después aplica esto. Así una página nueva aparece sola al final —publicar
 * y que no se vea sería desconcertante— y una borrada deja un id que no
 * coincide con nada.
 *
 * Las categorías, productos y links propios sí existen solo acá: los agrega el
 * comercio y guardan su destino (`href`) y su nombre, para que el servidor los
 * dibuje sin esperar a nadie (y Google los vea).
 *
 * `id`: 'home' | 'products' | 'categories' | 'contact' | 'page:<id>' |
 * 'cat:<id>' | 'prod:<id>' | 'link:<aleatorio>'.
 */
export interface ThemeMenuItem {
  id: string;
  visible: boolean;
  /** Sin `kind` (temas guardados antes): se deduce del id al normalizar. */
  kind?: ThemeMenuItemKind;
  /** Nombre a mostrar. Vacío = el de siempre (fijos) o el del destino. */
  label?: string;
  /** Destino (normalizado con normalizeLink). Los fijos no lo usan. */
  href?: string;
  /** Abrir en otra pestaña (links externos). */
  newTab?: boolean;
  /** Categoría: mostrar sus subcategorías en un desplegable (mega-menú en desktop). */
  showChildren?: boolean;
  /** Id del ítem de primer nivel del que cuelga (un solo nivel). Vacío = primer nivel. */
  parent?: string;
}

export interface ThemeHeader {
  bg: string;
  sticky: boolean;
  logoSize: 'sm' | 'md' | 'lg';
  showTabsMobile: boolean;
  /** Disposición de logo + menú + íconos. */
  layout: 'classic' | 'logo-center' | 'menu-left' | 'menu-right';
  /** Color del texto del menú en "R G B". Vacío = automático (el que se lee sobre el fondo). */
  textColor: string;
  /**
   * Transparente sobre la foto de portada del inicio; sólido al scrollear.
   * Solo se nota si el inicio arranca con una foto o un video (ver
   * `heroUnderHeader`): sobre un fondo liso no habría con qué contrastar.
   */
  transparentOnHome: boolean;
  /** Nivel de transparencia del header en el inicio. */
  transparentLevel: 'full' | 'light' | 'medium';
  /**
   * Logo para cuando el encabezado está transparente sobre la foto (suele ser
   * la versión en blanco). Vacío = el logo de siempre.
   */
  transparentLogo: string;
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
  /**
   * Colores propios por tipo de página. Una página que no figura usa los de
   * arriba (`bg` y `textColor`). Sirve para, por ejemplo, un encabezado oscuro
   * solo en el inicio y claro en el resto de la tienda.
   */
  pageColors: HeaderPageColors;
}

/**
 * Tipos de página que pueden tener su propio color de encabezado. Los decide
 * la ruta (ver el encabezado del storefront): el inicio, el listado (con o sin
 * categoría), la ficha de un producto, las páginas de contenido (las que se
 * publican, contacto y legales) y el checkout. El carrito no está: es un panel
 * que se abre encima de cualquier página, no una página.
 */
export const HEADER_PAGE_KINDS = ['home', 'listing', 'product', 'content', 'checkout'] as const;
export type HeaderPageKind = (typeof HEADER_PAGE_KINDS)[number];

/** El color del encabezado en un tipo de página. */
export interface HeaderPageColor {
  /** Fondo en "R G B". */
  bg: string;
  /** Texto e íconos en "R G B". Vacío = automático (el que se lee sobre ese fondo). */
  textColor: string;
}
export type HeaderPageColors = Partial<Record<HeaderPageKind, HeaderPageColor>>;

/** Un anuncio de la barra superior: texto + link opcional. */
interface AnnouncementItem {
  text: string;
  link: string;
  /** Abrir el link en otra pestaña. */
  newTab?: boolean;
}
/** Cuánto queda cada anuncio en "uno por vez", en segundos (default, mínimo y máximo). */
export const ANNOUNCEMENT_INTERVAL = { fallback: 5, min: 3, max: 10 } as const;
export interface ThemeAnnouncement {
  show: boolean;
  /**
   * 'static' = texto(s) fijo(s) centrado(s); 'marquee' = se desplazan de
   * derecha a izquierda; 'rotate' = uno por vez, cambiando cada `interval`.
   */
  animation: 'static' | 'marquee' | 'rotate';
  /** Uno o varios anuncios (cada uno con su link). */
  items: AnnouncementItem[];
  /** Segundos que queda cada anuncio en 'rotate' (de 3 a 10). */
  interval: number;
  /** Velocidad del 'marquee': lo que tarda en dar la vuelta. */
  speed: 'slow' | 'normal' | 'fast';
}

export interface ComingSoonConfig {
  /** Pedir el email para avisar cuando abra la tienda. */
  collectEmails: boolean;
  enabled: boolean;
  title: string;
  message: string;
  /**
   * Texto de la etiqueta de arriba. Vacío = sin etiqueta. Una marca de motos no
   * dice lo mismo que una de mascotas, y "Próximamente" fijo las aplana a todas.
   */
  eyebrow: string;
  /** Imagen de fondo (centrado) o del panel lateral (dividido). Vacío = sin imagen. */
  image: string;
  /** Centrado sobre el color de marca, o dividido con la imagen al costado. */
  layout: 'centered' | 'split';
  /** Mostrar las redes del pie: mientras la tienda no abre, es el único lugar a donde ir. */
  showSocial: boolean;
  /** WhatsApp para consultar antes de la apertura. Vacío = usa el del pie. */
  whatsapp: string;
  /** Fecha de apertura (AAAA-MM-DD). Vacía = no se anuncia ninguna. */
  launchDate: string;
}

// Las secciones del inicio (tipos, sobre común, registro, migraciones) viven
// en ./sections: acá solo se re-exportan para que el resto siga igual.
export type { SectionType, ThemeSection } from './sections/envelope';

export interface ProductListConfig {
  columns: number;
  /** Columnas en el celular: 2 (grilla) o 1 (una foto grande por fila). */
  mobileColumns: 1 | 2;
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
  defaultSort: 'newest' | 'price_asc' | 'price_desc' | 'name' | 'best_sellers';
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
  /** Campo de cupón en el carrito. Apagado, el que no tiene código no sale a buscar uno. */
  showCoupon: boolean;
  /** Botón "Seguir comprando" al lado del de pagar. */
  showContinue: boolean;
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
/** Botón flotante de WhatsApp (abajo, a la derecha o a la izquierda del storefront). */
interface WhatsAppButtonConfig {
  enabled: boolean;
  phone: string;
  message: string;
  /** Al pasar el mouse, muestra un mini-preview estilo chat de WhatsApp del mensaje. */
  showPreview: boolean;
  /** Esquina de abajo donde va. La izquierda deja libre la derecha (otro chat, el carrito…). */
  position: 'right' | 'left';
  /** Texto al lado del ícono ("¿Te ayudamos?"). Vacío = solo el ícono. */
  label: string;
}
/** Un link propio del pie (Envíos, Mayoristas, un catálogo en PDF…). */
export interface FooterLink {
  label: string;
  href: string;
  newTab?: boolean;
}

export interface FooterConfig {
  /**
   * 'centered': todo apilado al centro (el de siempre). 'columns': en columnas
   * en la compu (marca y redes · links · contacto · novedades), como las
   * tiendas grandes; en el celular se apila igual.
   */
  layout: 'centered' | 'columns';
  /** Color de fondo del pie en "R G B". Vacío = el fondo de la tienda. El texto se ajusta solo. */
  bg: string;
  /** Links propios del comercio, en el orden en que se cargaron. */
  links: FooterLink[];
  tiktok: string;
  youtube: string;
  /** Perfil de X (ex Twitter). */
  x: string;
  /** Links a las páginas de contenido publicadas (Cómo comprar, Preguntas…). */
  showPages: boolean;
  /** Suscripción a novedades en el pie. */
  showNewsletter: boolean;
  newsletterTitle: string;
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

/**
 * Estilo global de los botones principales (Comprar, Agregar, Pagar…).
 * `shape: 'auto'` sigue a los bordes globales (borderRadius), como siempre.
 */
export interface ButtonStyle {
  shape: 'auto' | 'square' | 'rounded' | 'pill';
  variant: 'filled' | 'outline';
  textCase: 'normal' | 'uppercase';
}

export interface ThemeConfig {
  /** Versión del esquema guardado (ver sections/migrations.ts). */
  schemaVersion: number;
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
  /** Forma, relleno y texto de los botones principales. */
  buttons: ButtonStyle;
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

/**
 * Secciones de un inicio que nunca se configuró (el tema no trae la lista).
 * Una lista vacía NO cae acá: es un inicio vacío a propósito.
 */
export const DEFAULT_SECTIONS: ThemeSection[] = normalizeSections([
  { id: 'carousel', type: 'carousel', visible: true, data: { slides: [] } },
  { id: 'featured', type: 'featured', visible: true, data: { title: 'Destacados', carousel: true } },
  // Sin ítems: la barra muestra los tres de siempre (envíos, pagos, compra protegida).
  { id: 'info-bar', type: 'info-bar', visible: true, data: {} },
])!;

/**
 * Defaults "neutros" del tema. `sections` queda vacío: las de un tema que nunca
 * se configuró las pone `normalizeTheme` (DEFAULT_SECTIONS).
 */
export const baseTheme: ThemeConfig = {
  schemaVersion: THEME_SCHEMA_VERSION,
  logo: '',
  favicon: '',
  shareImage: '',
  seoTitle: '',
  seoDescription: '',
  borderRadius: 'rounded',
  motion: 'subtle',
  density: 'cozy',
  iconKit: 'lucide',
  buttons: { shape: 'auto', variant: 'filled', textCase: 'normal' },
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
    transparentLogo: '',
    showSearch: false,
    showCart: true,
    cartStyle: 'icon',
    border: 'none',
    menu: [],
    pageColors: {},
  },
  announcement: {
    show: false,
    animation: 'static',
    items: [{ text: '', link: '' }],
    interval: ANNOUNCEMENT_INTERVAL.fallback,
    speed: 'normal',
  },
  comingSoon: {
    enabled: false,
    collectEmails: false,
    title: 'Estamos en construcción',
    message: 'Volvemos muy pronto con la tienda. ¡Gracias por tu paciencia!',
    eyebrow: 'Próximamente',
    image: '',
    layout: 'centered',
    showSocial: true,
    whatsapp: '',
    launchDate: '',
  },
  sections: [],
  productList: {
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
    showCoupon: true,
    showContinue: true,
    freeShippingBar: false,
    freeShippingThreshold: 5000000,
    checkoutButtonText: 'Iniciar compra',
    showSuggested: true,
    notice: '',
  },
  contact: { showForm: true, address: '', phone: '', email: '', whatsapp: '' },
  footer: {
    layout: 'centered',
    bg: '',
    links: [],
    text: '',
    showSocial: true,
    instagram: '',
    facebook: '',
    tiktok: '',
    youtube: '',
    x: '',
    showPages: false,
    showNewsletter: false,
    newsletterTitle: 'Recibí novedades y ofertas',
    showPaymentLogos: true,
    paymentLogos: ['mercadopago', 'visa', 'mastercard'],
    whatsapps: [],
    addresses: [],
    phones: [],
    emails: [],
  },
  whatsappButton: {
    enabled: false,
    phone: '',
    message: '¡Hola! Tengo una consulta.',
    showPreview: true,
    position: 'right',
    label: '',
  },
  customCss: '',
};

/** "R G B" con cada canal de 0 a 255, o vacío (= automático). Cualquier otra cosa, vacío. */
const rgbOrEmpty = (v: unknown): string =>
  typeof v === 'string' && /^\s*\d{1,3}\s+\d{1,3}\s+\d{1,3}\s*$/.test(v) ? v.trim() : '';

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
      .map((it) => ({
        text: it.text,
        link: typeof it.link === 'string' ? it.link : '',
        ...(it.newTab === true ? { newTab: true } : {}),
      }));
  }
  // Compat de lectura: temas persistidos con el shape v1 { message, link } (un
  // solo texto). El schema ya no expone esos campos, pero los datos viejos
  // siguen en la DB hasta que el merchant vuelva a guardar.
  const legacy = raw as { message?: unknown; link?: unknown };
  if (items.length === 0 && typeof legacy.message === 'string' && legacy.message.trim()) {
    items = [{ text: legacy.message, link: typeof legacy.link === 'string' ? legacy.link : '' }];
  }
  if (items.length === 0) items = [{ text: '', link: '' }];

  // Un tema guardado antes de "uno por vez" no trae ni intervalo ni velocidad:
  // quedan los de siempre (5 s y la marquesina a 22 s por vuelta).
  const { min, max, fallback } = ANNOUNCEMENT_INTERVAL;
  const interval =
    typeof raw.interval === 'number' && Number.isFinite(raw.interval)
      ? Math.min(max, Math.max(min, Math.round(raw.interval)))
      : fallback;
  return {
    show: typeof raw.show === 'boolean' ? raw.show : base.show,
    animation: raw.animation === 'marquee' || raw.animation === 'rotate' ? raw.animation : 'static',
    items,
    interval,
    speed: raw.speed === 'slow' || raw.speed === 'fast' ? raw.speed : base.speed,
  };
}

/**
 * Colores del encabezado por tipo de página: solo los tipos conocidos con un
 * fondo válido. Cualquier otra cosa (un tema viejo, un color roto) = sin
 * colores propios, y esa página usa los del encabezado.
 */
function normalizeHeaderPageColors(raw: unknown): HeaderPageColors {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out: HeaderPageColors = {};
  for (const kind of HEADER_PAGE_KINDS) {
    const entry = (raw as Record<string, Partial<HeaderPageColor> | undefined>)[kind];
    const bg = rgbOrEmpty(entry?.bg);
    if (bg) out[kind] = { bg, textColor: rgbOrEmpty(entry?.textColor) };
  }
  return out;
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

/** Ids de los ítems fijos del menú (existen siempre; se ocultan, no se borran). */
export const BUILTIN_MENU_IDS = ['home', 'products', 'categories', 'contact'] as const;

const MENU_KINDS: ThemeMenuItemKind[] = ['builtin', 'page', 'category', 'product', 'link'];

/** El tipo de un ítem guardado sin `kind` (temas anteriores): sale del id. */
function menuKindFromId(id: string): ThemeMenuItemKind {
  if ((BUILTIN_MENU_IDS as readonly string[]).includes(id)) return 'builtin';
  if (id.startsWith('page:')) return 'page';
  if (id.startsWith('cat:')) return 'category';
  if (id.startsWith('prod:')) return 'product';
  return 'link';
}

/**
 * Menú del encabezado: descarta lo que no tiene forma, deduce el tipo de los
 * ítems viejos ({ id, visible }) y deja el anidado en un solo nivel. Un hijo
 * cuyo padre no existe, es otro hijo o es el desplegable de Categorías (que ya
 * es un desplegable) vuelve al primer nivel en vez de perderse.
 */
function normalizeMenu(raw: unknown): ThemeMenuItem[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const items: ThemeMenuItem[] = [];
  for (const m of raw as Partial<ThemeMenuItem>[]) {
    if (typeof m?.id !== 'string' || !m.id || seen.has(m.id)) continue;
    seen.add(m.id);
    const kind = MENU_KINDS.includes(m.kind as ThemeMenuItemKind)
      ? (m.kind as ThemeMenuItemKind)
      : menuKindFromId(m.id);
    const item: ThemeMenuItem = { id: m.id, visible: m.visible !== false, kind };
    if (typeof m.label === 'string' && m.label.trim()) item.label = m.label.trim().slice(0, 80);
    if (typeof m.href === 'string' && m.href.trim()) item.href = m.href.trim();
    if (m.newTab === true) item.newTab = true;
    if (m.showChildren === true && kind === 'category') item.showChildren = true;
    if (typeof m.parent === 'string' && m.parent) item.parent = m.parent;
    items.push(item);
  }
  const byId = new Map(items.map((m) => [m.id, m]));
  for (const m of items) {
    if (!m.parent) continue;
    const parent = byId.get(m.parent);
    if (!parent || parent.parent || parent.id === m.id || parent.id === 'categories' || m.id === 'categories')
      delete m.parent;
  }
  // Quien tiene hijos no puede ser hijo (un solo nivel).
  const parents = new Set(items.filter((m) => m.parent).map((m) => m.parent!));
  for (const m of items) if (m.parent && parents.has(m.id)) delete m.parent;
  return items;
}

/** Links propios del pie: solo los que tienen nombre y destino. */
function normalizeFooterLinks(raw: unknown): FooterLink[] {
  if (!Array.isArray(raw)) return [];
  return (raw as Partial<FooterLink>[])
    .filter((l): l is FooterLink => typeof l?.label === 'string' && typeof l?.href === 'string')
    .map((l) => ({ label: l.label, href: l.href, ...(l.newTab === true ? { newTab: true } : {}) }));
}

function normalizeButtons(raw?: Partial<ButtonStyle>): ButtonStyle {
  const base = baseTheme.buttons;
  return {
    shape: (['auto', 'square', 'rounded', 'pill'] as const).includes(raw?.shape as ButtonStyle['shape'])
      ? raw!.shape!
      : base.shape,
    variant: raw?.variant === 'outline' ? 'outline' : base.variant,
    textCase: raw?.textCase === 'uppercase' ? 'uppercase' : base.textCase,
  };
}

/**
 * Mergea una config parcial sobre los defaults para que nunca falten campos.
 * Antes de mergear la lleva a la versión de esquema actual (migrateTheme).
 *
 * Secciones: una lista (aunque esté vacía) se respeta y se normaliza; si el
 * tema no trae lista —nunca se configuró— van `fallbackSections`.
 */
export function normalizeTheme(
  input: Partial<ThemeConfig> | null,
  fallbackSections: ThemeSection[] = DEFAULT_SECTIONS,
): ThemeConfig {
  if (!input || typeof input !== 'object' || Array.isArray(input))
    return { ...baseTheme, sections: normalizeSections(fallbackSections) ?? [] };
  const raw = migrateTheme(input) as Partial<ThemeConfig>;
  return {
    schemaVersion: raw.schemaVersion ?? THEME_SCHEMA_VERSION,
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
    buttons: normalizeButtons(raw.buttons),
    colors: { ...baseTheme.colors, ...raw.colors },
    fonts: { ...baseTheme.fonts, ...raw.fonts },
    header: {
      ...baseTheme.header,
      ...raw.header,
      // El menú puede venir de una config guardada antes de que existiera, o
      // con el formato viejo ({ id, visible }): se migra acá.
      menu: normalizeMenu(raw.header?.menu),
      textColor: rgbOrEmpty(raw.header?.textColor),
      pageColors: normalizeHeaderPageColors(raw.header?.pageColors),
      transparentLogo:
        typeof raw.header?.transparentLogo === 'string'
          ? raw.header.transparentLogo
          : baseTheme.header.transparentLogo,
    },
    announcement: normalizeAnnouncement(raw.announcement),
    comingSoon: {
      ...baseTheme.comingSoon,
      ...raw.comingSoon,
      layout: raw.comingSoon?.layout === 'split' ? 'split' : 'centered',
    },
    sections: normalizeSections(raw.sections) ?? normalizeSections(fallbackSections) ?? [],
    productList: {
      ...baseTheme.productList,
      ...raw.productList,
      mobileColumns: raw.productList?.mobileColumns === 1 ? 1 : 2,
    },
    productDetail: { ...baseTheme.productDetail, ...raw.productDetail },
    cart: { ...baseTheme.cart, ...raw.cart },
    contact: { ...baseTheme.contact, ...raw.contact },
    footer: {
      ...baseTheme.footer,
      ...raw.footer,
      // Temas guardados antes de que existieran: el pie centrado de siempre.
      layout: raw.footer?.layout === 'columns' ? 'columns' : 'centered',
      bg: rgbOrEmpty(raw.footer?.bg),
      links: normalizeFooterLinks(raw.footer?.links),
      paymentLogos: Array.isArray(raw.footer?.paymentLogos)
        ? raw.footer!.paymentLogos.filter((s) => PAYMENT_LOGO_SLUGS.includes(s))
        : baseTheme.footer.paymentLogos,
      whatsapps: Array.isArray(raw.footer?.whatsapps) ? raw.footer!.whatsapps : baseTheme.footer.whatsapps,
      addresses: Array.isArray(raw.footer?.addresses) ? raw.footer!.addresses : baseTheme.footer.addresses,
      phones: Array.isArray(raw.footer?.phones) ? raw.footer!.phones : baseTheme.footer.phones,
      emails: Array.isArray(raw.footer?.emails) ? raw.footer!.emails : baseTheme.footer.emails,
    },
    whatsappButton: {
      ...baseTheme.whatsappButton,
      ...raw.whatsappButton,
      position: raw.whatsappButton?.position === 'left' ? 'left' : 'right',
      label:
        typeof raw.whatsappButton?.label === 'string'
          ? raw.whatsappButton.label
          : baseTheme.whatsappButton.label,
    },
    customCss: typeof raw.customCss === 'string' ? raw.customCss : baseTheme.customCss,
  };
}
