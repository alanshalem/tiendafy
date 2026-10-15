'use client';

import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { LayoutGrid } from 'lucide-react';
import { formatMoney } from '@tiendafy/types';
import { cn } from '@tiendafy/ui/cn';
import { categoryHref } from '@/lib/category-url';
import {
  fetchPopularSearchesClient,
  fetchSearchSuggestionsClient,
  type SearchSuggestions,
} from '@/lib/catalog-client';
import { Icon } from './Icon';
import { InitialFallback } from './InitialFallback';
import { StoreImage } from './StoreImage';
import { useCart } from './cart-context';
import { usePreviewHref } from './preview';

/** Menos que esto no se busca (la API tampoco): con una letra aparece medio catálogo. */
export const SUGGEST_MIN_LENGTH = 2;
/** Lo que se espera entre teclas antes de preguntar: no un pedido por letra. */
export const SUGGEST_DEBOUNCE_MS = 200;
const SUGGEST_LIMIT = 6;

/** La URL de resultados para lo escrito (o el listado entero, sin texto). */
export const searchPath = (q: string) => `/productos${q.trim() ? `?q=${encodeURIComponent(q.trim())}` : ''}`;

type Option =
  | { kind: 'category'; id: string; href: string; label: string }
  | { kind: 'product'; id: string; href: string; product: SearchSuggestions['products'][number] }
  | { kind: 'popular'; id: string; href: string; label: string }
  | { kind: 'all'; id: string; href: string; label: string };

/**
 * El buscador con sugerencias mientras se escribe (patrón combobox de ARIA):
 * productos con foto y precio, las categorías que se llaman así y "Ver los N
 * resultados". Con la caja vacía, las búsquedas populares.
 *
 * Teclado: flechas para recorrer, Enter para ir a la opción marcada (o a los
 * resultados, sin ninguna marcada), Escape para cerrar y, otra vez, borrar.
 * Antes la caja solo mandaba al listado: "kettlebell" no mostraba nada
 * mientras se escribía.
 */
export function PredictiveSearch({
  variant = 'header',
  align = 'end',
  autoFocus = false,
  placeholder = 'Buscar',
  initialQuery = '',
  onNavigate,
  className,
}: {
  /** header: la caja chica del encabezado. mobile: la del celular. page: una grande (404, sin resultados). */
  variant?: 'header' | 'mobile' | 'page';
  /** Hacia dónde se abre la lista: pegada al borde izquierdo o al derecho de la caja. */
  align?: 'start' | 'end';
  autoFocus?: boolean;
  placeholder?: string;
  initialQuery?: string;
  onNavigate?: () => void;
  className?: string;
}) {
  const router = useRouter();
  const href = usePreviewHref();
  const { tenantId } = useCart();
  const uid = useId();
  const listId = `${uid}-lista`;
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const [q, setQ] = useState(initialQuery);
  const [expanded, setExpanded] = useState(false);
  const [active, setActive] = useState(-1);
  const [data, setData] = useState<{ term: string; result: SearchSuggestions } | null>(null);
  const [popular, setPopular] = useState<string[] | null>(null);
  const cache = useRef(new Map<string, SearchSuggestions>());

  const term = q.trim();
  const searching = term.length >= SUGGEST_MIN_LENGTH;

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus();
  }, [autoFocus]);

  // Sugerencias: esperar a que se deje de tipear, y cortar el pedido viejo
  // si se siguió escribiendo (que no pise una respuesta más nueva).
  useEffect(() => {
    if (!searching || !tenantId) return;
    const key = term.toLowerCase();
    const cached = cache.current.get(key);
    if (cached) {
      setData({ term, result: cached });
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void fetchSearchSuggestionsClient(tenantId, term, SUGGEST_LIMIT, controller.signal).then((result) => {
        if (controller.signal.aborted || !result) return;
        cache.current.set(key, result);
        setData({ term, result });
      });
    }, SUGGEST_DEBOUNCE_MS);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [term, searching, tenantId]);

  // Las populares, una vez y recién al usar la caja: no en cada página.
  useEffect(() => {
    if (!expanded || popular !== null || !tenantId) return;
    let current = true;
    void fetchPopularSearchesClient(tenantId, 6).then((terms) => {
      if (current) setPopular(terms);
    });
    return () => {
      current = false;
    };
  }, [expanded, popular, tenantId]);

  // Lo que se muestra es de lo escrito AHORA: una respuesta de "kett" no se
  // ofrece cuando ya dice "kettlebell" (hasta que llegue la nueva).
  const shown = searching && data && data.term.toLowerCase() === term.toLowerCase() ? data.result : null;

  const options = useMemo<Option[]>(() => {
    if (!searching) {
      return (popular ?? []).map((t, i) => ({
        kind: 'popular' as const,
        id: `${uid}-p${i}`,
        href: searchPath(t),
        label: t,
      }));
    }
    if (!shown) return [];
    return [
      ...shown.categories.map((c) => ({
        kind: 'category' as const,
        id: `${uid}-c${c.id}`,
        href: categoryHref(c),
        label: c.name,
      })),
      ...shown.products.map((p) => ({
        kind: 'product' as const,
        id: `${uid}-x${p.id}`,
        href: `/productos/${p.slug}`,
        product: p,
      })),
      {
        kind: 'all' as const,
        id: `${uid}-todo`,
        href: searchPath(term),
        label:
          shown.total === 0
            ? `Buscar «${term}» igual`
            : `Ver ${shown.total === 1 ? 'el resultado' : `los ${shown.total} resultados`} para «${term}»`,
      },
    ];
  }, [searching, shown, popular, term, uid]);

  const open = expanded && options.length > 0;
  const activeOption = open && active >= 0 ? options[active] : undefined;

  // Cerrar al tocar afuera.
  useEffect(() => {
    if (!expanded) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setExpanded(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [expanded]);

  const go = (to: string) => {
    setExpanded(false);
    setActive(-1);
    inputRef.current?.blur();
    onNavigate?.();
    router.push(href(to));
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!expanded) setExpanded(true);
      if (options.length === 0) return;
      const step = e.key === 'ArrowDown' ? 1 : -1;
      setActive((i) =>
        i < 0 ? (step > 0 ? 0 : options.length - 1) : (i + step + options.length) % options.length,
      );
    } else if (e.key === 'Enter' && activeOption) {
      e.preventDefault();
      go(activeOption.href);
    } else if (e.key === 'Escape') {
      if (open) {
        e.preventDefault();
        setExpanded(false);
        setActive(-1);
      } else if (q) {
        e.preventDefault();
        setQ('');
      }
    }
  };

  const status = !expanded
    ? ''
    : searching && shown
      ? shown.total === 0
        ? `No hay productos para «${term}».`
        : `${shown.total} ${shown.total === 1 ? 'producto' : 'productos'}. Usá las flechas para recorrer las sugerencias.`
      : '';

  const isPage = variant === 'page';
  const isMobile = variant === 'mobile';

  return (
    <div
      ref={rootRef}
      className={cn('relative', className)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setExpanded(false);
      }}
    >
      <form
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          go(searchPath(q));
        }}
        className={cn(
          'flex items-center gap-1.5',
          isPage ? 'rounded-full border border-fg/15 bg-bg px-4 text-fg' : 'rounded-full bg-current/10 px-3',
        )}
      >
        {!isMobile && (
          <button type="submit" aria-label="Buscar" className="opacity-70 hover:opacity-100">
            <Icon name="search" className="h-4 w-4" />
          </button>
        )}
        <input
          ref={inputRef}
          type={isMobile ? 'search' : 'text'}
          role="combobox"
          aria-label="Buscar"
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls={listId}
          aria-activedescendant={activeOption?.id}
          autoComplete="off"
          enterKeyHint="search"
          value={q}
          placeholder={placeholder}
          onChange={(e) => {
            setQ(e.target.value);
            setExpanded(true);
            setActive(-1);
          }}
          onFocus={() => setExpanded(true)}
          onKeyDown={onKeyDown}
          className={cn(
            'w-full bg-transparent outline-none placeholder:opacity-60',
            isPage ? 'h-12 text-base' : isMobile ? 'h-10 text-base' : 'h-8 w-32 text-sm lg:w-44',
          )}
          style={isPage ? undefined : { color: 'currentColor' }}
        />
        {isMobile && (
          <button type="submit" aria-label="Buscar" className="-m-2 p-2 opacity-70 hover:opacity-100">
            <Icon name="search" className="h-4 w-4" />
          </button>
        )}
      </form>

      <div
        id={listId}
        role="listbox"
        aria-label={searching ? `Sugerencias para «${term}»` : 'Búsquedas populares'}
        hidden={!open}
        className={cn(
          'absolute z-[70] mt-2 max-h-[min(70vh,34rem)] overflow-y-auto rounded-lg border border-fg/10 bg-bg py-2 text-left text-fg shadow-xl [text-shadow:none]',
          isMobile ? 'inset-x-0' : 'w-[min(26rem,calc(100vw-2rem))]',
          !isMobile && (align === 'start' ? 'left-0' : 'right-0'),
        )}
      >
        {open && (
          <>
            {!searching && <GroupLabel>Búsquedas populares</GroupLabel>}
            {options.map((opt, i) => {
              const prev = options[i - 1];
              const heading =
                opt.kind !== prev?.kind && opt.kind === 'category'
                  ? 'Categorías'
                  : opt.kind !== prev?.kind && opt.kind === 'product'
                    ? 'Productos'
                    : null;
              return (
                <div key={opt.id} role="presentation">
                  {heading && <GroupLabel>{heading}</GroupLabel>}
                  <div
                    id={opt.id}
                    role="option"
                    aria-selected={i === active}
                    // El foco se queda en la caja: tocar una opción no la cierra antes del clic.
                    onMouseDown={(e) => e.preventDefault()}
                    onMouseEnter={() => setActive(i)}
                    onClick={() => go(opt.href)}
                    className={cn(
                      'flex min-h-10 cursor-pointer items-center gap-3 px-3 py-1.5 text-sm',
                      i === active && 'bg-fg/[0.06]',
                      opt.kind === 'all' &&
                        'mt-1 border-t border-fg/10 pt-2.5 font-semibold text-primary-ink',
                    )}
                  >
                    <OptionBody option={opt} />
                  </div>
                </div>
              );
            })}
          </>
        )}
      </div>

      <p role="status" aria-live="polite" className="sr-only">
        {status}
      </p>
    </div>
  );
}

function GroupLabel({ children }: { children: ReactNode }) {
  return (
    <div
      role="presentation"
      className="px-3 pb-1 pt-2 text-[0.7rem] font-bold uppercase tracking-widest text-fg-muted"
    >
      {children}
    </div>
  );
}

function OptionBody({ option }: { option: Option }) {
  switch (option.kind) {
    case 'category':
      return (
        <>
          <LayoutGrid aria-hidden="true" className="h-4 w-4 shrink-0 opacity-60" />
          <span className="min-w-0 truncate">{option.label}</span>
        </>
      );
    case 'popular':
      return (
        <>
          <Icon name="search" className="h-4 w-4 shrink-0 opacity-60" />
          <span className="min-w-0 truncate">{option.label}</span>
        </>
      );
    case 'all':
      return <span className="min-w-0 truncate">{option.label}</span>;
    case 'product': {
      const p = option.product;
      const soldOut = p.stock != null && p.stock <= 0;
      const onSale = !!p.compareAtAmount && p.compareAtAmount > p.priceAmount;
      return (
        <>
          <span className="relative h-11 w-11 shrink-0 overflow-hidden rounded-md bg-fg/5">
            {p.image ? (
              <StoreImage src={p.image} alt="" sizes="44px" className="object-cover" />
            ) : (
              <InitialFallback
                name={p.name}
                className="flex h-full w-full items-center justify-center text-sm font-bold text-fg-muted"
              />
            )}
          </span>
          <span className="min-w-0 flex-1">
            <span className="line-clamp-2 leading-snug">{p.name}</span>
            <span className="mt-0.5 flex flex-wrap items-baseline gap-x-2 text-xs">
              <span className={cn('font-semibold', onSale && 'text-danger')}>
                {formatMoney(p.priceAmount, p.currency)}
              </span>
              {onSale && (
                <span className="text-fg-muted line-through">
                  {formatMoney(p.compareAtAmount!, p.currency)}
                </span>
              )}
              {soldOut && <span className="text-fg-muted">Sin stock</span>}
            </span>
          </span>
        </>
      );
    }
  }
}
