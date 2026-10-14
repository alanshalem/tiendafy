/**
 * Alertas de stock bajo (GET/PUT /api/v1/stock-alerts/…). La señal es la
 * misma de Compras › Reposición: cobertura contra lead time + colchón, más
 * los mínimos propios que la tienda le pone a una variante.
 */

export type StockAlertMode = 'off' | 'inmediato' | 'diario';

export const MODE_LABEL: Record<StockAlertMode, string> = {
  off: 'Sin avisos por email',
  inmediato: 'Al toque, apenas cruza',
  diario: 'Un resumen por día',
};

export interface LowStockItem {
  variantId: string;
  productId: string | null;
  product: string;
  variant: string;
  sku: string;
  available: number;
  coverageDays: number | null;
  unitsPerDay: number | null;
  suggestedQty: number;
  reorderPoint: number | null;
  /** `reposicion`: se agota antes de que llegue la compra; `minimo`: bajo el mínimo propio. */
  reason: 'reposicion' | 'minimo';
  minUnits: number | null;
  crossedAtUtc: string | null;
  notifiedAtUtc: string | null;
}

export interface LowStockResponse {
  mode: StockAlertMode;
  total: number;
  items: LowStockItem[];
}

export interface StockAlertSettings {
  mode: StockAlertMode;
  digestHour: number;
  lastDigestAtUtc: string | null;
  recipients: { userId: string; name: string; email: string; optedOut: boolean }[];
  me: { receives: boolean; eligible: boolean; optedOut: boolean };
}

export interface StockAlertRule {
  variantId: string;
  product: string;
  variant: string;
  sku: string;
  minUnits: number | null;
  muted: boolean;
}

/** "Remera · Rojo / M", sin la variante única. */
export const itemLabel = (i: { product: string; variant: string }) =>
  i.variant && i.variant !== 'Única' ? `${i.product} · ${i.variant}` : i.product;
