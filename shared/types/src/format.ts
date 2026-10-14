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

/**
 * Número (es-AR): `1234567` → "1.234.567". Centraliza el locale como las de al
 * lado; antes la misma decisión estaba repetida ochenta veces en el panel, una
 * por cada contador. `opts` para variar el formato.
 */
export function formatNumber(n: number, opts?: Intl.NumberFormatOptions): string {
  return n.toLocaleString('es-AR', opts);
}

/** Fecha (es-AR). Centraliza el locale; `opts` para variar el formato. */
export function formatDate(iso: string, opts?: Intl.DateTimeFormatOptions): string {
  return new Date(iso).toLocaleDateString('es-AR', opts);
}

/**
 * Fecha + hora (es-AR): "19/8/2026, 16:37". Misma forma de fecha que
 * `formatDate`, para que una pantalla no muestre "12 ago, 04:37 p. m." al lado
 * de "19/8/2026". La hora va en 24 h a la fuerza: según el navegador, es-AR
 * caía en 12 h con "p. m.", que en un comercio nadie lee así.
 */
export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('es-AR', {
    day: 'numeric',
    month: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });
}
