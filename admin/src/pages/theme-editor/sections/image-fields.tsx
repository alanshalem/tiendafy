import { useId, useLayoutEffect, useRef, type ReactNode } from 'react';
import { TriangleAlert } from 'lucide-react';
import { Checkbox, cn } from '@tiendafy/ui';
import { TEXT_POSITIONS, type Overlay, type TextPosition } from '@tiendafy/types';
import { MediaUploadList } from '../../../components/upload/MediaUpload';
import type { UploadKind } from '../../../lib/uploads';
import { Field, Select } from '../../theme-editor-inputs';

/*
 * Piezas de los editores de las secciones de imágenes (hero, carrusel,
 * banners, imagen y texto, marcas): dónde va el texto, el velo sobre la
 * foto, el aviso de legibilidad y "subir varias de una vez".
 */

const POSITION_LABEL: Record<TextPosition, string> = {
  'top-left': 'Arriba a la izquierda',
  'top-center': 'Arriba al centro',
  'top-right': 'Arriba a la derecha',
  'center-left': 'Al medio a la izquierda',
  center: 'En el centro',
  'center-right': 'Al medio a la derecha',
  'bottom-left': 'Abajo a la izquierda',
  'bottom-center': 'Abajo al centro',
  'bottom-right': 'Abajo a la derecha',
};

/**
 * Dónde va el texto sobre la foto: una grilla de 3×3 que se parece a lo que
 * se elige. Son radios de verdad (se recorren con las flechas del teclado),
 * cada casilla de 40 px.
 */
export function PositionPicker({
  label = 'Posición del texto',
  value,
  onChange,
  allowed = TEXT_POSITIONS,
}: {
  label?: string;
  value: TextPosition;
  onChange: (v: TextPosition) => void;
  /** Las posiciones que tienen sentido (todas por defecto). */
  allowed?: readonly TextPosition[];
}) {
  const name = useId();
  const labelId = useId();
  return (
    <div role="radiogroup" aria-labelledby={labelId}>
      <div id={labelId} className="mb-1.5 text-sm font-medium text-fg">
        {label}
      </div>
      <div className="flex items-center gap-3">
        <div className="grid w-fit grid-cols-3 gap-1 rounded-md border border-border bg-bg-muted p-1">
          {TEXT_POSITIONS.map((p) => {
            const enabled = allowed.includes(p);
            return (
              <label
                key={p}
                title={POSITION_LABEL[p]}
                className={cn(
                  'relative flex h-10 w-10 items-center justify-center rounded',
                  enabled ? 'cursor-pointer hover:bg-surface' : 'opacity-30',
                  value === p && 'bg-primary/10 ring-2 ring-primary',
                )}
              >
                <input
                  type="radio"
                  name={name}
                  value={p}
                  checked={value === p}
                  disabled={!enabled}
                  onChange={() => onChange(p)}
                  aria-label={POSITION_LABEL[p]}
                  className="peer sr-only"
                />
                <span
                  aria-hidden
                  className={cn(
                    'block h-1.5 w-4 rounded-full peer-focus-visible:outline-2 peer-focus-visible:outline-offset-4 peer-focus-visible:outline-primary',
                    value === p ? 'bg-primary' : 'bg-fg-subtle',
                  )}
                />
              </label>
            );
          })}
        </div>
        <span className="text-xs text-fg-muted">{POSITION_LABEL[value]}</span>
      </div>
    </div>
  );
}

export const OVERLAY_OPTIONS: { value: Overlay; label: string }[] = [
  { value: 'none', label: 'Nada' },
  { value: 'light', label: 'Leve' },
  { value: 'medium', label: 'Medio' },
  { value: 'strong', label: 'Fuerte' },
];

export function OverlayField({
  value,
  onChange,
  label = 'Oscurecer la foto (para que se lea el texto)',
}: {
  value: Overlay;
  onChange: (v: Overlay) => void;
  label?: string;
}) {
  return (
    <Field label={label}>
      <Select value={value} onChange={(v) => onChange(v as Overlay)} options={OVERLAY_OPTIONS} />
    </Field>
  );
}

/** Una casilla con toda la fila tocable (40 px de alto), no solo el cuadradito. */
export function CheckRow({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex min-h-10 cursor-pointer items-center gap-2 text-sm">
      <Checkbox checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}

/** Un aviso que no bloquea (legibilidad, falta un texto alternativo…). */
export function EditorWarning({ children }: { children: ReactNode }) {
  return (
    <p role="status" className="flex gap-1.5 rounded-md bg-warning/10 p-2 text-xs text-fg">
      <TriangleAlert className="mt-px h-3.5 w-3.5 shrink-0 text-warning" aria-hidden />
      <span>{children}</span>
    </p>
  );
}

/** Opciones de proporción ("ancho x alto"), con un nombre que se entiende. */
export const RATIO_LABEL: Record<string, string> = {
  '3x1': 'Muy apaisada (3:1)',
  '2x1': 'Apaisada (2:1)',
  '16x9': 'Apaisada (16:9)',
  '4x3': 'Casi cuadrada (4:3)',
  '1x1': 'Cuadrada (1:1)',
  '4x5': 'Vertical (4:5)',
  '3x4': 'Vertical (3:4)',
  original: 'La de la foto (sin recortar)',
};

export const ratioOptions = (values: readonly string[]) =>
  values.map((v) => ({ value: v, label: RATIO_LABEL[v] ?? v }));

/**
 * Subir varias fotos de una vez y que cada una sea un ítem nuevo (una
 * diapositiva, un logo). Las subidas terminan de a una: cada ítem se suma a
 * la lista más reciente, no a la de cuando se eligieron los archivos.
 */
export function BulkImageAdd<T>({
  kind,
  label,
  items,
  max,
  onChange,
  create,
}: {
  kind: UploadKind;
  label: string;
  items: T[];
  max: number;
  onChange: (items: T[]) => void;
  create: (url: string) => T;
}) {
  const latest = useRef(items);
  useLayoutEffect(() => {
    latest.current = items;
  });
  if (items.length >= max) return null;
  return (
    <details className="rounded-md border border-dashed border-border-strong">
      <summary className="flex min-h-10 cursor-pointer items-center px-3 text-sm font-medium text-primary">
        {label}
      </summary>
      <div className="p-2 pt-0">
        <MediaUploadList
          kind={kind}
          values={[]}
          onChange={(urls) => {
            const url = urls.at(-1);
            if (!url || latest.current.length >= max) return;
            latest.current = [...latest.current, create(url)];
            onChange(latest.current);
          }}
        />
      </div>
    </details>
  );
}
