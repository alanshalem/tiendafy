'use client';

import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { BadgeCheck, ChevronLeft, ChevronRight, Flag, MessageSquareReply, ThumbsUp, X } from 'lucide-react';
import { formatDate } from '@tiendafy/types';
import { cn } from '@tiendafy/ui/cn';
import { API_URL, clientJsonTenant, tenantHeaders } from '@/lib/api-client';
import { readJson, writeJson } from '@/lib/storage';
import { reviewsPath, type PublicReview, type ReviewSort, type ReviewsPage } from '@/lib/reviews';
import { Stars, formatRating } from './ReviewStars';
import { useCart } from './cart-context';
import { useFocusTrap } from './useFocusTrap';

/** Las reseñas que esta persona ya marcó como útiles (en este navegador). */
const votedKey = (storeKey: string) => `tiendafy.review-votes.${storeKey}`;

const REPORT_REASONS = [
  'No habla del producto',
  'Es ofensiva',
  'Parece falsa o es publicidad',
  'Tiene datos personales',
] as const;

/**
 * Las opiniones de la ficha: promedio, cuántas hay de cada estrella (se
 * tocan para filtrar), la lista con fotos (se amplían), ordenada por las más
 * útiles o las más nuevas, y paginada.
 *
 * Todas son de compradores (el backend no acepta otra cosa), por eso cada una
 * dice "Compra verificada". La primera página llega con la ficha desde el
 * servidor (la misma que va al JSON-LD); el resto se pide desde acá.
 */
export function ProductReviews({ productId, initial }: { productId: string; initial: ReviewsPage | null }) {
  const { tenantId } = useCart();
  const [data, setData] = useState<ReviewsPage | null>(initial);
  const [sort, setSort] = useState<ReviewSort>('helpful');
  const [page, setPage] = useState(1);
  const [rating, setRating] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [viewer, setViewer] = useState<{ photos: string[]; index: number } | null>(null);
  const [voted, setVoted] = useState<string[]>([]);
  const firstRender = useRef(true);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setVoted(readJson<string[]>(votedKey(tenantId), []));
  }, [tenantId]);

  useEffect(() => {
    // La primera página ya vino del servidor; sin ella (falló), se pide acá.
    if (firstRender.current) {
      firstRender.current = false;
      if (initial) return;
    }
    let alive = true;
    setLoading(true);
    clientJsonTenant<ReviewsPage>(reviewsPath(productId, { sort, page, rating }), tenantId).then((d) => {
      if (!alive) return;
      if (d) setData(d);
      setLoading(false);
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productId, tenantId, sort, page, rating]);

  if (!data || !data.enabled) return null;
  const { summary } = data;

  const changeFilter = (next: number | null) => {
    setRating(next);
    setPage(1);
  };
  const goTo = (next: number) => {
    setPage(next);
    listRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const markHelpful = async (review: PublicReview) => {
    if (voted.includes(review.id)) return;
    const next = [...voted, review.id].slice(-200);
    setVoted(next);
    writeJson(votedKey(tenantId), next);
    try {
      const res = await fetch(`${API_URL}/api/v1/reviews/${review.id}/helpful`, {
        method: 'POST',
        headers: tenantHeaders(tenantId),
      });
      if (!res.ok) return;
      const { helpfulCount } = (await res.json()) as { helpfulCount: number };
      setData((d) =>
        d ? { ...d, items: d.items.map((r) => (r.id === review.id ? { ...r, helpfulCount } : r)) } : d,
      );
    } catch {
      /* sin red: el voto no se cuenta, no pasa nada */
    }
  };

  return (
    <section
      id="opiniones"
      aria-labelledby="opiniones-titulo"
      className="mt-12 scroll-mt-24 border-t border-fg/10 pt-8"
    >
      <h2 id="opiniones-titulo" className="text-2xl font-bold" style={{ fontFamily: 'var(--font-heading)' }}>
        Opiniones
      </h2>

      {summary.count === 0 ? (
        <p className="mt-3 text-sm text-fg-muted">
          Todavía no hay opiniones de este producto. Las escriben quienes lo compraron: si es tu caso, te
          vamos a pedir la tuya por email.
        </p>
      ) : (
        <div className="mt-5 grid gap-8 md:grid-cols-[16rem_1fr]">
          {/* Resumen: promedio y cuántas de cada estrella (filtran la lista). */}
          <div>
            <div className="flex items-end gap-3">
              <span className="text-5xl font-bold leading-none">{formatRating(summary.average)}</span>
              <div className="pb-1">
                <Stars value={summary.average} className="h-5 w-5" />
                <p className="mt-1 text-xs text-fg-muted">
                  {summary.count === 1 ? '1 opinión' : `${summary.count} opiniones`}
                </p>
              </div>
            </div>
            <ul className="mt-4 space-y-1">
              {[5, 4, 3, 2, 1].map((stars) => {
                const n = summary.distribution[stars - 1] ?? 0;
                const pct = summary.count > 0 ? Math.round((n / summary.count) * 100) : 0;
                const active = rating === stars;
                return (
                  <li key={stars}>
                    <button
                      type="button"
                      disabled={n === 0}
                      onClick={() => changeFilter(active ? null : stars)}
                      aria-pressed={active}
                      aria-label={`${stars} estrellas: ${n} ${n === 1 ? 'opinión' : 'opiniones'}`}
                      className={cn(
                        'flex min-h-8 w-full items-center gap-2 rounded px-1 text-xs disabled:cursor-default',
                        active ? 'bg-fg/10 font-semibold' : 'enabled:hover:bg-fg/5',
                      )}
                    >
                      <span className="w-3 text-right tabular-nums">{stars}</span>
                      <span aria-hidden className="text-amber-400">
                        ★
                      </span>
                      <span className="h-2 flex-1 overflow-hidden rounded-full bg-fg/10">
                        <span
                          className="block h-full rounded-full bg-amber-400"
                          style={{ width: `${pct}%` }}
                        />
                      </span>
                      <span className="w-6 text-right tabular-nums text-fg-muted">{n}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>

          <div ref={listRef} className="min-w-0 scroll-mt-24">
            <div className="flex flex-wrap items-center justify-between gap-3">
              {rating ? (
                <button
                  type="button"
                  onClick={() => changeFilter(null)}
                  className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-fg/15 px-3 text-xs font-medium"
                >
                  Solo {rating} {rating === 1 ? 'estrella' : 'estrellas'}
                  <X className="h-3.5 w-3.5" aria-hidden />
                  <span className="sr-only">(quitar filtro)</span>
                </button>
              ) : (
                <span />
              )}
              <label className="flex items-center gap-2 text-sm">
                <span className="text-fg-muted">Ordenar por</span>
                <select
                  value={sort}
                  onChange={(e) => {
                    setSort(e.target.value as ReviewSort);
                    setPage(1);
                  }}
                  className="h-9 rounded-md border border-fg/15 bg-bg px-2 text-sm text-fg"
                >
                  <option value="helpful">Más útiles</option>
                  <option value="recent">Más recientes</option>
                </select>
              </label>
            </div>

            <ul className={cn('mt-4 divide-y divide-fg/10', loading && 'opacity-60')} aria-busy={loading}>
              {data.items.map((review) => (
                <ReviewItem
                  key={review.id}
                  review={review}
                  tenantId={tenantId}
                  voted={voted.includes(review.id)}
                  onHelpful={() => void markHelpful(review)}
                  onPhoto={(index) => setViewer({ photos: review.photos, index })}
                />
              ))}
            </ul>

            {data.totalPages > 1 && (
              <nav
                aria-label="Páginas de opiniones"
                className="mt-4 flex items-center justify-center gap-3 text-sm"
              >
                <button
                  type="button"
                  onClick={() => goTo(page - 1)}
                  disabled={page <= 1 || loading}
                  aria-label="Opiniones anteriores"
                  className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-fg/15 disabled:opacity-40"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <span className="tabular-nums text-fg-muted">
                  {page} de {data.totalPages}
                </span>
                <button
                  type="button"
                  onClick={() => goTo(page + 1)}
                  disabled={page >= data.totalPages || loading}
                  aria-label="Más opiniones"
                  className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-fg/15 disabled:opacity-40"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </nav>
            )}
          </div>
        </div>
      )}

      {viewer && (
        <PhotoViewer
          photos={viewer.photos}
          index={viewer.index}
          onChange={(index) => setViewer({ ...viewer, index })}
          onClose={() => setViewer(null)}
        />
      )}
    </section>
  );
}

function ReviewItem({
  review,
  tenantId,
  voted,
  onHelpful,
  onPhoto,
}: {
  review: PublicReview;
  tenantId: string;
  voted: boolean;
  onHelpful: () => void;
  onPhoto: (index: number) => void;
}) {
  return (
    <li className="py-5 first:pt-0">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <Stars value={review.rating} />
        {review.title && <h3 className="font-semibold">{review.title}</h3>}
      </div>
      <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-fg-muted">
        <span className="font-medium text-fg">{review.authorName}</span>
        {review.verified && (
          <span className="inline-flex items-center gap-1">
            <BadgeCheck className="h-3.5 w-3.5" aria-hidden /> Compra verificada
          </span>
        )}
        <span>{formatDate(review.createdAtUtc, { day: 'numeric', month: 'long', year: 'numeric' })}</span>
        {review.variantLabel && <span>· {review.variantLabel}</span>}
      </p>
      <p className="mt-2 whitespace-pre-line text-sm leading-relaxed wrap-anywhere">{review.body}</p>

      {review.photos.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {review.photos.map((url, i) => (
            <button
              key={url}
              type="button"
              onClick={() => onPhoto(i)}
              aria-label={`Ampliar la foto ${i + 1} de ${review.authorName}`}
              className="relative h-20 w-20 overflow-hidden rounded-md border border-fg/10"
            >
              <Image src={url} alt="" fill sizes="80px" className="object-cover" />
            </button>
          ))}
        </div>
      )}

      {review.reply && (
        <div className="mt-3 rounded-md bg-fg/[0.04] p-3 text-sm">
          <p className="flex items-center gap-1.5 text-xs font-semibold">
            <MessageSquareReply className="h-3.5 w-3.5" aria-hidden /> Respuesta de la tienda
          </p>
          <p className="mt-1 whitespace-pre-line wrap-anywhere">{review.reply}</p>
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
        <button
          type="button"
          onClick={onHelpful}
          disabled={voted}
          aria-pressed={voted}
          className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-fg/15 px-3 font-medium disabled:opacity-70"
        >
          <ThumbsUp className="h-3.5 w-3.5" aria-hidden />
          {voted ? '¡Gracias!' : 'Me sirvió'}
          {review.helpfulCount > 0 && (
            <span className="tabular-nums text-fg-muted">({review.helpfulCount})</span>
          )}
        </button>
        <ReportButton reviewId={review.id} tenantId={tenantId} />
      </div>
    </li>
  );
}

/** Denunciar: se elige el motivo y se manda. Tres personas distintas la sacan hasta que la tienda la mire. */
function ReportButton({ reviewId, tenantId }: { reviewId: string; tenantId: string }) {
  const [open, setOpen] = useState(false);
  const [sent, setSent] = useState(false);
  const [reason, setReason] = useState<string>(REPORT_REASONS[0]);

  if (sent) return <span className="text-fg-muted">Gracias, la vamos a revisar.</span>;
  if (!open)
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex min-h-9 items-center gap-1 text-fg-muted hover:underline"
      >
        <Flag className="h-3.5 w-3.5" aria-hidden /> Denunciar
      </button>
    );

  const send = async () => {
    setSent(true);
    try {
      await fetch(`${API_URL}/api/v1/reviews/${reviewId}/report`, {
        method: 'POST',
        headers: tenantHeaders(tenantId, true),
        body: JSON.stringify({ reason }),
      });
    } catch {
      /* sin red: la denuncia no llega; no vale la pena insistirle a quien la hizo */
    }
  };

  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <select
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        aria-label="Motivo de la denuncia"
        className="h-9 rounded-md border border-fg/15 bg-bg px-2 text-xs text-fg"
      >
        {REPORT_REASONS.map((r) => (
          <option key={r}>{r}</option>
        ))}
      </select>
      <button type="button" onClick={() => void send()} className="min-h-9 font-semibold hover:underline">
        Enviar denuncia
      </button>
      <button type="button" onClick={() => setOpen(false)} className="min-h-9 text-fg-muted hover:underline">
        Cancelar
      </button>
    </span>
  );
}

/** Las fotos de una reseña en grande: flechas, teclado (←/→/Esc) y foco atrapado. */
function PhotoViewer({
  photos,
  index,
  onChange,
  onClose,
}: {
  photos: string[];
  index: number;
  onChange: (index: number) => void;
  onClose: () => void;
}) {
  const ref = useFocusTrap<HTMLDivElement>(true);
  const go = (d: number) => onChange((index + d + photos.length) % photos.length);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowRight' && photos.length > 1) onChange((index + 1) % photos.length);
      else if (e.key === 'ArrowLeft' && photos.length > 1)
        onChange((index - 1 + photos.length) % photos.length);
    };
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [index, photos.length, onChange, onClose]);

  return (
    <div
      ref={ref}
      role="dialog"
      aria-modal="true"
      aria-label="Fotos de la opinión"
      tabIndex={-1}
      onClick={onClose}
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 p-4 outline-none"
    >
      <button
        type="button"
        onClick={onClose}
        aria-label="Cerrar"
        className="absolute right-3 top-3 inline-flex h-11 w-11 items-center justify-center rounded-full text-white/80 hover:bg-white/10"
      >
        <X className="h-7 w-7" />
      </button>
      {photos.length > 1 && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            go(-1);
          }}
          aria-label="Foto anterior"
          className="absolute left-3 z-10 inline-flex h-12 w-12 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20"
        >
          <ChevronLeft className="h-7 w-7" />
        </button>
      )}
      <div className="relative h-[80vh] w-[90vw]" onClick={(e) => e.stopPropagation()}>
        <Image
          src={photos[index]!}
          alt={`Foto ${index + 1} de ${photos.length}`}
          fill
          sizes="90vw"
          className="object-contain"
        />
      </div>
      {photos.length > 1 && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            go(1);
          }}
          aria-label="Foto siguiente"
          className="absolute right-3 z-10 inline-flex h-12 w-12 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20"
        >
          <ChevronRight className="h-7 w-7" />
        </button>
      )}
    </div>
  );
}
