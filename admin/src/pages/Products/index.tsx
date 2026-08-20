import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Archive, ArrowUpDown, Filter, Plus, Search, Trash2, Upload, X } from 'lucide-react';
import { Button, Checkbox, Modal, useToast } from '@tiendafy/ui';
import type { MoneyDto } from '@tiendafy/types';
import { useStore } from '../../context/StoreContext';
import { api, errMsg } from '../../lib/api';
import { fetchAllProducts } from '../../lib/products';
import { useVariantStock, useCatalogHealth } from './queries';
import { Pagination } from '../../components/Pagination';
import { EmptyState } from '../../components/EmptyState';
import { NoStoreSelected } from '../../components/NoStoreSelected';
import { HelpLink } from '../../components/HelpLink';
import { FilterPanel, defaultFilters, type ProductFilters } from './FilterPanel';
import { type Category } from './types';
import { ProductRows } from './ProductRows';
import { TABLE_CARD } from '../../lib/styles';
import { ListStats } from '../../components/stats/ListStats';

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

const SORTS = ['Más nuevo', 'Más viejo', 'Nombre A-Z', 'Nombre Z-A'] as const;

/**
 * Atajo desde la fila de métricas: cada número de arriba filtra el listado de
 * abajo. Vive aparte del panel de filtros porque no es una preferencia que se
 * arma, es "mostrame lo que acabo de contar".
 */
type Focus = 'none' | 'published' | 'draft' | 'noImage';

const FOCUS_LABEL: Record<Exclude<Focus, 'none'>, string> = {
  published: 'Publicados',
  draft: 'En borrador',
  noImage: 'Sin foto',
};

export function ProductsPage() {
  const { store } = useStore();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<(typeof SORTS)[number]>('Más nuevo');
  const [filterOpen, setFilterOpen] = useState(false);
  const [filters, setFilters] = useState<ProductFilters>(defaultFilters);
  const [focus, setFocus] = useState<Focus>('none');
  // Volver a tocar la misma métrica saca el filtro: es el gesto que espera
  // cualquiera que la usó para mirar y quiere volver al listado completo.
  const toggleFocus = (next: Exclude<Focus, 'none'>) =>
    setFocus((current) => (current === next ? 'none' : next));
  const [draftFilters, setDraftFilters] = useState<ProductFilters>(defaultFilters);

  const { data, isLoading } = useQuery({
    queryKey: ['products', store?.id],
    queryFn: () => fetchAllProducts<ProductDto>(),
    enabled: !!store,
  });
  const products = useMemo(() => data ?? [], [data]);

  const stockMap = useVariantStock(products);

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

  const filtered = useMemo(() => {
    let list = products;
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (p) => p.name.toLowerCase().includes(q) || p.variants.some((v) => v.sku.toLowerCase().includes(q)),
      );
    }
    if (focus === 'published') list = list.filter((p) => p.status === 'ACTIVE');
    if (focus === 'draft') list = list.filter((p) => p.status === 'DRAFT');
    if (focus === 'noImage') list = list.filter((p) => p.images.length === 0);
    if (filters.visibility === 'visible') list = list.filter((p) => p.status === 'ACTIVE');
    if (filters.visibility === 'hidden') list = list.filter((p) => p.status !== 'ACTIVE');
    if (filters.priceType === 'promo') list = list.filter((p) => p.variants.some((v) => v.compareAtPrice));
    if (filters.priceType === 'noPromo')
      list = list.filter((p) => p.variants.every((v) => !v.compareAtPrice));
    if (filters.stock !== 'all') {
      list = list.filter((p) => {
        const total = p.variants.reduce((sum, v) => sum + (stockMap.get(v.id)?.available ?? 0), 0);
        return filters.stock === 'in' ? total > 0 : total === 0;
      });
    }
    const sorted = [...list];
    if (sort === 'Nombre A-Z') sorted.sort((a, b) => a.name.localeCompare(b.name));
    if (sort === 'Nombre Z-A') sorted.sort((a, b) => b.name.localeCompare(a.name));
    if (sort === 'Más viejo') sorted.reverse();
    return sorted;
  }, [products, search, filters, focus, sort, stockMap]);

  const activeFilterCount = Object.entries(filters).filter(
    ([k, v]) => v !== defaultFilters[k as keyof ProductFilters],
  ).length;

  const PAGE_SIZE = 20;
  const [page, setPage] = useState(1);
  useEffect(() => {
    setPage(1);
  }, [search, filters, focus, sort]);
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageClamped = Math.min(page, totalPages);
  const pageItems = filtered.slice((pageClamped - 1) * PAGE_SIZE, pageClamped * PAGE_SIZE);

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

  const isEmpty = !isLoading && products.length === 0;

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
              value: health.published.toLocaleString('es-AR'),
              hint: `De ${health.total.toLocaleString('es-AR')} productos cargados. Solo los publicados se ven en la tienda.`,
              onClick: () => toggleFocus('published'),
              active: focus === 'published',
            },
            {
              label: 'En borrador',
              value: health.draft.toLocaleString('es-AR'),
              hint: 'Cargados pero invisibles para el público. Publicalos cuando estén listos.',
              tone: health.draft > 0 ? 'warning' : 'default',
              onClick: () => toggleFocus('draft'),
              active: focus === 'draft',
            },
            {
              label: 'Sin foto',
              value: health.withoutImage.toLocaleString('es-AR'),
              hint: 'Un producto sin foto casi no se vende. Es lo primero que conviene completar.',
              tone: health.withoutImage > 0 ? 'danger' : 'success',
              onClick: () => toggleFocus('noImage'),
              active: focus === 'noImage',
            },
            {
              // El costo no se carga desde acá: esta métrica lleva a la pantalla
              // donde sí se puede hacer algo con ella, ya filtrada.
              label: 'Sin costo cargado',
              value: health.variantsWithoutCost.toLocaleString('es-AR'),
              hint: `Variantes sin costo: quedan afuera del cálculo de rentabilidad. Van ${health.variantsWithCost} de ${health.variants}. Tocá para cargarlos.`,
              tone: health.variantsWithoutCost > 0 ? 'warning' : 'success',
              onClick: () => navigate('/productos/costos?sinCosto=1'),
            },
          ]}
        />
      )}

      {focus !== 'none' && (
        <div className="flex items-center gap-2 text-sm text-fg-muted">
          <span>
            Mostrando solo <span className="font-medium text-fg">{FOCUS_LABEL[focus]}</span> ·{' '}
            {filtered.length.toLocaleString('es-AR')} {filtered.length === 1 ? 'producto' : 'productos'}
          </span>
          <button
            type="button"
            onClick={() => setFocus('none')}
            className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-xs font-medium text-fg hover:bg-bg-muted"
          >
            <X className="h-3 w-3" /> Quitar filtro
          </button>
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
                onChange={(e) => setSearch(e.target.value)}
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
              onChange={(e) => setSort(e.target.value as (typeof SORTS)[number])}
              className="h-10 appearance-none rounded-md border border-border-strong bg-surface px-3 pr-8 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-primary"
            >
              {SORTS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center justify-between">
            <div className="text-sm text-fg-muted">{filtered.length} productos</div>
            {products.length > 0 && (
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

          {/* Barra de acciones masivas */}
          {selected.size > 0 && (
            <div className="sticky top-2 z-20 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-primary/40 bg-primary/5 px-4 py-2.5 shadow-card">
              <span className="text-sm font-medium text-fg">{selected.size} seleccionados</span>
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
          <div className={TABLE_CARD}>
            <table className="w-full text-sm">
              <thead>
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
          Vas a eliminar <span className="font-semibold text-fg">{products.length} productos</span> de{' '}
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
