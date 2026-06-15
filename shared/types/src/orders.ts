import type { IsoDateTime, Money } from './common';

/** Espeja la máquina de estados de Orders.Core (OrderStatus.cs). */
export type OrderStatus =
  | 'PENDING'
  | 'CONFIRMED'
  | 'SHIPPED'
  | 'DELIVERED'
  | 'CANCELED'
  | 'REFUNDED';

export interface Order {
  id: string;
  /** Secuencial por tenant: #1001. */
  orderNumber: number;
  status: OrderStatus;
  customer: OrderCustomer;
  items: OrderItem[];
  subtotal: Money;
  shippingCost: Money;
  tax: Money;
  total: Money;
  shippingAddress: Address | null;
  timeline: OrderEvent[];
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
}

/** Snapshot inmutable al momento de compra — no FK al producto actual. */
export interface OrderItem {
  id: string;
  productId: string;
  variantId: string;
  /** Nombre del producto al momento de la compra. */
  productName: string;
  variantDescription: string;
  sku: string;
  quantity: number;
  /** Precio al momento de la compra. */
  unitPrice: Money;
  lineTotal: Money;
}

export interface OrderCustomer {
  id: string | null;
  email: string;
  name: string;
  phone: string | null;
}

export interface Address {
  line1: string;
  line2: string | null;
  city: string;
  state: string;
  postalCode: string;
  /** ISO 3166-1 alpha-2: "AR", "BR", "MX". */
  country: string;
}

export interface OrderEvent {
  status: OrderStatus;
  note: string | null;
  occurredAt: IsoDateTime;
}
