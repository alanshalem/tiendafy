import Image from 'next/image';
import { Tag } from 'lucide-react';
import { formatMoney } from '@tiendafy/types';
import type { LineIssue } from '@/lib/cart-pricing';
import { LineIssueText, type CartLine, type StoredCoupon } from './cart';
import { INPUT_10 } from './styles';
import { PriceWithoutTaxes } from './StoreLegalInfo';

/**
 * El resumen del pedido del checkout: líneas, subtotal, descuentos, envío,
 * total y el campo del cupón. Solo dibuja: las cuentas vienen hechas (ver
 * lib/checkout-totals) y el estado vive en CheckoutClient.
 *
 * En el celular va arriba del formulario y se abre con la barra "Ver
 * resumen"; en la compu, al costado siempre.
 */
export function CheckoutSummary({
  id,
  open,
  lines,
  issues,
  onRemove,
  currency,
  subtotal,
  coupon,
  discount,
  offlineDiscount,
  offlinePct,
  cash,
  hasShipping,
  quotedShipping,
  freeByAmount,
  shipCost,
  total,
  couponInput,
  onCouponInput,
  onApplyCoupon,
  couponError,
}: {
  /** El id que apunta la barra "Ver resumen" (aria-controls). */
  id: string;
  /** Abierto en el celular (en la compu se ve siempre). */
  open: boolean;
  lines: CartLine[];
  issues: Record<string, LineIssue>;
  onRemove: (variantId: string) => void;
  currency: string;
  subtotal: number;
  coupon: StoredCoupon | null;
  discount: number;
  offlineDiscount: number;
  offlinePct: number;
  /** Paga en efectivo (si no, el descuento a mano es por transferencia). */
  cash: boolean;
  hasShipping: boolean;
  /** El envío antes del cupón de envío gratis. */
  quotedShipping: number;
  /** El medio propio elegido no se cobra por el monto de la compra. */
  freeByAmount: boolean;
  shipCost: number;
  total: number;
  couponInput: string;
  onCouponInput: (value: string) => void;
  onApplyCoupon: () => void;
  couponError: string | null;
}) {
  return (
    <aside
      id={id}
      aria-label="Resumen del pedido"
      className={`order-first h-fit rounded-lg border border-fg/10 p-4 text-sm lg:sticky lg:top-6 lg:order-none lg:block ${
        open ? 'block' : 'hidden'
      }`}
    >
      {lines.map((l) => (
        <div key={l.variantId} className="py-1.5">
          <div className="flex items-center gap-3">
            {l.image && (
              <Image
                src={l.image}
                alt=""
                width={48}
                height={48}
                className="h-12 w-12 rounded-md object-cover"
              />
            )}
            <span className="flex-1">
              {l.productName}
              {l.variantLabel && l.variantLabel !== 'Única' ? ` · ${l.variantLabel}` : ''} × {l.quantity}
            </span>
            <span className="tabular-nums">{formatMoney(l.priceAmount * l.quantity, l.currency)}</span>
          </div>
          {issues[l.variantId] && (
            <div className="flex items-start justify-between gap-2">
              <LineIssueText issue={issues[l.variantId]} />
              <button
                type="button"
                onClick={() => onRemove(l.variantId)}
                className="mt-1 shrink-0 text-xs font-semibold text-danger underline"
              >
                Quitar
              </button>
            </div>
          )}
        </div>
      ))}
      <div className="mt-3 space-y-1 border-t border-fg/10 pt-3">
        <div className="flex justify-between">
          <span className="opacity-70">Subtotal</span>
          <span className="tabular-nums">{formatMoney(subtotal, currency)}</span>
        </div>
        {discount > 0 && (
          <div className="flex justify-between text-success">
            <span>Descuento ({coupon?.code})</span>
            <span className="tabular-nums">- {formatMoney(discount, currency)}</span>
          </div>
        )}
        {offlineDiscount > 0 && (
          <div className="flex justify-between text-success">
            <span>
              Descuento por {cash ? 'pago en efectivo' : 'transferencia'} ({offlinePct}%)
            </span>
            <span className="tabular-nums">- {formatMoney(offlineDiscount, currency)}</span>
          </div>
        )}
        {hasShipping && (
          <div className="flex justify-between">
            <span className="opacity-70">
              Costo de envío
              {coupon?.freeShipping && quotedShipping > 0 ? ` (gratis con ${coupon.code})` : ''}
              {!coupon?.freeShipping && freeByAmount ? ' (sin cargo por el monto)' : ''}
            </span>
            <span className="tabular-nums">
              {shipCost === 0 ? 'Gratis' : formatMoney(shipCost, currency)}
            </span>
          </div>
        )}
        <div className="flex justify-between pt-1 text-base font-bold">
          <span>Total</span>
          <span className="tabular-nums">{formatMoney(total, currency)}</span>
        </div>
        <PriceWithoutTaxes amount={total} currency={currency} className="text-right" />
      </div>

      {!coupon && (
        <div className="mt-4">
          <div className="flex gap-2">
            <input
              value={couponInput}
              onChange={(e) => onCouponInput(e.target.value.toUpperCase())}
              placeholder="Cupón de descuento"
              aria-label="Cupón de descuento"
              className={INPUT_10}
            />
            <button
              onClick={() => onApplyCoupon()}
              className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-md border border-fg/30 px-3 text-sm font-semibold"
            >
              <Tag className="h-4 w-4" /> Aplicar
            </button>
          </div>
          {couponError && <p className="mt-1 text-xs text-danger">{couponError}</p>}
        </div>
      )}
    </aside>
  );
}
