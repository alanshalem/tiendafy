import { Landmark } from 'lucide-react';
import type { OrderView } from '@/lib/orders';

/**
 * Cómo terminar de pagar un pedido que se paga por fuera (transferencia,
 * depósito): los datos de la cuenta y qué hacer con el comprobante. Lo
 * completa la API en `paymentInstructions` según el medio de pago; mientras
 * no venga, no ocupa lugar.
 *
 * Va dentro del resumen del pedido (página de gracias y "Seguí tu pedido"),
 * solo mientras el pago está pendiente: una vez acreditado no hay nada que hacer.
 */
export function OrderPaymentInstructions({
  order,
}: {
  order: Pick<OrderView, 'status' | 'paymentInstructions'>;
}) {
  const info = order.paymentInstructions;
  if (!info?.text?.trim() || order.status !== 'PENDINGPAYMENT') return null;
  return (
    <section
      aria-label="Cómo pagar"
      className="mt-4 rounded-xl border border-[rgb(var(--color-primary)/0.35)] bg-[rgb(var(--color-primary)/0.06)] p-4 text-sm"
    >
      <div className="flex items-center gap-2 font-semibold">
        <Landmark className="h-4 w-4" aria-hidden /> {info.title ?? 'Datos para pagar'}
      </div>
      <p className="mt-2 whitespace-pre-line">{info.text}</p>
    </section>
  );
}
