'use client';

import { useEffect, useState } from 'react';
import { useCart } from './cart';
import type { PublishedPage } from './header-menu';

import { clientJsonTenant } from '@/lib/api-client';

/**
 * Páginas institucionales publicadas, o null mientras no llegaron. El menú del
 * encabezado necesita distinguir "todavía no sé" de "no hay ninguna": con
 * null dibuja lo que el comercio guardó (así está en el HTML del servidor) y
 * recién con la lista descarta las que se despublicaron.
 */
export function usePublishedPagesState(): PublishedPage[] | null {
  const { tenantId } = useCart();
  const [pages, setPages] = useState<PublishedPage[] | null>(null);

  useEffect(() => {
    if (!tenantId) return;
    clientJsonTenant<{ items?: PublishedPage[] }>('/api/v1/pages/published', tenantId).then((d) =>
      setPages(d?.items ?? []),
    );
  }, [tenantId]);

  return pages;
}

/** Las mismas páginas como lista (vacía mientras no llegaron). Las usa el pie. */
export function usePublishedPages(): PublishedPage[] {
  return usePublishedPagesState() ?? [];
}
