'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { Breadcrumbs, type BreadcrumbItem } from '@tiendafy/ui';
import { usePreviewHref } from './preview';

/**
 * Breadcrumbs del storefront (Inicio › Categoría › Producto): envuelve el
 * componente compartido con next/link y conserva ?preview=1&pt en el editor.
 */
export function StoreBreadcrumbs({ items, className }: { items: BreadcrumbItem[]; className?: string }) {
  const href = usePreviewHref();
  const PreviewLink = ({
    href: to,
    className: cn2,
    children,
  }: {
    href: string;
    className?: string;
    children: ReactNode;
  }) => (
    <Link href={href(to)} className={cn2}>
      {children}
    </Link>
  );
  return <Breadcrumbs items={items} linkComponent={PreviewLink} className={className} />;
}
