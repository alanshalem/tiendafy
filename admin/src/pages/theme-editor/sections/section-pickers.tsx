import { useId, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { qk } from '../../../lib/queryKeys';
import { Plus, X } from 'lucide-react';
import {
  argentinaLocalToIso,
  BEST_SELLERS_DAYS,
  clampProductLimit,
  formatArgentinaEnd,
  isoToArgentinaLocal,
  normalizeProductSource,
  PRODUCT_SOURCE_LIMIT,
  type ProductSource,
  type ProductSourceKind,
} from '@tiendafy/types';
import { api } from '../../../lib/api';
import { useStore } from '../../../context/StoreContext';
import { useProductSearch, useProductsByIds } from '../../../lib/useProductSearch';
import { Field, INPUT_BASE, Select, TextInput } from '../../theme-editor-inputs';
import { ProductPicker } from '../../theme-editor-pickers';

/* ============================================================
   Selectores de las secciones nuevas (fase 2): fecha y hora en
   Argentina, origen de productos, un producto, una categoría y
   números con rango. Reusan las consultas del panel (productos y
   categorías, con la misma cache que sus pantallas).
   ============================================================ */

const INPUT = `h-10 w-full px-3 text-sm ${INPUT_BASE}`;

/** Fecha y hora en hora de Argentina; guarda ISO en UTC (vacío = sin fecha). */
export function DateTimeField({
  label,
  value,
  onChange,
  hint,
}: {
  label: string;
  value: string;
  onChange: (iso: string) => void;
  hint?: string;
}) {
  const id = useId();
  const readable = formatArgentinaEnd(value);
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-fg">
        {label}
      </label>
      <input
        id={id}
        type="datetime-local"
        value={isoToArgentinaLocal(value)}
        onChange={(e) => onChange(argentinaLocalToIso(e.target.value))}
        className={INPUT}
      />
      <p className="mt-1 text-xs text-fg-muted">
        {readable ? `Termina el ${readable}, hora argentina. ` : ''}
        {hint}
      </p>
    </div>
  );
}

/** Número entero con rango (segundos, días, columnas). Lo vacío o inválido no se guarda. */
export function NumberField({
  label,
  value,
  onChange,
  min,
  max,
  hint,
  suffix,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  min: number;
  max: number;
  hint?: string;
  suffix?: string;
}) {
  const id = useId();
  // Lo que se está escribiendo (puede estar vacío a mitad de camino).
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-fg">
        {label}
      </label>
      <div className="flex items-center gap-2">
        <input
          id={id}
          type="number"
          inputMode="numeric"
          min={min}
          max={max}
          step={1}
          value={draft ?? String(value)}
          onChange={(e) => {
            setDraft(e.target.value);
            const n = Number(e.target.value);
            if (e.target.value !== '' && Number.isFinite(n))
              onChange(Math.min(max, Math.max(min, Math.round(n))));
          }}
          onBlur={() => setDraft(null)}
          className={`${INPUT} max-w-28`}
        />
        {suffix && <span className="text-sm text-fg-muted">{suffix}</span>}
      </div>
      {hint && <p className="mt-1 text-xs text-fg-muted">{hint}</p>}
    </div>
  );
}

/* ---------- Categorías ---------- */

interface CategoryDto {
  id: string;
  name: string;
  parentId?: string | null;
  path: string;
  depth?: number;
}

/** Las categorías de la tienda (misma consulta y cache que la pantalla de Categorías). */
export function useStoreCategories() {
  const { store } = useStore();
  return useQuery({
    queryKey: qk.categories(store?.id),
    queryFn: () => api.get<{ items: CategoryDto[] }>('/api/v1/categories'),
    enabled: !!store,
  });
}

/** Una categoría de la tienda (lista desplegable con sangría por nivel). */
export function CategorySelect({
  value,
  onChange,
  id,
  placeholder = 'Elegí una categoría',
}: {
  value: string;
  onChange: (id: string, name: string) => void;
  id?: string;
  placeholder?: string;
}) {
  const categories = useStoreCategories();
  const items = categories.data?.items ?? [];
  const missing = value && categories.data && !items.some((c) => c.id === value);
  return (
    <select
      id={id}
      value={value}
      onChange={(e) => onChange(e.target.value, items.find((c) => c.id === e.target.value)?.name ?? '')}
      className={`appearance-none ${INPUT}`}
    >
      <option value="">{categories.data ? placeholder : 'Cargando categorías…'}</option>
      {missing && <option value={value}>(Categoría borrada)</option>}
      {items.map((c) => (
        <option key={c.id} value={c.id}>
          {'  '.repeat(Math.max(0, (c.depth ?? 1) - 1))}
          {c.name}
        </option>
      ))}
    </select>
  );
}

/* ---------- Un producto ---------- */

interface PickDto {
  id: string;
  name: string;
  images?: { url: string }[];
}

/**
 * Un solo producto: el elegido como tarjeta (con "Cambiar" y "Quitar") o un
 * buscador. Busca en la base, como los demás selectores del panel.
 */
export function SingleProductPicker({
  value,
  onChange,
  emptyHint,
}: {
  value: string;
  onChange: (id: string) => void;
  emptyHint?: string;
}) {
  const [q, setQ] = useState('');
  const [searching, setSearching] = useState(false);
  const chosen = useProductsByIds<PickDto>(value ? [value] : []);
  const search = useProductSearch<PickDto>(q.trim(), { activeOnly: true, enabled: searching || !value });
  const current = chosen.data?.items.find((p) => p.id === value);
  const results = q.trim() ? (search.data?.items ?? []).filter((p) => p.id !== value).slice(0, 8) : [];

  if (value && !searching)
    return (
      <div className="flex items-center gap-2 rounded-md border border-border bg-surface p-2 text-sm">
        {current?.images?.[0] ? (
          <img src={current.images[0].url} alt="" className="h-10 w-10 rounded object-cover" />
        ) : (
          <div className="h-10 w-10 rounded bg-bg-muted" />
        )}
        <span className="min-w-0 flex-1 truncate">
          {current?.name ?? (chosen.data ? 'Producto borrado' : 'Producto')}
        </span>
        <button
          type="button"
          onClick={() => setSearching(true)}
          className="min-h-10 rounded-md px-2 text-xs font-medium text-primary hover:bg-bg-muted"
        >
          Cambiar
        </button>
        <button
          type="button"
          onClick={() => onChange('')}
          aria-label="Quitar el producto"
          className="flex h-10 w-10 items-center justify-center rounded-md text-fg-subtle hover:bg-bg-muted hover:text-danger"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    );

  return (
    <div>
      <input
        type="search"
        aria-label="Buscar un producto"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Buscar un producto…"
        className={INPUT}
      />
      {q.trim() && (
        <ul
          className="mt-1 max-h-56 space-y-1 overflow-y-auto rounded-md border border-border p-1"
          aria-label="Productos"
        >
          {!search.data && <li className="p-3 text-center text-xs text-fg-muted">Cargando…</li>}
          {search.data && results.length === 0 && (
            <li className="p-3 text-center text-xs text-fg-muted">Sin resultados.</li>
          )}
          {results.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => {
                  onChange(p.id);
                  setQ('');
                  setSearching(false);
                }}
                className="flex min-h-10 w-full items-center gap-2 rounded px-2 text-left text-sm hover:bg-bg-muted"
              >
                {p.images?.[0] ? (
                  <img src={p.images[0].url} alt="" className="h-8 w-8 rounded object-cover" />
                ) : (
                  <div className="h-8 w-8 rounded bg-bg-muted" />
                )}
                <span className="min-w-0 flex-1 truncate">{p.name}</span>
                <Plus className="h-4 w-4 text-primary" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
      {searching && value ? (
        <button
          type="button"
          onClick={() => setSearching(false)}
          className="mt-1 min-h-10 text-xs font-medium text-fg-muted hover:text-fg"
        >
          Cancelar
        </button>
      ) : (
        emptyHint && <p className="mt-1 text-xs text-fg-muted">{emptyHint}</p>
      )}
    </div>
  );
}

/* ---------- Origen de los productos ---------- */

const SOURCE_OPTIONS: { value: ProductSourceKind; label: string }[] = [
  { value: 'on-sale', label: 'Los que están en oferta (precio tachado)' },
  { value: 'manual', label: 'Los que elija yo' },
  { value: 'category', label: 'Los de una categoría' },
  { value: 'brand', label: 'Los de una marca' },
  { value: 'newest', label: 'Lo último que cargué' },
  { value: 'best-sellers', label: 'Los más vendidos' },
];

function sourceFor(kind: ProductSourceKind, prev: ProductSource): ProductSource {
  switch (kind) {
    case 'manual':
      return { kind, ids: prev.kind === 'manual' ? prev.ids : [] };
    case 'category':
      return { kind, categoryId: prev.kind === 'category' ? prev.categoryId : '' };
    case 'brand':
      return { kind, brand: prev.kind === 'brand' ? prev.brand : '' };
    case 'best-sellers':
      return { kind, days: BEST_SELLERS_DAYS.default };
    default:
      return { kind } as ProductSource;
  }
}

/** El origen que se muestra: el guardado, uno a medio elegir (categoría o marca vacía) o el de la sección. */
function shownSource(raw: unknown, fallback: ProductSource): ProductSource {
  const parsed = normalizeProductSource(raw);
  if (parsed) return parsed;
  const r = (raw ?? {}) as { kind?: unknown; brand?: unknown };
  if (r.kind === 'category') return { kind: 'category', categoryId: '' };
  if (r.kind === 'brand') return { kind: 'brand', brand: typeof r.brand === 'string' ? r.brand : '' };
  return fallback;
}

/**
 * De dónde salen los productos de una sección (`data.source` + `data.limit`,
 * lo que resuelve la API en /products/section). `fallback`: el origen que
 * usa la sección si no se eligió ninguno.
 */
export function ProductSourceField({
  source: rawSource,
  limit: rawLimit,
  fallback,
  onChange,
}: {
  source: unknown;
  limit: unknown;
  fallback: ProductSource;
  onChange: (patch: { source: ProductSource; limit: number }) => void;
}) {
  // Una categoría o marca a medio elegir no normaliza (queda null): se
  // conserva lo que hay en pantalla mientras tanto.
  const source = shownSource(rawSource, fallback);
  const limit = clampProductLimit(rawLimit);
  const set = (next: ProductSource, nextLimit = limit) => onChange({ source: next, limit: nextLimit });

  return (
    <>
      <Field label="Qué productos mostrar">
        <Select
          value={source.kind}
          onChange={(v) => set(sourceFor(v as ProductSourceKind, source))}
          options={SOURCE_OPTIONS}
        />
      </Field>
      {source.kind === 'manual' && (
        <Field label="Productos">
          <ProductPicker
            value={source.ids}
            onChange={(ids) =>
              set({ kind: 'manual', ids }, Math.max(limit, Math.min(ids.length, PRODUCT_SOURCE_LIMIT.max)))
            }
          />
        </Field>
      )}
      {source.kind === 'category' && (
        <Field label="Categoría">
          <CategorySelect
            value={source.categoryId}
            onChange={(categoryId) => set({ kind: 'category', categoryId })}
          />
        </Field>
      )}
      {source.kind === 'brand' && (
        <Field label="Marca">
          <TextInput
            value={source.brand}
            onChange={(brand) => set({ kind: 'brand', brand })}
            placeholder="Ej.: Nike"
          />
        </Field>
      )}
      <NumberField
        label="Cuántos mostrar como máximo"
        value={limit}
        min={PRODUCT_SOURCE_LIMIT.min}
        max={PRODUCT_SOURCE_LIMIT.max}
        onChange={(n) => set(source, n)}
      />
    </>
  );
}
