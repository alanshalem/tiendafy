import { api } from './api';

interface ProductsPage<T> {
  items: T[];
  nextCursor: string | null;
  hasMore: boolean;
}

export interface StockItem {
  variantId: string;
  available: number;
  reserved: number;
}

/** Trae TODOS los productos del tenant recorriendo el cursor (la API tope 100 por página). */
export async function fetchAllProducts<T>(): Promise<T[]> {
  const all: T[] = [];
  let after: string | null = null;
  for (;;) {
    const url: string = `/api/v1/products?limit=100${after ? `&after=${after}` : ''}`;
    const page: ProductsPage<T> = await api.get<ProductsPage<T>>(url);
    all.push(...page.items);
    if (!page.hasMore || !page.nextCursor) break;
    after = page.nextCursor;
  }
  return all;
}

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
