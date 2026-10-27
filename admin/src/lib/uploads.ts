/**
 * Qué se puede subir en cada lugar del panel, y cómo tiene que ser para que
 * la tienda se vea bien.
 *
 * Antes cada pantalla escribía a mano sus formatos y tamaños en un párrafo
 * distinto, y nadie miraba el archivo antes de mandarlo: un GIF o una foto
 * de 12 MB viajaban enteros para que el servidor los rechazara al final. Acá
 * vive una ficha por lugar; la pantalla solo dice "esto es un logo".
 *
 * Los límites copian los del servidor (S3MediaStorage, InvoiceScanner, los
 * endpoints de importación). Si cambian allá, cambian acá.
 */

const MB = 1024 * 1024;

interface FileFormat {
  /** Cómo se lo nombra al comercio: "JPG", "PDF". */
  label: string;
  mimes: readonly string[];
  /** Con punto. Windows a veces no informa el tipo de un .csv o un .zip: se reconoce por la extensión. */
  exts: readonly string[];
}

const FORMATS = {
  jpg: { label: 'JPG', mimes: ['image/jpeg'], exts: ['.jpg', '.jpeg'] },
  png: { label: 'PNG', mimes: ['image/png'], exts: ['.png'] },
  webp: { label: 'WebP', mimes: ['image/webp'], exts: ['.webp'] },
  avif: { label: 'AVIF', mimes: ['image/avif'], exts: ['.avif'] },
  svg: { label: 'SVG', mimes: ['image/svg+xml'], exts: ['.svg'] },
  mp4: { label: 'MP4', mimes: ['video/mp4'], exts: ['.mp4'] },
  webm: { label: 'WebM', mimes: ['video/webm'], exts: ['.webm'] },
  pdf: { label: 'PDF', mimes: ['application/pdf'], exts: ['.pdf'] },
  zip: {
    label: 'ZIP',
    mimes: ['application/zip', 'application/x-zip-compressed'],
    exts: ['.zip'],
  },
  csv: {
    label: 'CSV',
    mimes: ['text/csv', 'application/vnd.ms-excel'],
    exts: ['.csv'],
  },
} as const satisfies Record<string, FileFormat>;

type FormatKey = keyof typeof FORMATS;

/** Fotos que acepta /media (las que la tienda sabe mostrar). */
const PHOTO: FormatKey[] = ['jpg', 'png', 'webp', 'avif'];

export interface UploadSpec {
  formats: readonly FormatKey[];
  /** Peso máximo por formato (el SVG tiene un tope propio en el servidor). */
  maxBytes: Partial<Record<FormatKey, number>> & { default?: number };
  /**
   * Tamaño al que se muestra, en píxeles. Menos que esto se ve borroso en
   * pantallas de alta densidad; mucho más solo pesa.
   */
  ideal?: { width: number; height: number };
  /**
   * Cómo ocupa la tienda su lugar: `cover` llena el recuadro y recorta lo que
   * sobra (banners, fotos de producto); `contain` entra entera (logos).
   */
  fit?: 'cover' | 'contain';
  /** Una línea con el consejo que más cambia el resultado. */
  tip?: string;
  /** A partir de acá se avisa que va a tardar en celular (no se bloquea). */
  heavyBytes?: number;
  /** Cuántos archivos entran en total (un producto lleva hasta 10 fotos). */
  maxFiles?: number;
}

/** Imágenes y videos de la tienda: el endpoint /media. */
const MEDIA_LIMITS = { default: 5 * MB, svg: 1 * MB, mp4: 20 * MB, webm: 20 * MB };
/** La portada en un celular con datos: a partir de acá se nota. */
const HEAVY_IMAGE = 600 * 1024;
const HEAVY_VIDEO = 5 * MB;

export const UPLOADS = {
  logo: {
    formats: [...PHOTO, 'svg'],
    maxBytes: MEDIA_LIMITS,
    ideal: { width: 575, height: 230 },
    fit: 'contain',
    tip: 'Horizontal y con fondo transparente (PNG o SVG). El SVG se ve nítido en cualquier pantalla.',
    heavyBytes: HEAVY_IMAGE,
  },
  favicon: {
    formats: [...PHOTO, 'svg'],
    maxBytes: MEDIA_LIMITS,
    ideal: { width: 180, height: 180 },
    fit: 'contain',
    tip: 'Cuadrado y simple: se ve muy chico en la pestaña del navegador.',
    heavyBytes: 200 * 1024,
  },
  // El QR de "Data Fiscal" de ARCA para el pie de la tienda: se muestra chico,
  // pero tiene que poder escanearse.
  dataFiscalQr: {
    formats: PHOTO,
    maxBytes: MEDIA_LIMITS,
    ideal: { width: 240, height: 240 },
    fit: 'contain',
    tip: 'La imagen del QR que te da ARCA, recortada y sin bordes: tiene que poder escanearse.',
    heavyBytes: 200 * 1024,
  },
  shareImage: {
    formats: PHOTO,
    maxBytes: MEDIA_LIMITS,
    ideal: { width: 1200, height: 630 },
    fit: 'cover',
    tip: 'La muestran WhatsApp, Instagram y Facebook al compartir el link. Sin SVG: las redes no lo leen.',
    heavyBytes: HEAVY_IMAGE,
  },
  heroVideoWebm: {
    formats: ['webm'],
    maxBytes: MEDIA_LIMITS,
    ideal: { width: 1920, height: 1080 },
    fit: 'cover',
    tip: 'Loop corto (5 a 12 segundos), sin audio y bien comprimido.',
    heavyBytes: HEAVY_VIDEO,
  },
  heroVideoMp4: {
    formats: ['mp4'],
    maxBytes: MEDIA_LIMITS,
    ideal: { width: 1920, height: 1080 },
    fit: 'cover',
    tip: 'El mismo video que el WebM: lo usan iPhone y Safari.',
    heavyBytes: HEAVY_VIDEO,
  },
  /** Video vertical para celular: uno solo, en MP4 (lo reproducen todos los celulares). */
  heroVideoMobile: {
    formats: ['mp4'],
    maxBytes: MEDIA_LIMITS,
    ideal: { width: 720, height: 1280 },
    fit: 'cover',
    tip: 'Vertical (9:16), corto y sin audio. En celular cada MB cuenta: cuanto más liviano, mejor.',
    heavyBytes: 3 * MB,
  },
  heroPoster: {
    formats: PHOTO,
    maxBytes: MEDIA_LIMITS,
    ideal: { width: 1920, height: 1080 },
    fit: 'cover',
    tip: 'Un cuadro del video: se ve mientras carga, con conexión lenta y a quien pide menos movimiento.',
    heavyBytes: HEAVY_IMAGE,
  },
  heroPosterMobile: {
    formats: PHOTO,
    maxBytes: MEDIA_LIMITS,
    ideal: { width: 1080, height: 1620 },
    fit: 'cover',
    tip: 'Vertical: en celular el hero es más alto que ancho.',
    heavyBytes: HEAVY_IMAGE,
  },
  /** Con el alto "según la imagen" del carrusel (1580×600); con otro alto, ver carouselIdeal. */
  carousel: {
    formats: PHOTO,
    maxBytes: MEDIA_LIMITS,
    ideal: { width: 1580, height: 600 },
    fit: 'cover',
    tip: 'Dejá lo importante en el centro: según la pantalla se recortan los bordes.',
    heavyBytes: HEAVY_IMAGE,
  },
  carouselMobile: {
    formats: PHOTO,
    maxBytes: MEDIA_LIMITS,
    ideal: { width: 1080, height: 1350 },
    fit: 'cover',
    tip: 'Para celular: vertical o cuadrada, con lo importante en el centro.',
    heavyBytes: HEAVY_IMAGE,
  },
  /** La foto al lado del texto (media columna en computadora); con otra proporción, ver imageTextIdeal. */
  imageText: {
    formats: PHOTO,
    maxBytes: MEDIA_LIMITS,
    ideal: { width: 1200, height: 900 },
    fit: 'cover',
    heavyBytes: HEAVY_IMAGE,
  },
  imageTextMobile: {
    formats: PHOTO,
    maxBytes: MEDIA_LIMITS,
    ideal: { width: 1080, height: 1350 },
    fit: 'cover',
    tip: 'Para celular, donde la foto va a todo el ancho arriba o abajo del texto.',
    heavyBytes: HEAVY_IMAGE,
  },
  /** 3 columnas en 16:9 (lo de siempre); con otras opciones, ver bannerIdeal. */
  promoBanner: {
    formats: PHOTO,
    maxBytes: MEDIA_LIMITS,
    ideal: { width: 1080, height: 610 },
    fit: 'cover',
    tip: 'El texto lo pone la tienda encima: subí la foto sin letras.',
    heavyBytes: HEAVY_IMAGE,
  },
  promoBannerMobile: {
    formats: PHOTO,
    maxBytes: MEDIA_LIMITS,
    ideal: { width: 1080, height: 1080 },
    fit: 'cover',
    tip: 'Para celular: más alta que la de computadora, así el texto no tapa la foto.',
    heavyBytes: HEAVY_IMAGE,
  },
  categoryBanner: {
    formats: PHOTO,
    maxBytes: MEDIA_LIMITS,
    ideal: { width: 830, height: 830 },
    fit: 'cover',
    tip: 'El nombre de la categoría va encima: mejor una foto sin letras.',
    heavyBytes: HEAVY_IMAGE,
  },
  newsletterImage: {
    formats: PHOTO,
    maxBytes: MEDIA_LIMITS,
    ideal: { width: 280, height: 320 },
    fit: 'cover',
    heavyBytes: HEAVY_IMAGE,
  },
  testimonialPhoto: {
    formats: PHOTO,
    maxBytes: MEDIA_LIMITS,
    ideal: { width: 200, height: 200 },
    fit: 'cover',
    tip: 'Se muestra en un círculo chico: con la cara centrada alcanza.',
    heavyBytes: 200 * 1024,
  },
  brandLogo: {
    formats: [...PHOTO, 'svg'],
    maxBytes: MEDIA_LIMITS,
    // La tienda lo muestra entero en un lugar de 144×48 (3:1).
    ideal: { width: 300, height: 100 },
    fit: 'contain',
    tip: 'Apaisados y con fondo transparente (PNG o SVG).',
    heavyBytes: 200 * 1024,
  },
  comingSoon: {
    formats: PHOTO,
    maxBytes: MEDIA_LIMITS,
    ideal: { width: 1920, height: 1080 },
    fit: 'cover',
    heavyBytes: HEAVY_IMAGE,
  },
  productImage: {
    formats: PHOTO,
    maxBytes: MEDIA_LIMITS,
    ideal: { width: 1200, height: 1200 },
    fit: 'cover',
    tip: 'Cuadradas y con el producto centrado: la tienda las muestra en una grilla pareja.',
    heavyBytes: HEAVY_IMAGE,
    maxFiles: 10, // Product.MaxImages
  },
  pageImage: {
    formats: PHOTO,
    maxBytes: MEDIA_LIMITS,
    ideal: { width: 1200, height: 800 },
    fit: 'contain',
    tip: 'Ocupa el ancho del texto: con 1200 px de ancho alcanza.',
    heavyBytes: HEAVY_IMAGE,
  },
  /** Adjuntos del chat posventa: van al bucket privado. */
  supportAttachment: {
    formats: ['pdf', 'jpg', 'png'],
    maxBytes: { default: 10 * MB },
  },
  /** La factura del proveedor para leerla con IA. */
  invoiceScan: {
    formats: ['pdf', 'jpg', 'png', 'webp'],
    maxBytes: { default: 10 * MB },
    tip: 'Una foto derecha y bien iluminada se lee mejor que un escaneo torcido.',
  },
  /** Carga masiva de fotos: cada imagen, como en /media; la subida entera, hasta 1 GB (el tope de la API). */
  bulkImages: {
    formats: [...PHOTO, 'zip', 'csv'],
    maxBytes: { default: 5 * MB, zip: 1024 * MB, csv: 25 * MB },
    ideal: { width: 1200, height: 1200 },
    tip: 'El nombre de cada foto tiene que ser el identificador de URL del producto.',
  },
  /** El CSV de productos. Kestrel corta el cuerpo a los 30 MB; 20.000 líneas pesan mucho menos. */
  productCsv: {
    formats: ['csv'],
    maxBytes: { default: 25 * MB },
    tip: 'Hasta 20.000 líneas por archivo.',
  },
  /** Ícono propio de la barra de información (envíos, pagos…): se ve a 28 px. */
  infoIcon: {
    formats: ['png', 'svg', 'webp'],
    maxBytes: MEDIA_LIMITS,
    ideal: { width: 96, height: 96 },
    fit: 'contain',
    tip: 'Cuadrado y con fondo transparente (PNG o SVG).',
    heavyBytes: 100 * 1024,
  },
  /* ---- Secciones de la portada de la fase 2 ---- */
  popupImage: {
    formats: PHOTO,
    maxBytes: MEDIA_LIMITS,
    ideal: { width: 960, height: 540 },
    fit: 'cover',
    tip: 'Apaisada: arriba del título del pop-up en computadoras.',
    heavyBytes: HEAVY_IMAGE,
  },
  popupImageMobile: {
    formats: PHOTO,
    maxBytes: MEDIA_LIMITS,
    ideal: { width: 800, height: 600 },
    fit: 'cover',
    tip: 'Opcional: si no la subís, en celular va la otra.',
    heavyBytes: HEAVY_IMAGE,
  },
  sectionImage: {
    formats: PHOTO,
    maxBytes: MEDIA_LIMITS,
    ideal: { width: 1200, height: 1200 },
    fit: 'cover',
    tip: 'Con lo importante en el centro: según la pantalla se recortan los bordes.',
    heavyBytes: HEAVY_IMAGE,
  },
  columnIcon: {
    formats: [...PHOTO, 'svg'],
    maxBytes: MEDIA_LIMITS,
    ideal: { width: 160, height: 160 },
    fit: 'contain',
    tip: 'Un ícono o logo simple, con fondo transparente (PNG o SVG).',
    heavyBytes: 200 * 1024,
  },
  sectionVideo: {
    formats: ['mp4'],
    maxBytes: MEDIA_LIMITS,
    ideal: { width: 1280, height: 720 },
    fit: 'cover',
    tip: 'MP4 bien comprimido: lo ven todos los navegadores, también iPhone.',
    heavyBytes: HEAVY_VIDEO,
  },
} satisfies Record<string, UploadSpec>;

export type UploadKind = keyof typeof UPLOADS;

/* ------------------------------------------------------------ medidas según cómo se muestra */

/*
 * Algunas fotos se muestran distinto según lo que elige el comercio (la
 * proporción del banner, cuántas columnas, el alto del carrusel). La medida
 * recomendada sale de esa misma elección: la que se ve en la tienda. Las
 * cuentas usan el contenedor de la tienda (1280 px, 1248 útiles), el doble de
 * píxeles para pantallas de alta densidad y un celular de 390 px (×3 = 1080).
 */

export interface IdealSize {
  width: number;
  height: number;
}

/** "16x9" → 16/9. */
function ratioValue(ratio: string): number {
  const [w, h] = ratio.split('x').map(Number);
  return w && h ? w / h : 16 / 9;
}

const round10 = (n: number) => Math.round(n / 10) * 10;
const sized = (width: number, ratio: number): IdealSize => ({
  width: round10(width),
  height: round10(width / ratio),
});

/** Ancho útil del contenedor de la tienda en computadora. */
const CONTENT_WIDTH = 1248;
/** Un celular grande en píxeles reales. */
const PHONE_PX = 1080;

/**
 * Banner de una grilla: el ancho de una columna en computadora (al doble),
 * pero nunca menos que lo que ocupa en el celular. Con foto propia de
 * celular, la de computadora ya no tiene que cubrir el teléfono.
 */
export function bannerIdeal(opts: {
  ratio: string;
  columns: number;
  columnsMobile: number;
  fullWidth: boolean;
  hasMobileImage?: boolean;
}): IdealSize {
  const desktop = ((opts.fullWidth ? 1440 : CONTENT_WIDTH) / opts.columns) * 2;
  const mobile = opts.hasMobileImage ? 0 : PHONE_PX / opts.columnsMobile;
  return sized(Math.min(2400, Math.max(desktop, mobile)), ratioValue(opts.ratio));
}

/** La foto de celular de un banner: el ancho de su columna en el teléfono. */
export function bannerMobileIdeal(ratio: string, columnsMobile: number): IdealSize {
  return sized(PHONE_PX / columnsMobile, ratioValue(ratio));
}

/** Proporción del carrusel en computadora (a 1440 px de ancho) y en celular (a 390 px). */
const CAROUSEL_DESKTOP: Record<string, number> = {
  small: 1440 / 360,
  medium: 1440 / 460,
  large: 1440 / 600,
  full: 16 / 9,
  adapt: 1580 / 600,
};
const CAROUSEL_MOBILE: Record<string, number> = {
  small: 390 / 240,
  medium: 390 / 300,
  large: 390 / 420,
  full: 9 / 16,
  adapt: 4 / 5,
};

/** Foto de computadora de una diapositiva, según el alto elegido. */
export function carouselIdeal(height: string): IdealSize {
  if (height === 'adapt') return UPLOADS.carousel.ideal;
  return sized(1920, CAROUSEL_DESKTOP[height] ?? 1440 / 460);
}

/** Foto de celular de una diapositiva, según el alto en celular (`auto` = el de computadora). */
export function carouselMobileIdeal(heightMobile: string, height: string): IdealSize {
  const h = heightMobile === 'auto' ? height : heightMobile;
  return sized(PHONE_PX, CAROUSEL_MOBILE[h] ?? 390 / 300);
}

/**
 * Imagen y texto: media columna en computadora (~620 px, al doble 1200); sola,
 * sin texto, el contenedor entero. `original` no recorta: 4:3 de referencia.
 */
export function imageTextIdeal(ratio: string, alone: boolean): IdealSize {
  return sized(alone ? 1600 : 1200, ratio === 'original' ? 4 / 3 : ratioValue(ratio));
}

/* ------------------------------------------------------------ lectura de la ficha */

function extOf(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot < 0 ? '' : name.slice(dot).toLowerCase();
}

/** El formato del archivo dentro de la ficha, o null si no es ninguno de los aceptados. */
function formatOf(spec: UploadSpec, file: File): FormatKey | null {
  const type = file.type.toLowerCase();
  const ext = extOf(file.name);
  // Primero por tipo; si el navegador no lo informó (o informó uno genérico),
  // por la extensión.
  for (const key of spec.formats)
    if (type && (FORMATS[key].mimes as readonly string[]).includes(type)) return key;
  for (const key of spec.formats) if ((FORMATS[key].exts as readonly string[]).includes(ext)) return key;
  return null;
}

function maxBytesOf(spec: UploadSpec, format: FormatKey): number {
  return spec.maxBytes[format] ?? spec.maxBytes.default ?? Number.POSITIVE_INFINITY;
}

/** El `accept` del input: tipos y extensiones, para que el diálogo ofrezca lo que sirve. */
export function acceptOf(spec: UploadSpec): string {
  return spec.formats.flatMap((key) => [...FORMATS[key].mimes, ...FORMATS[key].exts]).join(',');
}

export function sizeLabel(bytes: number): string {
  if (bytes >= MB) {
    const mb = bytes / MB;
    return `${Number.isInteger(mb) ? mb : mb.toFixed(1)} MB`;
  }
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function listLabel(items: string[]): string {
  return items.length <= 1 ? (items[0] ?? '') : `${items.slice(0, -1).join(', ')} o ${items.at(-1)}`;
}

/** Lo que la ficha muestra antes de elegir: formatos, peso y tamaño ideal. */
export function describe(spec: UploadSpec): {
  formats: string;
  weight: string | null;
  ideal: string | null;
  count: string | null;
} {
  // "Hasta 5 MB (SVG: 1 MB)": el tope de la mayoría, y aparte los formatos que
  // se salen de esa regla, agrupados por tope.
  const bySize = new Map<number, string[]>();
  for (const f of spec.formats) {
    const size = maxBytesOf(spec, f);
    bySize.set(size, [...(bySize.get(size) ?? []), FORMATS[f].label]);
  }
  const [main] = [...bySize.entries()].sort((a, b) => b[1].length - a[1].length)[0]!;
  const limitLabel = (bytes: number) => (Number.isFinite(bytes) ? sizeLabel(bytes) : 'sin límite');
  const exceptions = [...bySize.entries()]
    .filter(([size]) => size !== main)
    .map(([size, labels]) => `${labels.join(', ')}: ${limitLabel(size)}`);
  return {
    formats: spec.formats.map((f) => FORMATS[f].label).join(' · '),
    weight: Number.isFinite(main)
      ? `Hasta ${sizeLabel(main)}${exceptions.length ? ` (${exceptions.join(', ')})` : ''}`
      : null,
    ideal: spec.ideal ? `Ideal ${spec.ideal.width}×${spec.ideal.height} px` : null,
    count: spec.maxFiles ? `Máximo ${spec.maxFiles}` : null,
  };
}

/* ------------------------------------------------------------ revisión del archivo */

/**
 * Lo que impide subirlo: formato que el servidor no acepta, archivo vacío o
 * demasiado pesado. Se revisa antes de mandar nada.
 */
export function rejectReason(spec: UploadSpec, file: File): string | null {
  const format = formatOf(spec, file);
  if (!format) {
    const ext = extOf(file.name).slice(1).toUpperCase();
    const what = ext ? `Es un archivo ${ext}` : 'Ese tipo de archivo no se puede subir';
    return `${what}. Acá se puede subir ${listLabel(spec.formats.map((f) => FORMATS[f].label))}.`;
  }
  if (file.size === 0) return 'El archivo está vacío.';
  const max = maxBytesOf(spec, format);
  if (file.size > max)
    return `Pesa ${sizeLabel(file.size)} y el máximo para ${FORMATS[format].label} es ${sizeLabel(max)}.${
      format === 'jpg' || format === 'png' ? ' Exportala con menos calidad o en WebP.' : ''
    }`;
  return null;
}

interface Dimensions {
  width: number;
  height: number;
}

/** Medidas reales de una imagen elegida, o null si no es una imagen que el navegador pueda leer. */
export function readDimensions(file: File): Promise<Dimensions | null> {
  if (!file.type.startsWith('image/') || file.type === 'image/svg+xml') return Promise.resolve(null);
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    const done = (value: Dimensions | null) => {
      URL.revokeObjectURL(url);
      resolve(value);
    };
    img.onload = () => done(img.naturalWidth ? { width: img.naturalWidth, height: img.naturalHeight } : null);
    img.onerror = () => done(null);
    img.src = url;
  });
}

/** Tolerancia: por debajo de 3/4 del tamaño ideal ya se nota borroso. */
const SHARP_ENOUGH = 0.75;
/** Diferencia de proporción a partir de la cual el recorte se come algo que importa. */
const CROP_TOLERANCE = 0.2;

/**
 * Lo que conviene saber aunque se pueda subir: que se va a ver borrosa, que
 * se va a recortar o que pesa tanto que tarda en celular. No bloquea: a veces
 * no hay otra foto, y decide el comercio.
 */
export function adviceFor(spec: UploadSpec, file: File, dims: Dimensions | null): string[] {
  const advice: string[] = [];
  const ideal = spec.ideal;
  if (dims && ideal) {
    const sx = dims.width / ideal.width;
    const sy = dims.height / ideal.height;
    // `cover` llena el recuadro: alcanza con que el lado más justo no llegue.
    // `contain` entra entera: se ve borrosa solo si NINGÚN lado llega.
    const scale = spec.fit === 'contain' ? Math.max(sx, sy) : Math.min(sx, sy);
    if (scale < SHARP_ENOUGH)
      advice.push(
        `Mide ${dims.width}×${dims.height} px y se muestra a ${ideal.width}×${ideal.height}: se va a ver borrosa.`,
      );
    if (spec.fit === 'cover') {
      const ratio = dims.width / dims.height / (ideal.width / ideal.height);
      if (ratio > 1 + CROP_TOLERANCE || ratio < 1 / (1 + CROP_TOLERANCE))
        advice.push(
          `Es más ${ratio > 1 ? 'ancha' : 'alta'} que el lugar (${ideal.width}×${ideal.height}): se van a recortar los ${
            ratio > 1 ? 'costados' : 'bordes de arriba y abajo'
          }.`,
        );
    }
  }
  if (spec.heavyBytes && file.size > spec.heavyBytes)
    advice.push(
      `Pesa ${sizeLabel(file.size)}: en celular con datos móviles tarda en cargar. Conviene que pese menos de ${sizeLabel(spec.heavyBytes)}.`,
    );
  return advice;
}
