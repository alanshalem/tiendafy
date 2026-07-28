/**
 * Formateo de dinero único para toda la plataforma (admin + storefront).
 * `amountInMinorUnits` = centavos; se divide por 100 y se muestra sin decimales
 * (convención de precios en ARS). Antes esta lógica estaba duplicada ~9 veces.
 */
export function formatMoney(amountInMinorUnits: number, currency?: string): string {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: currency || 'ARS',
    maximumFractionDigits: 0,
  }).format(amountInMinorUnits / 100);
}

/** Fecha (es-AR). Centraliza el locale; `opts` para variar el formato. */
export function formatDate(iso: string, opts?: Intl.DateTimeFormatOptions): string {
  return new Date(iso).toLocaleDateString('es-AR', opts);
}

/** Fecha + hora corta (es-AR): "05 jul, 14:30". */
export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('es-AR', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}
