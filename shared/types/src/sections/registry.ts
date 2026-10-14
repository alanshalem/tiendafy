/* ============================================================
   Registro único de secciones del inicio.

   Una entrada por tipo con todo lo que el resto del sistema necesita
   saber de él: nombre, descripción, grupo del menú, maqueta, campos
   (de donde salen el tipo TS, el normalizador y la validación del
   backend), contenido de ejemplo, límites y palabras de búsqueda.

   Antes esto vivía repartido en diez lugares (tipos del storefront,
   labels del editor, defaults en cuatro archivos que no coincidían…) y
   agregar una sección era una búsqueda del tesoro. Ver README.md.
   ============================================================ */

import { field, normalizeFields, type DataOf, type FieldsSpec } from './schema';
import { richDocFromText } from './rich-text';
import {
  isSectionType,
  normalizeHideOn,
  normalizeSectionStyle,
  SECTION_TYPES,
  type SectionType,
  type ThemeSection,
} from './envelope';

export type SectionGroup = 'Imágenes' | 'Productos' | 'Contenido' | 'Confianza' | 'Contacto';
export const SECTION_GROUPS: readonly SectionGroup[] = [
  'Imágenes',
  'Productos',
  'Contenido',
  'Confianza',
  'Contacto',
];

/** Qué maqueta dibuja el editor para el tipo (plantillas y menú de agregar). */
export type SectionWireframe =
  | 'hero'
  | 'products'
  | 'banners'
  | 'image-text'
  | 'text'
  | 'info-bar'
  | 'newsletter'
  | 'video'
  | 'cards'
  | 'faq'
  | 'logos'
  | 'countdown'
  | 'product-feature'
  | 'popup'
  | 'categories'
  | 'columns'
  | 'collage';

export interface SectionDefinition<F extends FieldsSpec = FieldsSpec> {
  type: SectionType;
  /** Nombre del tipo en el editor ("Carrusel de imágenes"). */
  label: string;
  /** Cómo se nombra en el botón del preview: "Editar el carrusel". */
  previewLabel: string;
  /** Una línea que explica para qué sirve (menú de agregar). */
  description: string;
  group: SectionGroup;
  wireframe: SectionWireframe;
  fields: F;
  /**
   * Contenido de ejemplo de una sección NUEVA (agregar o plantilla): que se
   * vea algo en la vista previa apenas se agrega. No es el fallback de los
   * datos viejos —eso es el `fallback` de cada campo—, así una sección
   * guardada con un campo vacío no aparece de golpe con texto de ejemplo.
   */
  defaults: Partial<DataOf<F>>;
  limits: {
    /** Cuántas de este tipo puede haber en el inicio. Sin valor = sin tope. */
    maxPerPage?: number;
  };
  /** Palabras con las que alguien la buscaría sin saber cómo se llama. */
  keywords: string;
}

const define = <const F extends FieldsSpec>(def: SectionDefinition<F>) => def;

/* ---- Campos de cada tipo (de acá sale el tipo de su data) ---- */

const heroVideoFields = {
  videoWebm: field.media(),
  videoMp4: field.media(),
  poster: field.media(),
  title: field.string(),
  subtitle: field.text(),
  buttonText: field.string(),
  link: field.url(),
  align: field.enum(['left', 'center'], 'center'),
  height: field.enum(['large', 'full'], 'large'),
  overlay: field.enum(['none', 'light', 'medium', 'strong'], 'medium'),
} as const;

const carouselFields = {
  images: field.strings('media', 20),
  fullHeightMobile: field.boolean(false),
} as const;

/** Destacados, recién llegados y ofertas comparten forma; cambia el título por defecto. */
const productsFields = (title: string) =>
  ({
    title: field.string(title),
    productIds: field.strings('id', 60),
    carousel: field.boolean(true),
  }) as const;

const bannerItem = {
  image: field.media(),
  title: field.string(),
  description: field.text(),
  link: field.url(),
  show: field.boolean(true),
} as const;

const bannersFields = {
  banners: field.items(bannerItem, 12),
  fullWidth: field.boolean(false),
} as const;

const institutionalFields = {
  title: field.string(),
  description: field.text(),
} as const;

const imageTextFields = {
  image: field.media(),
  title: field.string(),
  description: field.text(),
  buttonText: field.string(),
  link: field.url(),
  textColor: field.enum(['dark', 'light'], 'dark'),
} as const;

export const INFO_ICONS = ['shipping', 'card', 'security', 'gift', 'support', 'returns'] as const;

const infoBarFields = {
  items: field.items(
    {
      icon: field.enum(INFO_ICONS, 'shipping'),
      title: field.string(),
      description: field.text(),
      link: field.url(),
    },
    4,
  ),
} as const;

const newsletterFields = {
  image: field.media(),
  title: field.string(),
  text: field.text(),
} as const;

// El video se mete en un <iframe>: es un link más, con las mismas reglas.
const instagramFields = { video: field.url() } as const;

const testimonialsFields = {
  title: field.string(),
  items: field.items(
    { quote: field.text(), name: field.string(), detail: field.string(), photo: field.media() },
    24,
  ),
} as const;

const faqFields = {
  title: field.string(),
  items: field.items({ question: field.string(), answer: field.text() }, 40),
} as const;

const brandsFields = {
  title: field.string(),
  images: field.strings('media', 40),
} as const;

/* ---- Campos de los tipos de la fase 2 (ofertas, producto, pop-up, editorial…) ---- */

/*
 * Las secciones con una lista de productos (ofertas con cronómetro) guardan su
 * origen en `data.source` y su cantidad en `data.limit`, como destacados u
 * ofertas: no son campos del esquema, los resuelve `sectionProductPlan`
 * (product-source.ts).
 */
const countdownOfferFields = {
  title: field.string(),
  text: field.text(),
  /** Cuándo termina, en UTC. El editor lo pide y lo muestra en hora de Argentina. */
  endsAt: field.datetime(),
  /** Al terminar: se oculta la sección, o queda con un mensaje. */
  whenEnded: field.enum(['hide', 'message'], 'hide'),
  endedText: field.string('Esta oferta terminó.'),
  buttonText: field.string(),
  link: field.url(),
  carousel: field.boolean(true),
} as const;

const featuredProductFields = {
  productId: field.string('', 100),
  layout: field.enum(['image-left', 'image-right'], 'image-left'),
  badge: field.string(''),
  showDescription: field.boolean(true),
  /** `cart`: agregar al carrito (con varias variantes lleva a la ficha); `link`: "Ver producto". */
  button: field.enum(['cart', 'link'], 'cart'),
} as const;

const promoPopupFields = {
  image: field.media(),
  mobileImage: field.media(),
  title: field.string(),
  text: field.text(),
  couponCode: field.string('', 40),
  buttonText: field.string(),
  link: field.url(),
  newsletter: field.boolean(false),
  trigger: field.enum(['delay', 'exit', 'both'], 'delay'),
  delaySeconds: field.number(5, 0, 120),
  frequency: field.enum(['once', 'session', 'days'], 'days'),
  frequencyDays: field.number(7, 1, 365),
} as const;

const richTextFields = {
  title: field.string(),
  body: field.richtext(),
  image: field.media(),
  imagePosition: field.enum(['left', 'right', 'top'], 'left'),
  buttonText: field.string(),
  link: field.url(),
} as const;

const categoryListFields = {
  title: field.string(),
  /** `auto`: las categorías principales (las de primer nivel), hasta `count`. */
  mode: field.enum(['auto', 'manual'], 'auto'),
  count: field.number(6, 1, 24),
  items: field.items({ categoryId: field.string('', 100), title: field.string(), image: field.media() }, 24),
  layout: field.enum(['grid', 'carousel'], 'grid'),
  columnsDesktop: field.number(6, 2, 8),
  columnsMobile: field.number(2, 1, 3),
  shape: field.enum(['circle', 'square', 'portrait'], 'circle'),
  showAll: field.boolean(true),
  showAllText: field.string('Ver todas'),
} as const;

export const VIDEO_RATIOS = ['16:9', '9:16', '1:1', '4:3'] as const;

const videoFields = {
  /** `link`: YouTube o Vimeo; `file`: un MP4 subido a la tienda. */
  source: field.enum(['link', 'file'], 'link'),
  url: field.url(),
  file: field.media(),
  poster: field.media(),
  title: field.string(),
  text: field.text(),
  buttonText: field.string(),
  link: field.url(),
  ratio: field.enum(VIDEO_RATIOS, '16:9'),
  /** Solo el MP4: arranca solo, sin sonido y en loop (con botón de pausa). */
  autoplay: field.boolean(true),
} as const;

/** Íconos que se pueden elegir en "Íconos con texto" (los del kit de la tienda). `none`: sin ícono. */
export const COLUMN_ICONS = [
  'shipping',
  'card',
  'security',
  'gift',
  'support',
  'returns',
  'heart',
  'cart',
  'chat',
  'phone',
  'mail',
  'mapPin',
  'user',
  'search',
  'none',
] as const;

const iconColumnsFields = {
  title: field.string(),
  items: field.items(
    {
      icon: field.enum(COLUMN_ICONS, 'shipping'),
      /** Una imagen propia en lugar del ícono. */
      image: field.media(),
      title: field.string(),
      text: field.text(),
      link: field.url(),
    },
    12,
  ),
  columnsDesktop: field.number(3, 2, 6),
  mobile: field.enum(['1', '2', 'swipe'], '1'),
} as const;

const collageFields = {
  title: field.string(),
  blocks: field.items(
    {
      kind: field.enum(['image', 'product', 'category'], 'image'),
      image: field.media(),
      title: field.string(),
      link: field.url(),
      productId: field.string('', 100),
      categoryId: field.string('', 100),
    },
    3,
  ),
  layout: field.enum(['big-left', 'big-right'], 'big-left'),
  mobile: field.enum(['stack', 'swipe'], 'stack'),
} as const;

/* ---- El tipo de la data de cada sección (normalizada: todos los campos presentes) ---- */

export type HeroVideoData = DataOf<typeof heroVideoFields>;
export type CarouselData = DataOf<typeof carouselFields>;
export type ProductsData = DataOf<ReturnType<typeof productsFields>>;
export type BannersData = DataOf<typeof bannersFields>;
export type BannerItem = BannersData['banners'][number];
export type InstitutionalData = DataOf<typeof institutionalFields>;
export type ImageTextData = DataOf<typeof imageTextFields>;
export type InfoBarData = DataOf<typeof infoBarFields>;
export type InfoItemData = InfoBarData['items'][number];
export type NewsletterData = DataOf<typeof newsletterFields>;
export type InstagramData = DataOf<typeof instagramFields>;
export type TestimonialsData = DataOf<typeof testimonialsFields>;
export type TestimonialItem = TestimonialsData['items'][number];
export type FaqData = DataOf<typeof faqFields>;
export type FaqItem = FaqData['items'][number];
export type BrandsData = DataOf<typeof brandsFields>;
export type CountdownOfferData = DataOf<typeof countdownOfferFields>;
export type FeaturedProductData = DataOf<typeof featuredProductFields>;
export type PromoPopupData = DataOf<typeof promoPopupFields>;
export type RichTextData = DataOf<typeof richTextFields>;
export type CategoryListData = DataOf<typeof categoryListFields>;
export type CategoryListItem = CategoryListData['items'][number];
export type VideoData = DataOf<typeof videoFields>;
export type IconColumnsData = DataOf<typeof iconColumnsFields>;
export type IconColumnItem = IconColumnsData['items'][number];
export type CollageData = DataOf<typeof collageFields>;
export type CollageBlock = CollageData['blocks'][number];

/** Tipo de sección → tipo de su data. */
export interface SectionDataMap {
  'hero-video': HeroVideoData;
  carousel: CarouselData;
  featured: ProductsData;
  'new-products': ProductsData;
  'sale-products': ProductsData;
  'promo-banners': BannersData;
  'category-banners': BannersData;
  institutional: InstitutionalData;
  'image-text': ImageTextData;
  'info-bar': InfoBarData;
  newsletter: NewsletterData;
  instagram: InstagramData;
  testimonials: TestimonialsData;
  faq: FaqData;
  brands: BrandsData;
  'countdown-offer': CountdownOfferData;
  'featured-product': FeaturedProductData;
  'promo-popup': PromoPopupData;
}

/* ---- El registro ---- */

const DEFAULT_INFO_ITEMS = [
  { icon: 'shipping', title: 'Envíos a todo el país', description: '', link: '' },
  { icon: 'card', title: 'Pagá con Mercado Pago', description: '', link: '' },
  { icon: 'security', title: 'Compra protegida', description: '', link: '' },
] as const;

export const SECTION_REGISTRY = {
  'hero-video': define({
    type: 'hero-video',
    label: 'Hero con video',
    previewLabel: 'el hero con video',
    description: 'Video a pantalla completa con título y botón, para abrir la portada.',
    group: 'Imágenes',
    wireframe: 'hero',
    fields: heroVideoFields,
    defaults: {
      title: 'Nueva colección',
      subtitle: 'Descubrí lo nuevo de la temporada.',
      buttonText: 'Ver productos',
      link: '/productos',
    },
    limits: { maxPerPage: 1 },
    keywords: 'portada video fondo banner principal',
  }),
  carousel: define({
    type: 'carousel',
    label: 'Carrusel de imágenes',
    previewLabel: 'el carrusel',
    description: 'Fotos grandes a todo el ancho que se pasan solas.',
    group: 'Imágenes',
    wireframe: 'hero',
    fields: carouselFields,
    // Sin imágenes, el storefront muestra una portada con el nombre de la tienda.
    defaults: { images: [], fullHeightMobile: false },
    limits: {},
    keywords: 'slider portada fotos banner principal slideshow',
  }),
  'promo-banners': define({
    type: 'promo-banners',
    label: 'Banners promocionales',
    previewLabel: 'los banners de promo',
    description: 'Imágenes con promos o campañas, cada una con su link.',
    group: 'Imágenes',
    wireframe: 'banners',
    fields: bannersFields,
    defaults: {
      fullWidth: false,
      banners: [
        {
          image: '',
          title: 'Hasta 30% off',
          description: 'En productos seleccionados',
          link: '/productos',
          show: true,
        },
        {
          image: '',
          title: 'Envío gratis',
          description: 'En compras desde un monto mínimo',
          link: '/productos',
          show: true,
        },
        {
          image: '',
          title: 'Nuevos ingresos',
          description: 'Lo último que llegó',
          link: '/productos',
          show: true,
        },
      ],
    },
    limits: {},
    keywords: 'promociones ofertas campañas imagenes publicidad',
  }),
  'category-banners': define({
    type: 'category-banners',
    label: 'Banners de categorías',
    previewLabel: 'los banners de categorías',
    description: 'Imágenes cuadradas que llevan a cada categoría.',
    group: 'Imágenes',
    wireframe: 'banners',
    fields: bannersFields,
    defaults: {
      fullWidth: false,
      banners: [
        { image: '', title: 'Novedades', description: '', link: '/productos', show: true },
        { image: '', title: 'Más vendidos', description: '', link: '/productos', show: true },
        { image: '', title: 'Ofertas', description: '', link: '/productos', show: true },
      ],
    },
    limits: {},
    keywords: 'categorias rubros secciones imagenes',
  }),
  featured: define({
    type: 'featured',
    label: 'Productos destacados',
    previewLabel: 'los destacados',
    description: 'Los productos que elijas, en grilla o carrusel.',
    group: 'Productos',
    wireframe: 'products',
    fields: productsFields('Destacados'),
    defaults: { title: 'Destacados', carousel: true, productIds: [] },
    limits: {},
    keywords: 'destacados elegidos vitrina grilla',
  }),
  'new-products': define({
    type: 'new-products',
    label: 'Productos nuevos',
    previewLabel: 'los recién llegados',
    description: 'Lo último que cargaste, o los productos que elijas.',
    group: 'Productos',
    wireframe: 'products',
    fields: productsFields('Recién llegados'),
    defaults: { title: 'Recién llegados', carousel: true, productIds: [] },
    limits: {},
    keywords: 'nuevos novedades recien llegados ultimos',
  }),
  'sale-products': define({
    type: 'sale-products',
    label: 'Productos en oferta',
    previewLabel: 'las ofertas',
    description: 'Los productos con precio tachado, o los que elijas.',
    group: 'Productos',
    wireframe: 'products',
    fields: productsFields('Ofertas'),
    defaults: { title: 'Ofertas', carousel: true, productIds: [] },
    limits: {},
    keywords: 'ofertas descuentos rebajas sale liquidacion',
  }),
  institutional: define({
    type: 'institutional',
    label: 'Mensaje institucional',
    previewLabel: 'la sección institucional',
    description: 'Un título y un texto corto sobre tu marca.',
    group: 'Contenido',
    wireframe: 'text',
    fields: institutionalFields,
    defaults: {
      title: 'Sobre nosotros',
      description: 'Contá en pocas líneas quiénes son, qué venden y por qué elegirlos.',
    },
    limits: {},
    keywords: 'texto quienes somos historia marca mensaje',
  }),
  'image-text': define({
    type: 'image-text',
    label: 'Módulo de imagen y texto',
    previewLabel: 'la sección imagen + texto',
    description: 'Una imagen al lado de un texto con botón.',
    group: 'Contenido',
    wireframe: 'image-text',
    fields: imageTextFields,
    defaults: {
      title: 'Nuestra historia',
      description: 'Usá este espacio para contar algo de tu marca, un lanzamiento o cómo trabajan.',
      buttonText: 'Ver productos',
      link: '/productos',
    },
    limits: {},
    keywords: 'imagen texto historia boton bloque',
  }),
  faq: define({
    type: 'faq',
    label: 'Preguntas frecuentes',
    previewLabel: 'las preguntas frecuentes',
    description: 'Preguntas y respuestas desplegables, que además ayudan en Google.',
    group: 'Contenido',
    wireframe: 'faq',
    fields: faqFields,
    defaults: {
      title: 'Preguntas frecuentes',
      items: [
        {
          question: '¿Hacen envíos a todo el país?',
          answer: 'Contá acá adónde envían, con qué correo y cuánto tarda.',
        },
        {
          question: '¿Qué medios de pago aceptan?',
          answer: 'Contá acá con qué se puede pagar y si hay cuotas o descuentos.',
        },
        {
          question: '¿Puedo cambiar un producto?',
          answer: 'Contá acá cómo y en qué plazo se hacen los cambios.',
        },
      ],
    },
    // Varias secciones de preguntas se juntan en un solo FAQPage para Google.
    limits: {},
    keywords: 'faq dudas preguntas respuestas ayuda',
  }),
  'info-bar': define({
    type: 'info-bar',
    label: 'Información de envíos, pagos y compra',
    previewLabel: 'la barra de información',
    description: 'Íconos con envíos, medios de pago y compra protegida.',
    group: 'Confianza',
    wireframe: 'info-bar',
    fields: infoBarFields,
    defaults: { items: DEFAULT_INFO_ITEMS.map((i) => ({ ...i })) },
    limits: {},
    keywords: 'envios pagos seguridad iconos beneficios garantia',
  }),
  testimonials: define({
    type: 'testimonials',
    label: 'Testimonios de clientes',
    previewLabel: 'los testimonios',
    description: 'Opiniones de clientes con nombre y foto.',
    group: 'Confianza',
    wireframe: 'cards',
    fields: testimonialsFields,
    // Texto que se nota que hay que reemplazar: un testimonio inventado
    // publicado por descuido sería peor que no tener la sección.
    defaults: {
      title: 'Lo que dicen nuestros clientes',
      items: [
        {
          quote: 'Pegá acá la opinión de un cliente real (de WhatsApp o Instagram, con su permiso).',
          name: 'Nombre del cliente',
          detail: 'Ciudad',
          photo: '',
        },
        {
          quote: 'Las opiniones cortas y concretas convencen más que las largas.',
          name: 'Nombre del cliente',
          detail: 'Ciudad',
          photo: '',
        },
      ],
    },
    limits: {},
    keywords: 'opiniones reseñas clientes comentarios confianza',
  }),
  brands: define({
    type: 'brands',
    label: 'Marcas que vendemos',
    previewLabel: 'las marcas',
    description: 'Los logos de las marcas que vendés.',
    group: 'Confianza',
    wireframe: 'logos',
    fields: brandsFields,
    defaults: { title: 'Marcas que vendemos', images: [] },
    limits: {},
    keywords: 'logos marcas fabricantes',
  }),
  newsletter: define({
    type: 'newsletter',
    label: 'Newsletter',
    previewLabel: 'el newsletter',
    description: 'Un formulario para que te dejen el email.',
    group: 'Contacto',
    wireframe: 'newsletter',
    fields: newsletterFields,
    defaults: { title: 'Recibí novedades', text: 'Enterate primero de los lanzamientos y las ofertas.' },
    limits: { maxPerPage: 1 },
    keywords: 'suscripcion email novedades lista correo',
  }),
  instagram: define({
    type: 'instagram',
    label: 'Instagram / Video',
    previewLabel: 'el feed de Instagram',
    description: 'Un video de YouTube o Vimeo, o una publicación de Instagram.',
    group: 'Contacto',
    wireframe: 'video',
    fields: instagramFields,
    defaults: { video: '' },
    limits: {},
    keywords: 'instagram youtube vimeo video reel redes',
  }),
  'countdown-offer': define({
    type: 'countdown-offer',
    label: 'Ofertas con cronómetro',
    previewLabel: 'la oferta con cronómetro',
    description: 'Productos en oferta con una cuenta regresiva hasta que termina la promo.',
    group: 'Productos',
    wireframe: 'countdown',
    fields: countdownOfferFields,
    defaults: {
      title: 'Ofertas por tiempo limitado',
      text: 'Aprovechá antes de que termine.',
      // Una semana desde hoy (se calcula al agregarla): el cronómetro se ve andando.
      get endsAt() {
        return weekFromToday();
      },
      whenEnded: 'hide',
      buttonText: 'Ver todas las ofertas',
      link: '/productos',
      carousel: true,
    },
    limits: {},
    keywords: 'cuenta regresiva countdown reloj timer hot sale cyber monday black friday promo urgencia',
  }),
  'featured-product': define({
    type: 'featured-product',
    label: 'Producto destacado',
    previewLabel: 'el producto destacado',
    description: 'Un producto grande, con su foto, precio y botón de compra.',
    group: 'Productos',
    wireframe: 'product-feature',
    fields: featuredProductFields,
    defaults: { badge: 'Elegido del mes', layout: 'image-left', showDescription: true, button: 'cart' },
    limits: {},
    keywords: 'producto estrella vidriera lanzamiento elegido comprar',
  }),
  'promo-popup': define({
    type: 'promo-popup',
    label: 'Pop-up promocional',
    previewLabel: 'el pop-up',
    description: 'Una ventana con una promo o un cupón que aparece al entrar o al irse.',
    group: 'Contenido',
    wireframe: 'popup',
    fields: promoPopupFields,
    defaults: {
      title: '10% off en tu primera compra',
      text: 'Usá este código cuando pagues.',
      couponCode: 'BIENVENIDA10',
      buttonText: 'Ver productos',
      link: '/productos',
      trigger: 'delay',
      delaySeconds: 5,
      frequency: 'days',
      frequencyDays: 7,
    },
    limits: { maxPerPage: 1 },
    keywords: 'popup modal ventana emergente cupon descuento bienvenida suscripcion',
  }),
} satisfies Record<SectionType, SectionDefinition>;

/**
 * Dentro de una semana a las 23:59 de Argentina (UTC-3, sin horario de
 * verano), en UTC: el ejemplo del cronómetro.
 */
export function weekFromToday(now = new Date()): string {
  const ar = new Date(now.getTime() - 3 * 3600_000);
  const end = Date.UTC(ar.getUTCFullYear(), ar.getUTCMonth(), ar.getUTCDate() + 7, 23, 59) + 3 * 3600_000;
  return new Date(end).toISOString();
}

/** La definición de un tipo, o `undefined` si el tipo no existe (datos de una versión más nueva). */
export function sectionDefinition(type: string): SectionDefinition | undefined {
  return isSectionType(type) ? (SECTION_REGISTRY[type] as unknown as SectionDefinition) : undefined;
}

/** Todas las definiciones, en el orden del menú. */
export const SECTION_DEFINITIONS: readonly SectionDefinition[] = SECTION_TYPES.map(
  (t) => SECTION_REGISTRY[t] as unknown as SectionDefinition,
);

/** Nombre con que se muestra una sección en el editor: el propio, o el del tipo. */
export function sectionDisplayName(section: Pick<ThemeSection, 'type' | 'name'>): string {
  const own = section.name?.trim();
  return own || sectionDefinition(section.type)?.label || section.type;
}

/** La data de una sección, normalizada y con su tipo. Nunca tira. */
export function sectionData<T extends SectionType>(section: { type: T; data: unknown }): SectionDataMap[T] {
  const def = sectionDefinition(section.type);
  return (def ? normalizeFields(def.fields, section.data) : {}) as SectionDataMap[T];
}

/** ¿Entra otra sección de este tipo? (p. ej. un solo newsletter por página). */
export function canAddSection(sections: readonly Pick<ThemeSection, 'type'>[], type: SectionType): boolean {
  const max = SECTION_REGISTRY[type].limits.maxPerPage;
  return max === undefined || sections.filter((s) => s.type === type).length < max;
}

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
const randomId = () => Math.random().toString(36).slice(2, 8);

/** Una sección nueva del tipo, con el contenido de ejemplo del registro (se ve apenas se agrega). */
export function createSection(type: SectionType, data?: Record<string, unknown>): ThemeSection {
  const def = SECTION_REGISTRY[type] as unknown as SectionDefinition;
  return {
    id: `${type}-${randomId()}`,
    type,
    visible: true,
    data: normalizeFields(def.fields, { ...clone(def.defaults), ...data }),
  };
}

const ID_MAX = 100;

/** Tope de secciones en el inicio: más que esto es una página que nadie termina de cargar. */
export const MAX_SECTIONS = 40;

/**
 * Una sección cruda (de la DB, de un postMessage, de un JSON viejo) a su forma
 * válida. Nunca tira; devuelve `null` si no se puede rescatar (no es un objeto
 * o no tiene tipo). Un tipo desconocido se conserva con su data tal cual: lo
 * pudo haber creado una versión más nueva del editor, y el storefront
 * simplemente no lo dibuja.
 */
export function normalizeSection(raw: unknown, index = 0): ThemeSection | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.type !== 'string' || r.type.trim() === '') return null;
  const def = sectionDefinition(r.type);
  const id =
    typeof r.id === 'string' && r.id.trim() !== '' && r.id.length <= ID_MAX ? r.id : `${r.type}-${index}`;
  const out: ThemeSection = {
    ...(r as object),
    id,
    type: r.type as SectionType,
    // Sin `visible` explícito, la sección estaba oculta: se respeta.
    visible: r.visible === true,
    data: def
      ? normalizeFields(def.fields, r.data)
      : typeof r.data === 'object' && r.data !== null && !Array.isArray(r.data)
        ? (r.data as Record<string, unknown>)
        : {},
  };
  if (typeof r.name === 'string' && r.name.trim() !== '') out.name = r.name;
  else delete out.name;
  const hideOn = normalizeHideOn(r.hideOn);
  if (hideOn) out.hideOn = hideOn;
  else delete out.hideOn;
  const style = normalizeSectionStyle(r.style);
  if (style) out.style = style;
  else delete out.style;
  return out;
}

/**
 * La lista de secciones del inicio. `null` si no es una lista: el tema nunca
 * se configuró y cada consumidor decide su fallback. Una lista vacía es
 * válida —el comercio sacó todo a propósito— y se respeta.
 */
export function normalizeSections(raw: unknown): ThemeSection[] | null {
  if (!Array.isArray(raw)) return null;
  const seen = new Set<string>();
  const out: ThemeSection[] = [];
  raw.forEach((item, i) => {
    const s = normalizeSection(item, i);
    if (!s) return;
    // Ids repetidos rompían el editor (abrir una abría la otra): se renombra la copia.
    let id = s.id;
    for (let n = 2; seen.has(id); n++) id = `${s.id}-${n}`;
    seen.add(id);
    out.push(id === s.id ? s : { ...s, id });
  });
  return out;
}
