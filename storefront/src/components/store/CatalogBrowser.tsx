'use client';

import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { Search, ChevronLeft, ChevronRight } from 'lucide-react';
import type { ProductListConfig } from '@/lib/theme';
import type { CategoryDto } from '@/lib/catalog';
import { ProductCard, type StoreProduct } from './sections';
import { useLiveTheme } from './preview';

const SORTS: { value: string; label: string }[] = [
  { value: 'newest', label: 'Más nuevos' },
  { value: 'price_asc', label: 'Menor precio' },
  { value: 'price_desc', label: 'Mayor precio' },
  { value: 'name', label: 'Nombre A-Z' },
];

const colClass: Record<number, string> = {
  2: 'grid-cols-2',
  3: 'grid-cols-2 sm:grid-cols-3',
  4: 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-4',
};

interface Props {
  products: StoreProduct[];
  total: number;
  page: number;
  totalPages: number;
  categories: CategoryDto[];
  productList: ProductListConfig;
  current: { q: string; sort: string; category: string };
}

export function CatalogBrowser({ products, total, page, totalPages, categories, productList, current }: Props) {
  // En preview, refleja al instante los cambios de "Listado de productos".
  const live = useLiveTheme();
  productList = live?.productList ?? productList;
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [search, setSearch] = useState(current.q);

  const navigate = (patch: Record<string, string | null>) => {
    const params = new URLSearchParams(searchParams.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v === null || v === '') params.delete(k);
      else params.set(k, v);
    }
    router.push(`${pathname}?${params.toString()}`);
  };

  const onSearch = (e: React.FormEvent) => {
    e.preventDefault();
    navigate({ q: search.trim() || null, page: null });
  };

  const pageWindow = buildPageWindow(page, totalPages);

  return (
    <div className="mx-auto max-w-container px-4 pb-16">
      {/* Barra superior: total + orden */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-black/10 py-4">
        <p className="text-sm opacity-60">
          {total} {total === 1 ? 'resultado' : 'resultados'}
          {current.q && <> para «{current.q}»</>}
        </p>
        <label className="flex items-center gap-2 text-sm">
          <span className="opacity-60">Ordenar por</span>
          <select
            value={current.sort || 'newest'}
            onChange={(e) => navigate({ sort: e.target.value === 'newest' ? null : e.target.value, page: null })}
            className="rounded-md border border-black/15 bg-white px-2 py-1.5 text-sm text-black"
          >
            {SORTS.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
        </label>
      </div>

      <div className="grid gap-8 pt-6 lg:grid-cols-[15rem_1fr]">
        {/* Sidebar: búsqueda + categorías */}
        <aside className="space-y-6">
          <form onSubmit={onSearch}>
            <div className="flex gap-2">
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar productos"
                className="h-10 w-full rounded-md border border-black/15 bg-white px-3 text-sm text-black"
              />
              <button type="submit" aria-label="Buscar" className="inline-flex h-10 shrink-0 items-center justify-center rounded-md px-3 text-sm font-semibold text-primary-fg" style={{ background: 'rgb(var(--color-primary))' }}>
                <Search className="h-4 w-4" />
              </button>
            </div>
            {current.q && (
              <button type="button" onClick={() => { setSearch(''); navigate({ q: null, page: null }); }} className="mt-2 text-xs text-primary hover:underline">
                Limpiar búsqueda
              </button>
            )}
          </form>

          {categories.length > 0 && (
            <div>
              <h3 className="mb-2 text-xs font-bold uppercase tracking-widest opacity-60">Categorías</h3>
              <ul className="space-y-0.5 text-sm">
                <li>
                  <button
                    onClick={() => navigate({ category: null, page: null })}
                    className={`block w-full rounded px-2 py-1 text-left hover:bg-black/5 ${!current.category ? 'font-semibold text-primary' : 'opacity-80'}`}
                  >
                    Todas
                  </button>
                </li>
                {categories.map((c) => (
                  <li key={c.id} style={{ paddingLeft: `${(c.depth - 1) * 0.75}rem` }}>
                    <button
                      onClick={() => navigate({ category: c.id, page: null })}
                      className={`block w-full truncate rounded px-2 py-1 text-left hover:bg-black/5 ${current.category === c.id ? 'font-semibold text-primary' : 'opacity-80'}`}
                    >
                      {c.name}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </aside>

        {/* Grilla + paginado */}
        <div>
          {products.length === 0 ? (
            <p className="py-16 text-center opacity-60">No encontramos productos con esos filtros.</p>
          ) : (
            <div className={`grid gap-x-5 gap-y-8 ${colClass[productList.columns] ?? colClass[4]}`}>
              {products.map((p) => (
                <ProductCard key={p.id} product={p} list={productList} />
              ))}
            </div>
          )}

          {totalPages > 1 && (
            <nav className="mt-12 flex items-center justify-center gap-1.5">
              <PageBtn disabled={page <= 1} onClick={() => navigate({ page: String(page - 1) })} ariaLabel="Página anterior"><ChevronLeft className="h-4 w-4" /></PageBtn>
              {pageWindow.map((n, i) =>
                n === null ? (
                  <span key={`gap-${i}`} className="px-1 opacity-40">…</span>
                ) : (
                  <PageBtn key={n} active={n === page} onClick={() => navigate({ page: String(n) })}>
                    {n}
                  </PageBtn>
                ),
              )}
              <PageBtn disabled={page >= totalPages} onClick={() => navigate({ page: String(page + 1) })} ariaLabel="Página siguiente"><ChevronRight className="h-4 w-4" /></PageBtn>
            </nav>
          )}
        </div>
      </div>
    </div>
  );
}

function PageBtn({ children, active, disabled, onClick, ariaLabel }: { children: React.ReactNode; active?: boolean; disabled?: boolean; onClick?: () => void; ariaLabel?: string }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      className={`flex h-9 min-w-9 items-center justify-center rounded-md border px-2 text-sm transition-colors disabled:opacity-30 ${
        active ? 'border-transparent font-semibold text-primary-fg' : 'border-black/15 hover:bg-black/5'
      }`}
      style={active ? { background: 'rgb(var(--color-primary))' } : undefined}
    >
      {children}
    </button>
  );
}

/** Ventana de paginación: 1 … (p-1) p (p+1) … N */
function buildPageWindow(page: number, total: number): (number | null)[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const out: (number | null)[] = [1];
  const start = Math.max(2, page - 1);
  const end = Math.min(total - 1, page + 1);
  if (start > 2) out.push(null);
  for (let i = start; i <= end; i++) out.push(i);
  if (end < total - 1) out.push(null);
  out.push(total);
  return out;
}
