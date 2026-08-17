import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Badge, Dropdown, useToast, useConfirm } from '@tiendafy/ui';
import { MoreVertical } from 'lucide-react';
import { api, errMsg } from '../../lib/api';
import { toFormPrice, toDomainPrice } from '../../lib/price';
import { statusLabel, statusVariant, type StockItem } from './types';
import type { ProductDto, VariantDto } from './index';

export function ProductRows({
  product,
  stockMap,
  storeId,
  selected,
  onToggleSelect,
  onStatus,
  onDelete,
  onDuplicate,
}: {
  product: ProductDto;
  stockMap: Map<string, StockItem>;
  storeId: string;
  selected: boolean;
  onToggleSelect: () => void;
  onStatus: (publish: boolean) => void;
  onDelete: () => void;
  onDuplicate: () => void;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const confirm = useConfirm();

  const savePrice = useMutation({
    mutationFn: ({
      variant,
      regular,
      promo,
    }: {
      variant: VariantDto;
      regular: number;
      promo: number | null;
    }) => {
      const { priceAmount, compareAtAmount } = toDomainPrice(regular, promo);
      return api.patch(`/api/v1/products/${product.id}/variants/${variant.id}/price`, {
        priceAmount,
        currency: variant.price.currency,
        compareAtAmount,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products', storeId] });
      toast('Precio actualizado', { variant: 'success' });
    },
    onError: (err) => toast(errMsg(err, 'Error'), { variant: 'error' }),
  });

  return (
    <>
      {product.variants.map((variant, vi) => {
        const stockItem = stockMap.get(variant.id);
        const form = toFormPrice(variant.price.amount, variant.compareAtPrice?.amount ?? null);
        return (
          <tr
            key={variant.id}
            className={vi === 0 ? 'border-t-4 border-bg-subtle' : 'border-t border-border'}
          >
            {vi === 0 ? (
              <>
                <td className="px-3 py-3 align-top" rowSpan={product.variants.length}>
                  <input
                    type="checkbox"
                    className="rounded-sm border-border-strong"
                    checked={selected}
                    onChange={onToggleSelect}
                    aria-label={`Seleccionar ${product.name}`}
                  />
                </td>
                <td className="px-3 py-3 align-top" rowSpan={product.variants.length}>
                  <div className="flex items-start gap-3">
                    {product.images[0] ? (
                      <img
                        src={product.images[0].url}
                        alt=""
                        className="h-12 w-12 shrink-0 rounded-md border border-border object-cover"
                      />
                    ) : (
                      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md border border-border bg-bg-muted text-base font-bold text-fg-subtle">
                        {product.name.charAt(0)}
                      </div>
                    )}
                    <div className="min-w-0">
                      <Link
                        to={`/productos/${product.id}/editar`}
                        className="font-medium text-primary hover:underline"
                      >
                        {product.name}
                      </Link>
                      <div className="text-xs text-fg-subtle">/{product.slug}</div>
                      <div className="mt-1">
                        <Badge variant={statusVariant[product.status]}>{statusLabel[product.status]}</Badge>
                      </div>
                    </div>
                  </div>
                </td>
              </>
            ) : null}
            <td className="px-3 py-2 text-center tabular-nums">
              {stockItem ? (
                <span className={stockItem.available === 0 ? 'text-danger' : 'text-fg'}>
                  {stockItem.available}
                </span>
              ) : (
                <span className="text-fg-subtle">—</span>
              )}
            </td>
            <td className="px-3 py-2">
              <PriceInput
                value={form.regular}
                onSave={(amount) => savePrice.mutate({ variant, regular: amount, promo: form.promo })}
              />
            </td>
            <td className="px-3 py-2">
              <PriceInput
                value={form.promo}
                placeholder="—"
                onSave={(amount) => savePrice.mutate({ variant, regular: form.regular, promo: amount })}
              />
            </td>
            <td className="px-3 py-2 text-fg-muted">
              {variant.optionValues.length > 0 ? variant.optionValues.join(' / ') : 'Única'}
            </td>
            {vi === 0 ? (
              <td className="px-3 py-3 text-right align-top" rowSpan={product.variants.length}>
                <Dropdown>
                  <Dropdown.Trigger>
                    <MoreVertical className="h-4 w-4" />
                  </Dropdown.Trigger>
                  <Dropdown.Menu align="end">
                    <Dropdown.Item onSelect={() => navigate(`/productos/${product.id}/editar`)}>
                      Editar
                    </Dropdown.Item>
                    <Dropdown.Item onSelect={onDuplicate}>Duplicar</Dropdown.Item>
                    {product.status === 'ACTIVE' ? (
                      <Dropdown.Item onSelect={() => onStatus(false)}>Archivar</Dropdown.Item>
                    ) : (
                      <Dropdown.Item onSelect={() => onStatus(true)}>Publicar</Dropdown.Item>
                    )}
                    <Dropdown.Item
                      destructive
                      onSelect={async () => {
                        if (
                          await confirm({
                            title: 'Eliminar producto',
                            message: `¿Eliminar "${product.name}"? No se puede deshacer.`,
                            confirmLabel: 'Eliminar',
                            variant: 'danger',
                          })
                        )
                          onDelete();
                      }}
                    >
                      Eliminar
                    </Dropdown.Item>
                  </Dropdown.Menu>
                </Dropdown>
              </td>
            ) : null}
          </tr>
        );
      })}
    </>
  );
}

/** Input de precio inline: muestra en pesos, guarda en centavos al blur si cambió. */
function PriceInput({
  value,
  placeholder,
  onSave,
}: {
  value: number | null;
  placeholder?: string;
  onSave: (amountCents: number) => void;
}) {
  const initial = value != null ? (value / 100).toString() : '';
  const [draft, setDraft] = useState(initial);

  const commit = () => {
    const normalized = draft.replace(',', '.');
    if (normalized === '' && value == null) return;
    if (!/^\d+(\.\d{1,2})?$/.test(normalized)) {
      setDraft(initial);
      return;
    }
    const cents = Math.round(parseFloat(normalized) * 100);
    if (cents !== value) onSave(cents);
  };

  return (
    <div className="flex items-center rounded-md border border-border-strong bg-surface focus-within:ring-2 focus-within:ring-primary">
      <span className="pl-2 text-xs text-fg-subtle">$</span>
      <input
        value={draft}
        placeholder={placeholder}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
        className="h-8 w-full bg-transparent px-1.5 text-sm tabular-nums focus:outline-none"
        inputMode="decimal"
      />
    </div>
  );
}
