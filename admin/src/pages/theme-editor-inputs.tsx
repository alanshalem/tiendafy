import { useId, isValidElement, cloneElement, type ReactNode, type ReactElement } from 'react';
import { ChevronLeft, Plus, X } from 'lucide-react';
import type { ThemeConfig } from '@tiendafy/types';

/** Texto legible (blanco u oscuro) según la luminancia de un color "R G B". */
export { contrastText } from '@tiendafy/types';

/* Primitivos de formulario + helpers de color del editor de diseño. */

/**
 * Setter para una sección-objeto del tema (header/cart/footer/…). Evita repetir
 * `(patch) => updateTheme((t) => ({ ...t, key: { ...t.key, ...patch } }))` en cada panel.
 */
export function sectionSetter<K extends keyof ThemeConfig>(
  update: (u: (t: ThemeConfig) => ThemeConfig) => void,
  key: K,
) {
  return (patch: Partial<ThemeConfig[K]>) =>
    update((t) => ({ ...t, [key]: { ...(t[key] as object), ...patch } }) as ThemeConfig);
}

/* ---- color helpers (config guarda "R G B"; el input usa hex) ---- */
const rgbToHex = (raw: string, fb: string) => {
  const p = raw?.trim().split(/\s+/).map(Number);
  if (!p || p.length !== 3 || p.some(Number.isNaN)) return fb;
  return `#${p.map((n) => n.toString(16).padStart(2, '0')).join('')}`;
};
export const hexToRgb = (hex: string) => {
  const v = hex.replace('#', '');
  return `${parseInt(v.slice(0, 2), 16)} ${parseInt(v.slice(2, 4), 16)} ${parseInt(v.slice(4, 6), 16)}`;
};
/** Estilo base compartido de inputs/selects/textarea del editor. */
export const INPUT_BASE = 'rounded-md border border-border-strong bg-surface focus:outline-none focus:ring-2 focus:ring-primary';
/** Estilo completo de un input/textarea/select de alto estándar (h-10). */
export const INPUT_FIELD = `h-10 w-full px-3 text-sm ${INPUT_BASE}`;

export function BackHeader({ title, onBack, onReset }: { title: string; onBack: () => void; onReset?: () => void }) {
  return (
    <div className="flex items-center border-b border-border">
      <button onClick={onBack} className="flex flex-1 items-center gap-2 px-4 py-3 text-left text-sm font-semibold text-fg hover:bg-bg-muted">
        <ChevronLeft className="h-4 w-4 text-fg-muted" /> {title}
      </button>
      {onReset && (
        <button
          onClick={onReset}
          title="Volver esta sección a los valores por defecto"
          className="mr-2 shrink-0 rounded px-2 py-1 text-xs font-medium text-fg-muted hover:bg-bg-muted hover:text-fg"
        >
          Restablecer
        </button>
      )}
    </div>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  // Asocia programáticamente el <label> con su control: genera un id y lo
  // reenvía al hijo (TextInput/TextArea/Select/… aceptan `id`). Solo agrega
  // atributos: no cambia el render visual.
  const generatedId = useId();
  const el = isValidElement(children) ? (children as ReactElement<{ id?: string }>) : null;
  const controlId = el ? (el.props.id ?? generatedId) : undefined;
  return (
    <div>
      <label htmlFor={controlId} className="mb-1.5 block text-sm font-medium text-fg">{label}</label>
      {el ? cloneElement(el, { id: controlId }) : children}
      {hint && <p className="mt-1 text-xs text-fg-muted">{hint}</p>}
    </div>
  );
}

export function ColorRow({ label, hint, value, onChange, fallback }: { label: string; hint?: string; value: string; onChange: (raw: string) => void; fallback: string }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div>
        <div className="text-sm font-medium text-fg">{label}</div>
        {hint && <p className="text-xs text-fg-muted">{hint}</p>}
      </div>
      <input type="color" aria-label={label} value={rgbToHex(value, fallback)} onChange={(e) => onChange(hexToRgb(e.target.value))} className="h-8 w-12 shrink-0 cursor-pointer rounded border border-border-strong" />
    </div>
  );
}

export function Check({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-2 text-sm">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="rounded-sm" />
      {label}
    </label>
  );
}

export function TextInput({ value, onChange, placeholder, id }: { value: string; onChange: (v: string) => void; placeholder?: string; id?: string }) {
  return <input id={id} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className={INPUT_FIELD} />;
}

export function TextArea({ value, onChange, id }: { value: string; onChange: (v: string) => void; id?: string }) {
  return <textarea id={id} value={value} onChange={(e) => onChange(e.target.value)} rows={3} className={`w-full px-3 py-2 text-sm ${INPUT_BASE}`} />;
}

/** Lista de valores repetible (uno o varios): agregar / editar / quitar. */
export function StringList({ label, hint, values, onChange, placeholder }: { label: string; hint?: string; values: string[]; onChange: (v: string[]) => void; placeholder?: string }) {
  // Mismo markup visual que <Field>, pero asociando el <label> al primer input real.
  const firstId = useId();
  return (
    <div>
      <label htmlFor={firstId} className="mb-1.5 block text-sm font-medium text-fg">{label}</label>
      <div className="space-y-2">
        {values.map((val, i) => (
          <div key={i} className="flex gap-2">
            <input
              id={i === 0 ? firstId : undefined}
              value={val}
              onChange={(e) => onChange(values.map((v, idx) => (idx === i ? e.target.value : v)))}
              placeholder={placeholder}
              className={INPUT_FIELD}
            />
            <button type="button" onClick={() => onChange(values.filter((_, idx) => idx !== i))} aria-label="Quitar" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-border text-fg-muted hover:bg-bg-muted">
              <X className="h-4 w-4" />
            </button>
          </div>
        ))}
        <button type="button" onClick={() => onChange([...values, ''])} className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline">
          <Plus className="h-4 w-4" /> Agregar
        </button>
      </div>
      {hint && <p className="mt-1 text-xs text-fg-muted">{hint}</p>}
    </div>
  );
}

export function Select({ value, onChange, options, id }: { value: string; onChange: (v: string) => void; options: { value: string; label: string }[]; id?: string }) {
  return (
    <select id={id} value={value} onChange={(e) => onChange(e.target.value)} className={`appearance-none ${INPUT_FIELD}`}>
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}
