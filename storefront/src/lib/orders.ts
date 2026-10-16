import type { MoneyDto } from '@tiendafy/types';
import { apiUrl, problemMessage, tenantHeaders } from './api-client';

/** Quién lleva el paquete y dónde mirarlo (ver CarrierTrackingLink en la API). */
export interface CarrierTracking {
  carrier: string | null;
  number: string | null;
  url: string | null;
}

interface TimelineStep {
  key: 'received' | 'paid' | 'fulfilled' | 'delivered' | 'cancelled' | 'refunded' | string;
  label: string;
  atUtc: string | null;
  done: boolean;
}

interface OrderViewItem {
  variantId: string;
  productName: string;
  variantDescription: string;
  quantity: number;
  unitPrice: MoneyDto;
  image: string | null;
}

/**
 * Datos para pagar por fuera del checkout (transferencia, depósito). Lo
 * completa la API cuando el medio de pago los necesita; mientras no venga,
 * la página no muestra nada.
 */
interface PaymentInstructions {
  title?: string;
  text: string;
}

/**
 * Lo que ve el comprador de su pedido: el resumen de la página de gracias,
 * "Seguí tu pedido" y el detalle de su cuenta (misma forma en los tres).
 */
export interface OrderView {
  id: string;
  number: number;
  /** "#1042" (o el id corto en un pedido sin número). */
  label: string;
  status: string;
  isPickup: boolean;
  createdAtUtc: string;
  paidAtUtc: string | null;
  fulfilledAtUtc: string | null;
  currency: string;
  paymentProvider: string;
  subtotal: MoneyDto;
  discount: MoneyDto;
  shipping: MoneyDto;
  total: MoneyDto;
  refunded: MoneyDto;
  shippingMethod: string | null;
  pickupAddress: string | null;
  shippingAddress: string | null;
  /** "a**@gmail.com": a qué casilla fue la confirmación. */
  buyerEmailHint: string;
  items: OrderViewItem[];
  tracking: CarrierTracking | null;
  timeline: TimelineStep[];
  canRepent: boolean;
  invoiceAvailable: boolean;
  /** Abre este pedido en /seguimiento sin pedir email ni número. */
  trackingToken: string;
  paymentInstructions?: PaymentInstructions | null;
}

/** Estados de la API en palabras del comprador. */
export function orderStatusLabel(status: string, isPickup = false): string {
  switch (status) {
    case 'PENDINGPAYMENT':
      return 'Pago pendiente';
    case 'PAID':
      return 'Pagado';
    case 'FULFILLED':
      return isPickup ? 'Listo para retirar' : 'Enviado';
    case 'REFUNDED':
      return 'Reembolsado';
    case 'PARTIALLYREFUNDED':
      return 'Reembolso parcial';
    case 'FAILED':
      return 'Pago rechazado';
    case 'CANCELLED':
      return 'Cancelado';
    case 'CHARGEDBACK':
      return 'En disputa';
    default:
      return status;
  }
}

/** "Seguí tu pedido" de ese pedido, con el link firmado (sin pedir datos). */
export const trackingHref = (token: string) => `/seguimiento?t=${encodeURIComponent(token)}`;

/** El arrepentimiento con el número de pedido ya cargado. */
export const repentHref = (number: number | string) =>
  `/arrepentimiento?pedido=${encodeURIComponent(String(number))}`;

type TrackResult = { ok: true; order: OrderView } | { ok: false; error: string };

/**
 * Busca un pedido por email + número, o por el link firmado de los mails.
 * El error es siempre el mismo mensaje de la API ("no encontramos…"): no dice
 * si el email existe.
 */
export async function trackOrder(
  tenantId: string,
  query: { email?: string; number?: string; token?: string },
): Promise<TrackResult> {
  try {
    const res = await fetch(`${apiUrl()}/api/v1/shop/track-order`, {
      method: 'POST',
      headers: tenantHeaders(tenantId, true),
      body: JSON.stringify(query),
    });
    if (res.ok) return { ok: true, order: (await res.json()) as OrderView };
    return {
      ok: false,
      error: await problemMessage(res, 'No pudimos buscar tu pedido. Probá de nuevo en un rato.'),
    };
  } catch {
    return { ok: false, error: 'No pudimos buscar tu pedido. Revisá tu conexión y probá de nuevo.' };
  }
}
