import {
  productSourceQuery,
  sectionProductPlan,
  type ProductSource,
  type SectionProductPlan,
  type ThemeSection,
} from '@tiendafy/types';
import type { StoreProduct } from '@/components/store/ProductCard';

/**
 * Los productos de las secciones de la portada (destacados, recién llegados,
 * ofertas), resueltos por la API según el origen de cada una. Funciones PURAS:
 * las usan el servidor (lib/storefront) y la vista previa del editor
 * (StorefrontView), cada uno con su fetcher.
 */

/** Productos ya resueltos, por clave de plan (ver `planKey`). */
export type SectionProductsMap = Record<string, StoreProduct[]>;

/** Trae los productos de un origen; null si no se pudo (API caída o sin el endpoint). */
export type SourceFetcher = (source: ProductSource, limit: number) => Promise<StoreProduct[] | null>;

/**
 * Clave estable de un plan: la misma query que va a la API (más el respaldo).
 * Dos secciones con el mismo origen comparten resultado, y una sección cuyo
 * origen no cambió no se vuelve a pedir aunque cambie el resto del tema.
 */
export function planKey(plan: SectionProductPlan): string {
  const main = productSourceQuery(plan.source, plan.limit);
  return plan.fallback ? `${main}|${productSourceQuery(plan.fallback, plan.limit)}` : main;
}

/** Los planes distintos de las secciones de productos (las demás no piden nada). */
export function sectionPlans(sections: ThemeSection[]): Map<string, SectionProductPlan> {
  const plans = new Map<string, SectionProductPlan>();
  for (const s of sections) {
    const plan = sectionProductPlan(s);
    if (plan) plans.set(planKey(plan), plan);
  }
  return plans;
}

/** Lo resuelto para una sección; undefined si no es de productos o todavía no llegó. */
export function productsForSection(
  section: ThemeSection,
  resolved: SectionProductsMap,
): StoreProduct[] | undefined {
  const plan = sectionProductPlan(section);
  return plan ? resolved[planKey(plan)] : undefined;
}

/**
 * Lo resuelto, por id de sección: lo que reciben los renderers (vía
 * `useSectionProducts`). Por id y no por plan porque al render llega la
 * sección ya con los `productIds` de la transición, que cambian su plan.
 */
export function productsBySection(
  sections: ThemeSection[],
  resolved: SectionProductsMap,
): Record<string, StoreProduct[]> {
  const out: Record<string, StoreProduct[]> = {};
  for (const s of sections) {
    const list = productsForSection(s, resolved);
    if (list) out[s.id] = list;
  }
  return out;
}

/**
 * Resuelve un plan: el origen, y si vuelve vacío y hay respaldo, el respaldo
 * (destacados de una tienda que todavía no vendió nada muestra lo último).
 */
export async function resolvePlan(
  plan: SectionProductPlan,
  fetchSource: SourceFetcher,
): Promise<StoreProduct[] | null> {
  const list = await fetchSource(plan.source, plan.limit);
  if (list && list.length === 0 && plan.fallback)
    return (await fetchSource(plan.fallback, plan.limit)) ?? list;
  return list;
}

/** Resuelve todos los planes en paralelo. Los que fallan no van: esa sección queda como antes. */
export async function resolvePlans(
  plans: Map<string, SectionProductPlan>,
  fetchSource: SourceFetcher,
): Promise<SectionProductsMap> {
  const entries = await Promise.all(
    [...plans].map(async ([key, plan]) => [key, await resolvePlan(plan, fetchSource)] as const),
  );
  const out: SectionProductsMap = {};
  for (const [key, list] of entries) if (list) out[key] = list;
  return out;
}

/**
 * Id que no corresponde a ningún producto. El render de hoy, con
 * `productIds` vacío, cae a "los primeros del catálogo": una sección resuelta
 * sin resultados (ofertas sin ofertas) lleva este id para quedar vacía —y
 * oculta— en vez de mostrar cualquier cosa.
 */
export const NO_PRODUCTS_ID = '__tf-sin-productos__';

/**
 * Transición hasta que los renderers lean lo resuelto por su cuenta (con
 * `useSectionProducts`): el render actual elige por `data.productIds` dentro
 * de `products`. Acá cada sección resuelta lleva sus ids en ese campo y los
 * productos se suman a la lista (sin duplicar; lo recién resuelto, con stock,
 * pisa la copia vieja). Las secciones sin resolver quedan como estaban.
 */
export function applySectionProducts(
  sections: ThemeSection[],
  products: StoreProduct[],
  resolved: SectionProductsMap,
): { sections: ThemeSection[]; products: StoreProduct[] } {
  if (Object.keys(resolved).length === 0) return { sections, products };

  const pool = new Map(products.map((p) => [p.id, p]));
  const out = sections.map((s) => {
    const list = productsForSection(s, resolved);
    if (!list) return s;
    for (const p of list) pool.set(p.id, p);
    const productIds = list.length > 0 ? list.map((p) => p.id) : [NO_PRODUCTS_ID];
    return { ...s, data: { ...s.data, productIds } };
  });
  return { sections: out, products: [...pool.values()] };
}
