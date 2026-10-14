import { Checkbox, cn, useConfirm } from '@tiendafy/ui';
import { useId, useState, isValidElement, cloneElement, type ReactNode, type ReactElement } from 'react';
import { ChevronDown, ChevronLeft, Plus, X } from 'lucide-react';
import { LONG_TEXT_MAX, SHORT_TEXT_MAX, URL_MAX, type ThemeConfig, baseTheme } from '@tiendafy/types';

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
  /** Miniatura de cómo queda (opcional): el nombre solo no dice mucho. */
  thumb?: ReactNode;
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
              'relative rounded-lg border text-sm font-medium transition',
              p.thumb ? 'p-1.5 pb-2' : 'px-3 py-2.5',
              matches(p.patch)
                ? 'border-primary text-primary ring-2 ring-primary/30'
                : 'border-border text-fg hover:border-border-strong',
            )}
          >
            {p.thumb && <span className="mb-1.5 block overflow-hidden rounded">{p.thumb}</span>}
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

/**
 * El <label> de un control que no está adentro de un <Field> (Field le pasa
 * el `id` y pone el suyo): el `label` que se le pasó (visible) o, si solo
 * trae un ejemplo en el placeholder, ese texto para lectores de pantalla. Un
 * campo con solo placeholder no tiene nombre: cuando se escribe algo, el
 * placeholder desaparece y el lector de pantalla dice "campo de edición" a
 * secas.
 */
function OwnLabel({
  htmlFor,
  labelled,
  label,
  fallback,
}: {
  htmlFor: string;
  /** Ya tiene un <label for> afuera (vino con `id`). */
  labelled: boolean;
  label?: string;
  fallback?: string;
}) {
  if (labelled && !label) return null;
  if (label)
    return (
      <label htmlFor={htmlFor} className="mb-1.5 block text-sm font-medium text-fg">
        {label}
      </label>
    );
  return fallback ? (
    <label htmlFor={htmlFor} className="sr-only">
      {fallback}
    </label>
  ) : null;
}

/** Desde qué parte del máximo se muestra la cuenta de caracteres. */
const COUNTER_FROM = 0.8;

/**
 * "183/200" debajo del campo cuando se acerca al tope. El servidor rechaza un
 * título de más de 200 o un texto de más de 2000, y antes uno se enteraba por
 * un aviso de error después de escribir.
 */
function CharCounter({ id, length, max }: { id: string; length: number; max: number }) {
  if (length < max * COUNTER_FROM) return null;
  return (
    <p id={id} className={cn('mt-1 text-right text-xs', length >= max ? 'text-warning' : 'text-fg-subtle')}>
      {length}/{max}
      {length >= max && <span className="sr-only"> Llegaste al máximo de caracteres.</span>}
    </p>
  );
}

export function ColorRow({
  label,
  hint,
  value,
  onChange,
  fallback,
  onAuto,
  autoLabel = 'Automático',
  autoValue,
  autoHint,
}: {
  label: string;
  hint?: string;
  value: string;
  onChange: (raw: string) => void;
  /** Hex que muestra el selector mientras el valor está vacío (= automático). */
  fallback: string;
  /**
   * El color admite "automático" (valor vacío): con valor, un botón para
   * volver a automático; sin valor, se dice que lo es. Antes un color vacío
   * se veía igual que uno elegido y no había forma de volver atrás.
   */
  onAuto?: () => void;
  autoLabel?: string;
  /** El color "R G B" que se usa en automático: el selector lo muestra mientras el valor está vacío. */
  autoValue?: string;
  /** Lo que se lee debajo mientras está en automático. */
  autoHint?: string;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <div className="text-sm font-medium text-fg">{label}</div>
        {hint && <p className="text-xs text-fg-muted">{hint}</p>}
        {onAuto &&
          (value ? (
            <button
              type="button"
              onClick={onAuto}
              className="mt-0.5 text-xs font-medium text-primary hover:underline"
            >
              Volver a {autoLabel.toLowerCase()}
            </button>
          ) : (
            <p className="mt-0.5 text-xs text-fg-muted">{autoHint ?? `${autoLabel}: el que mejor se lee`}</p>
          ))}
      </div>
      <input
        type="color"
        aria-label={label}
        value={rgbToHex(value || autoValue || '', fallback)}
        onChange={(e) => onChange(hexToRgb(e.target.value))}
        className="h-8 w-12 shrink-0 cursor-pointer rounded border border-border-strong"
      />
    </div>
  );
}

/** Sección plegable para paneles largos: título clickeable + cuerpo. */
export function Collapsible({
  title,
  children,
  defaultOpen = true,
}: {
  title: string;
  children: ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-t border-border pt-4">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between text-sm font-semibold text-fg"
      >
        {title}
        <ChevronDown className={cn('h-4 w-4 text-fg-muted transition-transform', open ? 'rotate-180' : '')} />
      </button>
      {open && <div className="mt-3">{children}</div>}
    </div>
  );
}

const SEG_COLS = { 2: 'grid-cols-2', 3: 'grid-cols-3', 4: 'grid-cols-2' } as const;

/**
 * Grupo de opciones tipo segmented (3 botones; 4 van en dos filas: el panel
 * es angosto). Cada opción puede llevar un dibujito (`visual`) cuando lo que
 * se elige se ve: un tamaño, un borde, una disposición.
 */
export function SegGroup<T extends string>({
  value,
  options,
  onChange,
  columns = 3,
  labelledBy,
}: {
  value: T;
  options: { value: T; label: string; visual?: ReactNode }[];
  onChange: (v: T) => void;
  columns?: 2 | 3 | 4;
  labelledBy?: string;
}) {
  return (
    <div className={cn('grid gap-2', SEG_COLS[columns])} role="group" aria-labelledby={labelledBy}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          aria-pressed={value === o.value}
          className={cn(
            'min-h-10 rounded-lg border px-2 py-2 text-xs font-medium transition',
            o.visual && 'flex flex-col items-center justify-end gap-1.5',
            value === o.value
              ? 'border-primary text-primary ring-2 ring-primary/30'
              : 'border-border text-fg hover:border-border-strong',
          )}
        >
          {o.visual}
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Un selector con nombre arriba (como Field) para un SegGroup. */
export function SegField<T extends string>({
  label,
  hint,
  ...seg
}: { label: string; hint?: string } & Parameters<typeof SegGroup<T>>[0]) {
  const id = useId();
  return (
    <div>
      <div id={id} className="mb-1.5 text-sm font-medium text-fg">
        {label}
      </div>
      <SegGroup labelledBy={id} {...seg} />
      {hint && <p className="mt-1 text-xs text-fg-muted">{hint}</p>}
    </div>
  );
}

export function Check({
  label,
  checked,
  onChange,
  hint,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  /** Para qué sirve, debajo (alineado con el texto, no con la casilla). */
  hint?: string;
}) {
  const box = (
    <label className="flex items-center gap-2 text-sm">
      <Checkbox checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
  if (!hint) return box;
  return (
    <div>
      {box}
      <p className="mt-0.5 pl-6 text-xs text-fg-muted">{hint}</p>
    </div>
  );
}

/** Tope por defecto según el tipo: el mismo que valida el servidor. */
const DEFAULT_MAX: Record<string, number | undefined> = { text: SHORT_TEXT_MAX, url: URL_MAX };

export function TextInput({
  value,
  onChange,
  placeholder,
  id,
  type = 'text',
  maxLength,
  label,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  id?: string;
  /** 'date' para fechas: el navegador pone su propio selector. */
  type?: 'text' | 'date' | 'number' | 'url';
  /** Máximo de caracteres. Por defecto 200 (2000 en links); `false` = sin tope. */
  maxLength?: number | false;
  /** Nombre visible del campo cuando no va adentro de un <Field>. */
  label?: string;
}) {
  const ownId = useId();
  const inputId = id ?? ownId;
  const counterId = `${inputId}-count`;
  const max = maxLength === false ? undefined : (maxLength ?? DEFAULT_MAX[type]);
  const nearMax = max !== undefined && value.length >= max * COUNTER_FROM;
  return (
    <>
      <OwnLabel htmlFor={inputId} labelled={id !== undefined} label={label} fallback={placeholder} />
      <input
        id={inputId}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        maxLength={max}
        aria-describedby={nearMax ? counterId : undefined}
        className={INPUT_FIELD}
      />
      {max !== undefined && <CharCounter id={counterId} length={value.length} max={max} />}
    </>
  );
}

export function TextArea({
  value,
  onChange,
  id,
  placeholder,
  rows = 3,
  maxLength,
  label,
}: {
  value: string;
  onChange: (v: string) => void;
  id?: string;
  placeholder?: string;
  rows?: number;
  /** Máximo de caracteres. Por defecto 2000 (lo que acepta el servidor); `false` = sin tope. */
  maxLength?: number | false;
  /** Nombre visible del campo cuando no va adentro de un <Field>. */
  label?: string;
}) {
  const ownId = useId();
  const inputId = id ?? ownId;
  const counterId = `${inputId}-count`;
  const max = maxLength === false ? undefined : (maxLength ?? LONG_TEXT_MAX);
  const nearMax = max !== undefined && value.length >= max * COUNTER_FROM;
  return (
    <>
      <OwnLabel htmlFor={inputId} labelled={id !== undefined} label={label} fallback={placeholder} />
      <textarea
        id={inputId}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={rows}
        maxLength={max}
        aria-describedby={nearMax ? counterId : undefined}
        className={`w-full px-3 py-2 text-sm ${INPUT_BASE}`}
      />
      {max !== undefined && <CharCounter id={counterId} length={value.length} max={max} />}
    </>
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
              // El primero lo nombra el <label>; los demás, "Teléfonos 2", "Teléfonos 3"…
              aria-label={i === 0 ? undefined : `${label} ${i + 1}`}
              maxLength={SHORT_TEXT_MAX}
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
  label,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  id?: string;
  /** Nombre visible del campo cuando no va adentro de un <Field>. */
  label?: string;
}) {
  const ownId = useId();
  const selectId = id ?? ownId;
  return (
    <>
      <OwnLabel htmlFor={selectId} labelled={id !== undefined} label={label} />
      <select
        id={selectId}
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
    </>
  );
}
