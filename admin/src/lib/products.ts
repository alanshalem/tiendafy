import { api, ApiRequestError } from './api';

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

/**
 * Un ajuste absoluto de stock (`PUT /inventory/{id}`) viaja con el disponible
 * que vio quien lo cargó (`expectedAvailable`): si en el medio se vendió o
 * entró mercadería, el backend no pisa nada y responde 409 Stock.Changed con
 * un mensaje que ya dice cuánto hay ahora.
 */
export const isStockChanged = (e: unknown): e is ApiRequestError =>
  e instanceof ApiRequestError && e.error.code === 'Stock.Changed';

/** El stock actual de una variante (sin fila de stock es 0), o null si no se pudo leer. */
export async function fetchStock(variantId: string): Promise<StockItem | null> {
  try {
    const { items } = await api.get<{ items: StockItem[] }>(`/api/v1/inventory/?variantIds=${variantId}`);
    return items.find((x) => x.variantId === variantId) ?? { variantId, available: 0, reserved: 0 };
  } catch {
    return null;
  }
}
