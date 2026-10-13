import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Trash2, GripVertical } from 'lucide-react';
import { Button, Checkbox, FormField, Input, useToast } from '@tiendafy/ui';
import type { MoneyDto } from '@tiendafy/types';
import { useStore } from '../../context/StoreContext';
import { api, errMsg } from '../../lib/api';
import { toFormPrice, toDomainPrice, toCents, toPesos, isValidPrice } from '../../lib/price';
import { Section } from './FormSection';
import { type SpecValues } from './SpecFields';
import { StickyFormBar } from './StickyFormBar';
import { NoStoreSelected } from '../../components/NoStoreSelected';
import { statusLabel, type StockItem } from './types';
import {
  CategoriesSection,
  DetailsSection,
  SeoSection,
  SHIPPING_HINT,
  ShippingInputs,
  SpecSection,
  parseShipping,
  sameShipping,
  toShippingDraft,
  type ShippingDraft,
} from './product-form';
import { AddImagesTile, RemovableThumb, UploadingThumb } from './ImageTiles';
import { UploadNotes, UploadSpecHint, uploadMedia, useUploadQueue } from '../../components/upload/primitives';
import { ScreenSkeleton } from '../../components/Skeleton';

interface VariantDto {
  id: string;
  sku: string;
  optionValues: string[];
  price: MoneyDto;
  compareAtPrice: MoneyDto | null;
  barcode?: string | null;
  weightGrams?: number | null;
  lengthCm?: number | null;
  widthCm?: number | null;
  heightCm?: number | null;
}
interface ProductImage {
  id: string;
  url: string;
}
interface ProductDto {
  id: string;
  name: string;
  description: string | null;
  brand: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
  status: 'DRAFT' | 'ACTIVE' | 'ARCHIVED';
  variants: VariantDto[];
  images: ProductImage[];
  categoryIds: string[];
  specs?: { definitionId: string; value: string }[];
}

export function EditProductPage() {
  const { id } = useParams<{ id: string }>();
  const { store } = useStore();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: product, isLoading } = useQuery({
    queryKey: ['product', id],
    queryFn: () => api.get<ProductDto>(`/api/v1/products/${id}`),
    enabled: !!id && !!store,
  });

  const variantIds = useMemo(() => product?.variants.map((v) => v.id) ?? [], [product]);
  const { data: stockData } = useQuery({
    queryKey: ['inventory', store?.id, 'product', variantIds.join(',')],
    queryFn: () => api.get<{ items: StockItem[] }>(`/api/v1/inventory/?variantIds=${variantIds.join(',')}`),
    enabled: variantIds.length > 0,
  });

  // Estado del form (se inicializa al cargar el producto).
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [brand, setBrand] = useState('');
  const [seoTitle, setSeoTitle] = useState('');
  const [seoDescription, setSeoDescription] = useState('');
  const [prices, setPrices] = useState<Record<string, { price: string; promo: string }>>({});
  const [stock, setStock] = useState<Record<string, string>>({});
  // Por variante: código de barras y el paquete de una unidad (peso y medidas).
  const [barcodes, setBarcodes] = useState<Record<string, string>>({});
  const [shipping, setShipping] = useState<Record<string, ShippingDraft>>({});
  const [categoryIds, setCategoryIds] = useState<string[]>([]);
  const [specs, setSpecs] = useState<SpecValues>({});
  const [imageOrder, setImageOrder] = useState<string[]>([]);
  const [dragId, setDragId] = useState<string | null>(null);
  const [error, setError] = useState<string>();

  // Los campos se cargan UNA vez por producto, al dibujar. Antes un efecto los
  // volvía a copiar en cada recarga del producto —por ejemplo al subir una
  // foto— y se perdía lo que se estaba editando sin guardar.
  const [formFor, setFormFor] = useState<string | null>(null);
  if (product && formFor !== product.id) {
    setFormFor(product.id);
    setName(product.name);
    setDescription(product.description ?? '');
    setBrand(product.brand ?? '');
    setSeoTitle(product.seoTitle ?? '');
    setSeoDescription(product.seoDescription ?? '');
    setCategoryIds(product.categoryIds ?? []);
    setSpecs(Object.fromEntries((product.specs ?? []).map((x) => [x.definitionId, x.value])));
    setPrices(
      Object.fromEntries(
        product.variants.map((v) => {
          const f = toFormPrice(v.price.amount, v.compareAtPrice?.amount ?? null);
          return [v.id, { price: toPesos(f.regular), promo: f.promo != null ? toPesos(f.promo) : '' }];
        }),
      ),
    );
    setBarcodes(Object.fromEntries(product.variants.map((v) => [v.id, v.barcode ?? ''])));
    setShipping(Object.fromEntries(product.variants.map((v) => [v.id, toShippingDraft(v)])));
  }

  // El stock llega aparte: también se carga una sola vez por producto.
  const [stockFor, setStockFor] = useState<string | null>(null);
  if (product && stockData && stockFor !== product.id) {
    setStockFor(product.id);
    const map = new Map(stockData.items.map((s) => [s.variantId, s.available]));
    setStock(Object.fromEntries(product.variants.map((v) => [v.id, String(map.get(v.id) ?? '')])));
  }

  // Las fotos, en cambio, siguen al servidor: se agregan y se quitan al
  // instante. El orden local solo adelanta el arrastre mientras se guarda.
  const imagesKey = product?.images.map((img) => img.id).join(',') ?? '';
  const [imagesFor, setImagesFor] = useState('');
  if (imagesFor !== imagesKey) {
    setImagesFor(imagesKey);
    setImageOrder(product?.images.map((img) => img.id) ?? []);
  }

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['product', id] });
    queryClient.invalidateQueries({ queryKey: ['products', store?.id] });
  };

  // Imágenes: alta/baja inmediata (manager de medios). Cada foto sube con
  // su avance y se suma a la grilla apenas queda guardada; la que no sirve
  // queda afuera con su motivo, sin frenar al resto.
  const uploads = useUploadQueue('productImage', async (file, progress) => {
    const url = await uploadMedia(file, progress);
    await api.post(`/api/v1/products/${id}/images`, { url, altText: name });
    // La miniatura nueva aparece justo cuando se va la que estaba subiendo.
    await queryClient.invalidateQueries({ queryKey: ['product', id] });
    return url;
  });
  const addImages = async (files: File[]) => {
    const added = await uploads.run(files, () => {}, product?.images.length ?? 0);
    if (added === 0) return;
    queryClient.invalidateQueries({ queryKey: ['products', store?.id] });
    toast(added === 1 ? 'Foto agregada' : `${added} fotos agregadas`, { variant: 'success' });
  };
  const removeImage = useMutation({
    mutationFn: (imageId: string) => api.delete(`/api/v1/products/${id}/images/${imageId}`),
    onSuccess: () => refresh(),
    onError: (e) => toast(errMsg(e), { variant: 'error' }),
  });
  const reorder = useMutation({
    mutationFn: (imageIds: string[]) => api.put(`/api/v1/products/${id}/images/reorder`, { imageIds }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['product', id] });
      queryClient.invalidateQueries({ queryKey: ['products', store?.id] });
    },
    onError: (e) => toast(errMsg(e), { variant: 'error' }),
  });

  const onDropImage = (targetId: string) => {
    if (!dragId || dragId === targetId) {
      setDragId(null);
      return;
    }
    const next = imageOrder.filter((x) => x !== dragId);
    const at = next.indexOf(targetId);
    next.splice(at, 0, dragId);
    setDragId(null);
    setImageOrder(next);
    reorder.mutate(next);
  };

  // Guardar: aplica los diffs (detalles, precios, stock, categorías).
  const save = useMutation({
    mutationFn: async () => {
      if (!product) return;
      await api.patch(`/api/v1/products/${id}`, {
        name,
        description: description || null,
        brand: brand.trim() || null,
        seoTitle: seoTitle.trim() || null,
        seoDescription: seoDescription.trim() || null,
      });

      for (const v of product.variants) {
        const p = prices[v.id];
        if (!p) continue;
        const { priceAmount, compareAtAmount } = toDomainPrice(
          toCents(p.price),
          p.promo ? toCents(p.promo) : null,
        );
        if (priceAmount !== v.price.amount || compareAtAmount !== (v.compareAtPrice?.amount ?? null))
          await api.patch(`/api/v1/products/${id}/variants/${v.id}/price`, {
            priceAmount,
            currency: v.price.currency,
            compareAtAmount,
          });

        const sVal = stock[v.id];
        if (sVal !== undefined && sVal !== '' && !Number.isNaN(Number(sVal)))
          await api.put(`/api/v1/inventory/${v.id}`, {
            available: parseInt(sVal, 10),
            reason: 'Edición de producto',
          });

        const barcode = (barcodes[v.id] ?? '').trim();
        if (barcode !== (v.barcode ?? ''))
          await api.put(`/api/v1/products/${id}/variants/${v.id}/barcode`, { barcode: barcode || null });

        const size = shipping[v.id] && parseShipping(shipping[v.id]!).value;
        if (size && !sameShipping(v, size))
          await api.put(`/api/v1/products/${id}/variants/${v.id}/shipping`, size);
      }

      const before = [...(product.categoryIds ?? [])].sort().join(',');
      if (categoryIds.slice().sort().join(',') !== before)
        await api.put(`/api/v1/products/${id}/categories`, { categoryIds });

      // La ficha va entera: mandar solo lo cambiado obligaría a distinguir
      // "no lo toqué" de "lo borré", y son cosas distintas.
      await api.put(`/api/v1/products/${id}/specs`, {
        values: Object.entries(specs).map(([definitionId, value]) => ({ definitionId, value })),
      });
    },
    onSuccess: () => {
      refresh();
      toast('Producto guardado', { variant: 'success' });
      navigate('/productos');
    },
    onError: (e) => setError(errMsg(e, 'Error inesperado')),
  });

  const setStatus = useMutation({
    mutationFn: (publish: boolean) =>
      api.post(`/api/v1/products/${id}/${publish ? 'publish' : 'archive'}`, {}),
    onSuccess: () => {
      refresh();
      toast('Estado actualizado', { variant: 'success' });
    },
    onError: (e) => toast(errMsg(e), { variant: 'error' }),
  });

  const del = useMutation({
    mutationFn: () => api.delete(`/api/v1/products/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products', store?.id] });
      toast('Producto eliminado', { variant: 'success' });
      navigate('/productos');
    },
    onError: (e) => toast(errMsg(e), { variant: 'error' }),
  });

  const [confirmDel, setConfirmDel] = useState(false);

  if (!store) return <NoStoreSelected />;
  if (isLoading || !product) return <ScreenSkeleton label="Cargando producto…" />;

  const shippingInvalid = product.variants.some(
    (v) => shipping[v.id] && parseShipping(shipping[v.id]!).error,
  );
  const multi = product.variants.length > 1;

  return (
    <div className="space-y-4 pb-24">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-fg">Editar producto</h1>
        <span className="text-sm text-fg-muted">{statusLabel[product.status]}</span>
      </div>

      {/* En pantallas anchas, lo principal a la izquierda y lo que se toca poco
          (estado, categorías, SEO) en una columna al costado. */}
      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(18rem,24rem)]">
        <div className="min-w-0 space-y-4">
          <DetailsSection
            name={name}
            onName={setName}
            description={description}
            onDescription={setDescription}
            brand={brand}
            onBrand={setBrand}
            error={error}
          />

          <Section title="Fotos" hint="Se agregan o eliminan al instante. Arrastrá para reordenar.">
            <div className="flex flex-wrap gap-3">
              {imageOrder
                .map((iid) => product.images.find((img) => img.id === iid))
                .filter((img): img is ProductImage => !!img)
                .map((img) => (
                  <div
                    key={img.id}
                    draggable
                    onDragStart={() => setDragId(img.id)}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault();
                      onDropImage(img.id);
                    }}
                    className={`group relative cursor-grab active:cursor-grabbing ${dragId === img.id ? 'opacity-50' : ''}`}
                  >
                    <RemovableThumb src={img.url} onRemove={() => removeImage.mutate(img.id)}>
                      <span className="pointer-events-none absolute left-1 top-1 flex h-5 w-5 items-center justify-center rounded bg-black/50 text-white opacity-0 transition-opacity group-hover:opacity-100">
                        <GripVertical className="h-3.5 w-3.5" />
                      </span>
                    </RemovableThumb>
                  </div>
                ))}
              {uploads.pending.map((item) => (
                <UploadingThumb
                  key={item.id}
                  src={item.preview}
                  name={item.file.name}
                  progress={item.progress}
                  started={item.started}
                  onCancel={() => uploads.cancel(item.id)}
                />
              ))}
              <AddImagesTile onFiles={(f) => void addImages(f)} />
            </div>
            <div className="mt-3 space-y-2">
              <UploadSpecHint kind="productImage" />
              <UploadNotes notes={uploads.notes} onDismiss={uploads.dismissNotes} />
            </div>
          </Section>

          <Section
            title={multi ? 'Variantes' : 'Precio, stock y envío'}
            hint={multi ? 'Precio, stock, código de barras y paquete de cada una.' : undefined}
          >
            <div className="space-y-4">
              {product.variants.map((v) => {
                const label = v.optionValues.length > 0 ? v.optionValues.join(' / ') : v.sku;
                return (
                  <div key={v.id} className={multi ? 'rounded-md border border-border p-3' : undefined}>
                    {multi && <div className="mb-2 text-sm font-medium text-fg">{label}</div>}
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                      <FormField label="Precio (ARS)" required>
                        <Input
                          inputMode="decimal"
                          value={prices[v.id]?.price ?? ''}
                          onChange={(e) =>
                            setPrices((p) => ({
                              ...p,
                              [v.id]: { ...(p[v.id] ?? { price: '', promo: '' }), price: e.target.value },
                            }))
                          }
                        />
                      </FormField>
                      <FormField label="Promocional" hint="Opcional">
                        <Input
                          inputMode="decimal"
                          value={prices[v.id]?.promo ?? ''}
                          onChange={(e) =>
                            setPrices((p) => ({
                              ...p,
                              [v.id]: { ...(p[v.id] ?? { price: '', promo: '' }), promo: e.target.value },
                            }))
                          }
                          placeholder="—"
                        />
                      </FormField>
                      <FormField label="Stock">
                        <Input
                          inputMode="numeric"
                          value={stock[v.id] ?? ''}
                          onChange={(e) =>
                            setStock((s) => ({ ...s, [v.id]: e.target.value.replace(/\D/g, '') }))
                          }
                          placeholder="—"
                        />
                      </FormField>
                      <FormField label="Código de barras" hint="EAN, UPC…">
                        <Input
                          value={barcodes[v.id] ?? ''}
                          onChange={(e) => setBarcodes((b) => ({ ...b, [v.id]: e.target.value }))}
                          placeholder="—"
                        />
                      </FormField>
                    </div>
                    <div className="mt-3">
                      <p className="mb-2 text-xs text-fg-muted">{SHIPPING_HINT}</p>
                      <ShippingInputs
                        value={shipping[v.id] ?? toShippingDraft(v)}
                        onChange={(next) => setShipping((s) => ({ ...s, [v.id]: next }))}
                        labelPrefix={multi ? label : ''}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </Section>

          <SpecSection categoryIds={categoryIds} values={specs} onChange={setSpecs} />
        </div>
        <div className="min-w-0 space-y-4">
          <Section title="Estado y acciones">
            <Checkbox
              label="Mostrar en la tienda (publicado)"
              checked={product.status === 'ACTIVE'}
              onChange={(e) => setStatus.mutate(e.target.checked)}
            />
            <button
              type="button"
              onClick={() => setConfirmDel(true)}
              className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-danger hover:underline"
            >
              <Trash2 className="h-4 w-4" /> Eliminar producto
            </button>
            {confirmDel && (
              <div className="mt-2 rounded-md border border-danger/30 bg-danger/[0.04] p-3">
                <p className="text-sm text-fg">¿Seguro? Esto borra el producto y no se puede deshacer.</p>
                <div className="mt-2 flex gap-2">
                  <Button variant="danger" loading={del.isPending} onClick={() => del.mutate()}>
                    Eliminar
                  </Button>
                  <Button variant="secondary" onClick={() => setConfirmDel(false)}>
                    Cancelar
                  </Button>
                </div>
              </div>
            )}
          </Section>

          <CategoriesSection value={categoryIds} onChange={setCategoryIds} />

          <SeoSection
            title={seoTitle}
            onTitle={setSeoTitle}
            description={seoDescription}
            onDescription={setSeoDescription}
          />
        </div>
      </div>

      <StickyFormBar>
        <Button variant="secondary" onClick={() => navigate('/productos')}>
          Cancelar
        </Button>
        <Button
          loading={save.isPending}
          disabled={
            !name || shippingInvalid || product.variants.some((v) => !isValidPrice(prices[v.id]?.price ?? ''))
          }
          onClick={() => save.mutate()}
        >
          Guardar cambios
        </Button>
      </StickyFormBar>
    </div>
  );
}
