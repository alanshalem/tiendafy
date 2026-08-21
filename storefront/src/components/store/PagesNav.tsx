'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useCart } from './cart';
import { usePreviewHref } from './preview';

import { clientJsonTenant } from '@/lib/api-client';

interface Pg {
  id: string;
  title: string;
  slug: string;
}

/**
 * Páginas institucionales publicadas. Se expone como hook porque el menú del
 * encabezado necesita medirlas para decidir cuáles entran, y para eso las
 * necesita como datos y no como links ya dibujados.
 */
export function usePublishedPages(): Pg[] {
  const { tenantId } = useCart();
  const [pages, setPages] = useState<Pg[]>([]);

  useEffect(() => {
    if (!tenantId) return;
    clientJsonTenant<{ items?: Pg[] }>('/api/v1/pages/published', tenantId).then((d) =>
      setPages(d?.items ?? []),
    );
  }, [tenantId]);

  return pages;
}

/** Los mismos links, uno por línea. Lo usa el menú de mano del celular. */
export function PagesNav() {
  const href = usePreviewHref();
  const pages = usePublishedPages();

  if (pages.length === 0) return null;

  return (
    <>
      {pages.map((p) => (
        <Link
          key={p.id}
          href={href(`/paginas/${p.slug}`)}
          className="whitespace-nowrap opacity-90 hover:opacity-100"
        >
          {p.title}
        </Link>
      ))}
    </>
  );
}
