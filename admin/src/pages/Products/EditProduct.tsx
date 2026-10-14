import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Trash2, GripVertical } from 'lucide-react';
import { Button, Checkbox, FormField, Input, useToast, PageHeader } from '@tiendafy/ui';
import type { MoneyDto } from '@tiendafy/types';
import { useStore } from '../../context/StoreContext';
import { api, errMsg } from '../../lib/api';
import { fetchStock, isStockChanged } from '../../lib/products';
import { toFormPrice, toDomainPrice, toCents, toPesos, isValidPrice } from '../../lib/price';
import { Section } from './FormSection';
import { ProductWaitingNotice } from './StockAlerts';
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
import { AddImagesTile, PhotoTile, UploadingThumb } from './ImageTiles';
import { moveItem } from '../../lib/arrays';
import { UploadNotes, UploadSpecHint, uploadMedia, useUploadQueue } from '../../components/upload/primitives';
import { ScreenSkeleton } from '../../components/Skeleton';
import { ERROR_SHOWN, LoadError } from '../../components/LoadError';
import { useUnsavedChanges } from '../../lib/useUnsavedChanges';

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

  const productQ = useQuery({
    queryKey: ['product', id],
    queryFn: () => api.get<ProductDto>(`/api/v1/products/${id}`),
    enabled: !!id && !!store,
    meta: ERROR_SHOWN,
  });
  const { data: product, isLoading } = productQ;

  const variantIds = useMemo(() => product?.variants.map((v) => v.id) ?? [], [product]);
  const stockQ = useQuery({
    queryKey: ['inventory', store?.id, 'product', variantIds.join(',')],
    queryFn: () => api.get<{ items: StockItem[] }>(`/api/v1/inventory/?variantIds=${variantIds.join(',')}`),
    enabled: variantIds.length > 0,
    meta: ERROR_SHOWN,
  });
  const stockData = stockQ.data;

  // Estado del form (se inicializa al cargar el producto).
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [brand, setBrand] = useState('');
  const [seoTitle, setSeoTitle] = useState('');
  const [seoDescription, setSeoDescription] = useState('');
  const [prices, setPrices] = useState<Record<string, { price: string; promo: string }>>({});
  const [stock, setStock] = useState<Record<string, string>>({});
  // El stock que se vio al cargar (o el último guardado): solo se manda el que
  // cambió, y con este valor como "esperado" para que el backend no pise una
  // venta que entró mientras se editaba.
  const [stockSeen, setStockSeen] = useState<Record<string, string>>({});
  const [stockError, setStockError] = useState<Record<string, string>>({});
  // Por variante: código de barras y el paquete de una unidad (peso y medidas).
  const [barcodes, setBarcodes] = useState<Record<string, string>>({});
  const [shipping, setShipping] = useState<Record<string, ShippingDraft>>({});
  const [categoryIds, setCategoryIds] = useState<string[]>([]);
  const [specs, setSpecs] = useState<SpecValues>({});
  const [imageOrder, setImageOrder] = useState<string[]>([]);
  const [dragId, setDragId] = useState<string | null>(null);
  // Fotos marcadas para quitar: se borran recién al guardar (ver `pendingRemoval`).
  const [removedImages, setRemovedImages] = useState<string[]>([]);
  const [error, setError] = useState<string>();

  // Los campos se cargan UNA vez por producto, al dibujar. Antes un efecto los
  // volvía a copiar en cada recarga del producto —por ejemplo al subir una
  // foto— y se perdía lo que se estaba editando sin guardar.
  const [formFor, setFormFor] = useState<string | null>(null);
  // Cómo estaba el form al cargarse: contra eso se sabe si hay cambios sin guardar.
  const [loaded, setLoaded] = useState('');
  if (product && formFor !== product.id) {
    const initial = {
      name: product.name,
      description: product.description ?? '',
      brand: product.brand ?? '',
      seoTitle: product.seoTitle ?? '',
      seoDescription: product.seoDescription ?? '',
      categoryIds: product.categoryIds ?? [],
      specs: Object.fromEntries((product.specs ?? []).map((x) => [x.definitionId, x.value])) as SpecValues,
      prices: Object.fromEntries(
        product.variants.map((v) => {
          const f = toFormPrice(v.price.amount, v.compareAtPrice?.amount ?? null);
          return [v.id, { price: toPesos(f.regular), promo: f.promo != null ? toPesos(f.promo) : '' }];
        }),
      ),
      barcodes: Object.fromEntries(product.variants.map((v) => [v.id, v.barcode ?? ''])),
      shipping: Object.fromEntries(product.variants.map((v) => [v.id, toShippingDraft(v)])),
    };
    setFormFor(product.id);
    setLoaded(JSON.stringify(initial));
    setName(initial.name);
    setDescription(initial.description);
    setBrand(initial.brand);
    setSeoTitle(initial.seoTitle);
    setSeoDescription(initial.seoDescription);
    setCategoryIds(initial.categoryIds);
    setSpecs(initial.specs);
    setPrices(initial.prices);
    setBarcodes(initial.barcodes);
    setShipping(initial.shipping);
  }

  // El stock llega aparte: también se carga una sola vez por producto.
  const [stockFor, setStockFor] = useState<string | null>(null);
  if (product && stockData && stockFor !== product.id) {
    setStockFor(product.id);
    const map = new Map(stockData.items.map((s) => [s.variantId, s.available]));
    const loaded = Object.fromEntries(product.variants.map((v) => [v.id, String(map.get(v.id) ?? '')]));
    setStock(loaded);
    setStockSeen(loaded);
  }

  // Las fotos nuevas, en cambio, se suben al instante (subir lleva su tiempo y
  // no tiene sentido hacerlo esperar al guardado) y el orden se manda apenas
  // se cambia. El orden local solo adelanta el movimiento mientras se guarda.
  const imagesKey = product?.images.map((img) => img.id).join(',') ?? '';
  const [imagesFor, setImagesFor] = useState('');
  if (imagesFor !== imagesKey) {
    setImagesFor(imagesKey);
    setImageOrder(product?.images.map((img) => img.id) ?? []);
  }

  // Quitar una foto, en cambio, espera a "Guardar cambios" como el resto del
  // formulario. Antes la cruz la borraba en el acto, sin confirmar ni poder
  // deshacer, mientras todo lo demás se descartaba con "Cancelar": un toque
  // errado en el teléfono perdía la foto. Se eligió diferirla al guardado y no
  // un aviso con "Deshacer" porque el formulario ya tiene ese momento de
  // confirmación, y porque un borrado con demora seguiría corriendo aunque se
  // saliera con "Cancelar". Solo cuentan las que siguen en el producto: si un
  // guardado que falló a medias ya borró alguna, no se reintenta.
  const pendingRemoval = removedImages.filter((iid) => product?.images.some((img) => img.id === iid));

  // Mismo orden de claves que `initial`: la comparación es por texto.
  const dirty =
    !!formFor &&
    (JSON.stringify({
      name,
      description,
      brand,
      seoTitle,
      seoDescription,
      categoryIds,
      specs,
      prices,
      barcodes,
      shipping,
    }) !== loaded ||
      Object.keys(stock).some((vid) => stock[vid] !== (stockSeen[vid] ?? '')) ||
      pendingRemoval.length > 0);
  const leave = useUnsavedChanges(dirty);

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

  // Las flechas hacen lo mismo que el arrastre, de a un lugar.
  const moveImage = (imageId: string, step: -1 | 1) => {
    const from = imageOrder.indexOf(imageId);
    const next = moveItem(imageOrder, from, from + step);
    if (next === imageOrder) return;
    setImageOrder(next);
    reorder.mutate(next);
  };

  // Un ajuste de stock con el valor que se vio: si cambió en el medio, el
  // backend responde Stock.Changed con el actual, y ese pasa a ser el visto
  // para que el próximo guardado (ya revisado) entre.
  const saveStock = async (variantId: string, available: number, expectedAvailable: number) => {
    try {
      await api.put(`/api/v1/inventory/${variantId}`, {
        available,
        reason: 'Edición de producto',
        expectedAvailable,
      });
      setStockSeen((s) => ({ ...s, [variantId]: String(available) }));
    } catch (e) {
      if (isStockChanged(e)) {
        const now = await fetchStock(variantId);
        if (now) setStockSeen((s) => ({ ...s, [variantId]: String(now.available) }));
        setStockError((s) => ({ ...s, [variantId]: e.message }));
      }
      throw e;
    }
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

        // Antes se mandaba el stock de todas las variantes en cada guardado,
        // aunque nadie lo hubiera tocado: el número cargado al abrir pisaba las
        // ventas del medio y se vendía lo que ya no había.
        const sVal = stock[v.id];
        const seen = stockSeen[v.id] ?? '';
        if (sVal !== undefined && sVal !== '' && sVal !== seen && !Number.isNaN(Number(sVal)))
          await saveStock(v.id, parseInt(sVal, 10), seen === '' ? 0 : parseInt(seen, 10));

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

      // Las fotos quitadas, al final: si algo de arriba falla, siguen ahí.
      for (const imageId of pendingRemoval) await api.delete(`/api/v1/products/${id}/images/${imageId}`);
    },
    onSuccess: () => {
      refresh();
      toast('Producto guardado', { variant: 'success' });
      leave(() => navigate('/productos'));
    },
    onError: (e) => {
      // Si alguna foto se borró antes del error, que deje de verse.
      if (pendingRemoval.length > 0) queryClient.invalidateQueries({ queryKey: ['product', id] });
      // El choque de stock se marca en su campo (y en un aviso, porque el
      // campo puede estar lejos del botón); lo demás, donde siempre.
      if (isStockChanged(e)) toast(e.message, { variant: 'error' });
      else setError(errMsg(e, 'Error inesperado'));
    },
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
      leave(() => navigate('/productos'));
    },
    onError: (e) => toast(errMsg(e), { variant: 'error' }),
  });

  const [confirmDel, setConfirmDel] = useState(false);

  if (!store) return <NoStoreSelected />;
  if (productQ.isError && !product)
    return (
      <LoadError
        title="No se pudo cargar el producto."
        error={productQ.error}
        onRetry={() => void productQ.refetch()}
        retrying={productQ.isFetching}
      />
    );
  if (isLoading || !product) return <ScreenSkeleton label="Cargando producto…" />;

  const shippingInvalid = product.variants.some(
    (v) => shipping[v.id] && parseShipping(shipping[v.id]!).error,
  );
  const multi = product.variants.length > 1;
  const images = imageOrder
    .map((iid) => product.images.find((img) => img.id === iid))
    .filter((img): img is ProductImage => !!img);
  // La portada es la primera que va a quedar: si se quita la primera, pasa a la que sigue.
  const coverId = images.find((img) => !removedImages.includes(img.id))?.id;

  return (
    <div className="space-y-4 pb-24">
      <PageHeader
        title="Editar producto"
        actions={
          <>
            {/* "Avisame cuando ingrese": cuánta gente espera este producto. */}
            <ProductWaitingNotice productId={product.id} />
            <span className="text-sm text-fg-muted">{statusLabel[product.status]}</span>
          </>
        }
      />

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

          <Section
            title="Fotos"
            hint="Las nuevas se suben al instante; las que quites se borran al guardar. La primera es la portada: arrastrá o usá las flechas para ordenarlas."
          >
            <div className="flex flex-wrap gap-3">
              {images.map((img, i) => {
                const removed = removedImages.includes(img.id);
                return (
                  <div
                    key={img.id}
                    draggable={!removed}
                    onDragStart={() => setDragId(img.id)}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault();
                      onDropImage(img.id);
                    }}
                    className={`group ${removed ? '' : 'cursor-grab active:cursor-grabbing'} ${dragId === img.id ? 'opacity-50' : ''}`}
                  >
                    <PhotoTile
                      src={img.url}
                      cover={img.id === coverId}
                      removed={removed}
                      onRemove={() => setRemovedImages((r) => [...r, img.id])}
                      onRestore={() => setRemovedImages((r) => r.filter((x) => x !== img.id))}
                      onMoveLeft={i > 0 ? () => moveImage(img.id, -1) : undefined}
                      onMoveRight={i < images.length - 1 ? () => moveImage(img.id, 1) : undefined}
                    >
                      {!removed && (
                        <span className="pointer-events-none absolute left-1 top-1 flex h-5 w-5 items-center justify-center rounded bg-black/50 text-white opacity-0 transition-opacity group-hover:opacity-100">
                          <GripVertical className="h-3.5 w-3.5" />
                        </span>
                      )}
                    </PhotoTile>
                  </div>
                );
              })}
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
            {/* Sin el stock actual, el campo vacío parecería "sin stock". Igual
                se puede cargar uno: el backend lo compara contra 0 y, si había
                otro, avisa con el real. */}
            {stockQ.isError && !stockData && (
              <LoadError
                className="mb-4"
                title="No se pudo cargar el stock actual."
                error={stockQ.error}
                onRetry={() => void stockQ.refetch()}
                retrying={stockQ.isFetching}
              />
            )}
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
                      <FormField label="Stock" error={stockError[v.id]}>
                        <Input
                          inputMode="numeric"
                          value={stock[v.id] ?? ''}
                          onChange={(e) => {
                            setStock((s) => ({ ...s, [v.id]: e.target.value.replace(/\D/g, '') }));
                            setStockError((s) => ({ ...s, [v.id]: '' }));
                          }}
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
