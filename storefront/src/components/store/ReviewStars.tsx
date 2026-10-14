import { Star } from 'lucide-react';

/** Promedio y cantidad de reseñas aprobadas (lo que manda la API con cada producto). */
export interface ProductRating {
  average: number;
  count: number;
}

/** "4,5": el promedio como se lee en castellano (coma decimal, un decimal). */
export const formatRating = (value: number) =>
  value.toLocaleString('es-AR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

const opinions = (count: number) => (count === 1 ? '1 opinión' : `${count} opiniones`);

/**
 * Cinco estrellas con relleno parcial (4,5 = cuatro y media). Ámbar sobre un
 * gris que sale del color del texto del tema: se lee igual en un tema claro
 * que en uno oscuro.
 */
export function Stars({ value, className = 'h-4 w-4' }: { value: number; className?: string }) {
  return (
    <span
      role="img"
      aria-label={`${formatRating(value)} de 5 estrellas`}
      className="inline-flex shrink-0 items-center gap-0.5"
    >
      {[0, 1, 2, 3, 4].map((i) => {
        const fill = Math.max(0, Math.min(1, value - i));
        return (
          <span key={i} className="relative inline-flex" aria-hidden>
            <Star className={`${className} text-fg/25`} strokeWidth={1.5} />
            {fill > 0 && (
              <span className="absolute inset-y-0 left-0 overflow-hidden" style={{ width: `${fill * 100}%` }}>
                <Star className={`${className} fill-amber-400 text-amber-400`} strokeWidth={1.5} />
              </span>
            )}
          </span>
        );
      })}
    </span>
  );
}

/** Las estrellas de la card: chicas, con la cantidad al lado. Sin reseñas, nada. */
export function CardRating({ rating }: { rating?: ProductRating | null }) {
  if (!rating || rating.count === 0) return null;
  return (
    <div className="mt-0.5 flex items-center gap-1 text-xs text-fg-muted">
      <Stars value={rating.average} className="h-3.5 w-3.5" />
      <span aria-label={opinions(rating.count)}>({rating.count})</span>
    </div>
  );
}

/** Junto al nombre y el precio de la ficha: lleva a las opiniones de más abajo. */
export function RatingSummaryLink({ rating }: { rating?: ProductRating | null }) {
  if (!rating || rating.count === 0) return null;
  return (
    <a href="#opiniones" className="mt-1 inline-flex items-center gap-1.5 text-sm hover:underline">
      <Stars value={rating.average} />
      <span className="font-semibold">{formatRating(rating.average)}</span>
      <span className="text-fg-muted">({opinions(rating.count)})</span>
    </a>
  );
}
