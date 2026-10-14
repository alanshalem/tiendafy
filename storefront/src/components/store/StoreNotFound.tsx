'use client';

import Link from 'next/link';
import { PredictiveSearch } from './PredictiveSearch';
import { StoreDiscovery } from './StoreDiscovery';
import { usePreviewHref } from './preview';

/**
 * El 404 dentro de la tienda: con su encabezado, su pie y un buscador, y por
 * dónde seguir (lo más buscado, las categorías, lo más vendido, lo visto).
 * Importa sobre todo durante la mudanza desde Tiendanube: los links viejos
 * que circulan llegan acá, y una página en blanco era una venta perdida.
 */
export function StoreNotFound({ whatsappPhone }: { whatsappPhone?: string }) {
  const href = usePreviewHref();
  return (
    <main className="mx-auto max-w-container px-4 pb-16 pt-10">
      <div className="mx-auto max-w-xl text-center">
        <p
          aria-hidden="true"
          className="select-none text-[5rem] font-black leading-none tracking-tighter opacity-10 sm:text-[7rem]"
        >
          404
        </p>
        <h1 className="-mt-2 text-2xl font-bold" style={{ fontFamily: 'var(--font-heading)' }}>
          No encontramos esta página
        </h1>
        <p className="mt-2 text-sm text-fg-muted">
          El enlace puede estar roto o la página se movió. Buscá lo que querías o seguí por acá abajo.
        </p>
        <PredictiveSearch variant="page" align="start" placeholder="¿Qué estás buscando?" className="mt-6" />
        <Link
          href={href('/')}
          className="mt-4 inline-flex min-h-10 items-center text-sm font-semibold text-primary-ink hover:underline"
        >
          Volver al inicio
        </Link>
      </div>
      <div className="mt-12">
        <StoreDiscovery whatsappPhone={whatsappPhone} />
      </div>
    </main>
  );
}
