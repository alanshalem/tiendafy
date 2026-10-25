import { useState } from 'react';
import { Check, Sparkles } from 'lucide-react';
import { FormField, Input, Textarea, useToast, Spinner, SearchInput } from '@tiendafy/ui';
import { api, errMsg } from '../../lib/api';
import { foldText } from '../../lib/text';
import { useCategories } from '../../lib/useCategories';
import { useAiTask } from '../../lib/useAi';
import { Section } from './FormSection';
import { SpecFields, useSpecDefinitions, type SpecValues } from './SpecFields';
import type { Category } from './types';

/*
 * Las secciones que comparten "Nuevo producto" y "Editar producto". Antes
 * cada pantalla tenía las suyas y no coincidían: el alta mostraba campos que
 * no se guardaban (categoría, tags, medidas) y la edición no tenía código de
 * barras ni peso. Ahora las dos arman el mismo formulario con estas piezas, y
 * cada campo que se ve se guarda.
 */

/* ------------------------------------------------------------ nombre, descripción y marca */

export function DetailsSection({
  name,
  onName,
  description,
  onDescription,
  brand,
  onBrand,
  error,
}: {
  name: string;
  onName: (v: string) => void;
  description: string;
  onDescription: (v: string) => void;
  brand: string;
  onBrand: (v: string) => void;
  error?: string;
}) {
  const { toast } = useToast();
  const aiShortText = useAiTask('ShortText');
  const [aiWriting, setAiWriting] = useState(false);

  const writeWithAi = async () => {
    setAiWriting(true);
    try {
      const r = await api.post<{ text: string }>('/api/v1/ai/short-text', {
        kind: 'product-description',
        name,
        notes: description || null,
      });
      onDescription(r.text);
    } catch (err) {
      toast(errMsg(err, 'La IA no pudo escribir la descripción.'), { variant: 'error' });
    } finally {
      setAiWriting(false);
    }
  };

  return (
    <Section title="Nombre y descripción">
      <div className="space-y-4">
        <FormField label="Nombre" required error={error}>
          <Input value={name} onChange={(e) => onName(e.target.value)} placeholder="Ej.: Remera oversize" />
        </FormField>
        {/* El botón de IA va fuera del FormField: adentro, el <label> apuntaba al
            contenedor y la descripción quedaba sin nombre accesible. */}
        <div>
          <FormField label="Descripción" hint="Contale a tus clientes qué hace especial a este producto">
            <Textarea value={description} onChange={(e) => onDescription(e.target.value)} rows={5} />
          </FormField>
          {aiShortText.visible && name.trim().length > 2 && (
            <button
              type="button"
              disabled={aiWriting || !aiShortText.available}
              onClick={writeWithAi}
              className="mt-1.5 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline disabled:opacity-50"
              title={
                aiShortText.reason ??
                'Escribe (o reescribe) la descripción a partir del nombre y lo que ya haya'
              }
            >
              {aiWriting ? <Spinner inline size={12} /> : <Sparkles className="h-3 w-3" />}
              Escribir con IA
            </button>
          )}
        </div>
        <FormField label="Marca" hint="Se usa para filtrar en la tienda (ej: Royal Canin).">
          <Input value={brand} onChange={(e) => onBrand(e.target.value)} placeholder="Sin marca" />
        </FormField>
      </div>
    </Section>
  );
}

/* ------------------------------------------------------------ categorías */

export function CategoriesSection({
  value,
  onChange,
}: {
  value: string[];
  onChange: (ids: string[]) => void;
}) {
  const { data: cats } = useCategories();
  const [query, setQuery] = useState('');
  const toggle = (id: string) =>
    onChange(value.includes(id) ? value.filter((x) => x !== id) : [...value, id]);

  const items = cats?.items ?? [];
  const labeled = categoryLabels(items);
  const q = foldText(query.trim());
  // Las elegidas quedan a la vista aunque no coincidan con el filtro: si no,
  // buscar otra cosa las escondía y parecía que se habían desmarcado.
  const shown = q ? labeled.filter((c) => value.includes(c.id) || foldText(c.label).includes(q)) : labeled;

  return (
    <Section title="Categorías" hint="Aparecen en el menú y los filtros de la tienda.">
      {items.length === 0 ? (
        <p className="text-xs text-fg-subtle">No hay categorías. Creálas en Productos → Categorías.</p>
      ) : (
        <>
          {/* Con pocas categorías el buscador sobra; con sesenta, encontrar
              "Discos" a ojo entre todas era lo más lento de cargar un producto. */}
          {items.length > CATEGORY_SEARCH_FROM && (
            <SearchInput
              aria-label="Buscar categoría"
              placeholder="Buscar categoría…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="mb-3"
            />
          )}
          {shown.length === 0 ? (
            <p className="text-xs text-fg-subtle">Ninguna categoría coincide con “{query.trim()}”.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {shown.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => toggle(c.id)}
                  aria-pressed={value.includes(c.id)}
                  className={
                    value.includes(c.id)
                      ? 'inline-flex min-h-10 items-center gap-1.5 rounded-full border border-primary bg-primary/10 px-3.5 text-sm font-medium text-primary'
                      : 'inline-flex min-h-10 items-center gap-1.5 rounded-full border border-border-strong px-3.5 text-sm text-fg-muted hover:bg-bg-muted'
                  }
                >
                  {value.includes(c.id) && <Check className="h-3.5 w-3.5" aria-hidden />}
                  {c.label}
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </Section>
  );
}

/** Desde cuántas categorías aparece el buscador arriba de los chips. */
const CATEGORY_SEARCH_FROM = 8;

/**
 * Cada categoría con su nombre y el de sus padres ("Pesas › Discos"),
 * ordenadas así para que las hijas queden junto a su padre. Antes los chips
 * mostraban el path, que son slugs ("bumpers-plates-discos"): nadie reconocía
 * su propia categoría. Se sube por parentId y, si la API no lo trae, por los
 * prefijos del path, que identifican a cada ancestro igual.
 */
function categoryLabels(items: Category[]): (Category & { label: string })[] {
  const byId = new Map(items.map((c) => [c.id, c]));
  const byPath = new Map(items.map((c) => [c.path, c]));
  const parentOf = (c: Category): Category | undefined => {
    if (c.parentId) return byId.get(c.parentId);
    const cut = c.path.lastIndexOf('/');
    return cut > 0 ? byPath.get(c.path.slice(0, cut)) : undefined;
  };
  return items
    .map((c) => {
      const names = [c.name];
      const seen = new Set([c.id]);
      // El conjunto de vistas corta un ciclo si los datos vinieran rotos.
      for (let p = parentOf(c); p && !seen.has(p.id); p = parentOf(p)) {
        seen.add(p.id);
        names.unshift(p.name);
      }
      return { ...c, label: names.join(' › ') };
    })
    .sort((a, b) => a.label.localeCompare(b.label, 'es'));
}

/* ------------------------------------------------------------ SEO */

export function SeoSection({
  title,
  onTitle,
  description,
  onDescription,
}: {
  title: string;
  onTitle: (v: string) => void;
  description: string;
  onDescription: (v: string) => void;
}) {
  return (
    <Section
      title="SEO"
      hint="Cómo se ve en Google y al compartir. Vacío = se usan el nombre y la descripción."
    >
      <div className="space-y-4">
        <FormField label="Título SEO" hint="Hasta 70 caracteres">
          <Input value={title} onChange={(e) => onTitle(e.target.value)} />
        </FormField>
        <FormField label="Descripción SEO" hint="Hasta 320 caracteres">
          <Textarea value={description} onChange={(e) => onDescription(e.target.value)} rows={3} />
        </FormField>
      </div>
    </Section>
  );
}

/* ------------------------------------------------------------ ficha técnica */

/**
 * Ficha técnica del producto. Solo muestra los campos que la tienda declaró
 * para las categorías de ESTE producto: sin eso, cargar un producto sería
 * bajar por cuarenta campos que no aplican.
 */
export function SpecSection({
  categoryIds,
  values,
  onChange,
}: {
  categoryIds: string[];
  values: SpecValues;
  onChange: (next: SpecValues) => void;
}) {
  const { applicable, total } = useSpecDefinitions(categoryIds);
  if (total === 0) return null;

  return (
    <Section
      title="Ficha técnica"
      hint="Se muestra en la página del producto y se puede usar como filtro del catálogo."
    >
      {applicable.length === 0 ? (
        <p className="text-xs text-fg-subtle">
          Ninguno de los campos definidos aplica a las categorías de este producto. Se configuran en
          Configuración → Ficha técnica.
        </p>
      ) : (
        <SpecFields definitions={applicable} values={values} onChange={onChange} />
      )}
    </Section>
  );
}

/* ------------------------------------------------------------ peso y medidas */

/** Peso y medidas tal como se escriben en el formulario (kg y cm, con coma o punto). */
export interface ShippingDraft {
  weightKg: string;
  lengthCm: string;
  widthCm: string;
  heightCm: string;
}

export const EMPTY_SHIPPING: ShippingDraft = { weightKg: '', lengthCm: '', widthCm: '', heightCm: '' };

/** Lo que espera la API: gramos y centímetros enteros (null = sin cargar). */
interface ShippingSize {
  weightGrams: number | null;
  lengthCm: number | null;
  widthCm: number | null;
  heightCm: number | null;
}

const num = (s: string) => Number(s.trim().replace(',', '.'));

/** De la API al formulario. */
export function toShippingDraft(v: Partial<ShippingSize> | undefined): ShippingDraft {
  const cm = (n: number | null | undefined) => (n == null ? '' : String(n));
  return {
    weightKg: v?.weightGrams == null ? '' : String(v.weightGrams / 1000).replace('.', ','),
    lengthCm: cm(v?.lengthCm),
    widthCm: cm(v?.widthCm),
    heightCm: cm(v?.heightCm),
  };
}

/**
 * Del formulario a la API, o el motivo por el que no se puede guardar. Las
 * medidas van las tres o ninguna: con una sola no se calcula el volumen.
 */
export function parseShipping(
  d: ShippingDraft,
): { value: ShippingSize; error: null } | { value: null; error: string } {
  const sides = [d.lengthCm, d.widthCm, d.heightCm].map((s) => s.trim());
  let weightGrams: number | null = null;
  if (d.weightKg.trim()) {
    const kg = num(d.weightKg);
    if (!Number.isFinite(kg) || kg <= 0 || kg > 1000)
      return { value: null, error: 'El peso tiene que estar entre 0,001 y 1.000 kg.' };
    weightGrams = Math.max(1, Math.round(kg * 1000));
  }
  const filled = sides.filter(Boolean).length;
  if (filled > 0 && filled < 3)
    return { value: null, error: 'Cargá las tres medidas (largo, ancho y alto) o ninguna.' };
  const cms = sides.map((s) => (s ? Math.round(num(s)) : null));
  if (cms.some((c) => c !== null && (!Number.isFinite(c) || c < 1 || c > 500)))
    return { value: null, error: 'Cada medida tiene que estar entre 1 y 500 cm.' };
  return { value: { weightGrams, lengthCm: cms[0]!, widthCm: cms[1]!, heightCm: cms[2]! }, error: null };
}

export const sameShipping = (a: Partial<ShippingSize>, b: ShippingSize) =>
  (a.weightGrams ?? null) === b.weightGrams &&
  (a.lengthCm ?? null) === b.lengthCm &&
  (a.widthCm ?? null) === b.widthCm &&
  (a.heightCm ?? null) === b.heightCm;

/** Los cuatro campos del paquete de una unidad. */
export function ShippingInputs({
  value,
  onChange,
  labelPrefix = '',
}: {
  value: ShippingDraft;
  onChange: (next: ShippingDraft) => void;
  /** Para distinguir los campos de cada variante ("Peso (kg) de S / Rojo"). */
  labelPrefix?: string;
}) {
  const error = parseShipping(value).error;
  const field = (key: keyof ShippingDraft, label: string, placeholder: string) => (
    <FormField label={label}>
      <Input
        inputMode="decimal"
        aria-label={labelPrefix ? `${label} de ${labelPrefix}` : undefined}
        value={value[key]}
        onChange={(e) => onChange({ ...value, [key]: e.target.value.replace(/[^\d.,]/g, '') })}
        placeholder={placeholder}
      />
    </FormField>
  );
  return (
    <div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {field('weightKg', 'Peso del paquete (kg)', 'Ej.: 0,5')}
        {field('lengthCm', 'Largo (cm)', '—')}
        {field('widthCm', 'Ancho (cm)', '—')}
        {field('heightCm', 'Alto (cm)', '—')}
      </div>
      {error && (
        <p role="alert" className="mt-1.5 text-xs text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

/** La explicación del paquete, la misma en las dos pantallas. */
export const SHIPPING_HINT =
  'Del paquete de una unidad, listo para despachar. Con esto cotizan Correo Argentino, Andreani y Zipnova; lo que no cargues usa el paquete por defecto de Configuración → Medios de envío.';
