import { useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { Search, X } from 'lucide-react';
import { cn } from '@tiendafy/ui';
import {
  SECTION_DEFINITIONS,
  SECTION_GROUPS,
  type SectionDefinition,
  type SectionType,
  type ThemeConfig,
} from '@tiendafy/types';
import { foldText } from '../../../lib/text';
import { addBlockedReason } from './sectionOps';
import { SectionThumb } from './wireframes';

/** Tipos que coinciden con lo buscado: nombre, palabras clave y descripción, sin tildes. */
export function searchSectionTypes(
  query: string,
  defs: readonly SectionDefinition[] = SECTION_DEFINITIONS,
): SectionDefinition[] {
  const terms = foldText(query.trim()).split(/\s+/).filter(Boolean);
  if (terms.length === 0) return [...defs];
  return defs.filter((d) => {
    const hay = foldText(`${d.label} ${d.keywords} ${d.description} ${d.group}`);
    return terms.every((t) => hay.includes(t));
  });
}

/**
 * "Agregar sección": un selector con maqueta, nombre y para qué sirve cada
 * tipo, por grupos y con buscador.
 *
 * Antes era una lista de texto al final de la lista de secciones: en el
 * celular quedaba fuera de la pantalla, siempre agregaba al final y después
 * había que ir a buscar la sección nueva. Ahora:
 *   - en el celular es una hoja que sube desde abajo; en pantallas grandes,
 *     un panel al lado de la lista (no tapa la vista previa entera);
 *   - `where` dice dónde va a ir ("entre «A» y «B»"): se abre desde los "+"
 *     entre filas o desde el menú ⋯ de cada una;
 *   - lo que no entra (uno por página, el tope de secciones) aparece apagado
 *     y dice por qué;
 *   - el foco arranca en el buscador, flechas recorren, Escape cierra y el
 *     foco vuelve a donde estaba.
 */
export function AddSectionPicker({
  sections,
  where,
  onPick,
  onClose,
}: {
  sections: ThemeConfig['sections'];
  /** Dónde va a quedar, en palabras: "Al final", "Entre «A» y «B»". */
  where: string;
  onPick: (type: SectionType) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState('');
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const results = useMemo(() => searchSectionTypes(query), [query]);

  // Al cerrar sin elegir, el foco vuelve al botón que lo abrió (si se
  // eligió, lo maneja quien abre el panel de la sección nueva). Se anota al
  // primer dibujo: para cuando corren los efectos, el buscador ya tomó el foco.
  const [opener] = useState(() => document.activeElement as HTMLElement | null);
  const close = () => {
    onClose();
    if (opener?.isConnected) opener.focus();
  };

  const pick = (type: SectionType) => {
    if (addBlockedReason(sections, type)) return;
    onPick(type);
  };

  const focusables = () =>
    Array.from(dialogRef.current?.querySelectorAll<HTMLElement>('input, button') ?? []);
  const options = () =>
    Array.from(dialogRef.current?.querySelectorAll<HTMLElement>('[data-section-option]') ?? []);

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      close();
      return;
    }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      // El buscador y las opciones, en una sola fila con flechas.
      const list = [dialogRef.current!.querySelector<HTMLElement>('input')!, ...options()];
      const i = list.indexOf(document.activeElement as HTMLElement);
      const next = list[Math.max(0, Math.min(list.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1)))];
      next?.focus();
      e.preventDefault();
      return;
    }
    if (e.key === 'Tab') {
      // Trampa de foco: es un diálogo modal, Tab no se va a la vista previa.
      const list = focusables();
      const first = list[0];
      const last = list[list.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last?.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first?.focus();
      }
    }
  };

  const groups = SECTION_GROUPS.map((group) => ({
    group,
    defs: results.filter((d) => d.group === group),
  })).filter((g) => g.defs.length > 0);
  const full = addBlockedReason(sections, '') !== null;

  return createPortal(
    <div className="fixed inset-0 z-[80]" onKeyDown={onKeyDown}>
      <div className="absolute inset-0 bg-black/40 md:bg-black/10" aria-hidden onClick={close} />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={cn(
          'absolute flex flex-col overflow-hidden bg-surface text-fg shadow-overlay',
          // Celular: hoja desde abajo. md+: panel al lado de la lista.
          'inset-x-0 bottom-0 max-h-[88dvh] rounded-t-2xl pb-[env(safe-area-inset-bottom)]',
          'md:bottom-auto md:left-[calc(20rem+0.75rem)] md:right-auto md:top-[4.25rem] md:max-h-[calc(100dvh-5.5rem)] md:w-[26rem] md:rounded-xl md:border md:border-border md:pb-0',
        )}
      >
        <div className="flex shrink-0 items-start gap-2 border-b border-border px-4 pb-3 pt-3">
          <div className="min-w-0 flex-1 pt-1.5">
            <h2 id={titleId} className="text-base font-semibold">
              Agregar sección
            </h2>
            <p className="truncate text-xs text-fg-muted">{where}</p>
          </div>
          <button
            type="button"
            onClick={close}
            aria-label="Cerrar"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md text-fg-muted hover:bg-bg-muted hover:text-fg"
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>
        <div className="shrink-0 px-4 pt-3">
          <label className="relative block">
            <span className="sr-only">Buscar un tipo de sección</span>
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-subtle"
              aria-hidden
            />
            <input
              autoFocus
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                // Enter elige el primero que entra: buscar "faq" + Enter y listo.
                if (e.key !== 'Enter') return;
                const first = results.find((d) => !addBlockedReason(sections, d.type));
                if (first) {
                  e.preventDefault();
                  pick(first.type);
                }
              }}
              placeholder="Buscar: banners, preguntas, video…"
              className="h-11 w-full rounded-md border border-border-strong bg-surface pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </label>
        </div>
        {full && (
          <p className="mx-4 mt-3 rounded-md bg-warning-bg px-3 py-2 text-xs text-fg">
            {addBlockedReason(sections, '')}
          </p>
        )}
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 pb-3 pt-1">
          {groups.length === 0 && (
            <p className="px-3 py-8 text-center text-sm text-fg-muted">
              Ninguna sección con «{query}». Probá con otra palabra.
            </p>
          )}
          {groups.map(({ group, defs }) => (
            <div key={group} role="group" aria-label={group} className="pt-2">
              <div className="px-2 pb-1 text-[0.7rem] font-semibold uppercase tracking-wide text-fg-subtle">
                {group}
              </div>
              {defs.map((def) => {
                const blocked = addBlockedReason(sections, def.type);
                return (
                  <button
                    key={def.type}
                    type="button"
                    data-section-option
                    aria-disabled={blocked ? true : undefined}
                    onClick={() => pick(def.type)}
                    className={cn(
                      'flex min-h-14 w-full items-center gap-3 rounded-lg px-2 py-2 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                      blocked ? 'cursor-not-allowed opacity-50' : 'hover:bg-bg-muted',
                    )}
                  >
                    <SectionThumb type={def.type} className="w-24 shrink-0 border border-border shadow-sm" />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium text-fg">{def.label}</span>
                      <span className="block text-xs text-fg-muted">{blocked ?? def.description}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>,
    document.body,
  );
}
