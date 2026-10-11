import { useMemo, useState, type CSSProperties } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Archive, ArrowUpDown, Filter, Plus, Search, Trash2, Upload, X } from 'lucide-react';
import { Button, Checkbox, Modal, useToast } from '@tiendafy/ui';
import type { MoneyDto } from '@tiendafy/types';
import { useStore } from '../../context/StoreContext';
import { api, errMsg } from '../../lib/api';
import { useVariantStock, useCatalogHealth } from './queries';
import { Pagination } from '../../components/Pagination';
import { useDebouncedValue } from '../../lib/useDebouncedValue';
import { EmptyState } from '../../components/EmptyState';
import { NoStoreSelected } from '../../components/NoStoreSelected';
import { HelpLink } from '../../components/HelpLink';
import { FilterPanel, defaultFilters, type ProductFilters } from './FilterPanel';
import { type Category } from './types';
import { ProductRows } from './ProductRows';
import { TABLE_CARD, TABLE_HEAD_STICKY_UNDER_BAR } from '../../lib/styles';
import { ListStats } from '../../components/stats/ListStats';
import { formatNumber } from '../../lib/format';

export interface VariantDto {
  id: string;
  sku: string;
  optionValues: string[];
  price: MoneyDto;
  compareAtPrice: MoneyDto | null;
}
export interface ProductDto {
  id: string;
  name: string;
  slug: string;
  status: 'DRAFT' | 'ACTIVE' | 'ARCHIVED';
  variants: VariantDto[];
  images: { url: string }[];
}

/** Orden visible ↔ el que entiende el endpoint. */
const SORTS = {
  'Más nuevo': 'newest',
  'Más viejo': 'oldest',
  'Nombre A-Z': 'nameAsc',
  'Nombre Z-A': 'nameDesc',
} as const;

type SortLabel = keyof typeof SORTS;

/** Productos por página. */
const PAGE_SIZE = 20;

/** Cómo se lee el filtro puesto, para el cartel de arriba de la tabla. */
const FILTER_LABEL: Record<string, string> = {
  'status:active': 'Publicados',
  'status:draft': 'Borradores',
  'status:archived': 'Archivados',
  'missing:image': 'Sin foto',
  'stock:in': 'En stock',
  'stock:out': 'Sin stock',
  'priceType:promo': 'Con promoción',
  'priceType:noPromo': 'Sin promoción',
};

export function ProductsPage() {
  const { store } = useStore();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<SortLabel>('Más nuevo');
  const [filterOpen, setFilterOpen] = useState(false);
  const [filters, setFilters] = useState<ProductFilters>(defaultFilters);
  const [page, setPage] = useState(1);

  /**
   * Volver a tocar la misma métrica saca el filtro: es el gesto que espera
   * cualquiera que la usó para mirar y quiere volver al listado completo.
   */
  const toggleFilter = <K extends keyof ProductFilters>(key: K, value: ProductFilters[K]) => {
    setFilters((current) => ({
      ...current,
      [key]: current[key] === value ? defaultFilters[key] : value,
    }));
    setPage(1);
  };
  const [draftFilters, setDraftFilters] = useState<ProductFilters>(defaultFilters);

  const debouncedSearch = useDebouncedValue(search, 350).trim();

  // Una página por request, con búsqueda, filtros y orden resueltos en la base.
  // Antes se traía el catálogo COMPLETO al navegador para filtrar y paginar acá:
  // con miles de productos eso es descargar la tienda entera en cada visita, y
  // encima los filtros de categoría y envío no llegaban a aplicarse nunca.
  const { data, isLoading } = useQuery({
    queryKey: ['products-admin', store?.id, debouncedSearch, filters, sort, page],
    queryFn: () => {
      const params = new URLSearchParams({
        limit: String(PAGE_SIZE),
        offset: String((page - 1) * PAGE_SIZE),
        sort: SORTS[sort],
      });
      if (debouncedSearch) params.set('q', debouncedSearch);
      if (filters.category) params.set('categoryId', filters.category);
      if (filters.status !== 'all') params.set('status', filters.status.toUpperCase());
      if (filters.missing === 'image') params.set('missingImage', 'true');
      if (filters.stock !== 'all') params.set('stock', filters.stock);
      if (filters.priceType !== 'all') params.set('promo', String(filters.priceType === 'promo'));
      return api.get<{ items: ProductDto[]; total: number }>(`/api/v1/products?${params}`);
    },
    enabled: !!store,
    placeholderData: (previous) => previous,
  });

  const pageItems = useMemo(() => data?.items ?? [], [data]);
  const total = data?.total ?? 0;

  // El stock se pide solo para lo que se ve.
  const stockMap = useVariantStock(pageItems);

  // Salud del catálogo entero (no de la página): un listado paginado esconde
  // cuántos productos quedaron en borrador o sin foto.
  const { data: health } = useCatalogHealth();

  const { data: cats } = useQuery({
    queryKey: ['categories', store?.id],
    queryFn: () => api.get<{ items: Category[] }>('/api/v1/categories'),
    enabled: !!store,
  });

  const setStatus = useMutation({
    mutationFn: ({ id, publish }: { id: string; publish: boolean }) =>
      api.post(`/api/v1/products/${id}/${publish ? 'publish' : 'archive'}`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products', store?.id] });
      toast('Producto actualizado', { variant: 'success' });
    },
    onError: (err) => toast(errMsg(err, 'Error'), { variant: 'error' }),
  });

  const deleteProduct = useMutation({
    mutationFn: (id: string) => api.delete(`/api/v1/products/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products', store?.id] });
      toast('Producto eliminado', { variant: 'success' });
    },
    onError: (err) => toast(errMsg(err, 'Error'), { variant: 'error' }),
  });

  const [deleteAllOpen, setDeleteAllOpen] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const deleteAll = useMutation({
    mutationFn: () => api.delete<{ deleted: number }>('/api/v1/products'),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['products', store?.id] });
      setDeleteAllOpen(false);
      setConfirmText('');
      toast(`${res.deleted} productos eliminados`, { variant: 'success' });
    },
    onError: (err) => toast(errMsg(err, 'Error'), { variant: 'error' }),
  });

  const duplicateProduct = useMutation({
    mutationFn: (id: string) => api.post(`/api/v1/products/${id}/duplicate`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products', store?.id] });
      toast('Producto duplicado', { variant: 'success' });
    },
    onError: (err) => toast(errMsg(err, 'Error'), { variant: 'error' }),
  });

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const clearSelection = () => setSelected(new Set());

  const bulkAction = useMutation({
    mutationFn: async ({ ids, action }: { ids: string[]; action: 'publish' | 'archive' | 'delete' }) => {
      await Promise.all(
        ids.map((id) =>
          action === 'delete'
            ? api.delete(`/api/v1/products/${id}`)
            : api.post(`/api/v1/products/${id}/${action}`, {}),
        ),
      );
      return { count: ids.length, action };
    },
    onSuccess: ({ count, action }) => {
      queryClient.invalidateQueries({ queryKey: ['products', store?.id] });
      clearSelection();
      setBulkDeleteOpen(false);
      toast(
        `${count} producto${count === 1 ? '' : 's'} ${action === 'delete' ? 'eliminado' : 'actualizado'}${count === 1 ? '' : 's'}`,
        { variant: 'success' },
      );
    },
    onError: (err) => toast(errMsg(err, 'Error'), { variant: 'error' }),
  });
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);

  const activeFilters = Object.entries(filters).filter(
    ([k, v]) => v !== defaultFilters[k as keyof ProductFilters],
  );
  const activeFilterCount = activeFilters.length;

  // Los filtros que tienen nombre corto se listan arriba de la tabla; la
  // categoría no entra ahí (su nombre lo sabe el panel, no este listado).
  const filterChips = activeFilters
    .map(([k, v]) => ({ key: k as keyof ProductFilters, label: FILTER_LABEL[`${k}:${v}`] }))
    .filter((chip): chip is { key: keyof ProductFilters; label: string } => !!chip.label);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const pageClamped = Math.min(page, totalPages);

  const selectedOnPage = pageItems.filter((p) => selected.has(p.id)).length;
  const allPageSelected = pageItems.length > 0 && selectedOnPage === pageItems.length;
  const somePageSelected = selectedOnPage > 0 && !allPageSelected;
  const toggleSelectAll = () => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allPageSelected) {
        pageItems.forEach((p) => next.delete(p.id));
      } else {
        pageItems.forEach((p) => next.add(p.id));
      }
      return next;
    });
  };

  if (!store) {
    return <NoStoreSelected message="Elegí una tienda arriba para ver sus productos." />;
  }

  const hasQuery = !!debouncedSearch || activeFilterCount > 0;
  const isEmpty = !isLoading && total === 0 && !hasQuery;
  const noResults = !isLoading && total === 0 && hasQuery;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-fg">Productos</h1>
        <div className="flex flex-wrap items-center gap-2">
          <Link to="/productos/exportar-importar">
            <HeaderBtn>
              <ArrowUpDown className="h-4 w-4" /> Exportar e importar
            </HeaderBtn>
          </Link>
          <Link to="/productos/nuevo">
            <Button>
              <span className="inline-flex items-center gap-1.5">
                <Plus className="h-4 w-4" /> Agregar producto
              </span>
            </Button>
          </Link>
        </div>
      </div>

      {health && health.total > 0 && (
        <ListStats
          items={[
            {
              label: 'Publicados',
              value: formatNumber(health.published),
              hint: `De ${formatNumber(health.total)} productos cargados. Solo los publicados se ven en la tienda.`,
              onClick: () => toggleFilter('status', 'active'),
              active: filters.status === 'active',
            },
            {
              label: 'En borrador',
              value: formatNumber(health.draft),
              hint: 'Cargados pero invisibles para el público. Publicalos cuando estén listos.',
              tone: health.draft > 0 ? 'warning' : 'default',
              onClick: () => toggleFilter('status', 'draft'),
              active: filters.status === 'draft',
            },
            {
              label: 'Sin foto',
              value: formatNumber(health.withoutImage),
              hint: 'Un producto sin foto casi no se vende. Es lo primero que conviene completar.',
              tone: health.withoutImage > 0 ? 'danger' : 'success',
              onClick: () => toggleFilter('missing', 'image'),
              active: filters.missing === 'image',
            },
            {
              // El costo no se carga desde acá: esta métrica lleva a la pantalla
              // donde sí se puede hacer algo con ella, ya filtrada.
              label: 'Sin costo cargado',
              value: formatNumber(health.variantsWithoutCost),
              hint: `Variantes sin costo: quedan afuera del cálculo de rentabilidad. Van ${health.variantsWithCost} de ${health.variants}. Tocá para cargarlos.`,
              tone: health.variantsWithoutCost > 0 ? 'warning' : 'success',
              onClick: () => navigate('/productos/costos?sinCosto=1'),
            },
          ]}
        />
      )}

      {filterChips.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 text-sm text-fg-muted">
          <span>
            Mostrando solo{' '}
            <span className="font-medium text-fg">{filterChips.map((c) => c.label).join(' · ')}</span> ·{' '}
            {formatNumber(total)} {total === 1 ? 'producto' : 'productos'}
          </span>
          {filterChips.map((chip) => (
            <button
              key={chip.key}
              type="button"
              onClick={() => toggleFilter(chip.key, defaultFilters[chip.key])}
              className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-xs font-medium text-fg hover:bg-bg-muted"
            >
              <X className="h-3 w-3" /> {chip.label}
            </button>
          ))}
        </div>
      )}

      {isEmpty ? (
        <EmptyState
          kicker="Productos"
          title="Tu vidriera está esperando"
          body="Cargá tu primer producto con precio, fotos y descripción. En cuanto lo publiques, aparece en tu tienda."
          action={{
            label: 'Agregar mi primer producto',
            onClick: () => (window.location.href = '/productos/nuevo'),
          }}
        />
      ) : (
        <>
          {/* Toolbar búsqueda + filtros + orden */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[16rem]">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-subtle" />
              <input
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                placeholder="Buscar por nombre, SKU o tags"
                className="h-10 w-full rounded-md border border-border-strong bg-surface pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            <button
              type="button"
              onClick={() => {
                setDraftFilters(filters);
                setFilterOpen(true);
              }}
              className="inline-flex h-10 items-center gap-1.5 rounded-md border border-border-strong bg-surface px-3 text-sm font-medium text-fg hover:bg-bg-muted"
            >
              <Filter className="h-4 w-4" /> Filtrar
              {activeFilterCount > 0 && (
                <span className="rounded-full bg-primary px-1.5 text-xs font-bold text-primary-fg">
                  {activeFilterCount}
                </span>
              )}
            </button>
            <select
              value={sort}
              onChange={(e) => {
                setSort(e.target.value as SortLabel);
                setPage(1);
              }}
              className="h-10 appearance-none rounded-md border border-border-strong bg-surface px-3 pr-8 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-primary"
            >
              {Object.keys(SORTS).map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center justify-between">
            <div className="text-sm text-fg-muted">
              {formatNumber(total)} {total === 1 ? 'producto' : 'productos'}
            </div>
            {total > 0 && (
              <button
                type="button"
                onClick={() => {
                  setConfirmText('');
                  setDeleteAllOpen(true);
                }}
                className="inline-flex items-center gap-1.5 text-sm font-medium text-danger hover:underline"
              >
                <Trash2 className="h-4 w-4" /> Eliminar todos
              </button>
            )}
          </div>

          {/* Barra de acciones masivas. Se fija por debajo del encabezado del
              panel, que también es sticky: con `top` chico quedaba flotando
              encima y tapaba el selector de tienda. */}
          {selected.size > 0 && (
            <div className="sticky top-[calc(var(--header-height)+0.5rem)] z-20 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-primary/40 bg-surface/95 px-4 py-2.5 shadow-card backdrop-blur-xl">
              <span className="text-sm font-semibold text-primary">{selected.size} seleccionados</span>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={bulkAction.isPending}
                  onClick={() => bulkAction.mutate({ ids: [...selected], action: 'publish' })}
                  className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border-strong bg-surface px-3 text-sm font-medium text-fg hover:bg-bg-muted disabled:opacity-50"
                >
                  <Upload className="h-4 w-4" /> Publicar
                </button>
                <button
                  type="button"
                  disabled={bulkAction.isPending}
                  onClick={() => bulkAction.mutate({ ids: [...selected], action: 'archive' })}
                  className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border-strong bg-surface px-3 text-sm font-medium text-fg hover:bg-bg-muted disabled:opacity-50"
                >
                  <Archive className="h-4 w-4" /> Archivar
                </button>
                <button
                  type="button"
                  disabled={bulkAction.isPending}
                  onClick={() => setBulkDeleteOpen(true)}
                  className="inline-flex h-9 items-center gap-1.5 rounded-md border border-danger/40 bg-surface px-3 text-sm font-medium text-danger hover:bg-danger/10 disabled:opacity-50"
                >
                  <Trash2 className="h-4 w-4" /> Eliminar
                </button>
                <button
                  type="button"
                  onClick={clearSelection}
                  className="inline-flex h-9 items-center gap-1.5 rounded-md px-2 text-sm font-medium text-fg-muted hover:text-fg"
                >
                  <X className="h-4 w-4" /> Deseleccionar
                </button>
              </div>
            </div>
          )}

          {/* Tabla agrupada */}
          <div
            className={TABLE_CARD}
            style={{ '--bulk-bar': selected.size > 0 ? '4rem' : '0px' } as CSSProperties}
          >
            <table className="w-full text-sm">
              <thead className={TABLE_HEAD_STICKY_UNDER_BAR}>
                <tr className="border-b border-border bg-bg-subtle text-left text-xs font-medium uppercase tracking-wide text-fg-muted">
                  <th className="w-10 px-3 py-2.5">
                    <Checkbox
                      checked={allPageSelected}
                      indeterminate={somePageSelected}
                      onChange={toggleSelectAll}
                      aria-label="Seleccionar todos"
                    />
                  </th>
                  <th className="px-3 py-2.5">Producto</th>
                  <th className="w-20 px-3 py-2.5 text-center">Stock</th>
                  <th className="w-32 px-3 py-2.5">Precio</th>
                  <th className="w-32 px-3 py-2.5">Promocional</th>
                  <th className="w-28 px-3 py-2.5">Variantes</th>
                  <th className="w-24 px-3 py-2.5 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-12 text-center text-fg-muted">
                      Cargando...
                    </td>
                  </tr>
                ) : noResults ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-12 text-center">
                      <p className="text-fg-muted">Ningún producto coincide con la búsqueda.</p>
                      <button
                        type="button"
                        onClick={() => {
                          setSearch('');
                          setFilters(defaultFilters);
                          setPage(1);
                        }}
                        className="mt-2 text-sm font-medium text-primary hover:underline"
                      >
                        Limpiar búsqueda y filtros
                      </button>
                    </td>
                  </tr>
                ) : (
                  pageItems.map((product) => (
                    <ProductRows
                      key={product.id}
                      product={product}
                      stockMap={stockMap}
                      storeId={store.id}
                      selected={selected.has(product.id)}
                      onToggleSelect={() => toggleSelect(product.id)}
                      onStatus={(publish) => setStatus.mutate({ id: product.id, publish })}
                      onDelete={() => deleteProduct.mutate(product.id)}
                      onDuplicate={() => duplicateProduct.mutate(product.id)}
                    />
                  ))
                )}
              </tbody>
            </table>
          </div>

          <Pagination page={pageClamped} totalPages={totalPages} onPage={setPage} />
        </>
      )}

      <FilterPanel
        open={filterOpen}
        onClose={() => setFilterOpen(false)}
        filters={filters}
        categories={cats?.items ?? []}
        draft={draftFilters}
        setDraft={setDraftFilters}
        onApply={(f) => {
          setFilters(f);
          setFilterOpen(false);
        }}
        onClear={() => {
          setDraftFilters(defaultFilters);
          setFilters(defaultFilters);
        }}
      />

      <Modal
        open={deleteAllOpen}
        onClose={() => setDeleteAllOpen(false)}
        title="Eliminar todos los productos"
        footer={
          <>
            <Button variant="secondary" onClick={() => setDeleteAllOpen(false)}>
              Cancelar
            </Button>
            <Button
              variant="danger"
              loading={deleteAll.isPending}
              disabled={confirmText !== 'ELIMINAR'}
              onClick={() => deleteAll.mutate()}
            >
              Eliminar todo
            </Button>
          </>
        }
      >
        <p className="text-sm text-fg-muted">
          Vas a eliminar <span className="font-semibold text-fg">{total} productos</span> de{' '}
          <span className="font-semibold text-fg">{store.name}</span>, con sus variantes e imágenes. Esta
          acción no se puede deshacer.
        </p>
        <p className="mt-3 text-sm text-fg">
          Para confirmar, escribí <span className="font-mono font-semibold">ELIMINAR</span>:
        </p>
        <input
          value={confirmText}
          onChange={(e) => setConfirmText(e.target.value)}
          placeholder="ELIMINAR"
          className="mt-2 h-10 w-full rounded-md border border-border-strong bg-surface px-3 text-sm text-fg placeholder:text-fg-subtle focus:outline-none focus:ring-2 focus:ring-danger"
        />
      </Modal>

      <Modal
        open={bulkDeleteOpen}
        onClose={() => setBulkDeleteOpen(false)}
        title="Eliminar productos seleccionados"
        footer={
          <>
            <Button variant="secondary" onClick={() => setBulkDeleteOpen(false)}>
              Cancelar
            </Button>
            <Button
              variant="danger"
              loading={bulkAction.isPending}
              onClick={() => bulkAction.mutate({ ids: [...selected], action: 'delete' })}
            >
              Eliminar {selected.size}
            </Button>
          </>
        }
      >
        <p className="text-sm text-fg-muted">
          Vas a eliminar{' '}
          <span className="font-semibold text-fg">
            {selected.size} producto{selected.size === 1 ? '' : 's'}
          </span>
          , con sus variantes e imágenes. Esta acción no se puede deshacer.
        </p>
      </Modal>
      <HelpLink id="productos" />
    </div>
  );
}

function HeaderBtn({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex h-10 items-center gap-1.5 rounded-md border border-border-strong bg-surface px-3 text-sm font-medium text-fg hover:bg-bg-muted"
    >
      {children}
    </button>
  );
}
