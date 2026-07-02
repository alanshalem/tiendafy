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
