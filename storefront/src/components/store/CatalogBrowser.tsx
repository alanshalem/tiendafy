'use client';

import Link from 'next/link';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { useContext, useEffect, useId, useRef, useState } from 'react';
import {
  Search,
  SearchX,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Check,
  SlidersHorizontal,
  X,
} from 'lucide-react';
import { buildPageWindow, cn } from '@tiendafy/ui';
import { productGridClass, type ProductListConfig } from '@/lib/theme';
import type { CategoryDto, ProductFacets, SpecFacet } from '@/lib/catalog';
import { categoryParam, readableQuery } from '@/lib/category-url';
import { facetLabel, formatPesos } from '@/lib/facet-label';
import { logSearchClient } from '@/lib/catalog-client';
import { ProductCard, type StoreProduct } from './sections';
import { PreviewContext, useLiveTheme, usePreviewHref } from './preview';
import { EmptyState } from './EmptyState';
import { INPUT_10 } from './styles';
import { useCart } from './cart';
import { useFocusTrap } from './useFocusTrap';
import { useMediaQuery } from './use-media';
import { PredictiveSearch } from './PredictiveSearch';
import { StoreDiscovery } from './StoreDiscovery';

const SORTS: { value: string; label: string }[] = [
  { value: 'newest', label: 'Más nuevos' },
  { value: 'price_asc', label: 'Menor precio' },
  { value: 'price_desc', label: 'Mayor precio' },
  { value: 'name', label: 'Nombre A-Z' },
  { value: 'best_sellers', label: 'Más vendidos' },
];

/** Desde acá los filtros van al costado; abajo, en un panel que se abre con "Filtrar". */
const DESKTOP = '(min-width: 1024px)';

interface Props {
  products: StoreProduct[];
  total: number;
  page: number;
  totalPages: number;
  categories: CategoryDto[];
  facets: ProductFacets;
  productList: ProductListConfig;
  /** El encabezado queda fijo arriba: la barra de filtros del celular se pega debajo de él. */
  headerSticky?: boolean;
  /** El WhatsApp de la tienda, para "¿No lo encontrás?" de una búsqueda sin resultados. */
  whatsappPhone?: string;
  current: {
    q: string;
    sort: string;
    category: string;
    brand: string;
    options: string[];
    specs?: string[];
    priceMin: string;
    priceMax: string;
    /** Solo ofertas (`?onSale=1`). Puede faltar: sin él, todo el catálogo. */
    onSale?: boolean;
    /** Solo con stock (`?inStock=1`). */
    inStock?: boolean;
  };
}

export function CatalogBrowser({
  products,
  total,
  page,
  totalPages,
  categories,
  facets = { brands: [], options: [], priceMin: null, priceMax: null, specs: [] },
  productList,
  headerSticky = false,
  whatsappPhone,
  current,
}: Props) {
  // En preview, refleja al instante los cambios de "Listado de productos".
  const live = useLiveTheme();
  const list = live?.productList ?? productList;
  const href = usePreviewHref();
  const preview = useContext(PreviewContext);
  const { tenantId } = useCart();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [search, setSearch] = useState(current.q);
  const [priceMin, setPriceMin] = useState(current.priceMin);
  const [priceMax, setPriceMax] = useState(current.priceMax);
  const titleId = useId();
  const filtersId = useId();

  // Ni las facetas ni los filtros elegidos se dan por presentes: una respuesta
  // cacheada de antes de agregar un campo no lo trae, y el listado no se puede
  // caer por eso.
  const specFacets = facets.specs ?? [];
  const specSelection = current.specs ?? [];

  /**
   * La URL del listado con estos cambios. Categorías y páginas son links de
   * verdad (<a href>) y no botones: Google los sigue —antes no veía ninguna
   * categoría ni la página 2— y se pueden abrir en otra pestaña. Next/Link
   * igual navega sin recargar.
   */
  const hrefWith = (patch: Record<string, string | null>) => {
    const params = new URLSearchParams(searchParams.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v === null || v === '') params.delete(k);
      else params.set(k, v);
    }
    const query = readableQuery(params);
    return query ? `${pathname}?${query}` : pathname;
  };
  const navigate = (patch: Record<string, string | null>) => router.push(hrefWith(patch));
  // La página 1 no lleva ?page=: es la misma URL que el listado sin paginar.
  const pageHref = (n: number) => hrefWith({ page: n > 1 ? String(n) : null });

  // Opciones (Color/Talle): multi-valor con el param repetible `option`.
  const toggleOption = (value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    const cur = params.getAll('option');
    params.delete('option');
    const next = cur.includes(value) ? cur.filter((v) => v !== value) : [...cur, value];
    for (const v of next) params.append('option', v);
    params.delete('page');
    router.push(`${pathname}?${params.toString()}`);
  };

  // Ficha técnica: `spec=<definitionId>:<valor>`, repetible. Dentro de un campo
  // los valores suman (Honda o Yamaha) y entre campos recortan.
  const toggleSpec = (definitionId: string, value: string) => {
    const token = `${definitionId}:${value}`;
    const params = new URLSearchParams(searchParams.toString());
    const cur = params.getAll('spec');
    params.delete('spec');
    const next = cur.includes(token) ? cur.filter((v) => v !== token) : [...cur, token];
    for (const v of next) params.append('spec', v);
    params.delete('page');
    router.push(`${pathname}?${params.toString()}`);
  };

  const applyPrice = () =>
    navigate({ priceMin: priceMin.trim() || null, priceMax: priceMax.trim() || null, page: null });

  // Lo que saca "Limpiar filtros", y lo que cuenta el botón "Filtrar" del celular.
  const activeFilters =
    (current.onSale ? 1 : 0) +
    (current.inStock ? 1 : 0) +
    (current.brand ? 1 : 0) +
    current.options.length +
    specSelection.length +
    (current.priceMin || current.priceMax ? 1 : 0);
  const hasFilters = activeFilters > 0;
  const clearFilters = () => {
    setPriceMin('');
    setPriceMax('');
    const params = new URLSearchParams(searchParams.toString());
    for (const k of ['onSale', 'inStock', 'brand', 'option', 'spec', 'priceMin', 'priceMax', 'page'])
      params.delete(k);
    router.push(`${pathname}?${params.toString()}`);
  };

  const onSearch = (e: React.FormEvent) => {
    e.preventDefault();
    navigate({ q: search.trim() || null, page: null });
  };

  // Una búsqueda hecha, para "búsquedas populares" y lo que no encuentra nada
  // (Configuración › Búsqueda). Una vez por texto, en la primera página, y
  // nunca en la vista previa del editor (no es un comprador).
  const logged = useRef<string | null>(null);
  useEffect(() => {
    const q = current.q.trim();
    if (!q || preview || !tenantId || page !== 1 || logged.current === q) return;
    logged.current = q;
    logSearchClient(tenantId, q);
  }, [current.q, page, preview, tenantId]);

  // Filtros del celular: un panel desde abajo. Se cierra con Escape, tocando
  // afuera, con "Ver N productos" o si la pantalla pasa a ser de escritorio
  // (ahí los filtros ya están al costado). El fondo no se desplaza mientras.
  const [filtersOpen, setFiltersOpen] = useState(false);
  const desktop = useMediaQuery(DESKTOP);
  const sheet = filtersOpen && !desktop;
  const sheetRef = useFocusTrap<HTMLElement>(sheet);
  useEffect(() => {
    if (!sheet) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setFiltersOpen(false);
    };
    document.addEventListener('keydown', onKey);
    const root = document.documentElement;
    const previous = root.style.overflow;
    root.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      root.style.overflow = previous;
    };
  }, [sheet]);

  const pageWindow = buildPageWindow(page, totalPages);
  // Sin productos: ocultamos el sidebar y centramos el estado vacío en todo el ancho
  // (con sidebar quedaba corrido a la derecha, centrado solo dentro de la columna 1fr).
  const empty = products.length === 0;

  return (
    <div className="mx-auto max-w-container px-4 pb-16">
      {/* Barra superior: total + orden. En el celular se pega arriba al bajar,
          con "Filtrar" (los filtros ya no empujan los productos fuera de la
          pantalla: antes el primero quedaba a 1.155 px). */}
      <div
        className={cn(
          'sticky z-30 -mx-4 flex items-center gap-2 border-b border-fg/10 bg-bg px-4 py-2 md:static md:mx-0 md:flex-wrap md:justify-between md:gap-3 md:px-0 md:py-4',
          headerSticky ? 'top-14' : 'top-0',
        )}
      >
        {!empty && (
          <button
            type="button"
            onClick={() => setFiltersOpen(true)}
            aria-expanded={sheet}
            aria-controls={filtersId}
            className="inline-flex min-h-10 shrink-0 items-center gap-2 rounded-md border border-[rgb(var(--color-fg)/0.2)] px-3 text-sm font-medium lg:hidden"
          >
            <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
            Filtrar
            {activeFilters > 0 && (
              <span className="rounded-full bg-primary px-1.5 text-xs font-semibold text-primary-fg">
                {activeFilters}
                <span className="sr-only"> activos</span>
              </span>
            )}
          </button>
        )}
        <p className="hidden text-sm text-fg-muted md:block">
          {total} {total === 1 ? 'resultado' : 'resultados'}
          {current.q && <> para «{current.q}»</>}
        </p>
        <div className="ml-auto flex items-center gap-2 text-sm">
          <span className="hidden text-fg-muted lg:inline">Ordenar por</span>
          {/* El orden por defecto lo elige el comercio; sigue en la URL solo
              cuando el visitante elige otro, así el link se puede compartir. */}
          <SortDropdown
            value={current.sort || list.defaultSort}
            onChange={(v) => navigate({ sort: v === list.defaultSort ? null : v, page: null })}
          />
        </div>
      </div>
      <p className="pt-3 text-sm text-fg-muted md:hidden">
        {total} {total === 1 ? 'resultado' : 'resultados'}
      </p>

      <div className={empty ? 'pt-6' : 'grid gap-8 pt-4 md:pt-6 lg:grid-cols-[15rem_1fr]'}>
        {/* Filtros: al costado en la compu; en el celular, el mismo bloque se
            abre como panel desde abajo (no se repite: los links de las
            categorías están una sola vez en el HTML). Oculto sin resultados. */}
        {!empty && (
          <>
            {sheet && (
              <div
                aria-hidden="true"
                className="fixed inset-0 z-[65] bg-black/40"
                onClick={() => setFiltersOpen(false)}
              />
            )}
            <aside
              ref={sheetRef}
              id={filtersId}
              aria-labelledby={titleId}
              {...(sheet ? { role: 'dialog', 'aria-modal': true, tabIndex: -1 } : {})}
              className={
                sheet
                  ? 'fixed inset-x-0 bottom-0 z-[70] flex max-h-[88vh] flex-col rounded-t-2xl bg-bg text-fg shadow-2xl outline-none'
                  : 'hidden lg:block'
              }
            >
              <div
                className={
                  sheet ? 'flex items-center justify-between border-b border-fg/10 px-4 py-2' : 'sr-only'
                }
              >
                <h2 id={titleId} className="text-base font-bold">
                  Filtros
                </h2>
                {sheet && (
                  <button
                    type="button"
                    onClick={() => setFiltersOpen(false)}
                    aria-label="Cerrar filtros"
                    className="-mr-2 inline-flex h-10 w-10 items-center justify-center opacity-70 hover:opacity-100"
                  >
                    <X className="h-5 w-5" />
                  </button>
                )}
              </div>

              <div
                className={
                  sheet ? 'flex-1 space-y-6 overflow-y-auto overscroll-contain px-4 py-4' : 'space-y-6'
                }
              >
                <form onSubmit={onSearch}>
                  <div className="flex gap-2">
                    <input
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Buscar productos"
                      aria-label="Buscar"
                      className={INPUT_10}
                    />
                    <button
                      type="submit"
                      aria-label="Buscar"
                      className="inline-flex h-10 shrink-0 items-center justify-center rounded-md bg-primary px-3 text-sm font-semibold text-primary-fg"
                    >
                      <Search className="h-4 w-4" />
                    </button>
                  </div>
                  {current.q && (
                    <button
                      type="button"
                      onClick={() => {
                        setSearch('');
                        navigate({ q: null, page: null });
                      }}
                      className="mt-1 inline-flex min-h-10 items-center text-xs text-primary-ink hover:underline lg:min-h-0"
                    >
                      Limpiar búsqueda
                    </button>
                  )}
                </form>

                {/* Solo si hay ofertas en lo que se está viendo (o ya está activo, para poder sacarlo). */}
                {(current.onSale || (facets.onSale ?? 0) > 0) && (
                  <ToggleFilter
                    title="Ofertas"
                    label="Solo ofertas"
                    on={!!current.onSale}
                    count={facets.onSale ?? 0}
                    onToggle={() => navigate({ onSale: current.onSale ? null : '1', page: null })}
                  />
                )}

                {/* Lo agotado ya va al final; esto lo esconde del todo. Una
                    respuesta vieja sin el conteo no lo ofrece. */}
                {(current.inStock || (facets.inStock ?? 0) > 0) && (
                  <ToggleFilter
                    title="Disponibilidad"
                    label="Solo con stock"
                    on={!!current.inStock}
                    count={facets.inStock ?? 0}
                    onToggle={() => navigate({ inStock: current.inStock ? null : '1', page: null })}
                  />
                )}

                {list.filterCategories && categories.length > 0 && (
                  <CategoryFacet
                    categories={categories}
                    current={current.category}
                    hrefFor={(c) => hrefWith({ category: c ? categoryParam(c) : null, page: null })}
                  />
                )}

                {/* Precio (Desde / Hasta), en pesos */}
                {list.filterPrice && (
                  <div>
                    <FacetTitle>Precio</FacetTitle>
                    <div className="flex items-center gap-2">
                      <PriceInput
                        label="Precio desde"
                        value={priceMin}
                        onChange={setPriceMin}
                        placeholder={
                          facets.priceMin != null ? formatPesos(Math.floor(facets.priceMin / 100)) : 'Desde'
                        }
                      />
                      <span className="text-fg-muted">–</span>
                      <PriceInput
                        label="Precio hasta"
                        value={priceMax}
                        onChange={setPriceMax}
                        placeholder={
                          facets.priceMax != null ? formatPesos(Math.ceil(facets.priceMax / 100)) : 'Hasta'
                        }
                      />
                    </div>
                    <button
                      type="button"
                      onClick={applyPrice}
                      className="mt-2 min-h-10 w-full rounded-md border border-fg/15 text-xs font-semibold hover:bg-fg/5 lg:min-h-0 lg:py-1.5"
                    >
                      Aplicar
                    </button>
                  </div>
                )}

                {/* Marca (lista, single-select) */}
                {list.filterBrand && facets.brands.length > 0 && (
                  <BrandFacet
                    brands={facets.brands}
                    current={current.brand}
                    onSelect={(b) => navigate({ brand: current.brand === b ? null : b, page: null })}
                  />
                )}

                {/* Opciones del producto (Color / Talle / …), chips multi-select */}
                {list.filterOptions &&
                  facets.options.map((opt) => (
                    <OptionFacetChips
                      key={opt.name}
                      name={opt.name}
                      values={opt.values}
                      selected={current.options}
                      onToggle={toggleOption}
                    />
                  ))}

                {/* Ficha técnica: los campos que la tienda marcó como filtrables. */}
                {specFacets.map((f) => (
                  <SpecFacetChips
                    key={f.definitionId}
                    facet={f}
                    selected={specSelection}
                    onToggle={toggleSpec}
                  />
                ))}

                {hasFilters && !sheet && (
                  <button
                    type="button"
                    onClick={clearFilters}
                    className="text-xs text-primary-ink hover:underline"
                  >
                    Limpiar filtros
                  </button>
                )}
              </div>

              {/* Los filtros se aplican al tocarlos (la URL es el estado del
                  listado); el botón cierra el panel y dice cuántos quedaron. */}
              {sheet && (
                <div className="flex gap-2 border-t border-fg/10 px-4 py-3">
                  {hasFilters && (
                    <button
                      type="button"
                      onClick={clearFilters}
                      className="min-h-11 rounded-md border border-fg/15 px-4 text-sm font-semibold"
                    >
                      Limpiar filtros
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setFiltersOpen(false)}
                    className="min-h-11 flex-1 rounded-md bg-primary px-4 text-sm font-semibold text-primary-fg"
                  >
                    Ver {total} {total === 1 ? 'producto' : 'productos'}
                  </button>
                </div>
              )}
            </aside>
          </>
        )}

        {/* Grilla + paginado (o estado vacío centrado a todo el ancho) */}
        <div>
          {empty && current.q ? (
            <SearchEmpty
              q={current.q}
              hasFilters={hasFilters}
              onClearFilters={clearFilters}
              whatsappPhone={whatsappPhone}
            />
          ) : empty ? (
            <EmptyState
              icon={<SearchX className="h-8 w-8" />}
              title="Sin resultados"
              message="No encontramos productos con esos filtros. Probá cambiarlos o mirá todo el catálogo."
              cta={{ href: href('/productos'), label: 'Ver todo' }}
            />
          ) : (
            <div className={`grid gap-x-5 gap-y-8 ${productGridClass(list)}`}>
              {products.map((p) => (
                <ProductCard key={p.id} product={p} list={list} />
              ))}
            </div>
          )}

          {totalPages > 1 && (
            <nav aria-label="Páginas" className="mt-12 flex items-center justify-center gap-1.5">
              <PageLink href={page > 1 ? pageHref(page - 1) : null} rel="prev" ariaLabel="Página anterior">
                <ChevronLeft className="h-4 w-4" />
              </PageLink>
              {pageWindow.map((n, i) =>
                n === null ? (
                  <span key={`gap-${i}`} className="px-1 text-fg-muted">
                    …
                  </span>
                ) : (
                  <PageLink key={n} href={pageHref(n)} active={n === page}>
                    {n}
                  </PageLink>
                ),
              )}
              <PageLink
                href={page < totalPages ? pageHref(page + 1) : null}
                rel="next"
                ariaLabel="Página siguiente"
              >
                <ChevronRight className="h-4 w-4" />
              </PageLink>
            </nav>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Una búsqueda que no encontró nada. Antes decía lo mismo que un filtro sin
 * resultados ("probá cambiar los filtros"), cuando lo que falla es lo que se
 * escribió: va con otra búsqueda a mano, ideas para escribirla, lo que más se
 * busca y se vende, lo visto y cómo preguntar.
 */
function SearchEmpty({
  q,
  hasFilters,
  onClearFilters,
  whatsappPhone,
}: {
  q: string;
  hasFilters: boolean;
  onClearFilters: () => void;
  whatsappPhone?: string;
}) {
  return (
    <div className="mx-auto max-w-4xl">
      <div className="mx-auto max-w-xl text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-[rgb(var(--color-primary)/0.1)] text-primary-ink">
          <SearchX className="h-8 w-8" />
        </div>
        <h2 className="text-xl font-bold" style={{ fontFamily: 'var(--font-heading)' }}>
          No encontramos nada para «{q}»
        </h2>
        {hasFilters && (
          <button
            type="button"
            onClick={onClearFilters}
            className="mt-3 inline-flex min-h-10 items-center rounded-full border border-fg/15 px-4 text-sm font-semibold hover:bg-fg/5"
          >
            Buscar sin filtros
          </button>
        )}
        <PredictiveSearch
          key={q}
          variant="page"
          align="start"
          initialQuery={q}
          placeholder="Probá con otra búsqueda"
          className="mt-5 text-left"
        />
        <div className="mt-6 rounded-lg bg-fg/[0.04] p-4 text-left text-sm">
          <h3 className="font-semibold">Algunas ideas</h3>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-fg-muted">
            <li>Revisá cómo está escrito: una letra de más alcanza para no encontrar nada.</li>
            <li>
              Probá con menos palabras, o con una más general: «mancuerna» en vez de «mancuerna hexagonal 7,5
              kg».
            </li>
            <li>Buscá por el tipo de producto antes que por la marca o el modelo.</li>
          </ul>
        </div>
      </div>
      <div className="mt-12">
        <StoreDiscovery
          whatsappPhone={whatsappPhone}
          whatsappText={`¡Hola! Busco «${q}» y no lo encuentro en la tienda.`}
          excludeSearch={q}
        />
      </div>
    </div>
  );
}

/** Un precio del filtro: solo dígitos, en pesos, con el "$" adelante. */
function PriceInput({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <span className="relative block w-full min-w-0">
      <span
        aria-hidden="true"
        className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-sm text-fg-muted"
      >
        $
      </span>
      <input
        inputMode="numeric"
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, ''))}
        placeholder={placeholder}
        aria-label={label}
        className="h-10 w-full min-w-0 rounded-md border border-fg/20 bg-fg/[0.03] pl-5 pr-2 text-sm text-fg placeholder:text-fg-muted lg:h-9"
      />
    </span>
  );
}

/**
 * Un filtro de prender y apagar ("Solo ofertas", "Solo con stock"). Con el
 * número de productos, así se sabe qué se va a ver antes de tocarlo.
 */
function ToggleFilter({
  title,
  label,
  on,
  count,
  onToggle,
}: {
  title: string;
  label: string;
  on: boolean;
  count: number;
  onToggle: () => void;
}) {
  return (
    <div>
      <FacetTitle>{title}</FacetTitle>
      <button
        type="button"
        onClick={onToggle}
        role="switch"
        aria-checked={on}
        className="flex min-h-10 w-full items-center gap-2 rounded-md text-left text-sm hover:text-primary-ink"
      >
        <span
          aria-hidden="true"
          className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border ${on ? 'border-primary bg-primary text-primary-fg' : 'border-fg/25'}`}
        >
          {on && <Check className="h-3.5 w-3.5" />}
        </span>
        <span className={on ? 'font-semibold' : undefined}>{label}</span>
        {count > 0 && <span className="text-fg-muted">({count})</span>}
      </button>
    </div>
  );
}

// Facetas largas: mostramos algunos valores y colapsamos el resto tras "Ver más".
const FACET_VISIBLE = 8; // cuántos valores mostrar antes de colapsar
const FACET_SEARCHABLE = 15; // a partir de acá, buscador dentro de la faceta

/** Lógica común de una faceta colapsable + buscable (marca / opciones). */
function useCollapsibleFacet(values: string[]) {
  const [expanded, setExpanded] = useState(false);
  const [q, setQ] = useState('');
  const searchable = values.length > FACET_SEARCHABLE;
  const filtered = q ? values.filter((v) => v.toLowerCase().includes(q.toLowerCase())) : values;
  const shown = expanded ? filtered : filtered.slice(0, FACET_VISIBLE);
  const toggle = () => setExpanded((e) => !e);
  return { q, setQ, searchable, filtered, shown, expanded, toggle };
}

function FacetTitle({ children }: { children: React.ReactNode }) {
  return <h3 className="mb-2 text-xs font-bold uppercase tracking-widest text-fg-muted">{children}</h3>;
}

function FacetSearch({
  value,
  onChange,
  label,
}: {
  value: string;
  onChange: (v: string) => void;
  label: string;
}) {
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={label}
      className="mb-2 h-10 w-full rounded-md border border-fg/20 bg-fg/[0.03] px-2 text-xs text-fg placeholder:text-fg-muted lg:h-8"
    />
  );
}

function ShowMore({
  hidden,
  expanded,
  onToggle,
}: {
  hidden: number;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="mt-1 inline-flex min-h-10 items-center text-xs font-semibold text-primary-ink hover:underline lg:mt-2 lg:min-h-0"
    >
      {expanded ? 'Ver menos' : `Ver ${hidden} más`}
    </button>
  );
}

/** Opción del producto (Color/Talle/…): chips multi-select, colapsable + buscable. */
function OptionFacetChips({
  name,
  values,
  selected,
  onToggle,
}: {
  name: string;
  values: string[];
  selected: string[];
  onToggle: (v: string) => void;
}) {
  const { q, setQ, searchable, filtered, shown, expanded, toggle } = useCollapsibleFacet(values);
  return (
    <div>
      <FacetTitle>{name}</FacetTitle>
      {searchable && <FacetSearch value={q} onChange={setQ} label={`Buscar ${name.toLowerCase()}`} />}
      <div className="flex flex-wrap gap-1.5">
        {shown.map((v) => {
          const on = selected.includes(v);
          return (
            <button
              key={v}
              type="button"
              onClick={() => onToggle(v)}
              aria-pressed={on}
              className={`min-h-10 rounded-full border px-3 py-1 text-xs transition lg:min-h-0 ${on ? 'border-primary bg-primary/10 font-semibold text-primary-ink' : 'border-fg/15 hover:bg-fg/5'}`}
            >
              {facetLabel(v)}
            </button>
          );
        })}
      </div>
      {filtered.length > FACET_VISIBLE && (
        <ShowMore hidden={filtered.length - FACET_VISIBLE} expanded={expanded} onToggle={toggle} />
      )}
      {searchable && filtered.length === 0 && (
        <p className="mt-1 text-xs text-fg-muted">Sin coincidencias.</p>
      )}
    </div>
  );
}

interface CatNode {
  id: string;
  name: string;
  path: string;
  depth: number;
  children: CatNode[];
}

/** Arma el árbol de categorías desde la lista plana (por parentId). */
function buildCatTree(cats: CategoryDto[]): CatNode[] {
  const byId = new Map<string, CatNode>(
    cats.map((c) => [c.id, { id: c.id, name: c.name, path: c.path, depth: c.depth, children: [] }]),
  );
  const roots: CatNode[] = [];
  for (const c of cats) {
    const node = byId.get(c.id)!;
    const parent = c.parentId ? byId.get(c.parentId) : undefined;
    if (parent) parent.children.push(node);
    else roots.push(node);
  }
  return roots;
}

/** Ids de los ancestros de una categoría (para auto-expandir su rama). */
function ancestorsOf(id: string, cats: CategoryDto[]): string[] {
  const byId = new Map(cats.map((c) => [c.id, c]));
  const out: string[] = [];
  let cur = byId.get(id);
  while (cur?.parentId) {
    out.push(cur.parentId);
    cur = byId.get(cur.parentId);
  }
  return out;
}

/**
 * Categorías como acordeón: muestra las principales y se abren las secundarias con
 * el chevron. Mobile colapsa todo; buscador si hay muchas (busca en todo el árbol).
 * La rama de la categoría activa se auto-expande.
 *
 * Todas las categorías van en el HTML, también las colapsadas y las que quedan
 * tras "Ver más" (ocultas con `hidden`): así sus links llegan a Google.
 */
function CategoryFacet({
  categories,
  current,
  hrefFor,
}: {
  categories: CategoryDto[];
  current: string;
  /** El link al listado con esa categoría (null = todas). */
  hrefFor: (c: CategoryDto | CatNode | null) => string;
}) {
  const [catsOpen, setCatsOpen] = useState(false); // mobile
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [showAllRoots, setShowAllRoots] = useState(false);
  const [q, setQ] = useState('');

  // Auto-expandir la rama de la categoría activa (mantiene lo que abrió el usuario).
  useEffect(() => {
    if (current) setExpanded((prev) => new Set([...prev, ...ancestorsOf(current, categories)]));
  }, [current, categories]);

  const activeCat = categories.find((c) => c.id === current);
  const searchable = categories.length > FACET_SEARCHABLE;
  const toggleOpen = (id: string) =>
    setExpanded((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const tree = buildCatTree(categories);
  const rootsShown = showAllRoots ? tree.length : Math.min(tree.length, FACET_VISIBLE);
  const searchMatches = q ? categories.filter((c) => c.name.toLowerCase().includes(q.toLowerCase())) : [];

  // `rootIndex`: la posición entre las principales (las que pasan de
  // FACET_VISIBLE esperan al "Ver más"). Las hijas no lo llevan.
  const renderNode = (node: CatNode, rootIndex?: number) => {
    const hasKids = node.children.length > 0;
    const isOpen = expanded.has(node.id);
    return (
      <li key={node.id} hidden={rootIndex !== undefined && rootIndex >= rootsShown}>
        <div className="flex items-center gap-0.5" style={{ paddingLeft: `${(node.depth - 1) * 0.6}rem` }}>
          {hasKids ? (
            <button
              type="button"
              onClick={() => toggleOpen(node.id)}
              aria-label={isOpen ? 'Contraer' : 'Expandir'}
              className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded opacity-50 hover:opacity-100 lg:h-auto lg:w-auto lg:p-0.5"
            >
              <ChevronRight className={`h-3.5 w-3.5 transition-transform ${isOpen ? 'rotate-90' : ''}`} />
            </button>
          ) : (
            <span className="w-10 shrink-0 lg:w-[1.125rem]" />
          )}
          <Link
            href={hrefFor(node)}
            aria-current={current === node.id || undefined}
            className={`flex min-h-10 flex-1 items-center truncate rounded px-1.5 py-1 text-left hover:bg-fg/5 lg:block lg:min-h-0 ${current === node.id ? 'font-semibold text-primary-ink' : 'opacity-80'}`}
          >
            {node.name}
          </Link>
        </div>
        {hasKids && (
          <ul className="space-y-0.5" hidden={!isOpen}>
            {node.children.map((ch) => renderNode(ch))}
          </ul>
        )}
      </li>
    );
  };

  return (
    <div>
      <button
        type="button"
        onClick={() => setCatsOpen((o) => !o)}
        className="mb-2 flex min-h-10 w-full items-center justify-between lg:pointer-events-none lg:min-h-0"
      >
        <h3 className="text-xs font-bold uppercase tracking-widest text-fg-muted">
          Categorías{activeCat ? <span className="text-primary-ink">: {activeCat.name}</span> : ''}
        </h3>
        <ChevronDown
          className={`h-4 w-4 opacity-60 transition-transform lg:hidden ${catsOpen ? 'rotate-180' : ''}`}
        />
      </button>
      <div className={`${catsOpen ? 'block' : 'hidden'} lg:block`}>
        {searchable && <FacetSearch value={q} onChange={setQ} label="Buscar categoría" />}
        <ul className="space-y-0.5 text-sm">
          <li>
            <Link
              href={hrefFor(null)}
              aria-current={!current || undefined}
              className={`flex min-h-10 w-full items-center rounded px-1.5 py-1 pl-[2.6rem] text-left hover:bg-fg/5 lg:block lg:min-h-0 lg:pl-[1.4rem] ${!current ? 'font-semibold text-primary-ink' : 'opacity-80'}`}
            >
              Todas
            </Link>
          </li>
          {q
            ? searchMatches.map((c) => (
                <li key={c.id}>
                  <Link
                    href={hrefFor(c)}
                    className={`flex min-h-10 w-full items-center truncate rounded px-1.5 py-1 pl-[2.6rem] text-left hover:bg-fg/5 lg:block lg:min-h-0 lg:pl-[1.4rem] ${current === c.id ? 'font-semibold text-primary-ink' : 'opacity-80'}`}
                  >
                    {c.name}
                  </Link>
                </li>
              ))
            : tree.map((n, i) => renderNode(n, i))}
        </ul>
        {!q && tree.length > FACET_VISIBLE && (
          <ShowMore
            hidden={tree.length - rootsShown}
            expanded={showAllRoots}
            onToggle={() => setShowAllRoots((v) => !v)}
          />
        )}
        {q && searchMatches.length === 0 && <p className="mt-1 text-xs text-fg-muted">Sin coincidencias.</p>}
      </div>
    </div>
  );
}

/** Marca: lista single-select, colapsable + buscable. */
function BrandFacet({
  brands,
  current,
  onSelect,
}: {
  brands: string[];
  current: string;
  onSelect: (b: string) => void;
}) {
  const { q, setQ, searchable, filtered, shown, expanded, toggle } = useCollapsibleFacet(brands);
  return (
    <div>
      <FacetTitle>Marca</FacetTitle>
      {searchable && <FacetSearch value={q} onChange={setQ} label="Buscar marca" />}
      <ul className="space-y-0.5 text-sm">
        {shown.map((b) => (
          <li key={b}>
            <button
              onClick={() => onSelect(b)}
              aria-pressed={current === b}
              className={`flex min-h-10 w-full items-center truncate rounded px-2 py-1 text-left hover:bg-fg/5 lg:block lg:min-h-0 ${current === b ? 'font-semibold text-primary-ink' : 'opacity-80'}`}
            >
              {facetLabel(b)}
            </button>
          </li>
        ))}
      </ul>
      {filtered.length > FACET_VISIBLE && (
        <ShowMore hidden={filtered.length - FACET_VISIBLE} expanded={expanded} onToggle={toggle} />
      )}
      {searchable && filtered.length === 0 && (
        <p className="mt-1 text-xs text-fg-muted">Sin coincidencias.</p>
      )}
    </div>
  );
}

/** Dropdown de orden, estilizado con los colores de la tienda (no el select nativo). */
function SortDropdown({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);
  const currentOpt = SORTS.find((s) => s.value === value) ?? SORTS[0];
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="inline-flex min-h-10 items-center gap-2 rounded-md border border-[rgb(var(--color-fg)/0.2)] px-3 text-sm font-medium transition-colors lg:min-h-0 lg:py-1.5"
      >
        <span className="text-fg-muted lg:hidden">Ordenar:</span>
        {currentOpt.label}
        <ChevronDown className={`h-4 w-4 opacity-60 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="absolute right-0 z-30 mt-1.5 min-w-[11rem] overflow-hidden rounded-md border border-[rgb(var(--color-fg)/0.12)] bg-bg shadow-lg">
          {SORTS.map((s) => {
            const active = s.value === value;
            return (
              <button
                key={s.value}
                type="button"
                onClick={() => {
                  onChange(s.value);
                  setOpen(false);
                }}
                className={`flex min-h-10 w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-[rgb(var(--color-fg)/0.06)] ${active ? 'font-semibold text-primary-ink' : ''}`}
              >
                {s.label}
                {active && <Check className="h-4 w-4" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** Un número o una flecha del paginado. Sin `href` (primera/última página): deshabilitado. */
function PageLink({
  children,
  href,
  active,
  rel,
  ariaLabel,
}: {
  children: React.ReactNode;
  href: string | null;
  active?: boolean;
  rel?: string;
  ariaLabel?: string;
}) {
  const cls = `flex h-9 min-w-9 items-center justify-center rounded-md border px-2 text-sm transition-colors ${
    active ? 'border-transparent bg-primary font-semibold text-primary-fg' : 'border-fg/15 hover:bg-fg/5'
  }`;
  if (!href) {
    return (
      <span role="link" aria-disabled="true" aria-label={ariaLabel} className={`${cls} opacity-30`}>
        {children}
      </span>
    );
  }
  return (
    <Link
      href={href}
      rel={rel}
      aria-label={ariaLabel}
      aria-current={active ? 'page' : undefined}
      // La página activa usa los colores de marca pero no es un botón: no sigue
      // el estilo global de botones (globals.css).
      data-tf-plain
      className={cls}
    >
      {children}
    </Link>
  );
}

/**
 * Un campo de ficha técnica como chips. Solo se ofrecen los valores que
 * existen en el set actual: un filtro que lleva a "sin resultados" es peor que
 * no estar.
 */
function SpecFacetChips({
  facet,
  selected,
  onToggle,
}: {
  facet: SpecFacet;
  selected: string[];
  onToggle: (definitionId: string, value: string) => void;
}) {
  if (facet.values.length === 0) return null;
  return (
    <div>
      <FacetTitle>{facet.name}</FacetTitle>
      <div className="flex flex-wrap gap-1.5">
        {facet.values.map((v) => {
          const active = selected.includes(`${facet.definitionId}:${v}`);
          return (
            <button
              key={v}
              type="button"
              onClick={() => onToggle(facet.definitionId, v)}
              aria-pressed={active}
              data-tf-plain
              className={`min-h-10 rounded-md border px-2.5 py-1 text-xs transition-colors lg:min-h-0 ${
                active
                  ? 'border-primary bg-primary text-primary-fg'
                  : 'border-[rgb(var(--color-fg)/0.2)] hover:border-[rgb(var(--color-fg)/0.45)]'
              }`}
            >
              {facet.unit ? `${facetLabel(v)} ${facet.unit}` : facetLabel(v)}
            </button>
          );
        })}
      </div>
    </div>
  );
}
