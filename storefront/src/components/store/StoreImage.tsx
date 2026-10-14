import Image, { getImageProps } from 'next/image';
import { preload as preloadResource } from 'react-dom';

/** Hasta dónde es "celular" para la imagen de celular: el `md` de Tailwind (768 px). */
export const MOBILE_MEDIA = '(max-width: 767px)';
const DESKTOP_MEDIA = '(min-width: 768px)';

/**
 * Imagen de tienda sobre next/image (lazy-load, srcset responsive, sin layout
 * shift). Usa `fill`: el contenedor padre debe ser `relative` y tener tamaño
 * (ej. `aspect-square`). `className` va a la <img> interna (object-cover, etc.).
 *
 * `lcp`: es la imagen más grande a la vista al abrir la página (la portada).
 * Se precarga desde el <head> y se pide con prioridad alta, la precarga
 * incluida: un <link rel="preload"> de imagen sin `fetchpriority` arranca con
 * prioridad baja, y a la portada le llegaba tarde. Va en UNA sola imagen por
 * página; en el resto, lazy (el default de next/image).
 *
 * `mobileSrc`: otra foto para celular (dirección de arte: una vertical en vez
 * de recortar la apaisada). Va en un <picture> y el navegador baja UNA sola
 * de las dos según el ancho; con `lcp`, se precargan las dos con su media
 * query, así cada pantalla precarga solo la suya.
 */
export function StoreImage({
  src,
  alt,
  className,
  sizes = '(max-width: 768px) 50vw, 25vw',
  lcp = false,
  mobileSrc,
  mobileSizes,
  eager = false,
}: {
  src: string;
  alt: string;
  className?: string;
  sizes?: string;
  lcp?: boolean;
  /** Foto para pantallas de menos de 768 px. Sin valor (o igual a `src`), la misma. */
  mobileSrc?: string;
  /** El `sizes` de la foto de celular (por defecto, el mismo). */
  mobileSizes?: string;
  /**
   * Bajarla ya, sin prioridad: la que viene en un carrusel, para que al pasar
   * no aparezca un hueco mientras carga. No es `lcp` (no compite con la portada).
   */
  eager?: boolean;
}) {
  if (!mobileSrc || mobileSrc === src)
    return (
      <Image
        src={src}
        alt={alt}
        fill
        sizes={sizes}
        preload={lcp}
        loading={!lcp && eager ? 'eager' : undefined}
        fetchPriority={lcp ? 'high' : undefined}
        className={className}
      />
    );
  return (
    <ArtDirectedImage
      src={src}
      mobileSrc={mobileSrc}
      alt={alt}
      className={className}
      sizes={sizes}
      mobileSizes={mobileSizes ?? sizes}
      lcp={lcp}
      eager={eager}
    />
  );
}

function ArtDirectedImage({
  src,
  mobileSrc,
  alt,
  className,
  sizes,
  mobileSizes,
  lcp,
  eager,
}: {
  src: string;
  mobileSrc: string;
  alt: string;
  className?: string;
  sizes: string;
  mobileSizes: string;
  lcp: boolean;
  eager: boolean;
}) {
  // getImageProps y no <Image>: next/image no sabe de <picture>. Su `preload`
  // precargaría la foto de computadora también en el celular (que después
  // baja la suya): la precarga va a mano, una por media query. Adentro de un
  // <picture> el navegador elige UNA fuente, así que `eager` baja solo esa.
  const common = { alt, fill: true, fetchPriority: lcp ? ('high' as const) : undefined };
  const { props: desktop } = getImageProps({ ...common, src, sizes, className });
  const { props: mobile } = getImageProps({ ...common, src: mobileSrc, sizes: mobileSizes });
  if (lcp) {
    for (const [p, media] of [
      [mobile, MOBILE_MEDIA],
      [desktop, DESKTOP_MEDIA],
    ] as const)
      preloadResource(p.src, {
        as: 'image',
        imageSrcSet: p.srcSet,
        imageSizes: p.sizes,
        fetchPriority: 'high',
        media,
      });
  }
  return (
    <picture>
      <source media={MOBILE_MEDIA} srcSet={mobile.srcSet} sizes={mobile.sizes} />
      {/* eslint-disable-next-line jsx-a11y/alt-text -- el alt viene en las props de getImageProps */}
      <img {...desktop} loading={lcp || eager ? 'eager' : 'lazy'} />
    </picture>
  );
}
