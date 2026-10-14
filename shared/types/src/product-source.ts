/**
 * De dónde salen los productos de una sección de la portada (destacados,
 * recién llegados, ofertas…). Es el contrato entre el editor (que lo guarda en
 * `section.data.source`), la tienda (que lo pide) y la API, que lo resuelve en
 * `GET /api/v1/products/section` con los mismos nombres de parámetros.
 */

/** Los mismos órdenes que la búsqueda del storefront. */
export type ProductSourceSort = 'newest' | 'price_asc' | 'price_desc' | 'name';

export type ProductSource =
  /** Los que eligió el comercio, en su orden. Los no publicados se descartan. */
  | { kind: 'manual'; ids: string[] }
  /** Una categoría; por defecto también sus subcategorías. */
  | { kind: 'category'; categoryId: string; includeChildren?: boolean; sort?: ProductSourceSort }
  /** Una marca, sin distinguir mayúsculas. */
  | { kind: 'brand'; brand: string; sort?: ProductSourceSort }
  /** Lo último que se cargó. */
  | { kind: 'newest' }
  /** Con precio tachado mayor al de venta, de todo el catálogo. */
  | { kind: 'on-sale'; sort?: ProductSourceSort }
  /** Lo más vendido (unidades de ventas cobradas) en los últimos `days` días. */
  | { kind: 'best-sellers'; days?: number };

export type ProductSourceKind = ProductSource['kind'];

/** Cuántos productos muestra una sección: más de 24 ya no es una vidriera. */
export const PRODUCT_SOURCE_LIMIT = { min: 1, max: 24, default: 8 } as const;

/** Ventana de "más vendidos", en días. */
export const BEST_SELLERS_DAYS = { min: 1, max: 365, default: 30 } as const;

/** Lo mismo que acepta la API en `ids`: más que esto se ignora. */
const MAX_IDS = 100;

const SORTS: readonly ProductSourceSort[] = ['newest', 'price_asc', 'price_desc', 'name'];

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;
const clampInt = (v: number, min: number, max: number) => Math.min(max, Math.max(min, Math.round(v)));

/** Un límite válido (1–24) a partir de lo que venga guardado; si no sirve, `fallback`. */
export function clampProductLimit(raw: unknown, fallback: number = PRODUCT_SOURCE_LIMIT.default): number {
  const n = typeof raw === 'number' && Number.isFinite(raw) ? raw : fallback;
  return clampInt(n, PRODUCT_SOURCE_LIMIT.min, PRODUCT_SOURCE_LIMIT.max);
}

function sortOf(raw: unknown): { sort?: ProductSourceSort } {
  return SORTS.includes(raw as ProductSourceSort) ? { sort: raw as ProductSourceSort } : {};
}

function idsOf(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const ids = raw
    .filter((id): id is string => typeof id === 'string' && id.trim() !== '')
    .map((id) => id.trim());
  return [...new Set(ids)].slice(0, MAX_IDS);
}

/**
 * Un origen válido a partir de lo que venga guardado en el tema (JSON que
 * editó una persona, o un borrador viejo): null si no se puede resolver, y
 * quien lo usa cae a su default. Descarta campos de más y valores inválidos.
 */
export function normalizeProductSource(raw: unknown): ProductSource | null {
  if (!isRecord(raw)) return null;
  switch (raw.kind) {
    case 'manual':
      return { kind: 'manual', ids: idsOf(raw.ids) };
    case 'category': {
      if (typeof raw.categoryId !== 'string' || !raw.categoryId.trim()) return null;
      return {
        kind: 'category',
        categoryId: raw.categoryId.trim(),
        ...(raw.includeChildren === false ? { includeChildren: false } : {}),
        ...sortOf(raw.sort),
      };
    }
    case 'brand': {
      if (typeof raw.brand !== 'string' || !raw.brand.trim()) return null;
      return { kind: 'brand', brand: raw.brand.trim(), ...sortOf(raw.sort) };
    }
    case 'newest':
      return { kind: 'newest' };
    case 'on-sale':
      return { kind: 'on-sale', ...sortOf(raw.sort) };
    case 'best-sellers':
      return typeof raw.days === 'number' && Number.isFinite(raw.days)
        ? { kind: 'best-sellers', days: clampInt(raw.days, BEST_SELLERS_DAYS.min, BEST_SELLERS_DAYS.max) }
        : { kind: 'best-sellers' };
    default:
      return null;
  }
}

/**
 * Query string de `GET /api/v1/products/section` (sin el `?`). Siempre con
 * los parámetros en el mismo orden: es también la clave de la caché, y el
 * mismo origen tiene que dar la misma URL.
 */
export function productSourceQuery(source: ProductSource, limit?: number): string {
  const qs = new URLSearchParams({ kind: source.kind });
  switch (source.kind) {
    case 'manual':
      qs.set('ids', source.ids.join(','));
      break;
    case 'category':
      qs.set('categoryId', source.categoryId);
      if (source.includeChildren === false) qs.set('includeChildren', 'false');
      break;
    case 'brand':
      qs.set('brand', source.brand);
      break;
    case 'best-sellers':
      if (source.days != null) qs.set('days', String(source.days));
      break;
  }
  if ('sort' in source && source.sort) qs.set('sort', source.sort);
  qs.set('limit', String(clampProductLimit(limit)));
  return qs.toString();
}

/** Las secciones de la portada que muestran una lista de productos. */
export const PRODUCT_SECTION_TYPES = ['featured', 'new-products', 'sale-products'] as const;
export type ProductSectionType = (typeof PRODUCT_SECTION_TYPES)[number];

/** Qué pedir para una sección: el origen, cuántos, y a qué recurrir si vuelve vacío. */
export interface SectionProductPlan {
  source: ProductSource;
  limit: number;
  /** Si el origen no trae nada (una tienda sin ventas todavía), se pide este. */
  fallback?: ProductSource;
}

/**
 * Lo que muestra cada tipo de sección cuando el comercio no eligió nada:
 * destacados = lo más vendido (y si todavía no hay ventas, lo último), recién
 * llegados = lo último, ofertas = las ofertas de todo el catálogo.
 */
export function defaultProductSource(
  type: ProductSectionType,
): Pick<SectionProductPlan, 'source' | 'fallback'> {
  switch (type) {
    case 'featured':
      return { source: { kind: 'best-sellers' }, fallback: { kind: 'newest' } };
    case 'new-products':
      return { source: { kind: 'newest' } };
    case 'sale-products':
      return { source: { kind: 'on-sale' } };
  }
}

/**
 * El plan de una sección de productos, o null si la sección no es de
 * productos. Prioridad: `data.source` (lo que guarda el editor) → los
 * `data.productIds` de antes (elegidos a mano) → el default del tipo.
 * `data.limit` manda; sin él, una lista a mano muestra todo lo elegido (hasta
 * 24) y el resto 8.
 */
export function sectionProductPlan(section: {
  type: string;
  data: Record<string, unknown>;
}): SectionProductPlan | null {
  if (!(PRODUCT_SECTION_TYPES as readonly string[]).includes(section.type)) return null;
  const data = isRecord(section.data) ? section.data : {};

  const explicit = normalizeProductSource(data.source);
  const legacyIds = idsOf(data.productIds);
  const base =
    explicit ??
    (legacyIds.length > 0
      ? { source: { kind: 'manual', ids: legacyIds } as ProductSource }
      : defaultProductSource(section.type as ProductSectionType));
  const plan: Pick<SectionProductPlan, 'source' | 'fallback'> = 'kind' in base ? { source: base } : base;

  const manualSize = plan.source.kind === 'manual' ? plan.source.ids.length : 0;
  const limit = clampProductLimit(data.limit, manualSize > 0 ? manualSize : PRODUCT_SOURCE_LIMIT.default);
  return { ...plan, limit };
}
