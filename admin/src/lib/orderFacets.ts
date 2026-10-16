/**
 * Las otras caras de una venta, además del estado del pago (lib/orderStatus):
 * por dónde entró, con qué se cobró y en qué anda el envío. Los valores son
 * los que manda la API (OrderShipping / OrderPayment / Order.Channel) y los
 * nombres, los mismos que la planilla de ventas.
 */

export const ORDER_CHANNEL: Record<string, string> = {
  web: 'Tienda online',
  manual: 'Venta manual',
  quote: 'Presupuesto',
};

export const ORDER_PAYMENT: Record<string, string> = {
  online: 'Pago online',
  cash: 'Efectivo',
  transfer: 'Transferencia',
  cuenta_corriente: 'Cuenta corriente',
};

/** Estado del envío: se deduce del pago y de si se retira, no es un estado aparte. */
export const ORDER_SHIPPING: Record<string, { label: string; tone: 'warning' | 'success' | 'info' }> = {
  'por-despachar': { label: 'Por despachar', tone: 'warning' },
  'por-preparar': { label: 'Preparar para retiro', tone: 'warning' },
  enviada: { label: 'Enviada', tone: 'success' },
  'lista-para-retirar': { label: 'Lista para retirar', tone: 'info' },
};

export const toOptions = (map: Record<string, string | { label: string }>, all: string) => [
  { value: '', label: all },
  ...Object.entries(map).map(([value, v]) => ({ value, label: typeof v === 'string' ? v : v.label })),
];

/**
 * Qué pasa con la plata al reembolsar, según cómo se cobró. Antes el diálogo
 * decía siempre "devuelve el dinero en Mercado Pago", también para una venta
 * en efectivo (la plata la devuelve el comercio) o en cuenta corriente (no
 * hay plata que devolver: baja la deuda). Un pago online vuelve por la
 * pasarela que lo cobró (`gateway`, que dice la API en el historial de
 * reembolsos: Mercado Pago o Payway); mientras no se sabe, sin nombrarla.
 */
export function refundEffect(
  paymentMethod: string | null | undefined,
  paymentId: string | null,
  gateway?: string | null,
): string {
  const method = paymentMethod ?? (paymentId?.startsWith('manual-') ? paymentId.slice(7) : 'online');
  switch (method) {
    case 'cash':
      return 'La venta se cobró en efectivo: el sistema no mueve plata. Queda registrado el reembolso y la devolución la hacés vos.';
    case 'transfer':
      return 'La venta se cobró por transferencia: el sistema no mueve plata. Queda registrado el reembolso y la transferencia de vuelta la hacés vos.';
    case 'cuenta_corriente':
      return 'La venta fue en cuenta corriente: no hay plata que devolver. Se le baja la deuda al cliente por ese importe (queda como nota de crédito en Cuentas corrientes).';
    default:
      if (gateway === 'payway')
        return 'Se devuelve el dinero por Payway a la tarjeta con la que pagó el comprador.';
      if (gateway === 'mercadopago')
        return 'Se devuelve el dinero por Mercado Pago al medio con el que pagó el comprador.';
      return 'Se devuelve el dinero al medio con el que pagó el comprador.';
  }
}
