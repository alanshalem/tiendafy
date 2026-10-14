'use client';

import { useCallback, useSyncExternalStore } from 'react';
import { countdownParts, countdownSpeech, formatArgentinaEnd } from '@tiendafy/types';
import { ProductGrid, SectionTitle, usePreviewPlaceholders } from '../section-primitives';
import { useSectionProducts } from '../SectionProductsContext';
import type { SectionRenderProps } from '../section-types';
import { SectionButton } from './section-button';

/**
 * La hora actual, al segundo, solo en el navegador. En el servidor (y en la
 * hidratación, que tiene que dar lo mismo que el servidor) vale null: el
 * reloj del servidor no es el del comprador, y calcular ahí lo que falta
 * hacía que el HTML y el primer render del navegador no coincidieran. Con
 * `active` en false no corre ningún intervalo.
 */
function useNowSeconds(active: boolean): number | null {
  const subscribe = useCallback(
    (tick: () => void) => {
      if (!active) return () => {};
      const id = window.setInterval(tick, 1000);
      return () => window.clearInterval(id);
    },
    [active],
  );
  return useSyncExternalStore(
    subscribe,
    () => Math.floor(Date.now() / 1000) * 1000,
    () => null,
  );
}

const UNITS = [
  { key: 'days', label: 'días' },
  { key: 'hours', label: 'horas' },
  { key: 'minutes', label: 'min' },
  { key: 'seconds', label: 'seg' },
] as const;

/** Las cajas del cronómetro. Ancho fijo y números tabulares: cambiar de 59 a 00 no mueve nada. */
function Clock({ remaining }: { remaining: number | null }) {
  const parts = remaining === null ? null : countdownParts(remaining);
  return (
    <div className="flex gap-2 sm:gap-3" aria-hidden="true">
      {UNITS.map(({ key, label }) => (
        <div
          key={key}
          className="flex w-16 flex-col items-center rounded-lg bg-primary py-2 text-primary-fg sm:w-[4.5rem]"
        >
          <span className="text-2xl font-bold leading-tight tabular-nums sm:text-3xl">
            {parts ? String(parts[key]).padStart(2, '0') : '--'}
          </span>
          <span className="text-[11px] font-medium uppercase tracking-wide opacity-85">{label}</span>
        </div>
      ))}
    </div>
  );
}

/**
 * Ofertas con cronómetro: título, cuenta regresiva hasta `endsAt` y los
 * productos de su origen (por defecto, los que están en oferta). El HTML del
 * servidor trae el cronómetro con guiones y la fecha de cierre escrita; en el
 * navegador arranca a contar. Al terminar se oculta o queda con un mensaje,
 * según lo que eligió el comercio.
 */
export function CountdownOfferSection({
  section,
  data,
  products,
  productList,
}: SectionRenderProps<'countdown-offer'>) {
  const preview = usePreviewPlaceholders();
  const resolved = useSectionProducts(section.id);
  const end = data.endsAt ? Date.parse(data.endsAt) : NaN;
  const hasEnd = Number.isFinite(end);
  const now = useNowSeconds(hasEnd);
  const remaining = hasEnd && now !== null ? Math.max(0, end - now) : null;
  const ended = remaining === 0;

  // Sin el origen resuelto (la API no respondió), lo que haya en oferta.
  const list =
    resolved ?? products.filter((p) => p.compareAtAmount && p.compareAtAmount > p.priceAmount).slice(0, 8);

  if (ended && data.whenEnded === 'hide' && !preview) return null;

  // Lo que lee un lector de pantalla: cambia como mucho una vez por minuto.
  const speech = remaining === null ? '' : countdownSpeech(Math.ceil(remaining / 60_000) * 60_000);
  const endLabel = hasEnd ? formatArgentinaEnd(data.endsAt) : '';

  return (
    <section className="mx-auto max-w-container py-12">
      <div className="flex flex-col gap-5 px-4 md:flex-row md:items-end md:justify-between">
        <div className="min-w-0">
          {data.title && <SectionTitle className="text-2xl font-bold">{data.title}</SectionTitle>}
          {ended ? (
            <p className="mt-2 text-fg-muted">{data.endedText || 'Esta oferta terminó.'}</p>
          ) : (
            <>
              {data.text && <p className="mt-2 text-fg-muted">{data.text}</p>}
              {endLabel && (
                <p className="mt-1 text-sm text-fg-muted">{`Termina el ${endLabel} (hora argentina).`}</p>
              )}
            </>
          )}
        </div>
        {hasEnd && !ended && (
          <div className="shrink-0">
            <Clock remaining={remaining} />
            <p className="sr-only" aria-live="polite" aria-atomic="true">
              {speech}
            </p>
          </div>
        )}
      </div>

      {preview && !hasEnd && (
        <p className="mx-4 mt-4 rounded-md bg-fg/5 p-3 text-sm text-fg-muted">
          Elegí cuándo termina la oferta para que se vea el cronómetro.
        </p>
      )}
      {preview && ended && data.whenEnded === 'hide' && (
        <p className="mx-4 mt-4 rounded-md bg-fg/5 p-3 text-sm text-fg-muted">
          La oferta ya terminó: en la tienda esta sección no se muestra.
        </p>
      )}

      {!ended && list.length > 0 && (
        // La grilla trae su propio margen arriba: acá va pegada al encabezado.
        <div className="[&>section]:pb-0 [&>section]:pt-6">
          <ProductGrid title="" products={list} list={productList} carousel={data.carousel} />
        </div>
      )}
      {preview && !ended && list.length === 0 && (
        <p className="mx-4 mt-4 rounded-md bg-fg/5 p-3 text-sm text-fg-muted">
          Todavía no hay productos para mostrar: cargá un precio tachado en alguno o elegilos a mano.
        </p>
      )}

      <div className="mt-6 flex justify-center px-4 empty:hidden">
        <SectionButton text={data.buttonText} link={data.link} />
      </div>
    </section>
  );
}
