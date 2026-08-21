import Link from 'next/link';
import { headers } from 'next/headers';
import { permanentRedirect } from 'next/navigation';

import { API_URL } from '@/lib/api-client';
import { resolveTenant } from '@/lib/tenancy';

/**
 * Antes de mostrar el 404, se busca si el comercio dejó una redirección para
 * esta URL. Se consulta acá y no en un middleware a propósito: una redirección
 * solo importa cuando la página no existe, así que el tráfico normal no paga
 * ninguna consulta extra.
 */
async function redirectTarget(): Promise<string | null> {
  try {
    const headerList = await headers();
    // Lo deja el middleware: un componente de servidor no puede saber por su
    // cuenta qué URL se pidió.
    const path = headerList.get('x-pathname');
    if (!path) return null;

    const tenant = await resolveTenant();
    if (!tenant) return null;

    const res = await fetch(`${API_URL}/api/v1/redirects/resolve?path=${encodeURIComponent(path)}`, {
      headers: { 'X-Tenant-Id': tenant.id },
      cache: 'no-store',
    });
    if (!res.ok) return null;

    const data = (await res.json()) as { to?: string };
    return data.to ?? null;
  } catch {
    // Una redirección que no se pudo resolver no puede tapar el 404.
    return null;
  }
}

export default async function NotFound() {
  const target = await redirectTarget();
  if (target) permanentRedirect(target);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-4 text-center">
      <div className="relative">
        <span className="select-none text-[7rem] font-black leading-none tracking-tighter opacity-10 sm:text-[10rem]">
          404
        </span>
      </div>
      <h1 className="-mt-4 text-2xl font-bold">Esta página no existe</h1>
      <p className="mt-2 max-w-sm text-sm opacity-60">
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
