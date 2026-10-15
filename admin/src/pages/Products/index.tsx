import { useMemo, useState, type CSSProperties } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Archive, ArrowUpDown, Filter, MoreVertical, Plus, Trash2, Upload, X } from 'lucide-react';
import { Button, Checkbox, Dropdown, Modal, PageHeader, useToast, SearchInput } from '@tiendafy/ui';
import type { MoneyDto } from '@tiendafy/types';
import { useStore } from '../../context/StoreContext';
import { usePermissions } from '../../context/PermissionsContext';
import { api, errMsg } from '../../lib/api';
import { useVariantStock, useCatalogHealth } from './queries';
import { Pagination, pageRangeLabel } from '../../components/Pagination';
import { useListParams, useListSearch } from '../../lib/useListParams';
import { EmptyState } from '../../components/EmptyState';
import { NoStoreSelected } from '../../components/NoStoreSelected';
import { HelpLink } from '../../components/HelpLink';
import { FilterPanel, defaultFilters, type ProductFilters } from './FilterPanel';
import { type Category } from './types';
import { ProductCard, ProductRows } from './ProductRows';
import { ListCardList } from '../../components/ListCards';
import { useIsMobile } from '../../lib/useMediaQuery';
import { OWNER } from '../Settings/team-access';
import { TABLE_CARD, TABLE_HEAD_STICKY_UNDER_BAR, TABLE_SCROLL_X } from '../../lib/styles';
import { ListStats } from '../../components/stats/ListStats';
import { formatNumber } from '../../lib/format';
import { TableSkeleton } from '../../components/Skeleton';

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

type SortValue = (typeof SORTS)[keyof typeof SORTS];
const SORT_VALUES: readonly string[] = Object.values(SORTS);

/** Productos por página. */
const PAGE_SIZE = 20;

/**
 * Los parámetros del listado en la URL. Los filtros van con nombre propio
 * (y no como los del panel de filtros) para que la URL se lea:
 * /productos?estado=draft&falta=image.
 */
const LIST_DEFAULTS = {
  q: '',
  ordenar: 'newest' as SortValue,
  pagina: 1,
  categoria: defaultFilters.category,
  stock: defaultFilters.stock as string,
  promo: defaultFilters.priceType as string,
  estado: defaultFilters.status as string,
  falta: defaultFilters.missing as string,
};

/** Solo lo que el panel conoce: una URL tocada a mano no mete valores raros. */
function oneOf<T extends string>(value: string, allowed: readonly T[], fallback: T): T {
  return (allowed as readonly string[]).includes(value) ? (value as T) : fallback;
}

function filtersFrom(v: typeof LIST_DEFAULTS): ProductFilters {
  return {
    category: v.categoria,
    stock: oneOf(v.stock, ['all', 'in', 'out'], defaultFilters.stock),
    priceType: oneOf(v.promo, ['all', 'promo', 'noPromo'], defaultFilters.priceType),
    status: oneOf(v.estado, ['all', 'active', 'draft', 'archived'], defaultFilters.status),
    missing: oneOf(v.falta, ['all', 'image'], defaultFilters.missing),
  };
}

function paramsFrom(f: ProductFilters): Partial<typeof LIST_DEFAULTS> {
  return { categoria: f.category, stock: f.stock, promo: f.priceType, estado: f.status, falta: f.missing };
}

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
  // Quien solo ve el stock mira la lista; editar, crear y exportar es de catálogo.
  const { can, role } = usePermissions();
  const canEdit = can('catalog.write');
  // Borrar el catálogo entero es del dueño: alguien de catálogo arregla
  // productos, no los vacía todos de un golpe.
  const canDeleteAll = canEdit && role === OWNER;
  const mobile = useIsMobile();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // Búsqueda, filtros, orden y página viven en la URL y la pestaña los
  // recuerda: después de editar un producto, la ficha vuelve a "/productos"
  // y el listado reaparece como estaba (página y filtros), no en la página 1.
  const list = useListParams(LIST_DEFAULTS, { storageKey: store ? `productos:${store.id}` : null });
  const [search, setSearch] = useListSearch(list);
  const filters = filtersFrom(list.values);
  const sort = SORT_VALUES.includes(list.values.ordenar as SortValue)
    ? (list.values.ordenar as SortValue)
    : LIST_DEFAULTS.ordenar;
  const page = list.values.pagina;
  const setPage = (p: number) => list.set({ pagina: p });
  const setFilters = (f: ProductFilters) => list.set(paramsFrom(f));
  const [filterOpen, setFilterOpen] = useState(false);

  /**
   * Volver a tocar la misma métrica saca el filtro: es el gesto que espera
   * cualquiera que la usó para mirar y quiere volver al listado completo.
   */
  const toggleFilter = <K extends keyof ProductFilters>(key: K, value: ProductFilters[K]) =>
    setFilters({ ...filters, [key]: filters[key] === value ? defaultFilters[key] : value });
  const [draftFilters, setDraftFilters] = useState<ProductFilters>(defaultFilters);

  const debouncedSearch = list.values.q.trim();

  // Una página por request, con búsqueda, filtros y orden resueltos en la base.
  // Antes se traía el catálogo COMPLETO al navegador para filtrar y paginar acá:
  // con miles de productos eso es descargar la tienda entera en cada visita, y
  // encima los filtros de categoría y envío no llegaban a aplicarse nunca.
  const { data, isLoading } = useQuery({
    // Bajo ['products', tienda]: así lo refresca todo lo que invalida productos
    // (antes la clave era otra y publicar o borrar no actualizaba la lista).
    queryKey: ['products', store?.id, 'admin', debouncedSearch, filters, sort, page],
    queryFn: () => {
      const params = new URLSearchParams({
        limit: String(PAGE_SIZE),
        offset: String((page - 1) * PAGE_SIZE),
        sort,
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
    placeholderData: keepPreviousData,
  });

  const pageItems = useMemo(() => data?.items ?? [], [data]);
  const total = data?.total ?? 0;

  // El stock se pide solo para lo que se ve.
  const stockMap = useVariantStock(pageItems);

  // Salud del catálogo entero (no de la página): un listado paginado esconde
  // cuántos productos quedaron en borrador o sin foto.
  const { data: health } = useCatalogHealth(canEdit);

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

  // Elegidos: id → nombre. El nombre hace falta para decir cuáles fallaron
  // aunque estén en otra página (la selección sobrevive al paginar).
  const [selected, setSelected] = useState<Map<string, string>>(new Map());
  const toggleSelect = (product: ProductDto) => {
    setSelected((prev) => {
      const next = new Map(prev);
      if (next.has(product.id)) next.delete(product.id);
      else next.set(product.id, product.name);
      return next;
    });
  };
  const clearSelection = () => setSelected(new Map());
  const [bulkResult, setBulkResult] = useState<BulkResult | null>(null);

  // Uno por uno y cada uno por su lado: si falla uno, los demás igual se
  // hacen. Antes iban todos juntos con Promise.all y un solo error tiraba un
  // "Error" genérico, sin refrescar (lo borrado seguía en la lista), sin
  // limpiar la selección y sin decir qué sí había salido.
  const bulkAction = useMutation({
    mutationFn: async ({ ids, action }: { ids: string[]; action: BulkKind }) => {
      const outcomes = await settleInBatches(ids, (id) =>
        action === 'delete'
          ? api.delete(`/api/v1/products/${id}`)
          : api.post(`/api/v1/products/${id}/${action}`, {}),
      );
      return {
        action,
        done: ids.filter((_, i) => outcomes[i]!.status === 'fulfilled'),
        failed: ids.flatMap((id, i) => {
          const o = outcomes[i]!;
          return o.status === 'rejected' ? [{ id, reason: errMsg(o.reason, 'No se pudo.') }] : [];
        }),
      };
    },
    onSuccess: ({ action, done, failed }) => {
      queryClient.invalidateQueries({ queryKey: ['products', store?.id] });
      queryClient.invalidateQueries({ queryKey: ['catalog-health', store?.id] });
      setBulkDeleteOpen(false);
      const names = new Map(selected);
      // Los que salieron dejan de estar elegidos; los que fallaron quedan,
      // para reintentar o revisarlos.
      setSelected((prev) => {
        const next = new Map(prev);
        for (const id of done) next.delete(id);
        return next;
      });
      const result: BulkResult = {
        summary: bulkSummary(action, done.length, failed.length),
        failed: failed.map((f) => ({ ...f, name: names.get(f.id) ?? f.id })),
      };
      setBulkResult(failed.length > 0 ? result : null);
      toast(result.summary, { variant: failed.length > 0 ? 'error' : 'success' });
    },
    onError: (err) => toast(errMsg(err, 'No se pudo completar la acción.'), { variant: 'error' }),
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
      const next = new Map(prev);
      if (allPageSelected) {
        pageItems.forEach((p) => next.delete(p.id));
      } else {
        pageItems.forEach((p) => next.set(p.id, p.name));
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
      <PageHeader
        title="Productos"
        count={
          !isEmpty &&
          total > 0 &&
          pageRangeLabel(pageClamped, PAGE_SIZE, total, total === 1 ? 'producto' : 'productos')
        }
        actions={
          canEdit && (
            <>
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
              {/* "Eliminar todos" era un link rojo siempre a la vista en la
                  barra del listado, al alcance de cualquiera con permiso de
                  catálogo. Va escondido en este menú, y solo para el dueño. */}
              {canDeleteAll && total > 0 && (
                <Dropdown>
                  <Dropdown.Trigger label="Más acciones">
                    <MoreVertical className="h-4 w-4" />
                  </Dropdown.Trigger>
                  <Dropdown.Menu align="end">
                    <Dropdown.Item
                      destructive
                      onSelect={() => {
                        setConfirmText('');
                        setDeleteAllOpen(true);
                      }}
                    >
                      <span className="inline-flex items-center gap-1.5">
                        <Trash2 className="h-4 w-4" /> Eliminar todos los productos
                      </span>
                    </Dropdown.Item>
                  </Dropdown.Menu>
                </Dropdown>
              )}
            </>
          )
        }
      />

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
            onClick: () => navigate('/productos/nuevo'),
          }}
        />
      ) : (
        <>
          {/* Toolbar búsqueda + filtros + orden */}
          <div className="flex flex-wrap items-center gap-2">
            <SearchInput
              className="min-w-[16rem] flex-1"
              aria-label="Buscar productos"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por nombre, SKU o tags"
            />
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
              aria-label="Ordenar productos"
              value={sort}
              onChange={(e) => list.set({ ordenar: e.target.value as SortValue })}
              className="h-10 appearance-none rounded-md border border-border-strong bg-surface px-3 pr-8 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-primary"
            >
              {Object.entries(SORTS).map(([label, value]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>

          {bulkResult && (
            <div
              role="status"
              className="rounded-lg border border-warning/40 bg-warning-bg px-4 py-3 text-sm"
            >
              <div className="flex items-start justify-between gap-3">
                <p className="font-medium text-fg">{bulkResult.summary}.</p>
                <button
                  type="button"
                  onClick={() => setBulkResult(null)}
                  aria-label="Cerrar el resumen"
                  className="rounded p-0.5 text-fg-muted hover:text-fg"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <ul className="mt-1.5 space-y-0.5 text-fg-muted">
                {bulkResult.failed.map((f) => (
                  <li key={f.id}>
                    <span className="font-semibold text-fg">{f.name}</span>: {f.reason}
                  </li>
                ))}
              </ul>
              <p className="mt-1.5 text-xs text-fg-subtle">
                Los que fallaron siguen seleccionados: podés reintentar o revisarlos uno por uno.
              </p>
            </div>
          )}

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
                  onClick={() => bulkAction.mutate({ ids: [...selected.keys()], action: 'publish' })}
                  className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border-strong bg-surface px-3 text-sm font-medium text-fg hover:bg-bg-muted disabled:opacity-50"
                >
                  <Upload className="h-4 w-4" /> Publicar
                </button>
                <button
                  type="button"
                  disabled={bulkAction.isPending}
                  onClick={() => bulkAction.mutate({ ids: [...selected.keys()], action: 'archive' })}
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

          {/* En el teléfono, tarjetas: la tabla cortaba los precios. */}
          {mobile ? (
            <div className={TABLE_CARD}>
              {isLoading ? (
                <TableSkeleton label="Cargando productos…" />
              ) : noResults ? (
                <div className="px-4 py-12 text-center">
                  <p className="text-fg-muted">Ningún producto coincide con la búsqueda.</p>
                  <button
                    type="button"
                    onClick={() => list.set({ q: '', ...paramsFrom(defaultFilters) })}
                    className="mt-2 text-sm font-medium text-primary hover:underline"
                  >
                    Limpiar búsqueda y filtros
                  </button>
                </div>
              ) : (
                <ListCardList label="Productos">
                  {pageItems.map((product) => (
                    <ProductCard
                      key={product.id}
                      product={product}
                      stockMap={stockMap}
                      storeId={store.id}
                      readOnly={!canEdit}
                      selected={selected.has(product.id)}
                      onToggleSelect={() => toggleSelect(product)}
                      onStatus={(publish) => setStatus.mutate({ id: product.id, publish })}
                      onDelete={() => deleteProduct.mutate(product.id)}
                      onDuplicate={() => duplicateProduct.mutate(product.id)}
                    />
                  ))}
                </ListCardList>
              )}
            </div>
          ) : (
            /* Tabla agrupada */
            <div
              className={TABLE_CARD}
              style={{ '--bulk-bar': selected.size > 0 ? '4rem' : '0px' } as CSSProperties}
            >
              <div className={TABLE_SCROLL_X}>
                <table className="w-full text-sm">
                  <thead className={TABLE_HEAD_STICKY_UNDER_BAR}>
                    <tr className="border-b border-border bg-bg-subtle text-left text-xs font-medium text-fg-muted">
                      <th className="w-10 px-3 py-2.5">
                        {canEdit && (
                          <Checkbox
                            checked={allPageSelected}
                            indeterminate={somePageSelected}
                            onChange={toggleSelectAll}
                            aria-label="Seleccionar todos"
                          />
                        )}
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
                        <td colSpan={7}>
                          <TableSkeleton label="Cargando productos…" />
                        </td>
                      </tr>
                    ) : noResults ? (
                      <tr>
                        <td colSpan={7} className="px-4 py-12 text-center">
                          <p className="text-fg-muted">Ningún producto coincide con la búsqueda.</p>
                          <button
                            type="button"
                            onClick={() => list.set({ q: '', ...paramsFrom(defaultFilters) })}
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
                          readOnly={!canEdit}
                          selected={selected.has(product.id)}
                          onToggleSelect={() => toggleSelect(product)}
                          onStatus={(publish) => setStatus.mutate({ id: product.id, publish })}
                          onDelete={() => deleteProduct.mutate(product.id)}
                          onDuplicate={() => duplicateProduct.mutate(product.id)}
                        />
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

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
          aria-label="Escribí ELIMINAR para confirmar"
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
              onClick={() => bulkAction.mutate({ ids: [...selected.keys()], action: 'delete' })}
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

type BulkKind = 'publish' | 'archive' | 'delete';

interface BulkResult {
  summary: string;
  failed: { id: string; name: string; reason: string }[];
}

/**
 * Corre `run` para cada id, de a `size` a la vez, y devuelve el resultado de
 * cada uno en el mismo orden (como Promise.allSettled). De a pocos para no
 * mandar cien pedidos juntos cuando la selección junta varias páginas.
 */
async function settleInBatches<T>(
  ids: string[],
  run: (id: string) => Promise<T>,
  size = 6,
): Promise<PromiseSettledResult<T>[]> {
  const out: PromiseSettledResult<T>[] = [];
  for (let i = 0; i < ids.length; i += size) {
    out.push(...(await Promise.allSettled(ids.slice(i, i + size).map(run))));
  }
  return out;
}

const BULK_DONE: Record<BulkKind, [string, string]> = {
  publish: ['publicado', 'publicados'],
  archive: ['archivado', 'archivados'],
  delete: ['eliminado', 'eliminados'],
};
const BULK_VERB: Record<BulkKind, string> = { publish: 'publicar', archive: 'archivar', delete: 'eliminar' };

/** "3 productos publicados · 1 no se pudo publicar" */
function bulkSummary(action: BulkKind, done: number, failed: number): string {
  const [one, many] = BULK_DONE[action];
  const parts: string[] = [];
  if (done > 0) parts.push(`${done} ${done === 1 ? `producto ${one}` : `productos ${many}`}`);
  if (failed > 0) parts.push(`${failed} no se ${failed === 1 ? 'pudo' : 'pudieron'} ${BULK_VERB[action]}`);
  return parts.join(' · ');
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
