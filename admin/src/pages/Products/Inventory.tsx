import { useState } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Badge, Button, Card, Input, useToast, PageHeader, SearchInput } from '@tiendafy/ui';
import { useStore } from '../../context/StoreContext';
import { api, errMsg } from '../../lib/api';
import { downloadBlob } from '../../lib/download';
import { useVariantStock } from './queries';
import { fetchStock, isStockChanged } from '../../lib/products';
import { Pagination } from '../../components/Pagination';
import { InfoDot } from '../../components/charts';
import { ListStats } from '../../components/stats/ListStats';
import { formatMoney, formatNumber } from '../../lib/format';
import { useListParams, useListSearch } from '../../lib/useListParams';
import { HelpLink } from '../../components/HelpLink';
import { EmptyState } from '../../components/EmptyState';
import { NoStoreSelected } from '../../components/NoStoreSelected';
import { TABLE_HEAD_STICKY_SUBTLE, TABLE_SCROLL_X } from '../../lib/styles';
import { usePermissions } from '../../context/PermissionsContext';

interface VariantDto {
  id: string;
  sku: string;
  optionValues: string[];
}

interface ProductDto {
  id: string;
  name: string;
  variants: VariantDto[];
  images: { url: string }[];
}

/** Productos por página. */
const PAGE_SIZE = 20;

/** Desde cuántas unidades se considera "poco stock". */
const LOW_STOCK = 5;

/** Recorte del listado. Lo resuelve la base: la tabla muestra una página. */
type StockFilter = 'all' | 'out' | 'low';

/** Búsqueda, recorte de stock y página, en la URL (ver useListParams). */
const LIST_DEFAULTS = { q: '', stock: 'all', pagina: 1 };

const STOCK_LABEL: Record<Exclude<StockFilter, 'all'>, string> = {
  out: 'Sin stock',
  low: `Quedan ${LOW_STOCK} o menos`,
};

interface InventorySummary {
  variants: number;
  units: number;
  outOfStock: number;
  lowStock: number;
  reserved: number;
  stockValueMinor: number;
  currency: string;
  withoutCost: number;
}

export function InventoryPage() {
  // Ver el stock alcanza para mirarlo y sacar etiquetas; cambiarlo, no.
  const canAdjust = usePermissions().can('inventory.write');
  const { store } = useStore();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  // Lo tipeado y el disponible que había cuando se empezó a tipear: ese es el
  // que viaja como `expectedAvailable`. Con el de la consulta del momento, una
  // venta que refrescara la tabla mientras se tipeaba pasaría inadvertida.
  const [drafts, setDrafts] = useState<Record<string, { value: string; seen: number }>>({});
  const list = useListParams(LIST_DEFAULTS);
  const [search, setSearch] = useListSearch(list);
  const page = list.values.pagina;
  const setPage = (p: number) => list.set({ pagina: p });
  const stockFilter: StockFilter =
    list.values.stock === 'out' || list.values.stock === 'low' ? list.values.stock : 'all';
  const setStockFilter = (next: StockFilter) => list.set({ stock: next });
  const q = list.values.q.trim();

  // Volver a tocar la misma métrica saca el filtro.
  const toggleStock = (next: Exclude<StockFilter, 'all'>) =>
    setStockFilter(stockFilter === next ? 'all' : next);

  // Una página del catálogo por request, con la búsqueda en la base: antes se
  // traía el catálogo COMPLETO para filtrar y paginar en el navegador (y con
  // él, el stock de todas las variantes).
  const { data, isLoading } = useQuery({
    queryKey: ['products-page', store?.id, q, page, stockFilter],
    queryFn: () => {
      const params = new URLSearchParams({
        limit: String(PAGE_SIZE),
        offset: String((page - 1) * PAGE_SIZE),
      });
      if (q) params.set('q', q);
      if (stockFilter !== 'all') {
        params.set('stock', stockFilter);
        params.set('lowStockThreshold', String(LOW_STOCK));
      }
      return api.get<{ items: ProductDto[]; total: number }>(`/api/v1/products?${params}`);
    },
    enabled: !!store,
    placeholderData: keepPreviousData,
  });

  // Resumen del depósito completo, no de la página: la tabla muestra 20
  // variantes, pero la pregunta "¿cuánta plata tengo parada?" es del total.
  const { data: summary } = useQuery({
    queryKey: ['inventory-summary', store?.id],
    queryFn: () => api.get<InventorySummary>(`/api/v1/inventory/summary?lowStockThreshold=${LOW_STOCK}`),
    enabled: !!store,
  });

  const items = data?.items ?? [];
  const totalPages = Math.max(1, Math.ceil((data?.total ?? 0) / PAGE_SIZE));
  // El stock se pide solo para lo que se ve.
  const stockByVariant = useVariantStock(items);

  const save = useMutation({
    mutationFn: ({
      variantId,
      available,
      expectedAvailable,
    }: {
      variantId: string;
      available: number;
      expectedAvailable: number;
    }) =>
      api.put(`/api/v1/inventory/${variantId}`, {
        available,
        reason: 'Ajuste manual desde el panel',
        expectedAvailable,
      }),
    onSuccess: (_, { variantId }) => {
      queryClient.invalidateQueries({ queryKey: ['inventory', store?.id] });
      setDrafts((d) => {
        const next = { ...d };
        delete next[variantId];
        return next;
      });
      toast('Stock actualizado', { variant: 'success' });
    },
    onError: async (err, { variantId }) => {
      toast(errMsg(err, 'Error guardando stock'), { variant: 'error' });
      if (!isStockChanged(err)) return;
      // Se vendió o entró mercadería mientras se tipeaba: la fila se refresca
      // y lo tipeado queda, ahora contra el stock actual, para que la persona
      // lo revise y el segundo "Guardar" entre.
      queryClient.invalidateQueries({ queryKey: ['inventory', store?.id] });
      const now = await fetchStock(variantId);
      if (now)
        setDrafts((d) =>
          d[variantId] ? { ...d, [variantId]: { ...d[variantId], seen: now.available } } : d,
        );
    },
  });

  if (!store) {
    return <NoStoreSelected />;
  }

  if (!isLoading && items.length === 0 && !q) {
    return (
      <EmptyState
        as="h1"
        kicker="Inventario"
        title="Primero, productos"
        body="Cuando cargues productos vas a poder controlar el stock de cada variante desde acá."
      />
    );
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Inventario"
        subtitle="Stock por variante. Lo reservado son checkouts en curso — vuelve solo si expiran."
        actions={
          <Button
            variant="secondary"
            onClick={async () => {
              const ids = items.flatMap((p) => p.variants.map((v) => v.id)).join(',');
              if (!ids) return;
              try {
                downloadBlob(
                  await api.download(`/api/v1/products/labels?variantIds=${ids}`),
                  'etiquetas.pdf',
                );
              } catch (e) {
                toast(errMsg(e, 'No se pudieron generar las etiquetas'), { variant: 'error' });
              }
            }}
          >
            Etiquetas QR de esta página
          </Button>
        }
      />

      {summary && (
        <ListStats
          items={[
            {
              label: 'Unidades en depósito',
              value: formatNumber(summary.units),
              hint: `Suma del disponible de las ${formatNumber(summary.variants)} variantes del catálogo. No incluye lo reservado por checkouts en curso (${summary.reserved}).`,
            },
            {
              label: 'Valorizado a costo',
              value:
                summary.withoutCost === summary.variants
                  ? 'Sin costos'
                  : formatMoney(summary.stockValueMinor, summary.currency),
              hint:
                summary.withoutCost > 0
                  ? `Plata inmovilizada en mercadería, a costo de compra. Quedan ${summary.withoutCost} variantes sin costo cargado, así que el número es un piso.`
                  : 'Plata inmovilizada en mercadería, valuada al costo de compra (no al precio de venta).',
            },
            {
              label: 'Sin stock',
              value: formatNumber(summary.outOfStock),
              hint: 'Variantes en cero: siguen publicadas pero no se pueden vender. Tocá para ver los productos que las tienen.',
              tone: summary.outOfStock > 0 ? 'danger' : 'success',
              onClick: () => toggleStock('out'),
              active: stockFilter === 'out',
            },
            {
              label: `Quedan ${LOW_STOCK} o menos`,
              value: formatNumber(summary.lowStock),
              hint: 'Variantes por agotarse: son las candidatas a la próxima orden de compra. Tocá para ver los productos que las tienen.',
              tone: summary.lowStock > 0 ? 'warning' : 'default',
              onClick: () => toggleStock('low'),
              active: stockFilter === 'low',
            },
          ]}
        />
      )}

      {stockFilter !== 'all' && (
        <div className="flex items-center gap-2 text-sm text-fg-muted">
          <span>
            Mostrando solo <span className="font-medium text-fg">{STOCK_LABEL[stockFilter]}</span>
            {data && ` · ${formatNumber(data.total)} ${data.total === 1 ? 'producto' : 'productos'}`}
          </span>
          <button
            type="button"
            onClick={() => setStockFilter('all')}
            className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-xs font-medium text-fg hover:bg-bg-muted"
          >
            Ver todo
          </button>
        </div>
      )}

      <SearchInput
        aria-label="Buscar en el inventario"
        placeholder="Buscar por producto o SKU…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      <Card flush>
        <div className={TABLE_SCROLL_X}>
          <table className="w-full text-sm">
            <thead className={TABLE_HEAD_STICKY_SUBTLE}>
              <tr className="border-b border-border bg-bg-subtle text-left text-fg-muted">
                <th className="px-4 py-2.5 font-medium">Producto</th>
                <th className="px-4 py-2.5 font-medium">Variante</th>
                <th className="px-4 py-2.5 font-medium">SKU</th>
                <th className="px-4 py-2.5 text-center font-medium">
                  <span className="inline-flex items-center gap-1">
                    Reservado{' '}
                    <InfoDot info="Checkouts en curso: stock apartado mientras alguien compra. Si el pago no llega en 30 minutos, vuelve solo a disponible." />
                  </span>
                </th>
                <th className="px-4 py-2.5 text-center font-medium">
                  <span className="inline-flex items-center gap-1">
                    Disponible{' '}
                    <InfoDot info="Lo que se puede vender AHORA: el stock físico menos lo reservado." />
                  </span>
                </th>
                <th className="px-4 py-2.5">
                  <span className="sr-only">Acciones</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {items.flatMap((product) =>
                product.variants.map((variant, vi) => {
                  const current = stockByVariant.get(variant.id);
                  const draft = drafts[variant.id];
                  const value = draft?.value ?? String(current?.available ?? '');
                  const changed = draft !== undefined && draft.value !== String(current?.available ?? '');

                  return (
                    <tr key={variant.id} className="border-b border-border last:border-b-0">
                      <td className="px-4 py-2.5 font-medium text-fg">{vi === 0 ? product.name : ''}</td>
                      <td className="px-4 py-2.5 text-fg-muted">
                        {variant.optionValues.length > 0 ? variant.optionValues.join(' / ') : 'Única'}
                      </td>
                      <td className="px-4 py-2.5 text-fg-subtle">{variant.sku}</td>
                      <td className="px-4 py-2.5 text-center">
                        {current && current.reserved > 0 ? (
                          <Badge variant="warning">{current.reserved}</Badge>
                        ) : (
                          <span className="text-fg-subtle">0</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="mx-auto w-20 shrink-0">
                          <Input
                            aria-label={`Stock disponible de ${product.name}${
                              variant.optionValues.length > 0 ? ` (${variant.optionValues.join(' / ')})` : ''
                            }`}
                            compact
                            inputMode="numeric"
                            className="text-center"
                            value={value}
                            placeholder="—"
                            readOnly={!canAdjust}
                            onChange={(e) =>
                              setDrafts((d) => ({
                                ...d,
                                [variant.id]: {
                                  value: e.target.value.replace(/\D/g, ''),
                                  seen: d[variant.id]?.seen ?? current?.available ?? 0,
                                },
                              }))
                            }
                          />
                        </div>
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        {changed && canAdjust && (
                          <Button
                            size="sm"
                            loading={save.isPending && save.variables?.variantId === variant.id}
                            onClick={() =>
                              save.mutate({
                                variantId: variant.id,
                                available: parseInt(value || '0', 10),
                                expectedAvailable: draft!.seen,
                              })
                            }
                          >
                            Guardar
                          </Button>
                        )}
                      </td>
                    </tr>
                  );
                }),
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <Pagination page={page} totalPages={totalPages} onPage={setPage} />
      <HelpLink id="productos" />
    </div>
  );
}
