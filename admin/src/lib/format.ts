/** Formatos compartidos (@tiendafy/types): plata, números y fechas, con el locale en un solo lugar. */
export { formatMoney, formatNumber, formatDate, formatDateTime } from '@tiendafy/types';

/**
 * "12-ago" para los ejes de los gráficos. Tolera las dos formas en que los
 * endpoints mandan un día: "2026-08-12" (DateOnly) y "2026-08-12T00:00:00Z"
 * (DateTime). Partir por "-" a mano daba "NaN-ago" con la segunda.
 */
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

export function formatDayShort(iso: string): string {
  const [datePart] = iso.split('T');
  const [, month, day] = (datePart ?? '').split('-');
  const m = Number(month);
  const d = Number(day);
  if (!Number.isFinite(m) || !Number.isFinite(d)) return iso;
  return `${d}-${MESES[m - 1] ?? ''}`;
}
