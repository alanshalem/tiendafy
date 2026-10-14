/** Formatos compartidos (@tiendafy/types): plata, números y fechas, con el locale en un solo lugar. */
import { formatNumber } from '@tiendafy/types';

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

/**
 * Porcentaje con coma decimal: 38.7 → "38,7 %". Cada pantalla armaba el suyo
 * con un template (`${n}%`) y el punto decimal en inglés se colaba ("38.7%").
 * Recibe el número ya en porcentaje (38.7), no la fracción (0.387): así llegan
 * todos los que manda el backend.
 */
export function formatPercent(value: number, decimals = 1): string {
  return `${formatNumber(value, { maximumFractionDigits: decimals })} %`;
}

/**
 * Importe en unidades (no centavos) con dos decimales fijos: "USD 26.106,50".
 * Para montos que el backend manda como decimal —el FOB de una compra, un
 * renglón de factura escaneada—. `formatNumber` a secas dejaba "26.106,5",
 * que se lee como un error de tipeo.
 */
export function formatAmount(amount: number, currency?: string): string {
  const n = formatNumber(amount, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return currency ? `${currency} ${n}` : n;
}

/**
 * Centavos → texto para poblar un campo de importe, con separador de miles:
 * 11718700 → "117.187", 150050 → "1.500,50". Lo lee de vuelta
 * `parseMoneyInput` (lib/price), que entiende el punto como miles.
 */
export function formatMoneyInput(cents: number): string {
  const units = cents / 100;
  return formatNumber(units, {
    minimumFractionDigits: Number.isInteger(units) ? 0 : 2,
    maximumFractionDigits: 2,
  });
}
