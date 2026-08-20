import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Badge, Button, Card, Input, useToast } from '@tiendafy/ui';
import { useStore } from '../../context/StoreContext';
import { api, errMsg } from '../../lib/api';
import { downloadBlob } from '../../lib/download';
import { fetchAllProducts, matchesProduct } from '../../lib/products';
import { useVariantStock } from './queries';
import { Pagination } from '../../components/Pagination';
import { InfoDot } from '../../components/charts';
import { ListStats } from '../../components/stats/ListStats';
import { formatMoney } from '../../lib/format';
import { useDebouncedValue } from '../../lib/useDebouncedValue';
import { HelpLink } from '../../components/HelpLink';
import { EmptyState } from '../../components/EmptyState';
import { NoStoreSelected } from '../../components/NoStoreSelected';

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
  const { store } = useStore();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [search, setSearch] = useState('');

  const [page, setPage] = useState(1);
  const q = useDebouncedValue(search).trim();

  // Una página del catálogo por request, con la búsqueda en la base: antes se
  // traía el catálogo COMPLETO para filtrar y paginar en el navegador (y con
  // él, el stock de todas las variantes).
  const { data, isLoading } = useQuery({
    queryKey: ['products-page', store?.id, q, page],
    queryFn: () => {
      const params = new URLSearchParams({
        limit: String(PAGE_SIZE),
        offset: String((page - 1) * PAGE_SIZE),
      });
      if (q) params.set('q', q);
      return api.get<{ items: ProductDto[]; total: number }>(`/api/v1/products?${params}`);
    },
    enabled: !!store,
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
    mutationFn: ({ variantId, available }: { variantId: string; available: number }) =>
      api.put(`/api/v1/inventory/${variantId}`, { available, reason: 'Ajuste manual desde el panel' }),
    onSuccess: (_, { variantId }) => {
      queryClient.invalidateQueries({ queryKey: ['inventory', store?.id] });
      setDrafts((d) => {
        const next = { ...d };
        delete next[variantId];
        return next;
      });
      toast('Stock actualizado', { variant: 'success' });
    },
    onError: (err) => {
      toast(errMsg(err, 'Error guardando stock'), { variant: 'error' });
    },
  });

  if (!store) {
    return <NoStoreSelected />;
  }

  if (!isLoading && items.length === 0 && !q) {
    return (
      <EmptyState
        kicker="Inventario"
        title="Primero, productos"
        body="Cuando cargues productos vas a poder controlar el stock de cada variante desde acá."
      />
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Inventario</h1>
          <p className="mt-0.5 text-sm text-fg-muted">
            Stock por variante. Lo reservado son checkouts en curso — vuelve solo si expiran.
          </p>
        </div>
        <Button
          variant="secondary"
          onClick={async () => {
            const ids = items.flatMap((p) => p.variants.map((v) => v.id)).join(',');
            if (!ids) return;
            try {
              downloadBlob(await api.download(`/api/v1/products/labels?variantIds=${ids}`), 'etiquetas.pdf');
            } catch (e) {
              toast(errMsg(e, 'No se pudieron generar las etiquetas'), { variant: 'error' });
            }
          }}
        >
          Etiquetas QR de esta página
        </Button>
      </div>

      {summary && (
        <ListStats
          items={[
            {
              label: 'Unidades en depósito',
              value: summary.units.toLocaleString('es-AR'),
              hint: `Suma del disponible de las ${summary.variants.toLocaleString('es-AR')} variantes del catálogo. No incluye lo reservado por checkouts en curso (${summary.reserved}).`,
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
              value: summary.outOfStock.toLocaleString('es-AR'),
              hint: 'Variantes en cero: siguen publicadas pero no se pueden vender.',
              tone: summary.outOfStock > 0 ? 'danger' : 'success',
            },
            {
              label: `Quedan ${LOW_STOCK} o menos`,
              value: summary.lowStock.toLocaleString('es-AR'),
              hint: 'Variantes por agotarse. Son las candidatas a la próxima orden de compra.',
              tone: summary.lowStock > 0 ? 'warning' : 'default',
            },
          ]}
        />
      )}

      <Input
        placeholder="Buscar por producto o SKU…"
        value={search}
        onChange={(e) => {
          setSearch(e.target.value);
          setPage(1);
        }}
      />

      <Card flush>
        <table className="w-full text-sm">
          <thead>
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
              <th className="px-4 py-2.5" />
            </tr>
          </thead>
          <tbody>
            {items.flatMap((product) =>
              product.variants.map((variant, vi) => {
                const current = stockByVariant.get(variant.id);
                const draft = drafts[variant.id];
                const value = draft ?? String(current?.available ?? '');
                const changed = draft !== undefined && draft !== String(current?.available ?? '');

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
                          compact
                          inputMode="numeric"
                          className="text-center"
                          value={value}
                          placeholder="—"
                          onChange={(e) =>
                            setDrafts((d) => ({ ...d, [variant.id]: e.target.value.replace(/\D/g, '') }))
                          }
                        />
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      {changed && (
                        <Button
                          size="sm"
                          loading={save.isPending && save.variables?.variantId === variant.id}
                          onClick={() =>
                            save.mutate({ variantId: variant.id, available: parseInt(value || '0', 10) })
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
      </Card>

      <Pagination page={page} totalPages={totalPages} onPage={setPage} />
      <HelpLink id="productos" />
    </div>
  );
}
