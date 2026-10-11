import { Checkbox, cn, useConfirm } from '@tiendafy/ui';
import { useId, isValidElement, cloneElement, type ReactNode, type ReactElement } from 'react';
import { ChevronLeft, Plus, X } from 'lucide-react';
import { type ThemeConfig, baseTheme } from '@tiendafy/types';

/** Texto legible (blanco u oscuro) según la luminancia de un color "R G B". */
export { contrastText } from '@tiendafy/types';
import { contrastRatio } from '@tiendafy/types';

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
const hexToRgb = (hex: string) => {
  const v = hex.replace('#', '');
  return `${parseInt(v.slice(0, 2), 16)} ${parseInt(v.slice(2, 4), 16)} ${parseInt(v.slice(4, 6), 16)}`;
};
/** Estilo base compartido de inputs/selects/textarea del editor. */
export const INPUT_BASE =
  'rounded-md border border-border-strong bg-surface focus:outline-none focus:ring-2 focus:ring-primary';
/** Estilo completo de un input/textarea/select de alto estándar (h-10). */
const INPUT_FIELD = `h-10 w-full px-3 text-sm ${INPUT_BASE}`;

/**
 * Aviso de legibilidad entre dos colores del tema.
 *
 * Es el error que más caro sale y que menos se nota editando: el comercio elige
 * dos colores que le gustan en la pantalla grande, y en un celular al sol el
 * precio no se lee. WCAG AA pide 4.5 para texto normal.
 */
export function ContrastNote({ fg, bg, label }: { fg: string; bg: string; label: string }) {
  const ratio = contrastRatio(fg, bg);
  if (ratio >= 4.5) return null;
  const severe = ratio < 3;
  return (
    <p className={cn('mt-1.5 text-xs', severe ? 'text-danger' : 'text-warning')}>
      {severe ? 'No se lee: ' : 'Se lee justo: '}
      {label} tiene {ratio.toFixed(1)} de contraste y lo recomendado es 4.5.
      {severe ? ' Elegí un color más claro o más oscuro.' : ' Miralo en un celular antes de publicar.'}
    </p>
  );
}

export interface QuickStyle<T> {
  name: string;
  recommended?: boolean;
  /** Solo los campos que define el estilo; el resto queda como esté. */
  patch: Partial<T>;
}

/**
 * "Estilos rápidos" de un panel: un click deja la sección entera con una
 * combinación que se ve bien, y después se ajusta el detalle.
 *
 * El comercio no quiere decidir catorce casillas sueltas; quiere que su tienda
 * se parezca a las que conoce. El estilo aparece marcado cuando los campos que
 * define coinciden con lo que hay, así que tocar un detalle no lo desmarca
 * salvo que sea justo uno de los suyos.
 */
export function QuickStyles<T extends object>({
  presets,
  current,
  onApply,
}: {
  presets: QuickStyle<T>[];
  current: T;
  onApply: (patch: Partial<T>) => void;
}) {
  const matches = (patch: Partial<T>) =>
    (Object.keys(patch) as (keyof T)[]).every((k) => current[k] === patch[k]);
  return (
    <div>
      <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-fg-subtle">Estilos rápidos</div>
      <div className="grid grid-cols-2 gap-2">
        {presets.map((p) => (
          <button
            key={p.name}
            type="button"
            onClick={() => onApply(p.patch)}
            aria-pressed={matches(p.patch)}
            className={cn(
              'relative rounded-lg border px-3 py-2.5 text-sm font-medium transition',
              matches(p.patch)
                ? 'border-primary text-primary ring-2 ring-primary/30'
                : 'border-border text-fg hover:border-border-strong',
            )}
          >
            {p.name}
            {p.recommended && (
              <span className="absolute -top-2 right-1.5 rounded-full bg-primary px-1.5 py-0.5 text-[0.6rem] font-semibold text-primary-fg">
                Recomendado
              </span>
            )}
          </button>
        ))}
      </div>
      <p className="mt-2 text-xs text-fg-muted">Ajustá los detalles abajo.</p>
    </div>
  );
}

/**
 * "Restablecer" de un panel: confirma y devuelve esa parte del tema a los
 * valores de fábrica. Vivía suelto en tres paneles y faltaba en los otros once,
 * así que deshacer un experimento dependía de en qué pantalla lo hubieras hecho.
 */
export function useSectionReset(update: (u: (t: ThemeConfig) => ThemeConfig) => void) {
  const confirm = useConfirm();
  return <K extends keyof ThemeConfig>(keys: K | K[], label: string) =>
    async () => {
      const list = Array.isArray(keys) ? keys : [keys];
      const ok = await confirm({
        title: `Restablecer ${label}`,
        message: `¿Volver ${label} a los valores por defecto?`,
        confirmLabel: 'Restablecer',
        variant: 'danger',
      });
      if (!ok) return;
      update((t) => {
        const next = { ...t };
        for (const k of list) next[k] = baseTheme[k];
        return next;
      });
    };
}

export function BackHeader({
  title,
  onBack,
  onReset,
}: {
  title: string;
  onBack: () => void;
  onReset?: () => void;
}) {
  return (
    <div className="flex items-center border-b border-border">
      <button
        onClick={onBack}
        className="flex flex-1 items-center gap-2 px-4 py-3 text-left text-sm font-semibold text-fg hover:bg-bg-muted"
      >
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
      <label htmlFor={controlId} className="mb-1.5 block text-sm font-medium text-fg">
        {label}
      </label>
      {el ? cloneElement(el, { id: controlId }) : children}
      {hint && <p className="mt-1 text-xs text-fg-muted">{hint}</p>}
    </div>
  );
}

export function ColorRow({
  label,
  hint,
  value,
  onChange,
  fallback,
}: {
  label: string;
  hint?: string;
  value: string;
  onChange: (raw: string) => void;
  fallback: string;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div>
        <div className="text-sm font-medium text-fg">{label}</div>
        {hint && <p className="text-xs text-fg-muted">{hint}</p>}
      </div>
      <input
        type="color"
        aria-label={label}
        value={rgbToHex(value, fallback)}
        onChange={(e) => onChange(hexToRgb(e.target.value))}
        className="h-8 w-12 shrink-0 cursor-pointer rounded border border-border-strong"
      />
    </div>
  );
}

export function Check({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-2 text-sm">
      <Checkbox checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}

export function TextInput({
  value,
  onChange,
  placeholder,
  id,
  type = 'text',
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  id?: string;
  /** 'date' para fechas: el navegador pone su propio selector. */
  type?: 'text' | 'date' | 'number' | 'url';
}) {
  return (
    <input
      id={id}
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={INPUT_FIELD}
    />
  );
}

export function TextArea({
  value,
  onChange,
  id,
}: {
  value: string;
  onChange: (v: string) => void;
  id?: string;
}) {
  return (
    <textarea
      id={id}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      rows={3}
      className={`w-full px-3 py-2 text-sm ${INPUT_BASE}`}
    />
  );
}

/** Lista de valores repetible (uno o varios): agregar / editar / quitar. */
export function StringList({
  label,
  hint,
  values,
  onChange,
  placeholder,
}: {
  label: string;
  hint?: string;
  values: string[];
  onChange: (v: string[]) => void;
  placeholder?: string;
}) {
  // Mismo markup visual que <Field>, pero asociando el <label> al primer input real.
  const firstId = useId();
  return (
    <div>
      <label htmlFor={firstId} className="mb-1.5 block text-sm font-medium text-fg">
        {label}
      </label>
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
            <button
              type="button"
              onClick={() => onChange(values.filter((_, idx) => idx !== i))}
              aria-label="Quitar"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-border text-fg-muted hover:bg-bg-muted"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => onChange([...values, ''])}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
        >
          <Plus className="h-4 w-4" /> Agregar
        </button>
      </div>
      {hint && <p className="mt-1 text-xs text-fg-muted">{hint}</p>}
    </div>
  );
}

export function Select({
  value,
  onChange,
  options,
  id,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  id?: string;
}) {
  return (
    <select
      id={id}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={`appearance-none ${INPUT_FIELD}`}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
