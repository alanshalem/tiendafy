import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, Card, Input, useToast } from '@tiendafy/ui';
import { useStore } from '../../context/StoreContext';
import { api, errMsg } from '../../lib/api';
import { fetchAllProducts } from '../../lib/products';
import { formatMoney } from '../../lib/format';
import { Pagination } from '../../components/Pagination';
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
}

interface VariantCost {
  variantId: string;
  priceAmount: number;
  costAmount: number | null;
  currency: string;
}

/**
 * Costo por variante (base de Rentabilidad). El costo se guarda en PESOS acá
 * (el input es en pesos, la API trabaja en centavos). Carga masiva: columna
 * «Costo» del CSV de importación.
 */
export function CostsPage() {
  const { store } = useStore();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');

  const { data: products, isLoading } = useQuery({
    queryKey: ['products', store?.id],
    queryFn: () => fetchAllProducts<ProductDto>(),
    enabled: !!store,
  });

  const q = search.trim().toLowerCase();
  const allItems = (products ?? []).filter(
    (p) =>
      q === '' || p.name.toLowerCase().includes(q) || p.variants.some((v) => v.sku.toLowerCase().includes(q)),
  );
  const PAGE_SIZE = 20;
  const totalPages = Math.max(1, Math.ceil(allItems.length / PAGE_SIZE));
  const pageClamped = Math.min(page, totalPages);
  const items = allItems.slice((pageClamped - 1) * PAGE_SIZE, pageClamped * PAGE_SIZE);
  const pageIds = items.map((p) => p.id).join(',');

  // Costos de los productos visibles (endpoint admin con permiso — el DTO
  // público del catálogo no trae costo a propósito).
  const { data: costRows } = useQuery({
    queryKey: ['variant-costs', store?.id, pageIds],
    queryFn: async () => {
      const results = await Promise.all(
        items.map((p) => api.get<{ items: VariantCost[] }>(`/api/v1/products/${p.id}/costs`)),
      );
      return new Map(results.flatMap((r) => r.items).map((c) => [c.variantId, c]));
    },
    enabled: !!store && items.length > 0,
  });

  const save = useMutation({
    mutationFn: ({
      productId,
      variantId,
      costAmount,
    }: {
      productId: string;
      variantId: string;
      costAmount: number | null;
    }) => api.put(`/api/v1/products/${productId}/costs`, { costs: [{ variantId, costAmount }] }),
    onSuccess: (_, { variantId }) => {
      queryClient.invalidateQueries({ queryKey: ['variant-costs', store?.id] });
      setDrafts((d) => {
        const next = { ...d };
        delete next[variantId];
        return next;
      });
      toast('Costo actualizado', { variant: 'success' });
    },
    onError: (err) => {
      toast(errMsg(err, 'Error guardando el costo'), { variant: 'error' });
    },
  });

  if (!store) {
    return <NoStoreSelected />;
  }

  if (!isLoading && allItems.length === 0) {
    return (
      <EmptyState
        kicker="Costos"
        title="Primero, productos"
        body="Cuando cargues productos vas a poder cargar el costo de cada variante y ver tu ganancia real."
      />
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Costos</h1>
        <p className="mt-0.5 text-sm text-fg-muted">
          Cuánto te cuesta cada variante (en pesos). Con el costo cargado, Estadísticas → Rentabilidad muestra
          tu ganancia real por venta. Para cargar en masa usá la columna «Costo» del CSV.
        </p>
      </div>

      <Input
        placeholder="Buscar por producto o SKU…"
        value={search}
        onChange={(e) => {
          setSearch(e.target.value);
          setPage(1);
        }}
      />

      <Card flush>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-border bg-bg-subtle text-left text-fg-muted">
                <th className="px-4 py-2.5 font-medium">Producto</th>
                <th className="px-4 py-2.5 font-medium">Variante</th>
                <th className="px-4 py-2.5 text-right font-medium">Precio</th>
                <th className="px-4 py-2.5 text-right font-medium">Margen</th>
                <th className="px-4 py-2.5 text-center font-medium">Costo ($)</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {items.flatMap((product) =>
                product.variants.map((variant, vi) => {
                  const row = costRows?.get(variant.id);
                  const saved = row?.costAmount != null ? String(row.costAmount / 100) : '';
                  const draft = drafts[variant.id];
                  const value = draft ?? saved;
                  const changed = draft !== undefined && draft !== saved;
                  const costPesos = Number(value);
                  const margin =
                    row && value !== '' && Number.isFinite(costPesos) && row.priceAmount > 0
                      ? Math.round(((row.priceAmount - costPesos * 100) / row.priceAmount) * 100)
                      : null;

                  return (
                    <tr key={variant.id} className="border-b border-border last:border-b-0">
                      <td className="px-4 py-2.5 font-medium text-fg">{vi === 0 ? product.name : ''}</td>
                      <td className="px-4 py-2.5 text-fg-muted">
                        {variant.optionValues.length > 0 ? variant.optionValues.join(' / ') : 'Única'}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-fg-muted">
                        {row ? formatMoney(row.priceAmount, row.currency) : '—'}
                      </td>
                      <td
                        className={`px-4 py-2.5 text-right tabular-nums ${
                          margin != null && margin < 15 ? 'text-danger' : 'text-fg-muted'
                        }`}
                      >
                        {margin != null ? `${margin}%` : '—'}
                      </td>
                      <td className="px-4 py-2.5">
                        <Input
                          type="number"
                          min={0}
                          step="0.01"
                          className="mx-auto h-8 w-28 text-right"
                          value={value}
                          placeholder="Sin costo"
                          onChange={(e) => setDrafts((d) => ({ ...d, [variant.id]: e.target.value }))}
                        />
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <Button
                          size="sm"
                          variant="secondary"
                          disabled={!changed || save.isPending}
                          onClick={() =>
                            save.mutate({
                              productId: product.id,
                              variantId: variant.id,
                              costAmount: value.trim() === '' ? null : Math.round(Number(value) * 100),
                            })
                          }
                        >
                          Guardar
                        </Button>
                      </td>
                    </tr>
                  );
                }),
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <Pagination page={pageClamped} totalPages={totalPages} onPage={setPage} />
      <HelpLink id="rentabilidad" />
    </div>
  );
}
