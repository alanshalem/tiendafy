'use client';

import { useEffect, useId, useRef, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { Camera, CheckCircle2, Loader2, Star, X } from 'lucide-react';
import { cn } from '@tiendafy/ui';
import { API_URL, problemMessage, tenantHeaders } from '@/lib/api-client';
import { useCart } from './cart';
import { usePreviewHref } from './preview';
import { Stars } from './ReviewStars';
import { BTN_PRIMARY_BLOCK, INPUT_LIGHT_11, TEXTAREA_LIGHT } from './styles';

/** Una línea de la compra, como la devuelve /reviews/invite. */
interface InviteItem {
  orderItemId: string;
  productId: string | null;
  productName: string;
  productSlug: string | null;
  image: string | null;
  variantLabel: string | null;
  canReview: boolean;
  review: { rating: number; status: 'approved' | 'pending' | 'hidden' } | null;
}

interface Invite {
  orderId: string;
  authorName: string;
  items: InviteItem[];
}

type Load =
  | { kind: 'loading' }
  | { kind: 'error'; message: string; login?: boolean }
  | { kind: 'ready'; token: string; invite: Invite };

const MAX_PHOTOS = 4;
const MIN_BODY = 10;
const PHOTO_TYPES = 'image/jpeg,image/png,image/webp';
const STAR_LABELS = ['Muy malo', 'Malo', 'Normal', 'Bueno', 'Excelente'];

/**
 * Escribir reseñas de una compra. Con el link del email ya viene el token;
 * desde "Mi cuenta" viene el id de la compra y el token se pide con la sesión
 * del comprador. El servidor decide todo lo importante (que la compra sea
 * suya, que esté despachada, una reseña por producto): acá solo se arma el
 * formulario.
 */
export function ReviewWriter({ token, orderId }: { token: string | null; orderId: string | null }) {
  const { tenantId } = useCart();
  const href = usePreviewHref();
  const [load, setLoad] = useState<Load>({ kind: 'loading' });

  useEffect(() => {
    let alive = true;
    (async () => {
      let t = token;
      if (!t && orderId) {
        try {
          const res = await fetch(
            `${API_URL}/api/v1/shop/orders/${encodeURIComponent(orderId)}/review-invite`,
            {
              headers: tenantHeaders(tenantId),
              credentials: 'include',
            },
          );
          if (res.status === 401) {
            if (alive)
              setLoad({ kind: 'error', login: true, message: 'Iniciá sesión para opinar de tu compra.' });
            return;
          }
          const data = res.ok
            ? ((await res.json()) as { eligible: boolean; reason: string | null; token: string | null })
            : null;
          if (!data?.eligible || !data.token) {
            if (alive)
              setLoad({ kind: 'error', message: data?.reason ?? 'No encontramos esa compra en tu cuenta.' });
            return;
          }
          t = data.token;
        } catch {
          if (alive)
            setLoad({ kind: 'error', message: 'No pudimos cargar tu compra. Probá de nuevo en un rato.' });
          return;
        }
      }
      if (!t) {
        if (alive)
          setLoad({
            kind: 'error',
            message: 'Para opinar, entrá desde el email que te mandamos o desde tu cuenta.',
          });
        return;
      }
      try {
        const res = await fetch(`${API_URL}/api/v1/reviews/invite?token=${encodeURIComponent(t)}`, {
          headers: tenantHeaders(tenantId),
        });
        if (!res.ok) {
          const message = await problemMessage(res, 'El link para opinar no es válido o ya venció.');
          if (alive) setLoad({ kind: 'error', message });
          return;
        }
        const invite = (await res.json()) as Invite;
        if (alive) setLoad({ kind: 'ready', token: t, invite });
      } catch {
        if (alive)
          setLoad({ kind: 'error', message: 'No pudimos cargar tu compra. Probá de nuevo en un rato.' });
      }
    })();
    return () => {
      alive = false;
    };
  }, [token, orderId, tenantId]);

  if (load.kind === 'loading')
    return (
      <p className="mt-8 flex items-center gap-2 text-sm text-fg-muted" role="status">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Cargando tu compra…
      </p>
    );

  if (load.kind === 'error')
    return (
      <div className="mt-8 rounded-md border border-fg/10 p-4 text-sm" role="alert">
        <p>{load.message}</p>
        {load.login && (
          <Link href={href('/cuenta')} className="mt-2 inline-block font-semibold underline">
            Ir a mi cuenta
          </Link>
        )}
      </div>
    );

  const { invite } = load;
  return (
    <div className="mt-6 space-y-6">
      <p className="text-sm">
        Vas a firmar como <strong>{invite.authorName}</strong>.
      </p>
      {invite.items.map((item) => (
        <ReviewForm key={item.orderItemId} item={item} token={load.token} tenantId={tenantId} />
      ))}
    </div>
  );
}

function ReviewForm({ item, token, tenantId }: { item: InviteItem; token: string; tenantId: string }) {
  const id = useId();
  const href = usePreviewHref();
  const [rating, setRating] = useState(0);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [photos, setPhotos] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ rating: number; status: string } | null>(item.review);
  const fileRef = useRef<HTMLInputElement>(null);

  const header = (
    <div className="flex items-center gap-3">
      <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-md bg-fg/5">
        {item.image && <Image src={item.image} alt="" fill sizes="56px" className="object-cover" />}
      </div>
      <div className="min-w-0">
        {item.productSlug ? (
          <Link href={href(`/productos/${item.productSlug}`)} className="font-semibold hover:underline">
            {item.productName}
          </Link>
        ) : (
          <span className="font-semibold">{item.productName}</span>
        )}
        {item.variantLabel && <p className="text-xs text-fg-muted">{item.variantLabel}</p>}
      </div>
    </div>
  );

  if (done)
    return (
      <section className="rounded-lg border border-fg/10 p-4">
        {header}
        <p className="mt-3 flex items-center gap-2 text-sm">
          <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden />
          <Stars value={done.rating} />
          <span>
            {done.status === 'approved'
              ? '¡Gracias! Tu opinión ya está publicada.'
              : '¡Gracias! Tu opinión se publica cuando la tienda la revise.'}
          </span>
        </p>
      </section>
    );

  if (!item.canReview)
    return (
      <section className="rounded-lg border border-fg/10 p-4">
        {header}
        <p className="mt-3 text-sm text-fg-muted">Este producto ya no está en la tienda.</p>
      </section>
    );

  const upload = async (files: FileList | null) => {
    if (!files?.length) return;
    setError(null);
    setUploading(true);
    for (const file of Array.from(files).slice(0, MAX_PHOTOS - photos.length)) {
      const form = new FormData();
      form.append('token', token);
      form.append('file', file);
      try {
        const res = await fetch(`${API_URL}/api/v1/reviews/photos`, {
          method: 'POST',
          headers: tenantHeaders(tenantId),
          body: form,
        });
        if (!res.ok) {
          setError(await problemMessage(res, 'No se pudo subir la foto.'));
          continue;
        }
        const { url } = (await res.json()) as { url: string };
        setPhotos((p) => (p.length < MAX_PHOTOS ? [...p, url] : p));
      } catch {
        setError('No se pudo subir la foto.');
      }
    }
    setUploading(false);
    if (fileRef.current) fileRef.current.value = '';
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (rating === 0) return setError('Elegí de 1 a 5 estrellas.');
    if (body.trim().length < MIN_BODY)
      return setError(`Contanos un poco más (al menos ${MIN_BODY} caracteres).`);
    setError(null);
    setSending(true);
    try {
      const res = await fetch(`${API_URL}/api/v1/reviews`, {
        method: 'POST',
        headers: tenantHeaders(tenantId, true),
        body: JSON.stringify({ token, orderItemId: item.orderItemId, rating, title, body, photos }),
      });
      if (!res.ok) {
        setError(await problemMessage(res, 'No se pudo guardar tu opinión. Probá de nuevo.'));
        return;
      }
      const { status } = (await res.json()) as { status: string };
      setDone({ rating, status });
    } catch {
      setError('No se pudo guardar tu opinión. Probá de nuevo.');
    } finally {
      setSending(false);
    }
  };

  return (
    <form onSubmit={submit} className="rounded-lg border border-fg/10 p-4" aria-labelledby={`${id}-name`}>
      <div id={`${id}-name`}>{header}</div>

      <fieldset className="mt-4">
        <legend className="text-sm font-medium">¿Qué te pareció?</legend>
        <div role="radiogroup" aria-label="Estrellas" className="mt-1 flex items-center gap-1">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={rating === n}
              aria-label={`${n} ${n === 1 ? 'estrella' : 'estrellas'}: ${STAR_LABELS[n - 1]}`}
              onClick={() => setRating(n)}
              className="inline-flex h-11 w-11 items-center justify-center rounded-md hover:bg-fg/5"
            >
              <Star
                className={cn('h-7 w-7', n <= rating ? 'fill-amber-400 text-amber-400' : 'text-fg/30')}
                strokeWidth={1.5}
              />
            </button>
          ))}
          {rating > 0 && <span className="ml-2 text-sm text-fg-muted">{STAR_LABELS[rating - 1]}</span>}
        </div>
      </fieldset>

      <label htmlFor={`${id}-title`} className="mt-4 block text-sm font-medium">
        Título <span className="font-normal text-fg-muted">(opcional)</span>
      </label>
      <input
        id={`${id}-title`}
        value={title}
        onChange={(e) => setTitle(e.target.value.slice(0, 120))}
        placeholder="En pocas palabras"
        className={`${INPUT_LIGHT_11} mt-1`}
      />

      <label htmlFor={`${id}-body`} className="mt-4 block text-sm font-medium">
        Tu opinión
      </label>
      <textarea
        id={`${id}-body`}
        value={body}
        onChange={(e) => setBody(e.target.value.slice(0, 4000))}
        rows={5}
        placeholder="¿Cómo te resultó? ¿La calidad, el talle, el uso?"
        className={`${TEXTAREA_LIGHT} mt-1`}
      />

      <div className="mt-4">
        <p className="text-sm font-medium">
          Fotos <span className="font-normal text-fg-muted">(opcional, hasta {MAX_PHOTOS})</span>
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          {photos.map((url) => (
            <div key={url} className="relative h-20 w-20 overflow-hidden rounded-md border border-fg/10">
              <Image src={url} alt="" fill sizes="80px" className="object-cover" />
              <button
                type="button"
                onClick={() => setPhotos((p) => p.filter((u) => u !== url))}
                aria-label="Quitar la foto"
                className="absolute right-0 top-0 inline-flex h-8 w-8 items-center justify-center rounded-bl-md bg-black/60 text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ))}
          {photos.length < MAX_PHOTOS && (
            <label className="inline-flex h-20 w-20 cursor-pointer flex-col items-center justify-center gap-1 rounded-md border border-dashed border-fg/25 text-xs text-fg-muted hover:border-fg/50">
              {uploading ? (
                <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
              ) : (
                <Camera className="h-5 w-5" aria-hidden />
              )}
              {uploading ? 'Subiendo…' : 'Sumar'}
              <input
                ref={fileRef}
                type="file"
                accept={PHOTO_TYPES}
                multiple
                disabled={uploading}
                onChange={(e) => void upload(e.target.files)}
                className="sr-only"
              />
            </label>
          )}
        </div>
      </div>

      {error && (
        <p role="alert" className="mt-3 text-sm font-medium">
          {error}
        </p>
      )}
      <button type="submit" disabled={sending || uploading} className={`${BTN_PRIMARY_BLOCK} mt-4`}>
        {sending ? 'Enviando…' : 'Publicar mi opinión'}
      </button>
    </form>
  );
}
