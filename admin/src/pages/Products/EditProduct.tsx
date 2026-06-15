import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, X, Trash2, GripVertical } from 'lucide-react';
import { Button, Checkbox, FormField, Input, Textarea, useToast } from '@tiendafy/ui';
import { useStore } from '../../context/StoreContext';
import { api, ApiRequestError } from '../../lib/api';
import { toFormPrice, toDomainPrice } from '../../lib/price';

interface MoneyDto { amount: number; currency: string }
interface VariantDto {
  id: string;
  sku: string;
  optionValues: string[];
  price: MoneyDto;
  compareAtPrice: MoneyDto | null;
}
interface ProductImage { id: string; url: string }
interface ProductDto {
  id: string;
  name: string;
  description: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
  status: 'DRAFT' | 'ACTIVE' | 'ARCHIVED';
  variants: VariantDto[];
  images: ProductImage[];
  categoryIds: string[];
}
interface StockItem { variantId: string; available: number }
interface Category { id: string; name: string; path: string; depth: number }

function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="rounded-lg border border-border bg-surface p-5 shadow-card">
      <h2 className="text-sm font-semibold text-fg">{title}</h2>
      {hint && <p className="mt-0.5 text-xs text-fg-muted">{hint}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

const toPesos = (cents: number) => (cents / 100).toString();
const toCents = (s: string) => Math.round(parseFloat(s.replace(',', '.')) * 100);
const priceOk = (s: string) => /^\d+([.,]\d{1,2})?$/.test(s.replace(',', '.'));

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
    queryKey: ['inventory', store?.id, variantIds.join(',')],
    queryFn: () => api.get<{ items: StockItem[] }>(`/api/v1/inventory/?variantIds=${variantIds.join(',')}`),
    enabled: variantIds.length > 0,
  });
  const { data: cats } = useQuery({
    queryKey: ['categories', store?.id],
    queryFn: () => api.get<{ items: Category[] }>('/api/v1/categories'),
    enabled: !!store,
  });

  // Estado del form (se inicializa al cargar el producto).
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [seoTitle, setSeoTitle] = useState('');
  const [seoDescription, setSeoDescription] = useState('');
  const [prices, setPrices] = useState<Record<string, { price: string; promo: string }>>({});
  const [stock, setStock] = useState<Record<string, string>>({});
  const [categoryIds, setCategoryIds] = useState<string[]>([]);
  const [imageOrder, setImageOrder] = useState<string[]>([]);
  const [dragId, setDragId] = useState<string | null>(null);
  const [error, setError] = useState<string>();

  useEffect(() => {
    if (!product) return;
    setName(product.name);
    setDescription(product.description ?? '');
    setSeoTitle(product.seoTitle ?? '');
    setSeoDescription(product.seoDescription ?? '');
    setCategoryIds(product.categoryIds ?? []);
    setPrices(
      Object.fromEntries(
        product.variants.map((v) => {
          const f = toFormPrice(v.price.amount, v.compareAtPrice?.amount ?? null);
          return [v.id, { price: toPesos(f.regular), promo: f.promo != null ? toPesos(f.promo) : '' }];
        }),
      ),
    );
  }, [product]);

  useEffect(() => {
    if (!product) return;
    setImageOrder(product.images.map((img) => img.id));
  }, [product]);

  useEffect(() => {
    if (!stockData || !product) return;
    const map = new Map(stockData.items.map((s) => [s.variantId, s.available]));
    setStock(Object.fromEntries(product.variants.map((v) => [v.id, String(map.get(v.id) ?? '')])));
  }, [stockData, product]);

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['product', id] });
    queryClient.invalidateQueries({ queryKey: ['products', store?.id] });
  };

  // Imágenes: alta/baja inmediata (manager de medios).
  const addImages = useMutation({
    mutationFn: async (files: File[]) => {
      for (const file of files) {
        const { url } = await api.upload<{ url: string }>('/api/v1/media', file);
        await api.post(`/api/v1/products/${id}/images`, { url, altText: name });
      }
    },
    onSuccess: () => { refresh(); toast('Imágenes agregadas', { variant: 'success' }); },
    onError: (e) => toast(e instanceof ApiRequestError ? e.message : 'Error', { variant: 'error' }),
  });
  const removeImage = useMutation({
    mutationFn: (imageId: string) => api.delete(`/api/v1/products/${id}/images/${imageId}`),
    onSuccess: () => refresh(),
    onError: (e) => toast(e instanceof ApiRequestError ? e.message : 'Error', { variant: 'error' }),
  });
  const reorder = useMutation({
    mutationFn: (imageIds: string[]) => api.put(`/api/v1/products/${id}/images/reorder`, { imageIds }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['product', id] });
      queryClient.invalidateQueries({ queryKey: ['products', store?.id] });
    },
    onError: (e) => toast(e instanceof ApiRequestError ? e.message : 'Error', { variant: 'error' }),
  });

  const onDropImage = (targetId: string) => {
    if (!dragId || dragId === targetId) { setDragId(null); return; }
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
        seoTitle: seoTitle.trim() || null,
        seoDescription: seoDescription.trim() || null,
      });

      for (const v of product.variants) {
        const p = prices[v.id];
        if (!p) continue;
        const { priceAmount, compareAtAmount } = toDomainPrice(toCents(p.price), p.promo ? toCents(p.promo) : null);
        if (priceAmount !== v.price.amount || compareAtAmount !== (v.compareAtPrice?.amount ?? null))
          await api.patch(`/api/v1/products/${id}/variants/${v.id}/price`, { priceAmount, currency: v.price.currency, compareAtAmount });

        const sVal = stock[v.id];
        if (sVal !== undefined && sVal !== '' && !Number.isNaN(Number(sVal)))
          await api.put(`/api/v1/inventory/${v.id}`, { available: parseInt(sVal, 10), reason: 'Edición de producto' });
      }

      const before = [...(product.categoryIds ?? [])].sort().join(',');
      if (categoryIds.slice().sort().join(',') !== before)
        await api.put(`/api/v1/products/${id}/categories`, { categoryIds });
    },
    onSuccess: () => { refresh(); toast('Producto guardado', { variant: 'success' }); navigate('/productos'); },
    onError: (e) => setError(e instanceof ApiRequestError ? e.message : 'Error inesperado'),
  });

  const setStatus = useMutation({
    mutationFn: (publish: boolean) => api.post(`/api/v1/products/${id}/${publish ? 'publish' : 'archive'}`, {}),
    onSuccess: () => { refresh(); toast('Estado actualizado', { variant: 'success' }); },
    onError: (e) => toast(e instanceof ApiRequestError ? e.message : 'Error', { variant: 'error' }),
  });

  const del = useMutation({
    mutationFn: () => api.delete(`/api/v1/products/${id}`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['products', store?.id] }); toast('Producto eliminado', { variant: 'success' }); navigate('/productos'); },
    onError: (e) => toast(e instanceof ApiRequestError ? e.message : 'Error', { variant: 'error' }),
  });

  const [confirmDel, setConfirmDel] = useState(false);

  if (!store) return <p className="py-16 text-center text-sm text-fg-muted">Elegí una tienda arriba.</p>;
  if (isLoading || !product) return <p className="py-16 text-center text-sm text-fg-muted">Cargando producto...</p>;

  const toggleCategory = (cid: string) =>
    setCategoryIds((prev) => (prev.includes(cid) ? prev.filter((x) => x !== cid) : [...prev, cid]));

  return (
    <div className="mx-auto max-w-2xl space-y-4 pb-24">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-fg">Editar producto</h1>
        <span className="text-sm text-fg-muted">
          {product.status === 'ACTIVE' ? 'Publicado' : product.status === 'ARCHIVED' ? 'Archivado' : 'Borrador'}
        </span>
      </div>

      <Section title="Nombre y descripción">
        <div className="space-y-4">
          <FormField label="Nombre" required error={error}>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </FormField>
          <FormField label="Descripción">
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={5} />
          </FormField>
        </div>
      </Section>

      <Section title="SEO" hint="Cómo se ve en Google y al compartir.">
        <div className="space-y-4">
          <FormField label="Título SEO" hint="≤ 70 caracteres">
            <Input value={seoTitle} onChange={(e) => setSeoTitle(e.target.value)} />
          </FormField>
          <FormField label="Descripción SEO" hint="≤ 320 caracteres">
            <Textarea value={seoDescription} onChange={(e) => setSeoDescription(e.target.value)} rows={3} />
          </FormField>
        </div>
      </Section>

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
              onDrop={(e) => { e.preventDefault(); onDropImage(img.id); }}
              className={`group relative cursor-grab active:cursor-grabbing ${dragId === img.id ? 'opacity-50' : ''}`}
            >
              <img src={img.url} alt="" className="h-24 w-24 rounded-md border border-border object-cover" />
              <span className="pointer-events-none absolute left-1 top-1 flex h-5 w-5 items-center justify-center rounded bg-black/50 text-white opacity-0 transition-opacity group-hover:opacity-100">
                <GripVertical className="h-3.5 w-3.5" />
              </span>
              <button
                type="button"
                onClick={() => removeImage.mutate(img.id)}
                aria-label="Quitar imagen"
                className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-danger text-white"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
          <label className="flex h-24 w-24 cursor-pointer flex-col items-center justify-center gap-1 rounded-md border-2 border-dashed border-primary/40 text-primary hover:bg-primary/[0.05]">
            <Plus className="h-5 w-5" />
            <span className="text-[0.65rem] font-semibold">{addImages.isPending ? 'Subiendo…' : 'Agregar'}</span>
            <input
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              disabled={addImages.isPending}
              onChange={(e) => { const f = Array.from(e.target.files ?? []); if (f.length) addImages.mutate(f); }}
            />
          </label>
        </div>
      </Section>

      <Section title="Precios y stock" hint={product.variants.length > 1 ? 'Por variante' : undefined}>
        <div className="space-y-4">
          {product.variants.map((v) => (
            <div key={v.id} className="rounded-md border border-border p-3">
              {product.variants.length > 1 && (
                <div className="mb-2 text-sm font-medium text-fg">{v.optionValues.length > 0 ? v.optionValues.join(' / ') : v.sku}</div>
              )}
              <div className="grid grid-cols-3 gap-3">
                <FormField label="Precio (ARS)" required>
                  <Input inputMode="decimal" value={prices[v.id]?.price ?? ''} onChange={(e) => setPrices((p) => ({ ...p, [v.id]: { ...(p[v.id] ?? { price: '', promo: '' }), price: e.target.value } }))} />
                </FormField>
                <FormField label="Promocional" hint="Opcional">
                  <Input inputMode="decimal" value={prices[v.id]?.promo ?? ''} onChange={(e) => setPrices((p) => ({ ...p, [v.id]: { ...(p[v.id] ?? { price: '', promo: '' }), promo: e.target.value } }))} placeholder="—" />
                </FormField>
                <FormField label="Stock">
                  <Input inputMode="numeric" value={stock[v.id] ?? ''} onChange={(e) => setStock((s) => ({ ...s, [v.id]: e.target.value.replace(/\D/g, '') }))} placeholder="—" />
                </FormField>
              </div>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Categorías" hint="Aparecen en el menú y los filtros de la tienda.">
        {(cats?.items ?? []).length === 0 ? (
          <p className="text-xs text-fg-subtle">No hay categorías. Creálas en Productos → Categorías.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {cats!.items.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => toggleCategory(c.id)}
                className={
                  categoryIds.includes(c.id)
                    ? 'rounded-full border border-primary bg-primary/10 px-3 py-1 text-xs font-medium text-primary'
                    : 'rounded-full border border-border-strong px-3 py-1 text-xs text-fg-muted hover:bg-bg-muted'
                }
              >
                {c.path.split('/').join(' › ')}
              </button>
            ))}
          </div>
        )}
      </Section>

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
              <Button variant="danger" loading={del.isPending} onClick={() => del.mutate()}>Eliminar</Button>
              <Button variant="secondary" onClick={() => setConfirmDel(false)}>Cancelar</Button>
            </div>
          </div>
        )}
      </Section>

      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-surface/95 px-6 py-3 backdrop-blur md:left-sidebar">
        <div className="mx-auto flex max-w-2xl items-center justify-end gap-3">
          <Button variant="secondary" onClick={() => navigate('/productos')}>Cancelar</Button>
          <Button
            loading={save.isPending}
            disabled={!name || product.variants.some((v) => !priceOk(prices[v.id]?.price ?? ''))}
            onClick={() => save.mutate()}
          >
            Guardar cambios
          </Button>
        </div>
      </div>
    </div>
  );
}
