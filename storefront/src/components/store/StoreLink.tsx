'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { isExternalHref, safeHref } from '@tiendafy/types';
import { usePreviewHref } from './preview';

/**
 * Un link que cargó el comercio (menú, anuncio, pie): adentro de la tienda va
 * con <Link> (y conserva la vista previa del editor), afuera con <a>. Si el
 * destino no es válido no se dibuja un link roto ni un `href="#"`: queda el
 * texto solo, en un <span>.
 */
export function StoreLink({
  href,
  newTab,
  className,
  onClick,
  children,
}: {
  href: string | undefined;
  newTab?: boolean;
  className?: string;
  onClick?: () => void;
  children: ReactNode;
}) {
  const toHref = usePreviewHref();
  const safe = safeHref(href);
  if (!safe) return <span className={className}>{children}</span>;

  const target = newTab ? '_blank' : undefined;
  // noopener: la pestaña nueva no puede tocar la tienda (window.opener).
  const rel = newTab || isExternalHref(safe) ? 'noopener noreferrer' : undefined;
  if (safe.startsWith('/'))
    return (
      <Link
        href={toHref(safe)}
        target={target}
        rel={newTab ? rel : undefined}
        className={className}
        onClick={onClick}
      >
        {children}
      </Link>
    );
  return (
    <a href={safe} target={target} rel={rel} className={className} onClick={onClick}>
      {children}
    </a>
  );
}
