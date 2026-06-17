import Image from 'next/image';

/**
 * Imagen de tienda sobre next/image (lazy-load, srcset responsive, sin layout
 * shift). Usa `fill`: el contenedor padre debe ser `relative` y tener tamaño
 * (ej. `aspect-square`). `className` va a la <img> interna (object-cover, etc.).
 */
export function StoreImage({
  src,
  alt,
  className,
  sizes = '(max-width: 768px) 50vw, 25vw',
  priority = false,
}: {
  src: string;
  alt: string;
  className?: string;
  sizes?: string;
  priority?: boolean;
}) {
  return <Image src={src} alt={alt} fill sizes={sizes} priority={priority} className={className} />;
}
