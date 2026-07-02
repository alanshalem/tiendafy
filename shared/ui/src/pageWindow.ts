/**
 * Ventana de paginación numérica compacta: 1 … (p-1) p (p+1) … N.
 *
 * Fuente única compartida por storefront y admin (antes duplicada byte-a-byte
 * en `CatalogBrowser` y `Pagination`). `null` es el centinela de elipsis (…).
 */
export function buildPageWindow(page: number, total: number): (number | null)[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const out: (number | null)[] = [1];
  const start = Math.max(2, page - 1);
  const end = Math.min(total - 1, page + 1);
  if (start > 2) out.push(null);
  for (let i = start; i <= end; i++) out.push(i);
  if (end < total - 1) out.push(null);
  out.push(total);
  return out;
}
