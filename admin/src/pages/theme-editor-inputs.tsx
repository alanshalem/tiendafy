import { type ReactNode } from 'react';
import { ChevronLeft, Plus, X } from 'lucide-react';
import type { ThemeConfig } from '@tiendafy/types';

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
export const rgbToHex = (raw: string, fb: string) => {
  const p = raw?.trim().split(/\s+/).map(Number);
  if (!p || p.length !== 3 || p.some(Number.isNaN)) return fb;
  return `#${p.map((n) => n.toString(16).padStart(2, '0')).join('')}`;
};
export const hexToRgb = (hex: string) => {
  const v = hex.replace('#', '');
  return `${parseInt(v.slice(0, 2), 16)} ${parseInt(v.slice(2, 4), 16)} ${parseInt(v.slice(4, 6), 16)}`;
};
/** Texto legible (blanco u oscuro) según la luminancia de un color "R G B". */
export const contrastText = (rgbRaw: string): string => {
  const [r, g, b] = rgbRaw.trim().split(/\s+/).map(Number);
  const lum = (0.2126 * (r ?? 0) + 0.7152 * (g ?? 0) + 0.0722 * (b ?? 0)) / 255;
  return lum > 0.6 ? '17 24 39' : '255 255 255';
};

/** Estilo base compartido de inputs/selects/textarea del editor. */
export const INPUT_BASE = 'rounded-md border border-border-strong bg-surface focus:outline-none focus:ring-2 focus:ring-primary';

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
  return (
    <div>
      <label className="mb-1.5 block text-sm font-medium text-fg">{label}</label>
      {children}
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
      <input type="color" value={rgbToHex(value, fallback)} onChange={(e) => onChange(hexToRgb(e.target.value))} className="h-8 w-12 shrink-0 cursor-pointer rounded border border-border-strong" />
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

export function TextInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className={`h-10 w-full px-3 text-sm ${INPUT_BASE}`} />;
}

export function TextArea({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return <textarea value={value} onChange={(e) => onChange(e.target.value)} rows={3} className={`w-full px-3 py-2 text-sm ${INPUT_BASE}`} />;
}

/** Lista de valores repetible (uno o varios): agregar / editar / quitar. */
export function StringList({ label, hint, values, onChange, placeholder }: { label: string; hint?: string; values: string[]; onChange: (v: string[]) => void; placeholder?: string }) {
  return (
    <Field label={label} hint={hint}>
      <div className="space-y-2">
        {values.map((val, i) => (
          <div key={i} className="flex gap-2">
            <input
              value={val}
              onChange={(e) => onChange(values.map((v, idx) => (idx === i ? e.target.value : v)))}
              placeholder={placeholder}
              className={`h-10 w-full px-3 text-sm ${INPUT_BASE}`}
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
    </Field>
  );
}

export function Select({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className={`h-10 w-full appearance-none px-3 text-sm ${INPUT_BASE}`}>
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}
