import type { Metadata } from 'next';
import Link from 'next/link';

import { resolveTenant } from '@/lib/tenancy';
import { fetchPublishedTheme } from '@/lib/theme';
import { NOT_INDEXED } from '@/lib/seo';
import { StorefrontView } from '@/components/store/StorefrontView';
import { StoreNotFound } from '@/components/store/StoreNotFound';

/** Con el nombre de la tienda: antes la pestaña del 404 decía "Tienda online". */
export async function generateMetadata(): Promise<Metadata> {
  const tenant = await resolveTenant().catch(() => null);
  const title = 'Página no encontrada';
  return { title: { absolute: tenant ? `${title} · ${tenant.name}` : title }, robots: NOT_INDEXED };
}

/**
 * La pantalla de 404, adentro de la tienda: encabezado, pie, buscador y por
 * dónde seguir (ver StoreNotFound). Antes era una página blanca sin nada de
 * la tienda, justo adonde llegan los links viejos de Tiendanube.
 *
 * Next la arma en CADA página (va lista en la respuesta, por si hace falta),
 * así que no puede costar pedidos a la API: la tienda y su diseño salen de la
 * Data Cache (los mismos que ya pidió el layout), y lo que se busca adentro
 * (lo más vendido, lo visto) lo pide el navegador recién cuando se muestra.
 * Las redirecciones que cargó el comercio se buscan donde nace el 404 (ver
 * lib/redirects.ts), no acá.
 *
 * En construcción (o sin tienda, o sin diseño) queda la pantalla sola: la
 * tienda no se muestra hasta abrir.
 */
export default async function NotFound() {
  const tenant = await resolveTenant().catch(() => null);
  const theme = tenant ? await fetchPublishedTheme(tenant.id).catch(() => null) : null;
  if (!tenant || !theme || theme.comingSoon.enabled) return <BareNotFound />;

  const whatsapp = theme.whatsappButton?.enabled ? theme.whatsappButton.phone || undefined : undefined;
  return (
    <StorefrontView tenantId={tenant.id} tenantName={tenant.name} theme={theme} products={[]}>
      <StoreNotFound whatsappPhone={whatsapp} />
    </StorefrontView>
  );
}

function BareNotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-4 text-center">
      <span className="select-none text-[7rem] font-black leading-none tracking-tighter opacity-10 sm:text-[10rem]">
        404
      </span>
      <h1 className="-mt-4 text-2xl font-bold">Esta página no existe</h1>
      <p className="mt-2 max-w-sm text-sm text-fg-muted">
        El enlace puede estar roto o la página fue movida. Volvé al inicio y seguí comprando.
      </p>
      <Link
        href="/"
        className="mt-7 inline-flex items-center rounded-full bg-fg px-6 py-2.5 text-sm font-semibold text-bg transition-transform hover:scale-[1.03]"
      >
        Volver al inicio
      </Link>
    </main>
  );
}
