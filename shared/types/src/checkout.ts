import type { IsoDateTime, Money } from './common';
import type { Address } from './orders';

/** Espeja Payments.Core (PaymentStatus.cs): máquina de estados explícita. */
export type PaymentStatus =
  | 'PENDING'
  | 'APPROVED'
  | 'REJECTED'
  | 'REFUNDED'
  | 'CHARGED_BACK';

export type CheckoutStatus = 'OPEN' | 'SUBMITTED' | 'COMPLETED' | 'EXPIRED';

export interface CheckoutSession {
  id: string;
  status: CheckoutStatus;
  items: CheckoutItem[];
  email: string | null;
  shippingAddress: Address | null;
  subtotal: Money;
  shippingCost: Money | null;
  tax: Money | null;
  total: Money;
  /** Expira la reserva de stock. */
  expiresAt: IsoDateTime;
}

export interface CheckoutItem {
  variantId: string;
  productName: string;
  variantDescription: string;
  quantity: number;
  /** Precio snapshot al agregar al carrito; se revalida al submit. */
  unitPrice: Money;
}

export interface Payment {
  id: string;
  orderId: string;
  status: PaymentStatus;
  amount: Money;
  provider: 'MERCADO_PAGO';
  /** ID de la transacción en el PSP. */
  providerReference: string | null;
  createdAt: IsoDateTime;
}

/** Respuesta de iniciar pago: URL de redirect al PSP. */
export interface PaymentIntent {
  paymentId: string;
  /** init_point de Mercado Pago. */
  redirectUrl: string;
}
