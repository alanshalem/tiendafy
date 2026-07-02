/** Estado vacío cuando no hay tienda activa. Texto por defecto compartido; algunas
 *  vistas pasan un mensaje más específico. */
export function NoStoreSelected({ message = 'Elegí una tienda arriba.' }: { message?: string }) {
  return <p className="py-16 text-center text-sm text-fg-muted">{message}</p>;
}
