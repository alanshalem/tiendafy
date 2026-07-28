'use client';

import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { Search, SearchX, ChevronLeft, ChevronRight, ChevronDown, Check } from 'lucide-react';
import { buildPageWindow } from '@tiendafy/ui';
import { colClass, type ProductListConfig } from '@/lib/theme';
import type { CategoryDto, ProductFacets } from '@/lib/catalog';
import { ProductCard, type StoreProduct } from './sections';
import { useLiveTheme, usePreviewHref } from './preview';
import { EmptyState } from './EmptyState';

const SORTS: { value: string; label: string }[] = [
  { value: 'newest', label: 'Más nuevos' },
  { value: 'price_asc', label: 'Menor precio' },
  { value: 'price_desc', label: 'Mayor precio' },
  { value: 'name', label: 'Nombre A-Z' },
];

interface Props {
  products: StoreProduct[];
  total: number;
  page: number;
  totalPages: number;
  categories: CategoryDto[];
  facets: ProductFacets;
  productList: ProductListConfig;
  current: {
    q: string;
    sort: string;
    category: string;
    brand: string;
    options: string[];
    priceMin: string;
    priceMax: string;
  };
}

export function CatalogBrowser({
  products,
  total,
  page,
  totalPages,
  categories,
  facets = { brands: [], options: [], priceMin: null, priceMax: null },
  productList,
  current,
}: Props) {
  // En preview, refleja al instante los cambios de "Listado de productos".
  const live = useLiveTheme();
  const list = live?.productList ?? productList;
  const href = usePreviewHref();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [search, setSearch] = useState(current.q);
  const [priceMin, setPriceMin] = useState(current.priceMin);
  const [priceMax, setPriceMax] = useState(current.priceMax);

  const navigate = (patch: Record<string, string | null>) => {
    const params = new URLSearchParams(searchParams.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v === null || v === '') params.delete(k);
      else params.set(k, v);
    }
    router.push(`${pathname}?${params.toString()}`);
  };

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

  const applyPrice = () =>
    navigate({ priceMin: priceMin.trim() || null, priceMax: priceMax.trim() || null, page: null });

  const hasFilters = !!(current.brand || current.options.length || current.priceMin || current.priceMax);
  const clearFilters = () => {
    setPriceMin('');
    setPriceMax('');
    const params = new URLSearchParams(searchParams.toString());
    for (const k of ['brand', 'option', 'priceMin', 'priceMax', 'page']) params.delete(k);
    router.push(`${pathname}?${params.toString()}`);
  };

  const onSearch = (e: React.FormEvent) => {
    e.preventDefault();
    navigate({ q: search.trim() || null, page: null });
  };

  const pageWindow = buildPageWindow(page, totalPages);
  // Sin productos: ocultamos el sidebar y centramos el estado vacío en todo el ancho
  // (con sidebar quedaba corrido a la derecha, centrado solo dentro de la columna 1fr).
  const empty = products.length === 0;

  return (
    <div className="mx-auto max-w-container px-4 pb-16">
      {/* Barra superior: total + orden */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-black/10 py-4">
        <p className="text-sm opacity-60">
          {total} {total === 1 ? 'resultado' : 'resultados'}
          {current.q && <> para «{current.q}»</>}
        </p>
        <div className="flex items-center gap-2 text-sm">
          <span className="opacity-60">Ordenar por</span>
          <SortDropdown
            value={current.sort || 'newest'}
            onChange={(v) => navigate({ sort: v === 'newest' ? null : v, page: null })}
          />
        </div>
      </div>

      <div className={empty ? 'pt-6' : 'grid gap-8 pt-6 lg:grid-cols-[15rem_1fr]'}>
        {/* Sidebar: búsqueda + categorías (oculto si no hay resultados) */}
        {!empty && (
          <aside className="space-y-6">
            <form onSubmit={onSearch}>
              <div className="flex gap-2">
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Buscar productos"
                  aria-label="Buscar"
                  className="h-10 w-full rounded-md border border-black/15 bg-white px-3 text-sm text-black"
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
                  className="mt-2 text-xs text-primary hover:underline"
                >
                  Limpiar búsqueda
                </button>
              )}
            </form>

            {list.filterCategories && categories.length > 0 && (
              <CategoryFacet
                categories={categories}
                current={current.category}
                onSelect={(id) => navigate({ category: id, page: null })}
              />
            )}

            {/* Precio (Desde / Hasta) */}
            {list.filterPrice && (
              <div>
                <h3 className="mb-2 text-xs font-bold uppercase tracking-widest opacity-60">Precio</h3>
                <div className="flex items-center gap-2">
                  <input
                    inputMode="numeric"
                    value={priceMin}
                    onChange={(e) => setPriceMin(e.target.value.replace(/\D/g, ''))}
                    placeholder={
                      facets.priceMin != null ? String(Math.floor(facets.priceMin / 100)) : 'Desde'
                    }
                    aria-label="Precio desde"
                    className="h-9 w-full min-w-0 rounded-md border border-black/15 bg-white px-2 text-sm text-black"
                  />
                  <span className="opacity-40">–</span>
                  <input
                    inputMode="numeric"
                    value={priceMax}
                    onChange={(e) => setPriceMax(e.target.value.replace(/\D/g, ''))}
                    placeholder={facets.priceMax != null ? String(Math.ceil(facets.priceMax / 100)) : 'Hasta'}
                    aria-label="Precio hasta"
                    className="h-9 w-full min-w-0 rounded-md border border-black/15 bg-white px-2 text-sm text-black"
                  />
                </div>
                <button
                  type="button"
                  onClick={applyPrice}
                  className="mt-2 w-full rounded-md border border-black/15 py-1.5 text-xs font-semibold hover:bg-black/5"
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

            {hasFilters && (
              <button type="button" onClick={clearFilters} className="text-xs text-primary hover:underline">
                Limpiar filtros
              </button>
            )}
          </aside>
        )}

        {/* Grilla + paginado (o estado vacío centrado a todo el ancho) */}
        <div>
          {empty ? (
            <EmptyState
              icon={<SearchX className="h-8 w-8" />}
              title="Sin resultados"
              message="No encontramos productos con esos filtros. Probá cambiarlos o mirá todo el catálogo."
              cta={{ href: href('/productos'), label: 'Ver todo' }}
            />
          ) : (
            <div className={`grid gap-x-5 gap-y-8 ${colClass[list.columns] ?? colClass[4]}`}>
              {products.map((p) => (
                <ProductCard key={p.id} product={p} list={list} />
              ))}
            </div>
          )}

          {totalPages > 1 && (
            <nav className="mt-12 flex items-center justify-center gap-1.5">
              <PageBtn
                disabled={page <= 1}
                onClick={() => navigate({ page: String(page - 1) })}
                ariaLabel="Página anterior"
              >
                <ChevronLeft className="h-4 w-4" />
              </PageBtn>
              {pageWindow.map((n, i) =>
                n === null ? (
                  <span key={`gap-${i}`} className="px-1 opacity-40">
                    …
                  </span>
                ) : (
                  <PageBtn key={n} active={n === page} onClick={() => navigate({ page: String(n) })}>
                    {n}
                  </PageBtn>
                ),
              )}
              <PageBtn
                disabled={page >= totalPages}
                onClick={() => navigate({ page: String(page + 1) })}
                ariaLabel="Página siguiente"
              >
                <ChevronRight className="h-4 w-4" />
              </PageBtn>
            </nav>
          )}
        </div>
      </div>
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
  return <h3 className="mb-2 text-xs font-bold uppercase tracking-widest opacity-60">{children}</h3>;
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
      className="mb-2 h-8 w-full rounded-md border border-black/15 bg-white px-2 text-xs text-black"
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
      className="mt-2 text-xs font-semibold text-primary hover:underline"
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
              className={`rounded-full border px-3 py-1 text-xs transition ${on ? 'border-primary bg-primary/10 font-semibold text-primary' : 'border-black/15 hover:bg-black/5'}`}
            >
              {v}
            </button>
          );
        })}
      </div>
      {filtered.length > FACET_VISIBLE && (
        <ShowMore hidden={filtered.length - FACET_VISIBLE} expanded={expanded} onToggle={toggle} />
      )}
      {searchable && filtered.length === 0 && <p className="mt-1 text-xs opacity-50">Sin coincidencias.</p>}
    </div>
  );
}

interface CatNode {
  id: string;
  name: string;
  depth: number;
  children: CatNode[];
}

/** Arma el árbol de categorías desde la lista plana (por parentId). */
function buildCatTree(cats: CategoryDto[]): CatNode[] {
  const byId = new Map<string, CatNode>(
    cats.map((c) => [c.id, { id: c.id, name: c.name, depth: c.depth, children: [] }]),
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
 */
function CategoryFacet({
  categories,
  current,
  onSelect,
}: {
  categories: CategoryDto[];
  current: string;
  onSelect: (id: string | null) => void;
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
  const rootsShown = showAllRoots ? tree : tree.slice(0, FACET_VISIBLE);
  const searchMatches = q ? categories.filter((c) => c.name.toLowerCase().includes(q.toLowerCase())) : [];

  const renderNode = (node: CatNode) => {
    const hasKids = node.children.length > 0;
    const isOpen = expanded.has(node.id);
    return (
      <li key={node.id}>
        <div className="flex items-center gap-0.5" style={{ paddingLeft: `${(node.depth - 1) * 0.6}rem` }}>
          {hasKids ? (
            <button
              type="button"
              onClick={() => toggleOpen(node.id)}
              aria-label={isOpen ? 'Contraer' : 'Expandir'}
              className="shrink-0 rounded p-0.5 opacity-50 hover:opacity-100"
            >
              <ChevronRight className={`h-3.5 w-3.5 transition-transform ${isOpen ? 'rotate-90' : ''}`} />
            </button>
          ) : (
            <span className="w-[1.125rem] shrink-0" />
          )}
          <button
            onClick={() => onSelect(node.id)}
            aria-current={current === node.id || undefined}
            className={`block flex-1 truncate rounded px-1.5 py-1 text-left hover:bg-black/5 ${current === node.id ? 'font-semibold text-primary' : 'opacity-80'}`}
          >
            {node.name}
          </button>
        </div>
        {hasKids && isOpen && <ul className="space-y-0.5">{node.children.map(renderNode)}</ul>}
      </li>
    );
  };

  return (
    <div>
      <button
        type="button"
        onClick={() => setCatsOpen((o) => !o)}
        className="mb-2 flex w-full items-center justify-between lg:pointer-events-none"
      >
        <h3 className="text-xs font-bold uppercase tracking-widest opacity-60">
          Categorías{activeCat ? <span className="text-primary">: {activeCat.name}</span> : ''}
        </h3>
        <ChevronDown
          className={`h-4 w-4 opacity-60 transition-transform lg:hidden ${catsOpen ? 'rotate-180' : ''}`}
        />
      </button>
      <div className={`${catsOpen ? 'block' : 'hidden'} lg:block`}>
        {searchable && <FacetSearch value={q} onChange={setQ} label="Buscar categoría" />}
        <ul className="space-y-0.5 text-sm">
          <li>
            <button
              onClick={() => onSelect(null)}
              aria-current={!current || undefined}
              className={`block w-full rounded px-1.5 py-1 pl-[1.4rem] text-left hover:bg-black/5 ${!current ? 'font-semibold text-primary' : 'opacity-80'}`}
            >
              Todas
            </button>
          </li>
          {q
            ? searchMatches.map((c) => (
                <li key={c.id}>
                  <button
                    onClick={() => onSelect(c.id)}
                    className={`block w-full truncate rounded px-1.5 py-1 pl-[1.4rem] text-left hover:bg-black/5 ${current === c.id ? 'font-semibold text-primary' : 'opacity-80'}`}
                  >
                    {c.name}
                  </button>
                </li>
              ))
            : rootsShown.map(renderNode)}
        </ul>
        {!q && tree.length > FACET_VISIBLE && (
          <ShowMore
            hidden={tree.length - rootsShown.length}
            expanded={showAllRoots}
            onToggle={() => setShowAllRoots((v) => !v)}
          />
        )}
        {q && searchMatches.length === 0 && <p className="mt-1 text-xs opacity-50">Sin coincidencias.</p>}
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
              className={`block w-full truncate rounded px-2 py-1 text-left hover:bg-black/5 ${current === b ? 'font-semibold text-primary' : 'opacity-80'}`}
            >
              {b}
            </button>
          </li>
        ))}
      </ul>
      {filtered.length > FACET_VISIBLE && (
        <ShowMore hidden={filtered.length - FACET_VISIBLE} expanded={expanded} onToggle={toggle} />
      )}
      {searchable && filtered.length === 0 && <p className="mt-1 text-xs opacity-50">Sin coincidencias.</p>}
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
        className="inline-flex items-center gap-2 rounded-md border border-[rgb(var(--color-fg)/0.2)] px-3 py-1.5 text-sm font-medium transition-colors"
      >
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
                className={`flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-[rgb(var(--color-fg)/0.06)] ${active ? 'font-semibold text-primary' : ''}`}
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

function PageBtn({
  children,
  active,
  disabled,
  onClick,
  ariaLabel,
}: {
  children: React.ReactNode;
  active?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  ariaLabel?: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      className={`flex h-9 min-w-9 items-center justify-center rounded-md border px-2 text-sm transition-colors disabled:opacity-30 ${
        active
          ? 'border-transparent bg-primary font-semibold text-primary-fg'
          : 'border-black/15 hover:bg-black/5'
      }`}
    >
      {children}
    </button>
  );
}
