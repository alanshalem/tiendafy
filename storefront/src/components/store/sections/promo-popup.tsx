'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { EDITOR_MSG, type PromoPopupData } from '@tiendafy/types';
import { useCart } from '../cart-context';
import { Icon } from '../Icon';
import { NewsletterForm } from '../NewsletterForm';
import { isFromEditor } from '@/lib/editor-bridge';
import type { SectionRenderProps } from '../section-types';
import { StoreImage } from '../StoreImage';
import { useFocusTrap } from '../useFocusTrap';
import { SectionButton } from './section-button';

/* ============================================================
   Pop-up promocional. No ocupa lugar en la página: es un <dialog>
   modal (capa superior del navegador, fondo inerte, Escape para
   cerrar) que se abre a los N segundos de la primera visita, cuando
   el mouse sale de la ventana (solo en computadoras) o las dos cosas,
   y no vuelve a aparecer hasta que lo diga la frecuencia elegida.
   ============================================================ */

/** Donde nunca se interrumpe: pagando o en la cuenta. */
const NEVER_ON = ['/checkout', '/cuenta'];

const storageKey = (tenantId: string, sectionId: string) => `tf:popup:${tenantId || 'tienda'}:${sectionId}`;

/** ¿Ya se mostró dentro de la frecuencia elegida? Sin almacenamiento (modo privado), se muestra. */
export function popupSeen(data: PromoPopupData, key: string, now = Date.now()): boolean {
  try {
    if (data.frequency === 'session') return sessionStorage.getItem(key) !== null;
    const last = Number(localStorage.getItem(key));
    if (!last) return false;
    return data.frequency === 'once' || now - last < data.frequencyDays * 86_400_000;
  } catch {
    return false;
  }
}

function markSeen(data: PromoPopupData, key: string) {
  try {
    if (data.frequency === 'session') sessionStorage.setItem(key, '1');
    else localStorage.setItem(key, String(Date.now()));
  } catch {
    // Sin almacenamiento: puede volver a aparecer, no es grave.
  }
}

/**
 * Cuándo y cada cuánto aparece, en palabras: en el preview el pop-up se abre
 * a mano, así que esto es lo único que muestra qué cambian esas opciones.
 */
export function popupWhen(data: PromoPopupData): string {
  const secs = `a los ${data.delaySeconds} ${data.delaySeconds === 1 ? 'segundo' : 'segundos'} de entrar`;
  const when =
    data.trigger === 'exit'
      ? 'cuando el mouse se va de la página (solo en computadoras)'
      : data.trigger === 'both'
        ? `${secs} o al querer irse, lo que pase primero`
        : secs;
  const freq =
    data.frequency === 'once'
      ? 'una sola vez por persona'
      : data.frequency === 'session'
        ? 'una vez por visita'
        : `y otra vez a los ${data.frequencyDays} ${data.frequencyDays === 1 ? 'día' : 'días'}`;
  return `${when}, ${freq}`;
}

/** ¿Se ve donde está? (`hideOn` lo oculta con CSS en un dispositivo: ahí no se abre.) */
function isRendered(el: HTMLElement | null): boolean {
  for (let n = el; n && n !== document.body; n = n.parentElement)
    if (getComputedStyle(n).display === 'none') return false;
  return !!el;
}

function CouponCode({ code }: { code: string }) {
  const [copied, setCopied] = useState<boolean | null>(null);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };
  return (
    <div className="mt-4">
      <div className="flex items-stretch justify-center gap-2">
        <span className="flex min-h-11 items-center rounded-md border-2 border-dashed border-current px-4 font-mono text-lg font-bold tracking-wider">
          {code}
        </span>
        <button
          type="button"
          onClick={copy}
          className="min-h-11 rounded-md border border-current px-4 text-sm font-semibold hover:opacity-80"
        >
          {copied ? 'Copiado' : 'Copiar'}
        </button>
      </div>
      <p className="mt-1 min-h-5 text-xs text-fg-muted" aria-live="polite">
        {copied === true
          ? 'Código copiado. Pegalo cuando pagues.'
          : copied === false
            ? 'Copialo a mano: el navegador no dejó.'
            : ''}
      </p>
    </div>
  );
}

function PopupBody({
  data,
  titleId,
  onClose,
  active,
}: {
  data: PromoPopupData;
  titleId: string;
  onClose: () => void;
  active: boolean;
}) {
  // Tab y Shift+Tab quedan adentro; al cerrar, el foco vuelve a donde estaba.
  const trap = useFocusTrap<HTMLDivElement>(active);
  const hasImage = !!(data.image || data.mobileImage);
  return (
    <div ref={trap} tabIndex={-1} className="tf-in relative outline-none">
      <button
        type="button"
        onClick={onClose}
        aria-label="Cerrar"
        className="absolute right-1 top-1 z-10 flex h-11 w-11 items-center justify-center rounded-full bg-bg/85 text-fg shadow-sm hover:bg-bg"
      >
        <Icon name="close" className="h-5 w-5" />
      </button>
      {hasImage && (
        <>
          {/* En celular, la imagen propia si la hay (vertical u otra proporción). */}
          <div className="relative aspect-[4/3] w-full md:hidden">
            <StoreImage src={data.mobileImage || data.image} alt="" sizes="100vw" className="object-cover" />
          </div>
          <div className="relative hidden aspect-[16/9] w-full md:block">
            <StoreImage src={data.image || data.mobileImage} alt="" sizes="32rem" className="object-cover" />
          </div>
        </>
      )}
      <div className="px-6 pb-6 pt-6 text-center">
        {data.title && (
          <h2 id={titleId} className="text-2xl font-bold" style={{ fontFamily: 'var(--font-heading)' }}>
            {data.title}
          </h2>
        )}
        {data.text && <p className="mt-2 whitespace-pre-line text-fg-muted">{data.text}</p>}
        {data.couponCode.trim() && <CouponCode code={data.couponCode.trim()} />}
        {data.newsletter && <NewsletterForm source="home" />}
        <div className="mt-5 flex justify-center empty:hidden">
          <SectionButton text={data.buttonText} link={data.link} />
        </div>
      </div>
    </div>
  );
}

export function PromoPopupSection({ section, data, preview }: SectionRenderProps<'promo-popup'>) {
  const pathname = usePathname() ?? '/';
  const { tenantId } = useCart();
  const anchor = useRef<HTMLDivElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const titleId = useId();
  const key = storageKey(tenantId, section.id);

  // Lo último de la data, sin que cada render (que arma un objeto nuevo)
  // reinicie la espera de los segundos.
  const latest = useRef(data);
  useEffect(() => {
    latest.current = data;
  });

  const show = useCallback(
    (force = false) => {
      const el = dialog.current;
      if (!el || el.open) return;
      if (!force) {
        if (popupSeen(latest.current, key) || !isRendered(anchor.current)) return;
        // Otro diálogo abierto (el carrito, un formulario): no se encima.
        if (document.querySelector('dialog[open]')) return;
        markSeen(latest.current, key);
      }
      el.showModal();
      setOpen(true);
    },
    [key],
  );
  const close = useCallback(() => dialog.current?.close(), []);

  // La tienda: a los N segundos y/o al querer irse (mouse que sale por arriba).
  useEffect(() => {
    if (preview || NEVER_ON.some((p) => pathname.startsWith(p))) return;
    const timers: number[] = [];
    if (data.trigger !== 'exit') timers.push(window.setTimeout(() => show(), data.delaySeconds * 1000));
    // En celular no hay "salida": el disparador por salida es solo de computadora.
    const desktop = window.matchMedia?.('(hover: hover) and (pointer: fine)').matches;
    const onLeave = (e: MouseEvent) => {
      if (!e.relatedTarget && e.clientY <= 0) show();
    };
    const exit = data.trigger !== 'delay' && desktop;
    if (exit) document.addEventListener('mouseout', onLeave);
    return () => {
      timers.forEach(clearTimeout);
      if (exit) document.removeEventListener('mouseout', onLeave);
    };
  }, [preview, pathname, data.trigger, data.delaySeconds, show]);

  // El editor: se abre al abrir su panel y se cierra al pasar a otro.
  useEffect(() => {
    if (!preview) return;
    const onMsg = (e: MessageEvent) => {
      if (!isFromEditor(e) || e.data?.type !== EDITOR_MSG.focusSection) return;
      if (e.data.sectionId === section.id) show(true);
      else close();
    };
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, [preview, section.id, show, close]);

  return (
    // `contents`: no ocupa lugar ni toma el espaciado de la sección.
    <div ref={anchor} className="contents" data-promo-popup={section.id}>
      {preview && (
        <div className="mx-auto max-w-container px-4 py-4">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-dashed border-fg/25 px-4 py-3 text-sm text-fg-muted">
            <span>
              Pop-up: {data.title || 'sin título'}. En la tienda no ocupa lugar: aparece encima de la página{' '}
              {popupWhen(data)}.
            </span>
            <button
              type="button"
              data-region-action="passthrough"
              onClick={() => show(true)}
              className="min-h-10 rounded-md bg-primary px-4 font-semibold text-primary-fg"
            >
              Ver el pop-up
            </button>
          </div>
        </div>
      )}
      <dialog
        ref={dialog}
        // En el editor, la sección entera abre su panel al tocarla: sin esto,
        // la X, "Copiar" y el fondo del pop-up abierto no hacían nada.
        data-region-action="passthrough"
        aria-labelledby={data.title ? titleId : undefined}
        aria-label={data.title ? undefined : 'Promoción'}
        onClose={() => setOpen(false)}
        // Un clic en el fondo oscuro (fuera de la tarjeta) cierra.
        onClick={(e) => {
          if (e.target === e.currentTarget) close();
        }}
        className="m-auto max-h-[calc(100dvh-2rem)] w-[min(30rem,calc(100vw-2rem))] overflow-y-auto overscroll-contain rounded-xl border-0 bg-bg p-0 text-fg shadow-2xl backdrop:bg-black/55"
      >
        {open && <PopupBody data={data} titleId={titleId} onClose={close} active={open} />}
      </dialog>
    </div>
  );
}
