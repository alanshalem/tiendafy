import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Badge, Button, Checkbox, Dropdown, Modal, useConfirm, useToast } from '@tiendafy/ui';
import { MoreVertical } from 'lucide-react';
import { api, errMsg } from '../../lib/api';
import { formatMoney } from '../../lib/format';
import { toFormPrice, toDomainPrice } from '../../lib/price';
import { CARD_MENU_TRIGGER, ListCard } from '../../components/ListCards';
import { statusLabel, statusVariant, type StockItem } from './types';
import type { ProductDto, VariantDto } from './index';

interface RowProps {
  product: ProductDto;
  stockMap: Map<string, StockItem>;
  storeId: string;
  /** Sin permiso de catálogo: se mira, no se edita (ni precio, ni acciones, ni selección). */
  readOnly?: boolean;
  selected: boolean;
  onToggleSelect: () => void;
  onStatus: (publish: boolean) => void;
  onDelete: () => void;
  onDuplicate: () => void;
}

/** "Talle M / Rojo", o el nombre solo si es una variante única. */
const variantName = (product: ProductDto, variant: VariantDto) =>
  `${product.name}${variant.optionValues.length ? ` (${variant.optionValues.join(' / ')})` : ''}`;

/** Guardar el precio (y el promocional) de una variante: lo usan la fila y la hoja del teléfono. */
function useSavePrice(product: ProductDto, storeId: string) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  return useMutation({
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
}

/** El menú ⋮ de un producto: editar, duplicar, publicar/archivar, eliminar. */
function ProductActions({
  product,
  onStatus,
  onDelete,
  onDuplicate,
  onEditPrices,
  compact = false,
}: Pick<RowProps, 'product' | 'onStatus' | 'onDelete' | 'onDuplicate'> & {
  onEditPrices?: () => void;
  /** Solo el ícono, para la tarjeta del teléfono. */
  compact?: boolean;
}) {
  const navigate = useNavigate();
  const confirm = useConfirm();
  return (
    <Dropdown>
      <Dropdown.Trigger
        label={`Acciones de ${product.name}`}
        bare={compact}
        className={compact ? CARD_MENU_TRIGGER : undefined}
      >
        <MoreVertical className="h-4 w-4" />
      </Dropdown.Trigger>
      <Dropdown.Menu align="end">
        <Dropdown.Item onSelect={() => navigate(`/productos/${product.id}/editar`)}>Editar</Dropdown.Item>
        {onEditPrices && <Dropdown.Item onSelect={onEditPrices}>Cambiar precio</Dropdown.Item>}
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
  );
}

function ProductThumb({ product, size = 'h-12 w-12' }: { product: ProductDto; size?: string }) {
  return product.images[0] ? (
    <img
      src={product.images[0].url}
      alt=""
      className={`${size} shrink-0 rounded-md border border-border object-cover`}
    />
  ) : (
    <div
      className={`flex ${size} shrink-0 items-center justify-center rounded-md border border-border bg-bg-muted text-base font-bold text-fg-subtle`}
    >
      {product.name.charAt(0)}
    </div>
  );
}

export function ProductRows({
  product,
  stockMap,
  storeId,
  readOnly = false,
  selected,
  onToggleSelect,
  onStatus,
  onDelete,
  onDuplicate,
}: RowProps) {
  const savePrice = useSavePrice(product, storeId);

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
                  {!readOnly && (
                    <Checkbox
                      checked={selected}
                      onChange={onToggleSelect}
                      aria-label={`Seleccionar ${product.name}`}
                    />
                  )}
                </td>
                <td className="px-3 py-3 align-top" rowSpan={product.variants.length}>
                  <div className="flex items-start gap-3">
                    <ProductThumb product={product} />
                    <div className="min-w-0">
                      {readOnly ? (
                        <span className="font-medium text-fg">{product.name}</span>
                      ) : (
                        <Link
                          to={`/productos/${product.id}/editar`}
                          className="font-medium text-primary hover:underline"
                        >
                          {product.name}
                        </Link>
                      )}
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
                label={`Precio de ${variantName(product, variant)}`}
                value={form.regular}
                readOnly={readOnly}
                onSave={(amount) => savePrice.mutate({ variant, regular: amount, promo: form.promo })}
              />
            </td>
            <td className="px-3 py-2">
              <PriceInput
                label={`Precio promocional de ${variantName(product, variant)}`}
                value={form.promo}
                placeholder="—"
                readOnly={readOnly}
                onSave={(amount) => savePrice.mutate({ variant, regular: form.regular, promo: amount })}
              />
            </td>
            <td className="px-3 py-2 text-fg-muted">
              {variant.optionValues.length > 0 ? variant.optionValues.join(' / ') : 'Única'}
            </td>
            {vi === 0 ? (
              <td className="px-3 py-3 text-right align-top" rowSpan={product.variants.length}>
                {!readOnly && (
                  <ProductActions
                    product={product}
                    onStatus={onStatus}
                    onDelete={onDelete}
                    onDuplicate={onDuplicate}
                  />
                )}
              </td>
            ) : null}
          </tr>
        );
      })}
    </>
  );
}

/**
 * Un producto como tarjeta, para el teléfono. En 390 px el campo de precio de
 * la tabla cortaba "$ 117.187" en "$ 11": acá el precio se lee entero (el
 * rango si las variantes cuestan distinto) y se cambia en una hoja aparte,
 * con un campo por variante del ancho de la pantalla.
 */
export function ProductCard({
  product,
  stockMap,
  storeId,
  readOnly = false,
  selected,
  onToggleSelect,
  onStatus,
  onDelete,
  onDuplicate,
}: RowProps) {
  const navigate = useNavigate();
  const [pricesOpen, setPricesOpen] = useState(false);
  const prices = product.variants.map((v) => v.price.amount);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const currency = product.variants[0]?.price.currency;
  const onSale = product.variants.some((v) => v.compareAtPrice != null);
  const stock = product.variants.reduce<number | null>((sum, v) => {
    const item = stockMap.get(v.id);
    return item ? (sum ?? 0) + item.available : sum;
  }, null);

  return (
    <>
      <ListCard
        leading={
          <div className="flex items-start gap-3">
            {!readOnly && (
              <Checkbox
                checked={selected}
                onChange={onToggleSelect}
                aria-label={`Seleccionar ${product.name}`}
              />
            )}
            <ProductThumb product={product} />
          </div>
        }
        title={product.name}
        subtitle={
          product.variants.length > 1
            ? `${product.variants.length} variantes`
            : product.variants[0]?.optionValues.join(' / ') || undefined
        }
        value={
          product.variants.length === 0
            ? '—'
            : min === max
              ? formatMoney(min, currency)
              : `${formatMoney(min, currency)} – ${formatMoney(max, currency)}`
        }
        badges={
          <>
            <Badge variant={statusVariant[product.status]}>{statusLabel[product.status]}</Badge>
            {onSale && <Badge variant="primary">En oferta</Badge>}
          </>
        }
        meta={
          stock == null ? undefined : (
            <span className={stock === 0 ? 'text-danger' : undefined}>
              {stock === 0 ? 'Sin stock' : `Stock ${stock}`}
            </span>
          )
        }
        onOpen={readOnly ? undefined : () => navigate(`/productos/${product.id}/editar`)}
        actions={
          readOnly ? undefined : (
            <ProductActions
              product={product}
              onStatus={onStatus}
              onDelete={onDelete}
              onDuplicate={onDuplicate}
              onEditPrices={() => setPricesOpen(true)}
              compact
            />
          )
        }
      />
      {!readOnly && (
        <PriceSheet
          key={pricesOpen ? 'abierta' : 'cerrada'}
          open={pricesOpen}
          onClose={() => setPricesOpen(false)}
          product={product}
          storeId={storeId}
        />
      )}
    </>
  );
}

/** La hoja para cambiar precios desde el teléfono: un par de campos por variante. */
function PriceSheet({
  open,
  onClose,
  product,
  storeId,
}: {
  open: boolean;
  onClose: () => void;
  product: ProductDto;
  storeId: string;
}) {
  const savePrice = useSavePrice(product, storeId);
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Precio de ${product.name}`}
      footer={
        <Button variant="secondary" onClick={onClose}>
          Listo
        </Button>
      }
    >
      <p className="mb-3 text-sm text-fg-muted">
        Cada precio se guarda al salir del campo. El promocional es opcional: si lo cargás, el precio de lista
        se muestra tachado.
      </p>
      <div className="space-y-4">
        {product.variants.map((variant) => {
          const form = toFormPrice(variant.price.amount, variant.compareAtPrice?.amount ?? null);
          return (
            <div key={variant.id}>
              {product.variants.length > 1 && (
                <div className="mb-1.5 text-sm font-medium text-fg">
                  {variant.optionValues.join(' / ') || 'Única'}
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <label className="flex flex-col gap-1 text-xs text-fg-muted">
                  Precio
                  <PriceInput
                    label={`Precio de ${variantName(product, variant)}`}
                    value={form.regular}
                    tall
                    onSave={(amount) => savePrice.mutate({ variant, regular: amount, promo: form.promo })}
                  />
                </label>
                <label className="flex flex-col gap-1 text-xs text-fg-muted">
                  Promocional
                  <PriceInput
                    label={`Precio promocional de ${variantName(product, variant)}`}
                    value={form.promo}
                    placeholder="Sin oferta"
                    tall
                    onSave={(amount) => savePrice.mutate({ variant, regular: form.regular, promo: amount })}
                  />
                </label>
              </div>
            </div>
          );
        })}
      </div>
    </Modal>
  );
}

/** Input de precio inline: muestra en pesos, guarda en centavos al blur si cambió. */
function PriceInput({
  label,
  value,
  placeholder,
  readOnly = false,
  tall = false,
  onSave,
}: {
  /** Nombre accesible: en la fila no hay un <label> visible, el encabezado de la columna lo da a entender. */
  label: string;
  value: number | null;
  placeholder?: string;
  readOnly?: boolean;
  /** Más alto, para el dedo (la hoja del teléfono). */
  tall?: boolean;
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
        aria-label={label}
        value={draft}
        placeholder={placeholder}
        readOnly={readOnly}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={readOnly ? undefined : commit}
        onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
        className={`${tall ? 'h-11 text-base' : 'h-8 text-sm'} w-full min-w-0 bg-transparent px-1.5 tabular-nums text-fg focus:outline-none`}
        inputMode="decimal"
      />
    </div>
  );
}
