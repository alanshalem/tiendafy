/**
 * Piezas compartidas por los botones de envío de la venta (Correo Argentino,
 * Zipnova): antes vivían duplicadas verbatim en cada componente.
 */
import type { MoneyDto } from '@tiendafy/types';
import { parseMoneyInput } from './price';

/** Subconjunto de la orden que necesitan los flujos de envío. */
export interface ShippingOrderLike {
  id: string;
  buyerEmail: string;
  buyerName: string | null;
  buyerPhone: string | null;
  docNumber?: string | null;
  shippingMethod: string | null;
  shippingAddress: string | null;
  total: MoneyDto;
  /** Número de seguimiento cargado en la venta (Correo Argentino no lo devuelve al dar de alta). */
  tracking?: string | null;
}

/** "Av. Corrientes 1234, 2B, CABA, CP 1043" → campos sueltos (mejor esfuerzo). */
export function parseAddress(raw: string | null): {
  street: string;
  number: string;
  city: string;
  cp: string;
} {
  const out = { street: '', number: '', city: '', cp: '' };
  if (!raw) return out;
  const parts = raw.split(',').map((p) => p.trim());
  const cpPart = parts.find((p) => /^CP\s/i.test(p));
  if (cpPart) out.cp = cpPart.replace(/^CP\s*/i, '');
  const streetPart = parts[0] ?? '';
  const m = streetPart.match(/^(.*?)\s+(\d+[a-zA-Z]?)$/);
  if (m) {
    out.street = m[1] ?? '';
    out.number = m[2] ?? '';
  } else {
    out.street = streetPart;
  }
  const rest = parts.slice(1).filter((p) => !/^CP\s/i.test(p));
  out.city = rest[rest.length - 1] ?? '';
  return out;
}

/** Valor declarado sugerido: el total de la orden en pesos enteros. */
export const declaredValueFromOrder = (order: ShippingOrderLike): string =>
  String(Math.round(order.total.amount / 100));

/**
 * El valor declarado que escribió la persona, en pesos, con el lector de
 * importes del panel: "50.000" son cincuenta mil (con `Number` eran 50) y
 * "50000,50" lleva sus centavos (antes era 0). Lo que no se entiende, 0.
 */
export function parseDeclaredValue(text: string): number {
  const pesos = parseMoneyInput(text) / 100;
  return Number.isFinite(pesos) && pesos > 0 ? pesos : 0;
}

/** Botón secundario chico de las acciones de envío en la fila de la venta. */
export const shipmentTriggerCls =
  'inline-flex h-8 items-center gap-1.5 rounded-md border border-border-strong bg-surface px-3 text-xs font-semibold text-fg hover:bg-bg-muted';
