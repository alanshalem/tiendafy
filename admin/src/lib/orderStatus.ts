/**
 * Mapa canónico de estados de una venta: label + clases del pill, únicos para
 * la tabla de Ventas, las estadísticas y las demos del centro de ayuda (antes
 * cada una tenía su copia y ya habían driftado entre sí).
 */
export const ORDER_STATUS: Record<string, { label: string; cls: string }> = {
  PENDINGPAYMENT: { label: 'Pendiente', cls: 'bg-amber-100 text-amber-700' },
  PAID: { label: 'Pagada', cls: 'bg-green-100 text-green-700' },
  FAILED: { label: 'Fallida', cls: 'bg-red-100 text-red-700' },
  CANCELLED: { label: 'Cancelada', cls: 'bg-gray-100 text-gray-600' },
  REFUNDED: { label: 'Reembolsada', cls: 'bg-blue-100 text-blue-700' },
  PARTIALLYREFUNDED: { label: 'Reembolso parcial', cls: 'bg-sky-100 text-sky-700' },
  CHARGEDBACK: { label: 'Contracargo', cls: 'bg-rose-100 text-rose-700' },
  FULFILLED: { label: 'Enviada', cls: 'bg-green-100 text-green-700' },
};

export const orderStatusLabel = (status: string): string => ORDER_STATUS[status]?.label ?? status;
