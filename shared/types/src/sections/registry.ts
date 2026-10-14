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
import type { ProductSource } from '../product-source';
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

/**
 * Columnas propias de una sección de productos. 'auto' = las del listado
 * (Diseño → Listado de productos), que es lo que hacían todas antes.
 */
export const PRODUCT_SECTION_COLUMNS = ['auto', '2', '3', '4', '5'] as const;
export const PRODUCT_SECTION_MOBILE_COLUMNS = ['auto', '1', '2'] as const;

/**
 * Destacados, recién llegados y ofertas comparten forma; cambia el título por
 * defecto. De dónde salen los productos (`source`) y cuántos (`limit`) no son
 * campos del esquema: los lee `sectionProductPlan` (product-source.ts), que
 * también entiende los `productIds` de antes.
 */
const productsFields = (title: string) =>
  ({
    title: field.string(title),
    productIds: field.strings('id', 60),
    carousel: field.boolean(true),
    subtitle: field.text(),
    columns: field.enum(PRODUCT_SECTION_COLUMNS, 'auto'),
    mobileColumns: field.enum(PRODUCT_SECTION_MOBILE_COLUMNS, 'auto'),
    /** Link "Ver todos" al lado del título. */
    viewAll: field.boolean(false),
    viewAllText: field.string(),
    /** Vacío = automático: el listado que corresponde al origen (categoría, marca, lo nuevo). */
    viewAllLink: field.url(),
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
  /** Botón opcional: sin texto o sin link no se dibuja. */
  buttonText: field.string(),
  link: field.url(),
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
      /** Ícono propio (una imagen chica): si está, va en lugar del ícono del kit. */
      image: field.media(),
    },
    4,
  ),
  /** Cómo se acomodan en el celular: uno abajo del otro, de a dos, o deslizables. */
  mobileLayout: field.enum(['stack', 'grid', 'carousel'], 'stack'),
} as const;

/*
 * Los títulos con texto por defecto lo llevan como `fallback`: una sección
 * vieja sin título se sigue viendo igual, y un título vaciado a propósito
 * oculta el encabezado (como en las secciones de productos).
 */

const newsletterFields = {
  image: field.media(),
  title: field.string('Recibí novedades'),
  text: field.text(),
  /** Apilado (centrado) o partido: imagen a un lado, texto y formulario al otro. */
  layout: field.enum(['stacked', 'split'], 'stacked'),
  /** Lo que se lee al suscribirse. Vacío = el mensaje de siempre. */
  successMessage: field.string(),
  /** Letra chica debajo del formulario (bajas, privacidad). */
  legalText: field.text(),
} as const;

// El video se mete en un <iframe>: es un link más, con las mismas reglas.
const instagramFields = {
  video: field.url(),
  title: field.string(),
  caption: field.text(),
  /** 'auto': vertical para Shorts, horizontal para el resto. */
  aspect: field.enum(['auto', '16:9', '9:16', '1:1'], 'auto'),
} as const;

export const TESTIMONIAL_RATINGS = ['none', '1', '2', '3', '4', '5'] as const;

const testimonialsFields = {
  title: field.string('Lo que dicen nuestros clientes'),
  items: field.items(
    {
      quote: field.text(),
      name: field.string(),
      detail: field.string(),
      photo: field.media(),
      rating: field.enum(TESTIMONIAL_RATINGS, 'none'),
    },
    24,
  ),
  layout: field.enum(['grid', 'carousel'], 'grid'),
} as const;

const faqFields = {
  title: field.string('Preguntas frecuentes'),
  items: field.items({ question: field.string(), answer: field.text() }, 40),
  /** La primera pregunta arranca abierta: muestra que se despliegan. */
  openFirst: field.boolean(false),
} as const;

const brandsFields = {
  title: field.string(),
  images: field.strings('media', 40),
} as const;

/* ---- El tipo de la data de cada sección (normalizada: todos los campos presentes) ---- */

export type HeroVideoData = DataOf<typeof heroVideoFields>;
export type CarouselData = DataOf<typeof carouselFields>;
export type ProductsData = DataOf<ReturnType<typeof productsFields>> & {
  /** Origen de los productos. Crudo (lo escribió una persona): leer con `sectionProductPlan`. */
  source?: ProductSource;
  /** Cuántos (1–24). Crudo: leer con `sectionProductPlan` o `clampProductLimit`. */
  limit?: number;
};
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
}

/* ---- El registro ---- */

const DEFAULT_INFO_ITEMS = [
  { icon: 'shipping', title: 'Envíos a todo el país', description: '', link: '', image: '' },
  { icon: 'card', title: 'Pagá con Mercado Pago', description: '', link: '', image: '' },
  { icon: 'security', title: 'Compra protegida', description: '', link: '', image: '' },
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
    description: 'Lo más vendido, una categoría, una marca o los que elijas, en grilla o carrusel.',
    group: 'Productos',
    wireframe: 'products',
    fields: productsFields('Destacados'),
    defaults: { title: 'Destacados', carousel: true, productIds: [], viewAll: true },
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
    defaults: { title: 'Recién llegados', carousel: true, productIds: [], viewAll: true },
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
    defaults: { title: 'Ofertas', carousel: true, productIds: [], viewAll: true },
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
          rating: 'none',
        },
        {
          quote: 'Las opiniones cortas y concretas convencen más que las largas.',
          name: 'Nombre del cliente',
          detail: 'Ciudad',
          photo: '',
          rating: 'none',
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
