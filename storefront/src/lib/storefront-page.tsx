import type { ReactNode } from 'react';
import { loadStorefront, type StorefrontData } from './storefront';
import { fetchDraftTheme, fetchPublishedTheme, type ThemeConfig } from './theme';
import { ComingSoon } from '@/components/store/ComingSoon';

/**
 * Resuelve lo común de toda página interna del storefront: tienda + tema
 * (draft si `?preview=1`) + el gate de "tienda en construcción". Devuelve un
 * `fallback` listo para renderizar, o los datos resueltos.
 *
 * La home (`/`) NO usa esto: tiene branches propios (eliminada / suspendida).
 */
export type StorefrontPage =
  | { ok: false; fallback: ReactNode }
  | { ok: true; data: StorefrontData; theme: ThemeConfig; preview: boolean };

export async function resolveStorefrontPage(searchParams: Promise<{ preview?: string }>): Promise<StorefrontPage> {
  const data = await loadStorefront();
  if (!data) return { ok: false, fallback: <div className="p-10 text-center">Tienda no encontrada.</div> };

  const preview = (await searchParams).preview === '1';
  const theme = preview ? await fetchDraftTheme(data.tenant.id) : await fetchPublishedTheme(data.tenant.id);

  if (!preview && theme.comingSoon.enabled) {
    return { ok: false, fallback: <ComingSoon theme={theme} tenantName={data.tenant.name} /> };
  }

  return { ok: true, data, theme, preview };
}
