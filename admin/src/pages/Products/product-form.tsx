import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Loader2, Sparkles } from 'lucide-react';
import { FormField, Input, Textarea, useToast } from '@tiendafy/ui';
import { useStore } from '../../context/StoreContext';
import { api, errMsg } from '../../lib/api';
import { useAiEnabled } from '../../lib/useAi';
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
  const aiEnabled = useAiEnabled();
  const [aiWriting, setAiWriting] = useState(false);

  const writeWithAi = async () => {
    setAiWriting(true);
    try {
      const r = await api.post<{ text: string }>('/api/v1/ai/product-description', {
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
          <Input value={name} onChange={(e) => onName(e.target.value)} placeholder="Remera oversize" />
        </FormField>
        {/* El botón de IA va fuera del FormField: adentro, el <label> apuntaba al
            contenedor y la descripción quedaba sin nombre accesible. */}
        <div>
          <FormField label="Descripción" hint="Contale a tus clientes qué hace especial a este producto">
            <Textarea value={description} onChange={(e) => onDescription(e.target.value)} rows={5} />
          </FormField>
          {aiEnabled && name.trim().length > 2 && (
            <button
              type="button"
              disabled={aiWriting}
              onClick={writeWithAi}
              className="mt-1.5 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline disabled:opacity-50"
              title="Escribe (o reescribe) la descripción a partir del nombre y lo que ya haya"
            >
              {aiWriting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
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
  const { store } = useStore();
  const { data: cats } = useQuery({
    queryKey: ['categories', store?.id],
    queryFn: () => api.get<{ items: Category[] }>('/api/v1/categories'),
    enabled: !!store,
  });
  const toggle = (id: string) =>
    onChange(value.includes(id) ? value.filter((x) => x !== id) : [...value, id]);

  return (
    <Section title="Categorías" hint="Aparecen en el menú y los filtros de la tienda.">
      {(cats?.items ?? []).length === 0 ? (
        <p className="text-xs text-fg-subtle">No hay categorías. Creálas en Productos → Categorías.</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {cats!.items.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => toggle(c.id)}
              aria-pressed={value.includes(c.id)}
              className={
                value.includes(c.id)
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
  );
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
export interface ShippingSize {
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
        {field('weightKg', 'Peso del paquete (kg)', '0,5')}
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
