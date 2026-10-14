'use client';

import { safeHref } from '@tiendafy/types';
import { cn } from '@tiendafy/ui';
import { StoreLink } from '../StoreLink';

/**
 * El botón de una sección ("Ver productos", "Ver todas las ofertas"…). Sin
 * texto o sin un link válido no se dibuja: un botón que no lleva a ningún
 * lado (el viejo `href="#"`) se toca y no pasa nada. 44 px de alto, para el dedo.
 */
export function SectionButton({
  text,
  link,
  variant = 'primary',
  className,
}: {
  text: string;
  link: string;
  variant?: 'primary' | 'outline';
  className?: string;
}) {
  if (!text.trim() || !safeHref(link)) return null;
  return (
    <StoreLink
      href={link}
      className={cn(
        'inline-flex min-h-11 items-center justify-center rounded-md px-6 text-sm font-semibold transition-opacity hover:opacity-90',
        variant === 'primary' ? 'bg-primary text-primary-fg' : 'border border-current',
        className,
      )}
    >
      {text}
    </StoreLink>
  );
}
