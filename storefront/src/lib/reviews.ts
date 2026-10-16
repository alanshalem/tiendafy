/**
 * Tipos de las reseñas tal como las manda la API (GET /reviews/products/{id}).
 * Viven aparte del componente para que la página (servidor) los use al armar
 * el JSON-LD sin arrastrar código de cliente.
 */
export interface PublicReview {
  id: string;
  rating: number;
  title: string | null;
  body: string;
  /** "Ana P.": nunca el apellido entero ni el email. */
  authorName: string;
  variantLabel: string | null;
  photos: string[];
  /** Toda reseña nace de una compra despachada. */
  verified: boolean;
  helpfulCount: number;
  reply: string | null;
  repliedAtUtc: string | null;
  createdAtUtc: string;
}

interface ReviewsSummary {
  average: number;
  count: number;
  /** Cantidad por estrellas: índice 0 = 1 estrella … índice 4 = 5 estrellas. */
  distribution: number[];
}

export interface ReviewsPage {
  /** La tienda muestra reseñas (si las apagó, no hay sección). */
  enabled: boolean;
  summary: ReviewsSummary;
  items: PublicReview[];
  total: number;
  page: number;
  totalPages: number;
}

export type ReviewSort = 'helpful' | 'recent';

/** La URL de una página de reseñas (la usan el servidor y el cliente, con el mismo tamaño de página). */
export function reviewsPath(
  productId: string,
  opts: { sort?: ReviewSort; page?: number; rating?: number | null } = {},
) {
  const qs = new URLSearchParams({
    sort: opts.sort ?? 'helpful',
    page: String(opts.page ?? 1),
    pageSize: '5',
  });
  if (opts.rating) qs.set('rating', String(opts.rating));
  return `/api/v1/reviews/products/${productId}?${qs}`;
}
