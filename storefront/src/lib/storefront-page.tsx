import { Suspense, type ReactNode } from 'react';
import { loadStorefront, type StorefrontData } from './storefront';
import { resolvePageTheme, type ThemeConfig } from './theme';
import { ComingSoon } from '@/components/store/ComingSoon';
import { StorefrontView } from '@/components/store/StorefrontView';
import { PageSkeleton } from '@/components/store/Skeletons';

/**
 * Resuelve lo común de toda página interna del storefront: tienda + tema
 * (draft si `?preview=1` con token válido) + el gate de "tienda en construcción". Devuelve un
 * `fallback` listo para renderizar, o los datos resueltos.
 *
 * La home (`/`) NO usa esto: tiene branches propios (eliminada / suspendida).
 */
type StorefrontPage =
  | { ok: false; fallback: ReactNode }
  | { ok: true; data: StorefrontData; theme: ThemeConfig; preview: boolean };

export async function resolveStorefrontPage(
  searchParams: Promise<{ preview?: string; pt?: string }>,
  { products = true }: { products?: boolean } = {},
): Promise<StorefrontPage> {
  const data = await loadStorefront({ products });
  if (!data) return { ok: false, fallback: <div className="p-10 text-center">Tienda no encontrada.</div> };

  const { theme, preview } = await resolvePageTheme(data.tenant.id, await searchParams);

  if (!preview && theme.comingSoon.enabled) {
    return {
      ok: false,
      fallback: <ComingSoon theme={theme} tenantName={data.tenant.name} tenantId={data.tenant.id} />,
    };
  }

  return { ok: true, data, theme, preview };
}

type ResolvedPage = { data: StorefrontData; theme: ThemeConfig; preview: boolean };

/**
 * Esqueleto de una página interna: resolveStorefrontPage + StorefrontView, que
 * antes se copiaba idéntico en cada ruta. `children` recibe lo resuelto y
 * devuelve el contenido específico (puede ser async, ej. fetch por slug).
 *
 * El marco (encabezado, pie, carrito) sale apenas se conoce la tienda y su
 * diseño; el contenido llega después, en un <Suspense> con `fallback` en su
 * lugar. Así lo que tarde se ve como un esqueleto ADENTRO de la tienda, y no
 * como una página en blanco.
 */
export async function StorefrontPageShell({
  searchParams,
  catalogProducts = true,
  fallback = <PageSkeleton />,
  children,
}: {
  searchParams: Promise<{ preview?: string; pt?: string }>;
  /** false = la página no necesita el catálogo (ej. checkout). */
  catalogProducts?: boolean;
  /** Lo que se ve mientras llega el contenido. */
  fallback?: ReactNode;
  children: (page: ResolvedPage) => ReactNode | Promise<ReactNode>;
}) {
  const resolved = await resolveStorefrontPage(searchParams, { products: catalogProducts });
  if (!resolved.ok) return resolved.fallback;
  const { data, theme, preview } = resolved;

  return (
    <StorefrontView
      tenantId={data.tenant.id}
      tenantName={data.tenant.name}
      theme={theme}
      products={data.products}
      live={preview}
    >
      <Suspense fallback={fallback}>
        <ShellContent render={children} page={{ data, theme, preview }} />
      </Suspense>
    </StorefrontView>
  );
}

/** El contenido de la página, aparte para que su espera quede dentro del Suspense. */
async function ShellContent({
  render,
  page,
}: {
  render: (page: ResolvedPage) => ReactNode | Promise<ReactNode>;
  page: ResolvedPage;
}) {
  return <>{await render(page)}</>;
}
