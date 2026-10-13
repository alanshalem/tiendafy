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

export const MB = 1024 * 1024;

export interface FileFormat {
  /** Cómo se lo nombra al comercio: "JPG", "PDF". */
  label: string;
  mimes: readonly string[];
  /** Con punto. Windows a veces no informa el tipo de un .csv o un .zip: se reconoce por la extensión. */
  exts: readonly string[];
}

export const FORMATS = {
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
  heroPoster: {
    formats: PHOTO,
    maxBytes: MEDIA_LIMITS,
    ideal: { width: 1920, height: 1080 },
    fit: 'cover',
    tip: 'Un cuadro del video: se ve mientras carga y en conexiones lentas.',
    heavyBytes: HEAVY_IMAGE,
  },
  carousel: {
    formats: PHOTO,
    maxBytes: MEDIA_LIMITS,
    ideal: { width: 1580, height: 600 },
    fit: 'cover',
    tip: 'Dejá el texto importante en el centro: en celular se recortan los costados.',
    heavyBytes: HEAVY_IMAGE,
  },
  imageText: {
    formats: PHOTO,
    maxBytes: MEDIA_LIMITS,
    ideal: { width: 1270, height: 300 },
    fit: 'cover',
    heavyBytes: HEAVY_IMAGE,
  },
  promoBanner: {
    formats: PHOTO,
    maxBytes: MEDIA_LIMITS,
    ideal: { width: 620, height: 235 },
    fit: 'cover',
    heavyBytes: HEAVY_IMAGE,
  },
  categoryBanner: {
    formats: PHOTO,
    maxBytes: MEDIA_LIMITS,
    ideal: { width: 620, height: 620 },
    fit: 'cover',
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
    ideal: { width: 300, height: 120 },
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
  /** Carga masiva de fotos: cada imagen sube a /media; el ZIP y el CSV de mapeo no tienen tope propio. */
  bulkImages: {
    formats: [...PHOTO, 'zip', 'csv'],
    maxBytes: { default: 5 * MB, zip: Number.POSITIVE_INFINITY, csv: 25 * MB },
    ideal: { width: 1200, height: 1200 },
    tip: 'El nombre de cada foto tiene que ser el identificador de URL del producto.',
  },
  /** El CSV de productos. Kestrel corta el cuerpo a los 30 MB; 20.000 líneas pesan mucho menos. */
  productCsv: {
    formats: ['csv'],
    maxBytes: { default: 25 * MB },
    tip: 'Hasta 20.000 líneas por archivo.',
  },
} satisfies Record<string, UploadSpec>;

export type UploadKind = keyof typeof UPLOADS;

/* ------------------------------------------------------------ lectura de la ficha */

function extOf(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot < 0 ? '' : name.slice(dot).toLowerCase();
}

/** El formato del archivo dentro de la ficha, o null si no es ninguno de los aceptados. */
export function formatOf(spec: UploadSpec, file: File): FormatKey | null {
  const type = file.type.toLowerCase();
  const ext = extOf(file.name);
  // Primero por tipo; si el navegador no lo informó (o informó uno genérico),
  // por la extensión.
  for (const key of spec.formats)
    if (type && (FORMATS[key].mimes as readonly string[]).includes(type)) return key;
  for (const key of spec.formats) if ((FORMATS[key].exts as readonly string[]).includes(ext)) return key;
  return null;
}

export function maxBytesOf(spec: UploadSpec, format: FormatKey): number {
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

export interface Dimensions {
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
