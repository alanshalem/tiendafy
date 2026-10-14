'use client';

import { getImageProps } from 'next/image';
import { contrastText, type ImageTextData } from '@tiendafy/types';
import { cn } from '@tiendafy/ui';
import { MOBILE_MEDIA, StoreImage } from '../StoreImage';
import { StoreLink } from '../StoreLink';
import { SectionTitle } from '../section-primitives';
import { useSectionStyle } from '../section-context';
import type { SectionRenderProps } from '../section-types';
import { RATIO_CLASS } from './image-overlay';

const V_ALIGN = { top: 'items-start', center: 'items-center', bottom: 'items-end' } as const;

const PANEL = {
  none: '',
  subtle: 'rounded-xl bg-fg/[0.04] p-6 md:p-10',
  accent: 'rounded-xl bg-primary/[0.08] p-6 md:p-10',
  dark: 'rounded-xl bg-[rgb(17_24_39)] p-6 text-white md:p-10',
} as const;

const BUTTON = {
  solid: 'rounded-md bg-primary px-5 text-primary-fg',
  outline: 'rounded-md border-2 border-current px-5',
  link: 'underline decoration-2 underline-offset-4',
} as const;

/** Alto máximo de una foto con su proporción original (una vertical medía 900 px). */
const MAX_H = 'max-h-[min(70svh,560px)]';

/**
 * Una foto que conserva su proporción (no sabemos sus medidas: no se guardan).
 * El recuadro arranca en 4:3 y se ajusta al llegar la foto; con el alto
 * máximo, una vertical ya no ocupa la pantalla entera.
 */
function NaturalImage({
  src,
  mobileSrc,
  alt,
  sizes,
}: {
  src: string;
  mobileSrc: string;
  alt: string;
  sizes: string;
}) {
  const common = { alt, width: 1200, height: 900, sizes };
  const { props: desktop } = getImageProps({ ...common, src });
  const mobile = mobileSrc && mobileSrc !== src ? getImageProps({ ...common, src: mobileSrc }).props : null;
  return (
    <picture>
      {mobile && <source media={MOBILE_MEDIA} srcSet={mobile.srcSet} sizes={mobile.sizes} />}
      {/* eslint-disable-next-line jsx-a11y/alt-text -- el alt viene en las props de getImageProps */}
      <img
        {...desktop}
        loading="lazy"
        className={cn('mx-auto h-auto w-auto max-w-full rounded-lg object-contain', MAX_H)}
      />
    </picture>
  );
}

function SectionImage({ data, sizes }: { data: ImageTextData; sizes: string }) {
  if (data.ratio === 'original')
    return <NaturalImage src={data.image} mobileSrc={data.mobileImage} alt={data.alt} sizes={sizes} />;
  return (
    <div className={cn('relative w-full overflow-hidden rounded-lg', RATIO_CLASS[data.ratio])}>
      <StoreImage
        src={data.image}
        mobileSrc={data.mobileImage || undefined}
        alt={data.alt}
        sizes={sizes}
        className="object-cover"
      />
    </div>
  );
}

/**
 * ¿El texto claro se lee? Sobre la página (casi siempre clara) no: antes
 * "Claro" dejaba el texto blanco sobre blanco. Si la sección no tiene un
 * fondo propio oscuro, el texto claro va sobre un recuadro oscuro.
 */
function useNeedsDarkPanel(data: ImageTextData): boolean {
  const style = useSectionStyle();
  if (data.textColor !== 'light' || data.textBackground === 'dark') return false;
  const darkSection =
    style?.background === 'custom' &&
    !!style.backgroundColor &&
    contrastText(style.backgroundColor) === '255 255 255';
  return !darkSection;
}

export function ImageTextSection({ data }: SectionRenderProps<'image-text'>) {
  const forceDark = useNeedsDarkPanel(data);
  if (!data.image && !data.title) return null;

  const hasText = !!(data.title || data.description || (data.buttonText && data.link));

  // Solo imagen (sin texto): a todo el ancho del contenedor, centrada — no media
  // columna a la izquierda. Sirve para banners de cualquier proporción.
  if (data.image && !hasText) {
    return (
      <section className="mx-auto max-w-container px-4 py-14">
        <SectionImage data={data} sizes="(max-width: 1280px) 100vw, 1280px" />
      </section>
    );
  }

  const panel = forceDark ? 'dark' : data.textBackground;
  const light = panel === 'dark' || data.textColor === 'light';
  const text = (
    <div
      className={cn(
        PANEL[panel],
        light && 'text-white',
        data.image && (data.mobileOrder === 'text' ? 'order-1' : 'order-2'),
        data.image && (data.imagePosition === 'right' ? 'md:order-1' : 'md:order-2'),
      )}
    >
      {data.title && <SectionTitle className="text-2xl font-bold sm:text-3xl">{data.title}</SectionTitle>}
      {data.description && (
        <p className={cn('mt-3 whitespace-pre-line', light ? 'opacity-90' : 'opacity-75')}>
          {data.description}
        </p>
      )}
      {data.buttonText && data.link && (
        <StoreLink
          href={data.link}
          newTab={data.newTab}
          className={cn(
            'mt-5 inline-flex min-h-11 items-center text-sm font-semibold',
            BUTTON[data.buttonStyle],
          )}
        >
          {data.buttonText}
        </StoreLink>
      )}
    </div>
  );

  // Imagen + texto = 2 columnas (en celular, apiladas). Solo texto = una columna.
  return (
    <section
      className={cn(
        'mx-auto max-w-container px-4 py-14',
        data.image && `grid gap-8 md:grid-cols-2 md:gap-12 ${V_ALIGN[data.verticalAlign]}`,
      )}
    >
      {data.image && (
        <div
          className={cn(
            data.mobileOrder === 'text' ? 'order-2' : 'order-1',
            data.imagePosition === 'right' ? 'md:order-2' : 'md:order-1',
          )}
        >
          <SectionImage data={data} sizes="(max-width: 767px) 100vw, 640px" />
        </div>
      )}
      {text}
    </section>
  );
}
