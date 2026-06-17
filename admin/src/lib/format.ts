/** Formato de plata: centavos → moneda es-AR (sin decimales). Fuente única. */
export const formatMoney = (cents: number, currency = 'ARS'): string =>
  new Intl.NumberFormat('es-AR', { style: 'currency', currency: currency || 'ARS', maximumFractionDigits: 0 }).format(cents / 100);
