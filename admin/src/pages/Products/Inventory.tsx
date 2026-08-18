import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Badge, Button, Card, Input, useToast } from '@tiendafy/ui';
import { useStore } from '../../context/StoreContext';
import { api, errMsg } from '../../lib/api';
import { downloadBlob } from '../../lib/download';
import { fetchAllProducts } from '../../lib/products';
import { useVariantStock } from './queries';
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
  images: { url: string }[];
}

export function InventoryPage() {
  const { store } = useStore();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  const [page, setPage] = useState(1);

  const { data: products, isLoading } = useQuery({
    queryKey: ['products', store?.id],
    queryFn: () => fetchAllProducts<ProductDto>(),
    enabled: !!store,
  });

  const allItems = products ?? [];
  const stockByVariant = useVariantStock(allItems);

  const PAGE_SIZE = 20;
  const totalPages = Math.max(1, Math.ceil(allItems.length / PAGE_SIZE));
  const pageClamped = Math.min(page, totalPages);

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

  const items = allItems.slice((pageClamped - 1) * PAGE_SIZE, pageClamped * PAGE_SIZE);
  if (!isLoading && allItems.length === 0) {
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

      <Card flush>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-bg-subtle text-left text-fg-muted">
              <th className="px-4 py-2.5 font-medium">Producto</th>
              <th className="px-4 py-2.5 font-medium">Variante</th>
              <th className="px-4 py-2.5 font-medium">SKU</th>
              <th className="px-4 py-2.5 text-center font-medium">Reservado</th>
              <th className="px-4 py-2.5 text-center font-medium">Disponible</th>
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
                      <Input
                        inputMode="numeric"
                        className="mx-auto h-8 w-20 text-center"
                        value={value}
                        placeholder="—"
                        onChange={(e) =>
                          setDrafts((d) => ({ ...d, [variant.id]: e.target.value.replace(/\D/g, '') }))
                        }
                      />
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

      <Pagination page={pageClamped} totalPages={totalPages} onPage={setPage} />
      <HelpLink id="productos" />
    </div>
  );
}
