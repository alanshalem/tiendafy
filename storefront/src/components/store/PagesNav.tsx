'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useCart } from './cart';
import { usePreviewHref } from './preview';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:5080';

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
    fetch(`${API}/api/v1/pages/published`, { headers: { 'X-Tenant-Id': tenantId } })
      .then((r) => r.json())
      .then((d) => setPages(d.items ?? []))
      .catch(() => {});
  }, [tenantId]);

  if (pages.length === 0) return null;

  return (
    <>
      {pages.map((p) => (
        <Link key={p.id} href={href(`/paginas/${p.slug}`)} className="opacity-90 hover:opacity-100">
          {p.title}
        </Link>
      ))}
    </>
  );
}
