import { useId } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  BEST_SELLERS_DAYS,
  PRODUCT_SOURCE_LIMIT,
  SECTION_REGISTRY,
  productSourceListingHref,
  sectionProductPlan,
  type ProductSource,
  type ProductSourceKind,
  type ProductSourceSort,
  type ProductsData,
} from '@tiendafy/types';
import { LinkPicker } from '../../../components/LinkPicker';
import { useStore } from '../../../context/StoreContext';
import { api } from '../../../lib/api';
import { Check, Field, Select, TextArea, TextInput } from '../../theme-editor-inputs';
import { ProductPicker } from '../../theme-editor-pickers';
import type { SectionEditorProps } from './types';

type ProductsType = 'featured' | 'new-products' | 'sale-products';

const KINDS: { value: ProductSourceKind; label: string }[] = [
  { value: 'manual', label: 'Elegidos a mano' },
  { value: 'category', label: 'De una categoría' },
  { value: 'brand', label: 'De una marca' },
  { value: 'newest', label: 'Los más nuevos' },
  { value: 'on-sale', label: 'En oferta' },
  { value: 'best-sellers', label: 'Los más vendidos' },
];

const SORTS: { value: ProductSourceSort; label: string }[] = [
  { value: 'newest', label: 'Más nuevos primero' },
  { value: 'price_asc', label: 'Precio: de menor a mayor' },
  { value: 'price_desc', label: 'Precio: de mayor a menor' },
  { value: 'name', label: 'Nombre (A–Z)' },
];

const LAYOUTS = [
  { value: 'carousel', label: 'Carrusel (se desliza)' },
  { value: 'grid', label: 'Grilla' },
];

interface CategoryDto {
  id: string;
  name: string;
  path: string;
  depth?: number;
}

/** Categorías de la tienda (misma consulta y caché que la pantalla de Categorías y el selector de links). */
function useCategories(enabled: boolean) {
  const { store } = useStore();
  return useQuery({
    queryKey: ['categories', store?.id],
    queryFn: () => api.get<{ items: CategoryDto[] }>('/api/v1/categories'),
    enabled: enabled && !!store,
  });
}

/** Las marcas cargadas en los productos (las mismas que el filtro de la tienda). */
function useBrands(enabled: boolean) {
  const { store } = useStore();
  return useQuery({
    queryKey: ['product-brands', store?.id],
    queryFn: () =>
      api
        .get<{ facets?: { brands?: string[] } }>('/api/v1/products/search?pageSize=1')
        .then((r) => r.facets?.brands ?? []),
    enabled: enabled && !!store,
    staleTime: 5 * 60_000,
  });
}

/** Un origen nuevo del tipo elegido, conservando lo que se pueda del anterior. */
function sourceOfKind(kind: ProductSourceKind, prev: ProductSource, legacyIds: string[]): ProductSource {
  const sort = 'sort' in prev ? prev.sort : undefined;
  switch (kind) {
    case 'manual':
      return { kind, ids: prev.kind === 'manual' ? prev.ids : legacyIds };
    case 'category':
      return { kind, categoryId: prev.kind === 'category' ? prev.categoryId : '', ...(sort ? { sort } : {}) };
    case 'brand':
      return { kind, brand: prev.kind === 'brand' ? prev.brand : '', ...(sort ? { sort } : {}) };
    case 'on-sale':
      return { kind, ...(sort ? { sort } : {}) };
    case 'best-sellers':
      return { kind, days: prev.kind === 'best-sellers' ? prev.days : BEST_SELLERS_DAYS.default };
    case 'newest':
      return { kind };
  }
}

/**
 * El origen que se está editando. Una categoría o una marca recién elegidas
 * todavía no tienen valor y para la tienda no son un origen válido (cae al
 * de su tipo); el editor las muestra igual, esperando que se complete.
 */
function editingSource(raw: unknown, planned: ProductSource): ProductSource {
  const r = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : null;
  if (r?.kind === 'category' && planned.kind !== 'category') return { kind: 'category', categoryId: '' };
  if (r?.kind === 'brand' && planned.kind !== 'brand') return { kind: 'brand', brand: '' };
  return planned;
}

/** Cómo se lee el destino automático de "Ver todos" en el editor. */
function autoViewAllLabel(source: ProductSource): string {
  switch (source.kind) {
    case 'category':
      return 'el listado de la categoría';
    case 'brand':
      return 'el listado de la marca';
    case 'newest':
      return 'el listado, con lo más nuevo primero';
    default:
      return 'el listado de todos los productos';
  }
}

const clampInt = (raw: string, min: number, max: number, fallback: number) => {
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};

/**
 * Destacados, recién llegados y ofertas: el mismo editor. Qué productos van
 * (a mano, una categoría, una marca, lo nuevo, ofertas o lo más vendido),
 * cuántos, cómo se acomodan y el link "Ver todos".
 *
 * Lo que está guardado se lee con `sectionProductPlan`, igual que la tienda:
 * una sección vieja con `productIds` aparece como "Elegidos a mano" y una sin
 * nada, con el origen por defecto de su tipo.
 */
export function ProductsEditor({ section, data, set }: SectionEditorProps<ProductsType>) {
  const type = section.type as ProductsType;
  const plan = sectionProductPlan(section)!;
  const source = editingSource(data.source, plan.source);
  const ids = useId();

  const setSource = (next: ProductSource) => {
    const patch: Partial<ProductsData> = { source: next };
    // Los elegidos también en `productIds`: la forma de antes sigue diciendo lo mismo.
    if (next.kind === 'manual') patch.productIds = next.ids;
    set(patch);
  };
  const categories = useCategories(source.kind === 'category');
  const brands = useBrands(source.kind === 'brand');
  const sortable = source.kind === 'category' || source.kind === 'brand' || source.kind === 'on-sale';

  const columnsOptions = [
    { value: 'auto', label: 'Como el listado de productos' },
    ...['2', '3', '4', '5'].map((n) => ({ value: n, label: `${n} columnas` })),
  ];
  const mobileOptions = [
    { value: 'auto', label: 'Como el listado de productos' },
    { value: '1', label: '1 columna (foto grande)' },
    { value: '2', label: '2 columnas' },
  ];

  return (
    <>
      <Field label="Título" hint="Dejalo vacío para no mostrar título.">
        <TextInput
          value={data.title}
          onChange={(v) => set({ title: v })}
          placeholder={SECTION_REGISTRY[type].fields.title.fallback}
        />
      </Field>
      <Field label="Subtítulo (opcional)">
        <TextArea value={data.subtitle} onChange={(v) => set({ subtitle: v })} />
      </Field>

      <Field label="Qué productos mostrar">
        <Select
          value={source.kind}
          onChange={(v) => setSource(sourceOfKind(v as ProductSourceKind, source, data.productIds))}
          options={KINDS}
        />
      </Field>

      {source.kind === 'manual' && (
        <Field
          label="Productos elegidos"
          hint={`Se muestran en este orden, hasta ${PRODUCT_SOURCE_LIMIT.max}. Los que no estén publicados no aparecen.`}
        >
          <ProductPicker
            value={source.ids}
            max={PRODUCT_SOURCE_LIMIT.max}
            onChange={(next) => setSource({ kind: 'manual', ids: next })}
          />
        </Field>
      )}

      {source.kind === 'category' && (
        <>
          <Field label="Categoría">
            <Select
              value={source.categoryId}
              onChange={(v) => setSource({ ...source, categoryId: v })}
              options={[
                { value: '', label: categories.isLoading ? 'Cargando categorías…' : 'Elegí una categoría' },
                ...(categories.data?.items ?? []).map((c) => ({
                  value: c.id,
                  label: `${'— '.repeat(Math.max(0, (c.depth ?? 1) - 1))}${c.name}`,
                })),
              ]}
            />
          </Field>
          <Check
            label="Incluir sus subcategorías"
            checked={source.includeChildren !== false}
            onChange={(v) => {
              const { includeChildren: _drop, ...rest } = source;
              setSource(v ? rest : { ...rest, includeChildren: false });
            }}
          />
        </>
      )}

      {source.kind === 'brand' && (
        <Field
          label="Marca"
          hint={
            source.brand.trim()
              ? 'Como está escrita en los productos (sin importar mayúsculas).'
              : 'Escribí o elegí una marca. Mientras tanto se muestra lo de siempre.'
          }
        >
          <BrandInput
            listId={`${ids}-brands`}
            value={source.brand}
            brands={brands.data ?? []}
            onChange={(v) => setSource({ ...source, brand: v })}
          />
        </Field>
      )}

      {source.kind === 'best-sellers' && (
        <Field
          label="Vendidos en los últimos (días)"
          hint="Si todavía no hay ventas, se muestran los más nuevos."
        >
          <TextInput
            type="number"
            value={String(source.days ?? BEST_SELLERS_DAYS.default)}
            onChange={(v) =>
              setSource({
                kind: 'best-sellers',
                days: clampInt(v, BEST_SELLERS_DAYS.min, BEST_SELLERS_DAYS.max, BEST_SELLERS_DAYS.default),
              })
            }
          />
        </Field>
      )}

      {sortable && (
        <Field label="Orden">
          <Select
            value={source.sort ?? 'newest'}
            onChange={(v) => setSource({ ...source, sort: v as ProductSourceSort })}
            options={SORTS}
          />
        </Field>
      )}

      {source.kind !== 'manual' && (
        <Field label={`Cantidad de productos (${PRODUCT_SOURCE_LIMIT.min} a ${PRODUCT_SOURCE_LIMIT.max})`}>
          <TextInput
            type="number"
            value={String(plan.limit)}
            onChange={(v) =>
              set({
                limit: clampInt(
                  v,
                  PRODUCT_SOURCE_LIMIT.min,
                  PRODUCT_SOURCE_LIMIT.max,
                  PRODUCT_SOURCE_LIMIT.default,
                ),
              })
            }
          />
        </Field>
      )}

      <Field label="Cómo se muestran">
        <Select
          value={data.carousel ? 'carousel' : 'grid'}
          onChange={(v) => set({ carousel: v === 'carousel' })}
          options={LAYOUTS}
        />
      </Field>
      <Field label="Columnas en computadora">
        <Select
          value={data.columns}
          onChange={(v) => set({ columns: v as ProductsData['columns'] })}
          options={columnsOptions}
        />
      </Field>
      <Field label="Columnas en el celular">
        <Select
          value={data.mobileColumns}
          onChange={(v) => set({ mobileColumns: v as ProductsData['mobileColumns'] })}
          options={mobileOptions}
        />
      </Field>

      <Check
        label='Mostrar el link "Ver todos"'
        checked={data.viewAll}
        onChange={(v) => set({ viewAll: v })}
      />
      {data.viewAll && (
        <>
          <Field label="Texto del link">
            <TextInput
              value={data.viewAllText}
              onChange={(v) => set({ viewAllText: v })}
              placeholder="Ver todos"
            />
          </Field>
          <LinkPicker
            label="A dónde lleva"
            value={data.viewAllLink}
            onChange={(href) => set({ viewAllLink: href })}
            hint={
              data.viewAllLink
                ? 'Sacá el link para que vaya solo al listado que corresponde.'
                : `Sin elegir nada, va a ${autoViewAllLabel(plan.source)} (${productSourceListingHref(plan.source)}).`
            }
          />
        </>
      )}
    </>
  );
}

/** Campo de marca con las marcas cargadas como sugerencias (se puede escribir otra). */
function BrandInput({
  id,
  listId,
  value,
  brands,
  onChange,
}: {
  id?: string;
  listId: string;
  value: string;
  brands: string[];
  onChange: (v: string) => void;
}) {
  return (
    <>
      <input
        id={id}
        list={listId}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={brands[0] ? `Ej.: ${brands[0]}` : 'Nombre de la marca'}
        className="h-10 w-full rounded-md border border-border-strong bg-surface px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
      />
      <datalist id={listId}>
        {brands.map((b) => (
          <option key={b} value={b} />
        ))}
      </datalist>
    </>
  );
}
