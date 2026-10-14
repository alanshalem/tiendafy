import type { Metadata } from 'next';
import Link from 'next/link';

import { resolveTenant } from '@/lib/tenancy';

/** Con el nombre de la tienda: antes la pestaña del 404 decía "Tienda online". */
export async function generateMetadata(): Promise<Metadata> {
  const tenant = await resolveTenant().catch(() => null);
  const title = 'Página no encontrada';
  return { title: { absolute: tenant ? `${title} · ${tenant.name}` : title } };
}

/**
 * La pantalla de 404. Solo pinta: Next la arma en cada página (va lista en la
 * respuesta, por si hace falta), así que no puede consultar nada. Las
 * redirecciones que cargó el comercio se buscan donde nace el 404 (ver
 * lib/redirects.ts): en las páginas de producto y de contenido, y en la ruta
 * que atrapa lo que no existe (app/[...ruta]).
 */
export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-4 text-center">
      <div className="relative">
        <span className="select-none text-[7rem] font-black leading-none tracking-tighter opacity-10 sm:text-[10rem]">
          404
        </span>
      </div>
      <h1 className="-mt-4 text-2xl font-bold">Esta página no existe</h1>
      <p className="mt-2 max-w-sm text-sm text-fg-muted">
        El enlace puede estar roto o la página fue movida. Volvé al inicio y seguí comprando.
      </p>
      <Link
        href="/"
        className="mt-7 inline-flex items-center rounded-full bg-black px-6 py-2.5 text-sm font-semibold text-white transition-transform hover:scale-[1.03] dark:bg-white dark:text-black"
      >
        Volver al inicio
      </Link>
    </main>
  );
}
