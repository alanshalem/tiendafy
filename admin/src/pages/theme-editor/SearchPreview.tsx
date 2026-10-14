import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { CheckCheck, Globe, MoreVertical } from 'lucide-react';
import { cn } from '@tiendafy/ui';
import {
  homeSeoDescription,
  homeSeoTitle,
  homeShareImage,
  SEO_DESCRIPTION_IDEAL,
  SEO_DESCRIPTION_SHORT,
  SEO_TITLE_IDEAL,
  truncateForSnippet,
} from '@tiendafy/types';

/*
 * Cómo se ve la portada afuera de la tienda: el resultado en Google y el
 * link compartido por WhatsApp. Usan los mismos textos e imagen que la
 * tienda (homeSeoTitle, homeSeoDescription, homeShareImage), así lo que se
 * ve acá es lo que ve la gente.
 *
 * Son "fotos" de otras apps: llevan los colores de Google y de WhatsApp, en
 * claro o en oscuro según el panel (html[data-theme=dark]; antes eran
 * recuadros blancos pegados en el panel oscuro). Las clases del modo oscuro
 * van escritas enteras: Tailwind las encuentra leyendo el código.
 *
 * El resultado de Google se dibuja al ancho de un celular y se achica para
 * entrar: a 260 px los renglones se cortaban distinto que en un teléfono.
 */

interface PreviewProps {
  storeName: string;
  /** El dominio público de la tienda, sin https (mitienda.com.ar). */
  host: string;
  seoTitle: string;
  seoDescription: string;
  favicon: string;
  shareImage: string;
  logo: string;
}

/** Ancho al que se dibuja el resultado: el de la columna de resultados en un celular. */
const PHONE_WIDTH = 360;

/**
 * Dibuja a `width` px y achica para ocupar el ancho disponible, con el alto
 * que corresponde. Sin ResizeObserver (tests) queda a tamaño real.
 */
function Scaled({ width, children }: { width: number; children: ReactNode }) {
  const outer = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ scale: 1, height: 0 });
  useLayoutEffect(() => {
    const o = outer.current;
    const i = inner.current;
    if (!o || !i || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => {
      const scale = Math.min(1, o.clientWidth / width);
      setBox({ scale, height: i.offsetHeight * scale });
    });
    ro.observe(o);
    ro.observe(i);
    return () => ro.disconnect();
  }, [width]);
  return (
    <div
      ref={outer}
      className="w-full overflow-hidden"
      style={box.height ? { height: box.height } : undefined}
    >
      <div ref={inner} style={{ width, transform: `scale(${box.scale})`, transformOrigin: 'top left' }}>
        {children}
      </div>
    </div>
  );
}

/** El resultado de búsqueda en el celular: favicon, sitio, dirección, título y descripción. */
export function GoogleResultPreview({
  storeName,
  host,
  seoTitle,
  seoDescription,
  favicon,
}: Pick<PreviewProps, 'storeName' | 'host' | 'seoTitle' | 'seoDescription' | 'favicon'>) {
  const title = homeSeoTitle(seoTitle, storeName);
  const description = truncateForSnippet(
    homeSeoDescription(seoDescription, storeName),
    SEO_DESCRIPTION_IDEAL,
  );
  return (
    <figure
      aria-label="Vista previa en Google"
      className="rounded-xl bg-[#f1f3f4] p-2 [[data-theme=dark]_&]:bg-[#171717]"
    >
      <Scaled width={PHONE_WIDTH}>
        {/* El padding deja entrar la sombra de la tarjeta (el recorte del achique la cortaba). */}
        <div className="pb-1.5">
          <div className="rounded-2xl bg-white px-4 pb-4 pt-3.5 text-left font-[Arial,Helvetica,sans-serif] shadow-[0_1px_6px_rgba(32,33,36,0.18)] [[data-theme=dark]_&]:bg-[#202124] [[data-theme=dark]_&]:shadow-none">
            <div className="flex items-center gap-3">
              <span className="flex h-[26px] w-[26px] shrink-0 items-center justify-center overflow-hidden rounded-full border border-[#dadce0] bg-white [[data-theme=dark]_&]:border-[#3c4043] [[data-theme=dark]_&]:bg-[#303134]">
                {favicon ? (
                  <img src={favicon} alt="" className="h-[18px] w-[18px] object-contain" />
                ) : (
                  <Globe
                    className="h-4 w-4 text-[#5f6368] [[data-theme=dark]_&]:text-[#9aa0a6]"
                    aria-hidden
                  />
                )}
              </span>
              <span className="min-w-0 flex-1 leading-[1.3]">
                <span className="block truncate text-sm text-[#202124] [[data-theme=dark]_&]:text-[#dadce0]">
                  {storeName}
                </span>
                <span className="block truncate text-xs text-[#4d5156] [[data-theme=dark]_&]:text-[#bdc1c6]">
                  https://{host}
                </span>
              </span>
              <MoreVertical
                className="h-4 w-4 shrink-0 text-[#5f6368] [[data-theme=dark]_&]:text-[#9aa0a6]"
                aria-hidden
              />
            </div>
            <p className="mt-3 line-clamp-2 break-words text-xl leading-[1.3] text-[#1a0dab] [[data-theme=dark]_&]:text-[#99c3ff]">
              {title}
            </p>
            <p className="mt-1.5 line-clamp-3 break-words text-sm leading-[1.58] text-[#4d5156] [[data-theme=dark]_&]:text-[#bdc1c6]">
              {description}
            </p>
          </div>
        </div>
      </Scaled>
    </figure>
  );
}

/**
 * El link mandado por WhatsApp: un mensaje propio (verde) con la tarjeta del
 * link arriba y la dirección abajo, como se ve en el teléfono. Con imagen al
 * compartir la foto va grande; con el logo de respaldo, chica al costado;
 * sin ninguna, solo el texto.
 */
export function SharePreview({
  storeName,
  host,
  seoTitle,
  seoDescription,
  shareImage,
  logo,
}: Omit<PreviewProps, 'favicon'>) {
  const title = homeSeoTitle(seoTitle, storeName);
  const description = homeSeoDescription(seoDescription, storeName);
  const image = homeShareImage(shareImage, logo);
  const text = (
    <div className="min-w-0 flex-1 px-2.5 py-2">
      <p className="line-clamp-2 break-words text-[0.8125rem] font-semibold leading-snug text-[#111b21] [[data-theme=dark]_&]:text-[#e9edef]">
        {title}
      </p>
      <p className="mt-0.5 line-clamp-2 break-words text-xs leading-snug text-[#667781] [[data-theme=dark]_&]:text-[#8696a0]">
        {description}
      </p>
      <p className="mt-1 truncate text-[0.6875rem] text-[#667781] [[data-theme=dark]_&]:text-[#8696a0]">
        {host}
      </p>
    </div>
  );
  return (
    <figure
      aria-label="Vista previa al compartir por WhatsApp"
      className="rounded-xl bg-[#efeae2] px-3 py-4 [[data-theme=dark]_&]:bg-[#0b141a]"
    >
      <div className="relative ml-auto w-[88%] max-w-[18rem]">
        {/* La colita del globo, arriba a la derecha. */}
        <span
          aria-hidden
          className="absolute -right-1.5 top-0 h-3 w-3 bg-[#d9fdd3] [clip-path:polygon(0_0,100%_0,0_100%)] [[data-theme=dark]_&]:bg-[#005c4b]"
        />
        <div className="rounded-lg rounded-tr-none bg-[#d9fdd3] p-1 text-left shadow-[0_1px_0.5px_rgba(11,20,26,0.13)] [[data-theme=dark]_&]:bg-[#005c4b]">
          <div className="overflow-hidden rounded-md bg-[#d1f0c8] [[data-theme=dark]_&]:bg-[#025144]">
            {image && !image.fromLogo ? (
              <>
                <img src={image.url} alt="" className="aspect-[1.91/1] w-full object-cover" />
                {text}
              </>
            ) : image ? (
              <div className="flex items-stretch">
                <span className="flex w-[4.5rem] shrink-0 items-center justify-center bg-white p-1.5">
                  <img src={image.url} alt="" className="max-h-14 w-full object-contain" />
                </span>
                {text}
              </div>
            ) : (
              text
            )}
          </div>
          <p className="break-all px-1.5 pt-1.5 text-[0.8125rem] leading-snug text-[#027eb5] underline [[data-theme=dark]_&]:text-[#53bdeb]">
            https://{host}
          </p>
          <p className="flex items-center justify-end gap-1 px-1.5 text-[0.6875rem] text-[#667781] [[data-theme=dark]_&]:text-white/60">
            12:30
            <CheckCheck className="h-3.5 w-3.5 text-[#53bdeb]" aria-hidden />
          </p>
        </div>
      </div>
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

/** "48 de 60 · Buen largo." debajo del campo, con una barrita que se llena hasta el ideal. */
export function LengthMeter({ kind, value }: { kind: 'title' | 'description'; value: string }) {
  const length = value.trim().length;
  const ideal = kind === 'title' ? SEO_TITLE_IDEAL : SEO_DESCRIPTION_IDEAL;
  const v = verdict(kind, length);
  return (
    <div className="mt-1.5">
      <div className="h-1 overflow-hidden rounded-full bg-bg-muted" aria-hidden>
        <div
          className={cn(
            'h-full rounded-full transition-[width] motion-reduce:transition-none',
            v.tone === 'warn' ? 'bg-warning' : v.tone === 'ok' ? 'bg-success' : 'bg-fg-subtle',
          )}
          style={{ width: `${Math.min(100, (length / ideal) * 100)}%` }}
        />
      </div>
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
    </div>
  );
}
