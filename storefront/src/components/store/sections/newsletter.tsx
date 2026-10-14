'use client';

import { cn } from '@tiendafy/ui';
import { NewsletterForm } from '../NewsletterForm';
import { SectionTitle } from '../section-primitives';
import { useSectionStyle } from '../section-context';
import { StoreImage } from '../StoreImage';
import type { SectionRenderProps } from '../section-types';

/**
 * Suscripción a novedades. Apilada (todo centrado) o partida (imagen a un
 * lado, texto y formulario al otro, desde la tablet). El fondo suave de
 * siempre se va si el comercio eligió otro en "Diseño de la sección".
 */
export function NewsletterSection({ data }: SectionRenderProps<'newsletter'>) {
  const style = useSectionStyle();
  const split = data.layout === 'split' && !!data.image;
  const left = style?.align === 'left' || split;
  const body = (
    <div className={cn('min-w-0', left ? 'text-left' : 'text-center')}>
      {data.title && <SectionTitle className="text-xl font-bold wrap-anywhere">{data.title}</SectionTitle>}
      {data.text && (
        <p className={cn('mt-2 max-w-md whitespace-pre-line opacity-70 wrap-anywhere', !left && 'mx-auto')}>
          {data.text}
        </p>
      )}
      <NewsletterForm source="home" align={left ? 'start' : 'center'} successMessage={data.successMessage} />
      {data.legalText && (
        <p
          className={cn(
            'mt-3 max-w-md whitespace-pre-line text-xs text-fg-muted wrap-anywhere',
            !left && 'mx-auto',
          )}
        >
          {data.legalText}
        </p>
      )}
    </div>
  );
  return (
    <section className={cn(!style?.background && 'bg-fg/[0.03]')}>
      {split ? (
        // La imagen acompaña, no manda: dos quintos del ancho y el bloque no
        // pasa de 1024 px (a todo el ancho, una foto 4:3 ocupaba la pantalla).
        <div className="mx-auto grid max-w-5xl items-center gap-8 px-4 py-14 sm:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
          <div className="relative aspect-[4/3] w-full overflow-hidden rounded-lg">
            <StoreImage
              src={data.image}
              alt=""
              sizes="(max-width: 640px) 100vw, 400px"
              className="object-cover"
            />
          </div>
          {body}
        </div>
      ) : (
        <div className="mx-auto max-w-container px-4 py-14">
          {data.image && (
            <div className={cn('relative mb-5 h-28 w-44 overflow-hidden rounded-lg', left ? '' : 'mx-auto')}>
              <StoreImage src={data.image} alt="" sizes="176px" className="object-cover" />
            </div>
          )}
          {body}
        </div>
      )}
    </section>
  );
}
