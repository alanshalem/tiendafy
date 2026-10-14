import type { MoneyDto } from '@tiendafy/types';
import type { CartLine } from '@/components/store/cart';
import { API_URL, tenantHeaders } from './api-client';

/**
 * El carrito guarda el precio del momento en que se agregó cada producto, y el
 * checkout cobra el de hoy (el backend nunca confía en el precio del
 * navegador). Sin repreciar, el comprador veía un total, el formulario de pago
 * se armaba con ese total y el cobro salía por otro. Esto trae lo vigente y
 * dice qué cambió.
 */

/** Lo vigente de una variante según la API (ver GET /products/variants). */
export interface VariantSnapshot {
  variantId: string;
  price: MoneyDto;
  available: number;
}

export interface PriceChange {
  variantId: string;
  productName: string;
  /** centavos */
  from: number;
  to: number;
  currency: string;
}

/**
 * Disponibilidad por variante, después de consultar: número = unidades,
 * null = ya no se vende (no existe o se despublicó).
 */
export type Availability = Record<string, number | null>;

export type LineIssue = { kind: 'gone' } | { kind: 'out' } | { kind: 'short'; available: number };

/**
 * Precio y stock vigentes de esas variantes. null si no se pudo saber (sin
 * red, API vieja, error): en ese caso se sigue con lo guardado — el backend
 * igual cobra el precio vigente y rechaza lo que no tenga stock.
 */
export async function fetchVariantSnapshots(
  tenantId: string,
  variantIds: string[],
): Promise<Map<string, VariantSnapshot> | null> {
  const ids = [...new Set(variantIds)];
  if (ids.length === 0) return new Map();
  try {
    const res = await fetch(
      `${API_URL}/api/v1/products/variants?ids=${ids.map(encodeURIComponent).join(',')}`,
      // Con un tope: es una verificación, no puede dejar el carrito colgado.
      { headers: tenantHeaders(tenantId), signal: AbortSignal.timeout(8000) },
    );
    if (!res.ok) return null;
    const data = (await res.json()) as { items?: VariantSnapshot[] };
    if (!Array.isArray(data?.items)) return null;
    return new Map(data.items.map((i) => [i.variantId, i]));
  } catch {
    return null;
  }
}

/** Aplica lo vigente a las líneas: precios nuevos, qué cambió y qué hay. */
export function reprice(
  lines: CartLine[],
  snapshots: Map<string, VariantSnapshot>,
): { lines: CartLine[]; changes: PriceChange[]; availability: Availability } {
  const changes: PriceChange[] = [];
  const availability: Availability = {};
  const next = lines.map((l) => {
    const snap = snapshots.get(l.variantId);
    availability[l.variantId] = snap ? snap.available : null;
    if (!snap || (snap.price.amount === l.priceAmount && snap.price.currency === l.currency)) return l;
    changes.push({
      variantId: l.variantId,
      productName: l.productName,
      from: l.priceAmount,
      to: snap.price.amount,
      currency: snap.price.currency,
    });
    return { ...l, priceAmount: snap.price.amount, currency: snap.price.currency };
  });
  return { lines: next, changes, availability };
}

/**
 * Suma avisos nuevos a los que ya se mostraron, por variante: si el precio
 * cambió dos veces se avisa del primero al último, y si volvió al original
 * el aviso se va.
 */
export function mergePriceChanges(prev: PriceChange[], incoming: PriceChange[]): PriceChange[] {
  const byId = new Map(prev.map((c) => [c.variantId, c]));
  for (const c of incoming) {
    const before = byId.get(c.variantId);
    byId.set(c.variantId, before ? { ...c, from: before.from } : c);
  }
  return [...byId.values()].filter((c) => c.from !== c.to);
}

/** Qué impide comprar esta línea, si algo (sin consultar todavía: nada). */
export function lineIssue(line: CartLine, availability: Availability | null): LineIssue | null {
  if (!availability || !(line.variantId in availability)) return null;
  const available = availability[line.variantId];
  if (available === null || available === undefined) return { kind: 'gone' };
  if (available <= 0) return { kind: 'out' };
  if (available < line.quantity) return { kind: 'short', available };
  return null;
}

/** El aviso de una línea con problema, en palabras de comprador. */
export function issueText(issue: LineIssue): string {
  switch (issue.kind) {
    case 'gone':
      return 'Ya no está a la venta. Quitalo para seguir.';
    case 'out':
      return 'Se quedó sin stock. Quitalo para seguir.';
    case 'short':
      return issue.available === 1
        ? 'Queda 1 sola unidad. Bajá la cantidad para seguir.'
        : `Quedan ${issue.available} unidades. Bajá la cantidad para seguir.`;
  }
}
