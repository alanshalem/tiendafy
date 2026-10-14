import { useStore } from '../context/StoreContext';
import { LoadError } from './LoadError';

/** Estado vacío cuando no hay tienda activa. Texto por defecto compartido; algunas
 *  vistas pasan un mensaje más específico. */
export function NoStoreSelected({ message = 'Elegí una tienda arriba.' }: { message?: string }) {
  const { loadError, retry } = useStore();
  // Si la lista de tiendas no llegó, no es que falte elegir una.
  if (loadError)
    return (
      <div className="mx-auto max-w-xl py-16">
        <LoadError title="No se pudieron cargar tus tiendas." error={loadError} onRetry={retry} />
      </div>
    );
  return <p className="py-16 text-center text-sm text-fg-muted">{message}</p>;
}
