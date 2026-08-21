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

/** Links a las páginas institucionales publicadas (Sobre nosotros, Términos, etc.). */
export function PagesNav() {
  const { tenantId } = useCart();
  const href = usePreviewHref();
  const [pages, setPages] = useState<Pg[]>([]);

  useEffect(() => {
    if (!tenantId) return;
    clientJsonTenant<{ items?: Pg[] }>('/api/v1/pages/published', tenantId).then((d) =>
      setPages(d?.items ?? []),
    );
  }, [tenantId]);

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
