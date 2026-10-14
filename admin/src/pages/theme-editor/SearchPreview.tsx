import { Globe, ImageOff } from 'lucide-react';
import { cn } from '@tiendafy/ui';
import {
  homeSeoDescription,
  homeSeoTitle,
  SEO_DESCRIPTION_IDEAL,
  SEO_DESCRIPTION_SHORT,
  SEO_TITLE_IDEAL,
  truncateForSnippet,
} from '@tiendafy/types';

/*
 * Cómo se ve la portada afuera de la tienda: el resultado en Google y el
 * link compartido por WhatsApp. Usan los mismos textos por defecto que la
 * tienda (homeSeoTitle/homeSeoDescription), así lo que se ve acá es lo que
 * ve Google. Los colores son los de Google y WhatsApp en modo claro, fijos:
 * es una foto de afuera, no parte del panel.
 */

interface PreviewProps {
  storeName: string;
  /** El dominio público de la tienda, sin https (mitienda.com.ar). */
  host: string;
  seoTitle: string;
  seoDescription: string;
  favicon: string;
  shareImage: string;
}

/** El resultado de búsqueda: favicon, nombre del sitio, dirección, título y descripción. */
export function GoogleResultPreview({
  storeName,
  host,
  seoTitle,
  seoDescription,
  favicon,
}: Omit<PreviewProps, 'shareImage'>) {
  const title = truncateForSnippet(homeSeoTitle(seoTitle, storeName), SEO_TITLE_IDEAL);
  const description = truncateForSnippet(
    homeSeoDescription(seoDescription, storeName),
    SEO_DESCRIPTION_IDEAL,
  );
  return (
    <figure
      className="rounded-lg border border-border bg-white p-3.5 text-left shadow-sm"
      aria-label="Vista previa en Google"
    >
      <div className="flex items-center gap-2.5">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-full border border-[#dadce0] bg-[#f1f3f4]">
          {favicon ? (
            <img src={favicon} alt="" className="h-[18px] w-[18px] object-contain" />
          ) : (
            <Globe className="h-4 w-4 text-[#5f6368]" aria-hidden />
          )}
        </span>
        <span className="min-w-0 leading-tight">
          <span className="block truncate text-sm text-[#202124]">{storeName}</span>
          <span className="block truncate text-xs text-[#4d5156]">https://{host}</span>
        </span>
      </div>
      <p className="mt-2 line-clamp-2 break-words text-lg leading-snug text-[#1a0dab]">{title}</p>
      <p className="mt-1 line-clamp-3 break-words text-[0.8125rem] leading-snug text-[#4d5156]">
        {description}
      </p>
    </figure>
  );
}

/**
 * El link compartido en un chat de WhatsApp. Con imagen, va grande arriba;
 * sin imagen, WhatsApp arma una tarjeta chica solo con el texto.
 */
export function SharePreview({
  storeName,
  host,
  seoTitle,
  seoDescription,
  shareImage,
}: Omit<PreviewProps, 'favicon'>) {
  const title = homeSeoTitle(seoTitle, storeName);
  const description = homeSeoDescription(seoDescription, storeName);
  const text = (
    <div className="min-w-0 px-2.5 py-2">
      <p className="line-clamp-2 break-words text-[0.8125rem] font-semibold leading-snug text-[#111b21]">
        {title}
      </p>
      <p className="mt-0.5 line-clamp-2 break-words text-xs leading-snug text-[#54656f]">{description}</p>
      <p className="mt-1 truncate text-[0.7rem] text-[#54656f]">{host}</p>
    </div>
  );
  return (
    <figure
      className="mx-auto max-w-[17rem] rounded-lg bg-[#d9fdd3] p-1 text-left shadow-sm"
      aria-label="Vista previa al compartir por WhatsApp"
    >
      <div className="overflow-hidden rounded-md bg-[#cfe9c7]">
        {shareImage ? (
          <>
            <img src={shareImage} alt="" className="aspect-[1.91/1] w-full object-cover" />
            {text}
          </>
        ) : (
          <div className="flex items-stretch">
            <span className="flex w-14 shrink-0 items-center justify-center bg-[#c3dfba] text-[#54656f]">
              <ImageOff className="h-4 w-4" aria-hidden />
            </span>
            {text}
          </div>
        )}
      </div>
      <p className="px-1.5 pb-0.5 pt-1 text-[0.8125rem] text-[#027eb5] underline decoration-[#027eb5]/40">
        https://{host}
      </p>
    </figure>
  );
}

type Verdict = { tone: 'ok' | 'warn' | 'muted'; text: string };

/** Qué tan bien está el largo de un texto para Google, en una línea. */
function verdict(kind: 'title' | 'description', length: number): Verdict {
  if (length === 0) return { tone: 'muted', text: 'Vacío: va el de la vista previa.' };
  if (kind === 'title') {
    if (length > SEO_TITLE_IDEAL) return { tone: 'warn', text: 'Largo: Google lo va a cortar.' };
    if (length < 25) return { tone: 'warn', text: 'Corto: sumá qué vendés.' };
    return { tone: 'ok', text: 'Buen largo.' };
  }
  if (length > SEO_DESCRIPTION_IDEAL) return { tone: 'warn', text: 'Larga: Google la va a cortar.' };
  if (length < SEO_DESCRIPTION_SHORT)
    return { tone: 'warn', text: 'Corta: contá qué vendés, envíos o medios de pago.' };
  return { tone: 'ok', text: 'Buen largo.' };
}

/** "48 de 60 · Buen largo." debajo del campo. */
export function LengthMeter({ kind, value }: { kind: 'title' | 'description'; value: string }) {
  const length = value.trim().length;
  const ideal = kind === 'title' ? SEO_TITLE_IDEAL : SEO_DESCRIPTION_IDEAL;
  const v = verdict(kind, length);
  return (
    <p
      className={cn(
        'mt-1 flex items-center justify-between gap-2 text-xs',
        v.tone === 'warn' ? 'text-warning' : v.tone === 'ok' ? 'text-success' : 'text-fg-subtle',
      )}
    >
      <span>{v.text}</span>
      <span className="shrink-0 tabular-nums text-fg-subtle">
        {length} de {ideal}
      </span>
    </p>
  );
}
