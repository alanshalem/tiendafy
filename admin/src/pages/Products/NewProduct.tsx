import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { qk } from '../../lib/queryKeys';
import { Plus, X } from 'lucide-react';
import { Button, Checkbox, FormField, Input, Radio, RadioGroup, useToast, PageHeader } from '@tiendafy/ui';
import { useStore } from '../../context/StoreContext';
import { api, errMsg } from '../../lib/api';
import { toDomainPrice, toCents, isValidPrice } from '../../lib/price';
import { Section } from './FormSection';
import { StickyFormBar } from './StickyFormBar';
import { AddImagesTile, PhotoTile, UploadingThumb } from './ImageTiles';
import { moveItem } from '../../lib/arrays';
import { UploadNotes, UploadSpecHint, uploadMedia, useUploadQueue } from '../../components/upload/primitives';
import { type SpecValues } from './SpecFields';
import {
  CategoriesSection,
  DetailsSection,
  EMPTY_SHIPPING,
  SeoSection,
  SHIPPING_HINT,
  ShippingInputs,
  SpecSection,
  parseShipping,
} from './product-form';
import { useUnsavedChanges } from '../../lib/useUnsavedChanges';
import { TABLE_HEAD_TEXT } from '../../lib/styles';

interface ProductDto {
  id: string;
  name: string;
}

/** Una opción del builder: nombre + sus valores (csv en el input). */
interface OptionDraft {
  name: string;
  /** Texto crudo del input, separado por comas. */
  valuesText: string;
}

/** Fila de variante: combinación de valores + sus campos editables. */
interface VariantRow {
  /** Valores que componen la combinación, en el orden de las opciones. */
  optionValues: string[];
  price: string;
  promoPrice: string;
  sku: string;
  barcode: string;
  stock: string;
}

const MAX_OPTIONS = 3;

/** Parsea el csv de valores de una opción (trim + sin vacíos + sin duplicados). */
function parseValues(text: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of text.split(',')) {
    const v = raw.trim();
    if (!v || seen.has(v.toLowerCase())) continue;
    seen.add(v.toLowerCase());
    out.push(v);
  }
  return out;
}

/** Producto cartesiano de los valores de cada opción. */
function cartesian(lists: string[][]): string[][] {
  return lists.reduce<string[][]>(
    (acc, list) => acc.flatMap((combo) => list.map((v) => [...combo, v])),
    [[]],
  );
}

/** Sugerencia de SKU a partir del nombre + valores. */
function suggestSku(name: string, values: string[]): string {
  const base = name.trim().slice(0, 12).toUpperCase().replace(/\s+/g, '-');
  const tail = values.map((v) => v.trim().slice(0, 6).toUpperCase().replace(/\s+/g, '-')).join('-');
  return [base, tail].filter(Boolean).join('-') || 'SKU';
}

/** Clave estable de una combinación, para mapear filas entre renders. */
function comboKey(values: string[]): string {
  return values.join('\u0000');
}

export function NewProductPage() {
  const { store } = useStore();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [brand, setBrand] = useState('');
  const [seoTitle, setSeoTitle] = useState('');
  const [seoDescription, setSeoDescription] = useState('');
  const [categoryIds, setCategoryIds] = useState<string[]>([]);
  const [specs, setSpecs] = useState<SpecValues>({});
  const [price, setPrice] = useState('');
  const [promoPrice, setPromoPrice] = useState('');
  const [stockMode, setStockMode] = useState('infinite');
  const [stock, setStock] = useState('');
  const [sku, setSku] = useState('');
  const [barcode, setBarcode] = useState('');
  // El paquete de una unidad: con variantes, el mismo para todas (después se
  // ajusta cada una al editar).
  const [shipping, setShipping] = useState(EMPTY_SHIPPING);
  const [files, setFiles] = useState<File[]>([]);
  const [publish, setPublish] = useState(true);
  const [error, setError] = useState<string>();

  // --- Builder de variantes ---
  const [hasVariants, setHasVariants] = useState(false);
  const [options, setOptions] = useState<OptionDraft[]>([{ name: '', valuesText: '' }]);
  /** Overrides por combinación: el merchant edita precio/sku/stock por fila. */
  const [rowOverrides, setRowOverrides] = useState<Record<string, Partial<VariantRow>>>({});

  // Opciones efectivas (con al menos un valor parseado).
  const parsedOptions = options
    .map((o) => ({ name: o.name.trim(), values: parseValues(o.valuesText) }))
    .filter((o) => o.name && o.values.length > 0);

  // Filas = producto cartesiano de los valores, con overrides aplicados.
  const variantRows: VariantRow[] =
    parsedOptions.length > 0
      ? cartesian(parsedOptions.map((o) => o.values)).map((optionValues) => {
          const ov = rowOverrides[comboKey(optionValues)] ?? {};
          return {
            optionValues,
            price: ov.price ?? '',
            promoPrice: ov.promoPrice ?? '',
            sku: ov.sku ?? suggestSku(name, optionValues),
            barcode: ov.barcode ?? '',
            stock: ov.stock ?? '',
          };
        })
      : [];

  const setRowField = (key: string, field: keyof VariantRow, value: string) =>
    setRowOverrides((prev) => ({ ...prev, [key]: { ...prev[key], [field]: value } }));

  const canAddOption = options.length < MAX_OPTIONS;

  // Una URL local por archivo, y se liberan cuando cambian (antes se creaba
  // una nueva en cada render y ninguna se liberaba).
  const previews = useMemo(() => files.map((f) => URL.createObjectURL(f)), [files]);
  useEffect(() => () => previews.forEach((p) => URL.revokeObjectURL(p)), [previews]);
  // Las fotos se revisan al elegirlas y suben recién al guardar, de a una.
  const photos = useUploadQueue('productImage', uploadMedia);
  const [saving, setSaving] = useState<{ index: number; progress: number } | null>(null);

  // Cualquier cosa cargada cuenta: salir sin guardar pregunta antes.
  const dirty =
    [name, description, brand, seoTitle, seoDescription, price, promoPrice, stock, sku, barcode].some(
      (v) => v.trim() !== '',
    ) ||
    categoryIds.length > 0 ||
    Object.values(specs).some((v) => v.trim() !== '') ||
    JSON.stringify(shipping) !== JSON.stringify(EMPTY_SHIPPING) ||
    files.length > 0 ||
    hasVariants;
  const leave = useUnsavedChanges(dirty);

  const parsedShipping = parseShipping(shipping);
  const size = parsedShipping.value ?? {};

  const save = useMutation({
    mutationFn: async () => {
      // Payload: con variantes (builder) o variante única (flujo clásico).
      const payload = hasVariants
        ? {
            name,
            description: description || null,
            options: parsedOptions.map((o) => ({ name: o.name, values: o.values })),
            variants: variantRows.map((row) => {
              const { priceAmount, compareAtAmount } = toDomainPrice(
                toCents(row.price),
                row.promoPrice ? toCents(row.promoPrice) : null,
              );
              return {
                sku: row.sku.trim() || suggestSku(name, row.optionValues),
                optionValues: row.optionValues,
                priceAmount,
                currency: 'ARS' as const,
                compareAtAmount: compareAtAmount ?? undefined,
                barcode: row.barcode.trim() || undefined,
                ...size,
              };
            }),
            publish,
          }
        : (() => {
            const { priceAmount, compareAtAmount } = toDomainPrice(
              toCents(price),
              promoPrice ? toCents(promoPrice) : null,
            );
            return {
              name,
              description: description || null,
              options: [],
              variants: [
                {
                  sku: sku || name.slice(0, 16).toUpperCase().replace(/\s+/g, '-'),
                  optionValues: [],
                  priceAmount,
                  currency: 'ARS' as const,
                  compareAtAmount: compareAtAmount ?? undefined,
                  barcode: barcode.trim() || undefined,
                  ...size,
                },
              ],
              publish,
            };
          })();

      const product = await api.post<ProductDto & { id: string }>('/api/v1/products', payload);

      // Subir imágenes y adjuntarlas en orden, cada una con su avance.
      try {
        for (const [index, file] of files.entries()) {
          setSaving({ index, progress: 0 });
          const url = await uploadMedia(file, { onProgress: (progress) => setSaving({ index, progress }) });
          await api.post(`/api/v1/products/${product.id}/images`, { url, altText: name });
        }
      } finally {
        setSaving(null);
      }

      if (hasVariants) {
        // Stock inicial por variante: matcheamos las creadas por sku / optionValues.
        const rowsWithStock = variantRows.filter((row) => row.stock.trim() !== '');
        if (rowsWithStock.length > 0) {
          const full = await api.get<{
            variants: { id: string; sku: string; optionValues: string[] }[];
          }>(`/api/v1/products/${product.id}`);
          for (const row of rowsWithStock) {
            const wantSku = (row.sku.trim() || suggestSku(name, row.optionValues)).toUpperCase();
            const created =
              full.variants.find((v) => v.sku?.toUpperCase() === wantSku) ??
              full.variants.find((v) => comboKey(v.optionValues ?? []) === comboKey(row.optionValues));
            if (created) {
              await api.put(`/api/v1/inventory/${created.id}`, {
                available: parseInt(row.stock, 10),
                reason: 'Alta de producto',
              });
            }
          }
        }
      } else if (stockMode === 'limited' && stock) {
        // Stock inicial si se cargó (flujo de variante única).
        const full = await api.get<{ variants: { id: string }[] }>(`/api/v1/products/${product.id}`);
        const vid = full.variants[0]?.id;
        if (vid) {
          await api.put(`/api/v1/inventory/${vid}`, {
            available: parseInt(stock, 10),
            reason: 'Alta de producto',
          });
        }
      }

      // Lo que el alta no recibe se guarda enseguida, sobre el producto creado.
      if (brand.trim() || seoTitle.trim() || seoDescription.trim())
        await api.patch(`/api/v1/products/${product.id}`, {
          name,
          description: description || null,
          brand: brand.trim() || null,
          seoTitle: seoTitle.trim() || null,
          seoDescription: seoDescription.trim() || null,
        });
      if (categoryIds.length > 0) await api.put(`/api/v1/products/${product.id}/categories`, { categoryIds });
      const specValues = Object.entries(specs).filter(([, value]) => value.trim() !== '');
      if (specValues.length > 0)
        await api.put(`/api/v1/products/${product.id}/specs`, {
          values: specValues.map(([definitionId, value]) => ({ definitionId, value })),
        });

      return product;
    },
    onSuccess: (product) => {
      queryClient.invalidateQueries({ queryKey: qk.products(store?.id) });
      toast(`"${product.name}" creado`, { variant: 'success' });
      leave(() => navigate('/productos'));
    },
    onError: (err) => setError(errMsg(err, 'Error inesperado')),
  });

  const priceValid = isValidPrice(price);

  // Validación del builder: al menos una fila y todos los precios válidos.
  const variantsValid =
    variantRows.length > 0 &&
    variantRows.every(
      (row) => isValidPrice(row.price) && (row.promoPrice.trim() === '' || isValidPrice(row.promoPrice)),
    );

  const canSave =
    !parsedShipping.error && (hasVariants ? Boolean(name) && variantsValid : Boolean(name) && priceValid);

  if (!store) {
    return <p className="py-16 text-center text-sm text-fg-muted">Elegí una tienda arriba.</p>;
  }

  return (
    <div className="space-y-4 pb-24">
      <PageHeader title="Nuevo producto" />

      {/* En pantallas anchas, lo principal a la izquierda y lo que se toca poco
          (publicación, categorías, SEO) en una columna al costado. */}
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

          <Section title="Fotos" hint="Suben al guardar el producto. La primera es la portada.">
            <div className="flex flex-wrap gap-3">
              {previews.map((src, i) =>
                saving && i < saving.index ? (
                  // Ya subida: mientras se guarda el resto no se puede quitar.
                  <img
                    key={src}
                    src={src}
                    alt=""
                    className="h-24 w-24 rounded-md border border-border object-cover"
                  />
                ) : saving ? (
                  <UploadingThumb
                    key={src}
                    src={src}
                    name={files[i]!.name}
                    progress={i === saving.index ? saving.progress : 0}
                    started={i === saving.index}
                  />
                ) : (
                  // Suben en este orden, así que la primera es la portada.
                  <PhotoTile
                    key={src}
                    src={src}
                    cover={i === 0}
                    onRemove={() => setFiles((f) => f.filter((_, idx) => idx !== i))}
                    onMoveLeft={i > 0 ? () => setFiles((f) => moveItem(f, i, i - 1)) : undefined}
                    onMoveRight={
                      i < previews.length - 1 ? () => setFiles((f) => moveItem(f, i, i + 1)) : undefined
                    }
                  />
                ),
              )}
              <AddImagesTile
                disabled={!!saving}
                onFiles={(added) => {
                  const ok = photos.screen(added, files.length);
                  if (ok.length) setFiles((f) => [...f, ...ok]);
                }}
              />
            </div>
            <div className="mt-3 space-y-2">
              <UploadSpecHint kind="productImage" />
              <UploadNotes notes={photos.notes} onDismiss={photos.dismissNotes} />
            </div>
          </Section>

          <Section title="Variantes" hint="Opcional. Ej: Talle S/M/L, Color Rojo/Azul.">
            <Checkbox
              label="Este producto tiene variantes"
              checked={hasVariants}
              onChange={(e) => setHasVariants(e.target.checked)}
            />

            {hasVariants && (
              <div className="mt-4 space-y-4">
                {/* Opciones (máx 3): nombre + valores separados por coma. */}
                <div className="space-y-3">
                  {options.map((opt, i) => (
                    <div key={i} className="grid grid-cols-[1fr_1.5fr_auto] items-end gap-3">
                      <FormField label={i === 0 ? 'Opción' : ''}>
                        <Input
                          value={opt.name}
                          onChange={(e) =>
                            setOptions((prev) =>
                              prev.map((o, idx) => (idx === i ? { ...o, name: e.target.value } : o)),
                            )
                          }
                          placeholder="Ej.: Talle"
                        />
                      </FormField>
                      <FormField
                        label={i === 0 ? 'Valores' : ''}
                        hint={i === options.length - 1 ? 'Separados por coma' : undefined}
                      >
                        <Input
                          value={opt.valuesText}
                          onChange={(e) =>
                            setOptions((prev) =>
                              prev.map((o, idx) => (idx === i ? { ...o, valuesText: e.target.value } : o)),
                            )
                          }
                          placeholder="Ej.: S, M, L"
                        />
                      </FormField>
                      <button
                        type="button"
                        onClick={() =>
                          setOptions((prev) => (prev.length > 1 ? prev.filter((_, idx) => idx !== i) : prev))
                        }
                        disabled={options.length <= 1}
                        aria-label="Quitar opción"
                        className="mb-1 flex h-10 w-10 items-center justify-center rounded-md border border-border text-fg-muted hover:bg-bg-muted disabled:opacity-40"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    disabled={!canAddOption}
                    onClick={() => setOptions((prev) => [...prev, { name: '', valuesText: '' }])}
                  >
                    <Plus className="h-4 w-4" /> Agregar opción
                  </Button>
                  {!canAddOption && <p className="text-xs text-fg-subtle">Máximo {MAX_OPTIONS} opciones.</p>}
                </div>

                {/* Tabla de combinaciones generadas. */}
                {variantRows.length > 0 && (
                  <div className="overflow-x-auto rounded-md border border-border">
                    <table className="w-full text-sm">
                      <thead className={TABLE_HEAD_TEXT}>
                        <tr className="border-b border-border bg-bg-muted text-left text-xs text-fg-muted">
                          <th className="px-3 py-2 font-medium">Variante</th>
                          <th className="px-3 py-2 font-medium">Precio (ARS)</th>
                          <th className="px-3 py-2 font-medium">Promocional</th>
                          <th className="px-3 py-2 font-medium">SKU</th>
                          <th className="px-3 py-2 font-medium">Código de barras</th>
                          <th className="px-3 py-2 font-medium">Stock</th>
                        </tr>
                      </thead>
                      <tbody>
                        {variantRows.map((row) => {
                          const key = comboKey(row.optionValues);
                          const priceInvalid = row.price !== '' && !isValidPrice(row.price);
                          const promoInvalid = row.promoPrice !== '' && !isValidPrice(row.promoPrice);
                          return (
                            <tr key={key} className="border-b border-border last:border-0">
                              <td className="px-3 py-2 font-medium text-fg">
                                {row.optionValues.join(' / ')}
                              </td>
                              <td className="px-3 py-2">
                                <Input
                                  aria-label={`Precio de ${row.optionValues.join(' / ')}`}
                                  inputMode="decimal"
                                  error={priceInvalid}
                                  value={row.price}
                                  onChange={(e) => setRowField(key, 'price', e.target.value)}
                                  placeholder="Ej.: 28.900"
                                  className="h-9 w-28"
                                />
                              </td>
                              <td className="px-3 py-2">
                                <Input
                                  aria-label={`Precio promocional de ${row.optionValues.join(' / ')}`}
                                  inputMode="decimal"
                                  error={promoInvalid}
                                  value={row.promoPrice}
                                  onChange={(e) => setRowField(key, 'promoPrice', e.target.value)}
                                  placeholder="—"
                                  className="h-9 w-28"
                                />
                              </td>
                              <td className="px-3 py-2">
                                <Input
                                  aria-label={`SKU de ${row.optionValues.join(' / ')}`}
                                  value={row.sku}
                                  onChange={(e) => setRowField(key, 'sku', e.target.value.toUpperCase())}
                                  className="h-9 w-36"
                                />
                              </td>
                              <td className="px-3 py-2">
                                <Input
                                  aria-label={`Código de barras de ${row.optionValues.join(' / ')}`}
                                  value={row.barcode}
                                  onChange={(e) => setRowField(key, 'barcode', e.target.value)}
                                  placeholder="—"
                                  className="h-9 w-36"
                                />
                              </td>
                              <td className="px-3 py-2">
                                <Input
                                  aria-label={`Stock de ${row.optionValues.join(' / ')}`}
                                  inputMode="numeric"
                                  value={row.stock}
                                  onChange={(e) =>
                                    setRowField(key, 'stock', e.target.value.replace(/\D/g, ''))
                                  }
                                  placeholder="—"
                                  className="h-9 w-20"
                                />
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </Section>

          {!hasVariants && (
            <Section title="Precios">
              <div className="grid grid-cols-2 gap-4">
                <FormField label="Precio (ARS)" required>
                  <Input
                    inputMode="decimal"
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                    placeholder="Ej.: 28.900"
                  />
                </FormField>
                <FormField label="Precio promocional" hint="Opcional">
                  <Input
                    inputMode="decimal"
                    value={promoPrice}
                    onChange={(e) => setPromoPrice(e.target.value)}
                    placeholder="—"
                  />
                </FormField>
              </div>
            </Section>
          )}

          {!hasVariants && (
            <Section title="Inventario">
              {/* La sección ya lo titula a la vista; el grupo igual necesita nombre. */}
              <RadioGroup legend={<span className="sr-only">Cómo se controla el stock</span>}>
                <Radio
                  name="stock"
                  label="Sin límite"
                  checked={stockMode === 'infinite'}
                  onChange={() => setStockMode('infinite')}
                />
                <Radio
                  name="stock"
                  label="Limitado"
                  checked={stockMode === 'limited'}
                  onChange={() => setStockMode('limited')}
                />
              </RadioGroup>
              {stockMode === 'limited' && (
                <div className="mt-3 w-40">
                  <Input
                    aria-label="Cantidad en stock"
                    inputMode="numeric"
                    value={stock}
                    onChange={(e) => setStock(e.target.value.replace(/\D/g, ''))}
                    placeholder="Cantidad"
                  />
                </div>
              )}
            </Section>
          )}

          {!hasVariants && (
            <Section title="Códigos">
              <div className="grid grid-cols-2 gap-4">
                <FormField label="SKU" hint="Identificador interno">
                  <Input
                    value={sku}
                    onChange={(e) => setSku(e.target.value.toUpperCase())}
                    placeholder="Ej.: REM-001"
                  />
                </FormField>
                <FormField label="Código de barras" hint="EAN, UPC...">
                  <Input value={barcode} onChange={(e) => setBarcode(e.target.value)} placeholder="—" />
                </FormField>
              </div>
            </Section>
          )}

          <Section title="Envío" hint={SHIPPING_HINT}>
            {hasVariants && (
              <p className="mb-3 text-xs text-fg-muted">
                Se aplica a todas las variantes; si alguna pesa distinto, ajustala después al editar.
              </p>
            )}
            <ShippingInputs value={shipping} onChange={setShipping} />
          </Section>

          <SpecSection categoryIds={categoryIds} values={specs} onChange={setSpecs} />
        </div>
        <div className="min-w-0 space-y-4">
          <Section title="Publicación">
            <Checkbox
              label="Mostrar en la tienda"
              checked={publish}
              onChange={(e) => setPublish(e.target.checked)}
            />
            <p className="mt-1 text-xs text-fg-muted">Si lo dejás sin marcar, queda como borrador.</p>
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

      {/* Footer sticky */}
      <StickyFormBar>
        <Button variant="secondary" onClick={() => navigate('/productos')}>
          Cancelar
        </Button>
        <Button loading={save.isPending} disabled={!canSave} onClick={() => save.mutate()}>
          Guardar producto
        </Button>
      </StickyFormBar>
    </div>
  );
}
