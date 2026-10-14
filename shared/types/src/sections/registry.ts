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
import { upgradeSectionData } from './legacy';
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
  | 'logos';

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

/** Cuánto se oscurece una foto para que se lea el texto blanco encima. */
export const OVERLAYS = ['none', 'light', 'medium', 'strong'] as const;
export type Overlay = (typeof OVERLAYS)[number];

/**
 * Dónde va el texto sobre una imagen: "vertical-horizontal" (o `center`).
 * El editor lo muestra como una grilla de 3×3.
 */
export const TEXT_POSITIONS = [
  'top-left',
  'top-center',
  'top-right',
  'center-left',
  'center',
  'center-right',
  'bottom-left',
  'bottom-center',
  'bottom-right',
] as const;
export type TextPosition = (typeof TEXT_POSITIONS)[number];

/** Proporciones de un banner o una imagen ("ancho x alto"). */
export const BANNER_RATIOS = ['3x1', '2x1', '16x9', '4x3', '1x1', '4x5', '3x4'] as const;
export type BannerRatio = (typeof BANNER_RATIOS)[number];

const heroVideoFields = {
  videoWebm: field.media(),
  videoMp4: field.media(),
  poster: field.media(),
  title: field.string(),
  subtitle: field.text(),
  buttonText: field.string(),
  link: field.url(),
  align: field.enum(['left', 'center', 'right'], 'center'),
  height: field.enum(['small', 'medium', 'large', 'full'], 'large'),
  overlay: field.enum(OVERLAYS, 'medium'),
  /** Video vertical para celular (MP4). Sin valor, el de computadora. */
  videoMobile: field.media(),
  /** Imagen de respaldo para celular. Sin valor, la de computadora. */
  posterMobile: field.media(),
  verticalAlign: field.enum(['top', 'center', 'bottom'], 'center'),
  /** Antes el texto era siempre blanco: es el fallback. */
  textColor: field.enum(['light', 'dark'], 'light'),
  newTab: field.boolean(false),
  secondButtonText: field.string(),
  secondLink: field.url(),
  secondNewTab: field.boolean(false),
} as const;

const carouselSlide = {
  image: field.media(),
  /** Imagen para celular (vertical o cuadrada). Sin valor, la de computadora. */
  mobileImage: field.media(),
  /** Texto alternativo: lo leen los lectores de pantalla y Google. */
  alt: field.string(),
  link: field.url(),
  newTab: field.boolean(false),
  title: field.string(),
  subtitle: field.text(),
  buttonText: field.string(),
  textPosition: field.enum(TEXT_POSITIONS, 'center'),
  overlay: field.enum(OVERLAYS, 'none'),
} as const;

/** Alto del carrusel. `adapt` = el de la imagen (sin recortes si respeta la medida recomendada). */
export const CAROUSEL_HEIGHTS = ['adapt', 'small', 'medium', 'large', 'full'] as const;

const carouselFields = {
  slides: field.items(carouselSlide, 20),
  autoplay: field.boolean(true),
  /** Segundos que se ve cada diapositiva. */
  speed: field.enum(['3', '4', '5', '6', '7', '8', '9'], '5'),
  /** `medium` es el alto de antes (300 px en celular, 460 en computadora). */
  height: field.enum(CAROUSEL_HEIGHTS, 'medium'),
  /** En celular. `auto` = la versión de celular del alto de computadora. */
  heightMobile: field.enum(['auto', ...CAROUSEL_HEIGHTS], 'auto'),
  arrows: field.boolean(true),
  indicators: field.boolean(true),
} as const;

/** Destacados, recién llegados y ofertas comparten forma; cambia el título por defecto. */
const productsFields = (title: string) =>
  ({
    title: field.string(title),
    productIds: field.strings('id', 60),
    carousel: field.boolean(true),
  }) as const;

const promoBannerItem = {
  image: field.media(),
  mobileImage: field.media(),
  alt: field.string(),
  title: field.string(),
  description: field.text(),
  buttonText: field.string(),
  link: field.url(),
  newTab: field.boolean(false),
  show: field.boolean(true),
} as const;

/** Los fallbacks son el render de antes: 3 columnas (2 en tablet), 16:9, texto abajo con degradé. */
const promoBannersFields = {
  title: field.string(),
  banners: field.items(promoBannerItem, 12),
  fullWidth: field.boolean(false),
  columns: field.enum(['1', '2', '3', '4'], '3'),
  columnsMobile: field.enum(['1', '2'], '1'),
  ratio: field.enum(BANNER_RATIOS, '16x9'),
  /** En celular (una columna angosta) un banner más alto deja lugar al texto. `same` = la misma. */
  ratioMobile: field.enum(['same', ...BANNER_RATIOS], 'same'),
  textPosition: field.enum(TEXT_POSITIONS, 'bottom-left'),
  overlay: field.enum(OVERLAYS, 'medium'),
} as const;

const categoryBannerItem = {
  image: field.media(),
  alt: field.string(),
  title: field.string(),
  link: field.url(),
  newTab: field.boolean(false),
  show: field.boolean(true),
} as const;

/**
 * En celular van de a 2 (antes, 1 por fila: cuatro categorías ocupaban dos
 * pantallas de scroll). El resto, como antes: cuadradas, 3 por fila, nombre
 * centrado sobre la foto oscurecida.
 */
const categoryBannersFields = {
  title: field.string(),
  banners: field.items(categoryBannerItem, 12),
  fullWidth: field.boolean(false),
  columns: field.enum(['2', '3', '4', '5', '6'], '3'),
  columnsMobile: field.enum(['1', '2'], '2'),
  ratio: field.enum(BANNER_RATIOS, '1x1'),
  textPosition: field.enum(TEXT_POSITIONS, 'center'),
  overlay: field.enum(OVERLAYS, 'medium'),
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
  mobileImage: field.media(),
  alt: field.string(),
  newTab: field.boolean(false),
  imagePosition: field.enum(['left', 'right'], 'left'),
  /** En celular las columnas se apilan: qué va primero. */
  mobileOrder: field.enum(['image', 'text'], 'image'),
  verticalAlign: field.enum(['top', 'center', 'bottom'], 'center'),
  /** `original` = la proporción de la foto, con un alto máximo. */
  ratio: field.enum(['original', '16x9', '4x3', '1x1', '4x5', '3x4'], 'original'),
  /** Recuadro detrás del texto. Con texto claro sobre una página clara, la tienda pone uno oscuro. */
  textBackground: field.enum(['none', 'subtle', 'accent', 'dark'], 'none'),
  buttonStyle: field.enum(['solid', 'outline', 'link'], 'solid'),
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
  logos: field.items(
    { image: field.media(), name: field.string(), link: field.url(), newTab: field.boolean(false) },
    40,
  ),
  /** `auto`: fijos y centrados con 4 o menos, en movimiento con más (como antes). */
  layout: field.enum(['auto', 'marquee', 'grid'], 'auto'),
  speed: field.enum(['slow', 'normal', 'fast'], 'normal'),
  grayscale: field.boolean(false),
} as const;

/* ---- El tipo de la data de cada sección (normalizada: todos los campos presentes) ---- */

export type HeroVideoData = DataOf<typeof heroVideoFields>;
export type CarouselData = DataOf<typeof carouselFields>;
export type ProductsData = DataOf<ReturnType<typeof productsFields>>;
export type CarouselSlide = CarouselData['slides'][number];
export type PromoBannersData = DataOf<typeof promoBannersFields>;
export type PromoBannerItem = PromoBannersData['banners'][number];
export type CategoryBannersData = DataOf<typeof categoryBannersFields>;
export type CategoryBannerItem = CategoryBannersData['banners'][number];
/** Nombres de antes (cuando las dos grillas compartían forma). */
export type BannersData = PromoBannersData;
export type BannerItem = PromoBannerItem;
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
export type BrandLogo = BrandsData['logos'][number];

/** Tipo de sección → tipo de su data. */
export interface SectionDataMap {
  'hero-video': HeroVideoData;
  carousel: CarouselData;
  featured: ProductsData;
  'new-products': ProductsData;
  'sale-products': ProductsData;
  'promo-banners': PromoBannersData;
  'category-banners': CategoryBannersData;
  institutional: InstitutionalData;
  'image-text': ImageTextData;
  'info-bar': InfoBarData;
  newsletter: NewsletterData;
  instagram: InstagramData;
  testimonials: TestimonialsData;
  faq: FaqData;
  brands: BrandsData;
}

/* ---- El registro ---- */

/** Un banner de ejemplo (el editor pide la foto). */
const promoBanner = (title: string, description: string): PromoBannerItem => ({
  image: '',
  mobileImage: '',
  alt: '',
  title,
  description,
  buttonText: '',
  link: '/productos',
  newTab: false,
  show: true,
});
const categoryBanner = (title: string): CategoryBannerItem => ({
  image: '',
  alt: '',
  title,
  link: '/productos',
  newTab: false,
  show: true,
});

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
    description: 'Fotos grandes a todo el ancho que se pasan solas, con texto y link en cada una.',
    group: 'Imágenes',
    wireframe: 'hero',
    fields: carouselFields,
    // Sin diapositivas, el storefront muestra una portada con el nombre de la tienda.
    defaults: { slides: [] },
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
    fields: promoBannersFields,
    defaults: {
      banners: [
        promoBanner('Hasta 30% off', 'En productos seleccionados'),
        promoBanner('Envío gratis', 'En compras desde un monto mínimo'),
        promoBanner('Nuevos ingresos', 'Lo último que llegó'),
      ],
    },
    limits: {},
    keywords: 'promociones ofertas campañas imagenes publicidad',
  }),
  'category-banners': define({
    type: 'category-banners',
    label: 'Banners de categorías',
    previewLabel: 'los banners de categorías',
    description: 'Una imagen por categoría, con su nombre encima, que lleva a esa categoría.',
    group: 'Imágenes',
    wireframe: 'banners',
    fields: categoryBannersFields,
    defaults: {
      banners: [categoryBanner('Novedades'), categoryBanner('Más vendidos'), categoryBanner('Ofertas')],
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
      ratio: '4x3',
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
    defaults: { title: 'Marcas que vendemos', logos: [] },
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
} satisfies Record<SectionType, SectionDefinition>;

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
  return (
    def ? normalizeFields(def.fields, upgradeSectionData(section.type, section.data)) : {}
  ) as SectionDataMap[T];
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
    data: normalizeFields(def.fields, upgradeSectionData(type, { ...clone(def.defaults), ...data })),
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
      ? normalizeFields(def.fields, upgradeSectionData(r.type, r.data))
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
