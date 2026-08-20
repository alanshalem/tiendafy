import { api } from './api';

export interface StockItem {
  variantId: string;
  available: number;
  reserved: number;
}

/** Shape mínimo del catálogo que comparten los typeaheads de variantes. */
export interface CatalogVariant {
  id: string;
  sku: string;
  optionValues: string[];
}

export interface CatalogProduct {
  id: string;
  name: string;
  variants: CatalogVariant[];
}

/** "Remera térmica · M / Negro" — el label canónico de una variante. */
export const variantLabel = (p: { name: string }, v: { optionValues: string[] }): string =>
  `${p.name}${v.optionValues.length ? ` · ${v.optionValues.join(' / ')}` : ''}`;

/** Filtro de búsqueda por nombre de producto o SKU (q ya en minúsculas). */
export const matchesProduct = (p: { name: string; variants: { sku: string }[] }, q: string): boolean =>
  q === '' || p.name.toLowerCase().includes(q) || p.variants.some((v) => v.sku.toLowerCase().includes(q));

/** Stock de muchas variantes, partido en chunks para no pasarse del largo de URL. */
export async function fetchStockChunked(variantIds: string[]): Promise<StockItem[]> {
  if (variantIds.length === 0) return [];
  const chunks: string[][] = [];
  for (let i = 0; i < variantIds.length; i += 60) chunks.push(variantIds.slice(i, i + 60));
  const results = await Promise.all(
    chunks.map((ch) => api.get<{ items: StockItem[] }>(`/api/v1/inventory/?variantIds=${ch.join(',')}`)),
  );
  return results.flatMap((r) => r.items);
}
