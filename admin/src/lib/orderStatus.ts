import { badgeVariantClass as tone } from '@tiendafy/ui';

/**
 * Mapa canónico de estados de una venta: label + clases del pill, únicos para
 * la tabla de Ventas, las estadísticas y las demos del centro de ayuda (antes
 * cada una tenía su copia y ya habían driftado entre sí).
 *
 * Los colores son los tonos del Badge (tokens semánticos, con modo oscuro):
 * con la paleta cruda de Tailwind, "Pagada" en modo oscuro era un rectángulo
 * verde claro con letra verde clara encima.
 */
export const ORDER_STATUS: Record<string, { label: string; cls: string }> = {
  PENDINGPAYMENT: { label: 'Pendiente', cls: tone.warning },
  PAID: { label: 'Pagada', cls: tone.success },
  FAILED: { label: 'Fallida', cls: tone.danger },
  CANCELLED: { label: 'Cancelada', cls: tone.neutral },
  REFUNDED: { label: 'Reembolsada', cls: tone.info },
  PARTIALLYREFUNDED: { label: 'Reembolso parcial', cls: tone.info },
  CHARGEDBACK: { label: 'Contracargo', cls: tone.danger },
  FULFILLED: { label: 'Enviada', cls: tone.success },
};

export const orderStatusLabel = (status: string): string => ORDER_STATUS[status]?.label ?? status;
