import type { ReactNode } from 'react';
import { loadStorefront, type StorefrontData } from './storefront';
import { fetchDraftTheme, fetchPublishedTheme, type ThemeConfig } from './theme';
import { ComingSoon } from '@/components/store/ComingSoon';
import { StorefrontView } from '@/components/store/StorefrontView';

/**
 * Resuelve lo común de toda página interna del storefront: tienda + tema
 * (draft si `?preview=1`) + el gate de "tienda en construcción". Devuelve un
 * `fallback` listo para renderizar, o los datos resueltos.
 *
 * La home (`/`) NO usa esto: tiene branches propios (eliminada / suspendida).
 */
type StorefrontPage =
  | { ok: false; fallback: ReactNode }
  | { ok: true; data: StorefrontData; theme: ThemeConfig; preview: boolean };

export async function resolveStorefrontPage(
  searchParams: Promise<{ preview?: string; pt?: string }>,
): Promise<StorefrontPage> {
  const data = await loadStorefront();
  if (!data) return { ok: false, fallback: <div className="p-10 text-center">Tienda no encontrada.</div> };

  const sp = await searchParams;
  const preview = sp.preview === '1';
  const theme = preview
    ? await fetchDraftTheme(data.tenant.id, sp.pt)
    : await fetchPublishedTheme(data.tenant.id);

  if (!preview && theme.comingSoon.enabled) {
    return {
      ok: false,
      fallback: <ComingSoon theme={theme} tenantName={data.tenant.name} tenantId={data.tenant.id} />,
    };
  }

  return { ok: true, data, theme, preview };
}

/**
 * Esqueleto de una página interna: resolveStorefrontPage + StorefrontView, que
 * antes se copiaba idéntico en cada ruta. `children` recibe lo resuelto y
 * devuelve el contenido específico (puede ser async, ej. fetch por slug).
 */
export async function StorefrontPageShell({
  searchParams,
  catalogProducts = true,
  children,
}: {
  searchParams: Promise<{ preview?: string; pt?: string }>;
  /** false = la página no necesita el catálogo (ej. checkout). */
  catalogProducts?: boolean;
  children: (page: {
    data: StorefrontData;
    theme: ThemeConfig;
    preview: boolean;
  }) => ReactNode | Promise<ReactNode>;
}) {
  const resolved = await resolveStorefrontPage(searchParams);
  if (!resolved.ok) return resolved.fallback;
  const { data, theme, preview } = resolved;

  return (
    <StorefrontView
      tenantId={data.tenant.id}
      tenantName={data.tenant.name}
      theme={theme}
      products={catalogProducts ? data.products : []}
      live={preview}
    >
      {await children({ data, theme, preview })}
    </StorefrontView>
  );
}
