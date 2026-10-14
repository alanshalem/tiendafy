import Image from 'next/image';

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
 */
export function StoreImage({
  src,
  alt,
  className,
  sizes = '(max-width: 768px) 50vw, 25vw',
  lcp = false,
}: {
  src: string;
  alt: string;
  className?: string;
  sizes?: string;
  lcp?: boolean;
}) {
  return (
    <Image
      src={src}
      alt={alt}
      fill
      sizes={sizes}
      preload={lcp}
      fetchPriority={lcp ? 'high' : undefined}
      className={className}
    />
  );
}
