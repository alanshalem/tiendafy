import { useId, type ReactNode } from 'react';
import { cn } from '@tiendafy/ui';

/*
 * Selectores visuales del editor de secciones: en vez de una lista
 * desplegable con "Apaisada (16:9)" o "A la izquierda del texto", una fila
 * de opciones con un dibujito de lo que se elige (la forma, el lado, las
 * columnas). Se ve todo a la vez y se compara de un vistazo.
 *
 * Son radios de verdad (se recorren con las flechas, tienen nombre para el
 * lector de pantalla) con casillas de 40 px o más para el dedo.
 */

export interface Choice<V extends string> {
  value: V;
  /** Lo que se lee debajo del dibujo (corto: "16:9", "Izquierda"). */
  label: string;
  /** El dibujito. Sin dibujo, la opción es solo el texto. */
  icon?: ReactNode;
  /** Nombre completo para el lector de pantalla y el tooltip, si `label` no alcanza. */
  title?: string;
}

export function ChoiceGroup<V extends string>({
  label,
  hint,
  value,
  onChange,
  options,
  columns,
}: {
  label: string;
  hint?: string;
  value: V;
  onChange: (v: V) => void;
  options: readonly Choice<V>[];
  /** Cuántas por fila. Por defecto, todas en una (hasta 4). */
  columns?: number;
}) {
  const name = useId();
  const labelId = useId();
  const hintId = useId();
  const cols = columns ?? Math.min(options.length, 4);
  return (
    <div role="radiogroup" aria-labelledby={labelId} aria-describedby={hint ? hintId : undefined}>
      <div id={labelId} className="mb-1.5 text-sm font-medium text-fg">
        {label}
      </div>
      <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
        {options.map((o) => {
          const active = o.value === value;
          return (
            <label
              key={o.value}
              title={o.title ?? o.label}
              className={cn(
                'relative flex min-h-10 cursor-pointer flex-col items-center justify-center gap-1 rounded-md border px-1 py-1.5 text-center text-xs transition-colors',
                'has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-primary',
                active
                  ? 'border-primary bg-primary/[0.08] font-semibold text-fg ring-1 ring-primary'
                  : 'border-border text-fg-muted hover:border-border-strong hover:text-fg',
              )}
            >
              <input
                type="radio"
                name={name}
                value={o.value}
                checked={active}
                onChange={() => onChange(o.value)}
                aria-label={o.title ?? o.label}
                className="sr-only"
              />
              {o.icon && (
                <span aria-hidden className={cn(active ? 'text-primary' : 'text-fg-subtle')}>
                  {o.icon}
                </span>
              )}
              <span className="leading-tight">{o.label}</span>
            </label>
          );
        })}
      </div>
      {hint && (
        <p id={hintId} className="mt-1 text-xs text-fg-muted">
          {hint}
        </p>
      )}
    </div>
  );
}

/* ---- Dibujitos (28 × 20, con currentColor) ---- */

const Svg = ({ children }: { children: ReactNode }) => (
  <svg viewBox="0 0 28 20" width="28" height="20" fill="none" stroke="currentColor" strokeWidth="1.5">
    {children}
  </svg>
);

/** Un rectángulo con la proporción "ancho x alto" ("16x9", "1x1"…), centrado en la caja. */
export function RatioIcon({ ratio }: { ratio: string }) {
  const [w, h] = ratio.split(/[x:]/).map(Number);
  if (!w || !h) {
    // 'original' / 'auto': una foto con las esquinas marcadas (la que venga).
    return (
      <Svg>
        <path d="M5 7V3h4M19 3h4v4M23 13v4h-4M9 17H5v-4" strokeLinecap="round" />
      </Svg>
    );
  }
  const scale = Math.min(24 / w, 16 / h);
  const rw = w * scale;
  const rh = h * scale;
  return (
    <Svg>
      <rect x={(28 - rw) / 2} y={(20 - rh) / 2} width={rw} height={rh} rx="1.5" />
    </Svg>
  );
}

/** Imagen (bloque lleno) y texto (rayas) a un lado, o la imagen arriba. */
export function SideIcon({ image }: { image: 'left' | 'right' | 'top' }) {
  if (image === 'top')
    return (
      <Svg>
        <rect x="7" y="2" width="14" height="8" rx="1" fill="currentColor" stroke="none" opacity=".55" />
        <path d="M8 13h12M8 16.5h8" strokeLinecap="round" />
      </Svg>
    );
  const imgX = image === 'left' ? 2 : 15;
  const txtX = image === 'left' ? 16 : 3;
  return (
    <Svg>
      <rect x={imgX} y="3" width="11" height="14" rx="1" fill="currentColor" stroke="none" opacity=".55" />
      <path d={`M${txtX} 7h9M${txtX} 10.5h9M${txtX} 14h6`} strokeLinecap="round" />
    </Svg>
  );
}

/** Uno grande y dos chicos (collage), con el grande a un lado. */
export function CollageIcon({ big }: { big: 'left' | 'right' }) {
  const bx = big === 'left' ? 2 : 15;
  const sx = big === 'left' ? 16 : 3;
  return (
    <Svg>
      <rect x={bx} y="2" width="11" height="16" rx="1" fill="currentColor" stroke="none" opacity=".55" />
      <rect x={sx} y="2" width="9" height="7" rx="1" />
      <rect x={sx} y="11" width="9" height="7" rx="1" />
    </Svg>
  );
}

/** Forma de una foto: círculo, cuadrado o vertical. */
export function ShapeIcon({ shape }: { shape: 'circle' | 'square' | 'portrait' }) {
  return (
    <Svg>
      {shape === 'circle' ? (
        <circle cx="14" cy="10" r="7.5" />
      ) : shape === 'square' ? (
        <rect x="6.5" y="2.5" width="15" height="15" rx="2" />
      ) : (
        <rect x="8" y="1.5" width="12" height="17" rx="2" />
      )}
    </Svg>
  );
}

/** N columnas lado a lado. */
export function ColumnsIcon({ n }: { n: number }) {
  const gap = 1.5;
  const w = (24 - gap * (n - 1)) / n;
  return (
    <Svg>
      {Array.from({ length: n }, (_, i) => (
        <rect
          key={i}
          x={2 + i * (w + gap)}
          y="4"
          width={w}
          height="12"
          rx="1"
          fill="currentColor"
          stroke="none"
          opacity=".55"
        />
      ))}
    </Svg>
  );
}

/** Cómo se acomodan varias cosas: grilla, carrusel (la última asomada), apiladas. */
export function LayoutIcon({ layout }: { layout: 'grid' | 'carousel' | 'stack' }) {
  if (layout === 'grid')
    return (
      <Svg>
        {[2, 11, 20].map((x) =>
          [2, 11].map((y) => <rect key={`${x}-${y}`} x={x} y={y} width="6" height="7" rx="1" />),
        )}
      </Svg>
    );
  if (layout === 'carousel')
    return (
      <Svg>
        <rect x="1" y="4" width="10" height="12" rx="1" fill="currentColor" stroke="none" opacity=".55" />
        <rect x="13" y="4" width="10" height="12" rx="1" />
        <path d="M25 4h1.5M25 16h1.5" strokeLinecap="round" />
      </Svg>
    );
  return (
    <Svg>
      <rect x="6" y="2" width="16" height="4.5" rx="1" />
      <rect x="6" y="8" width="16" height="4.5" rx="1" />
      <rect x="6" y="14" width="16" height="4.5" rx="1" />
    </Svg>
  );
}

/** Opciones de proporción como selector visual ("16x9" → dibujo + "16:9"). */
export function ratioChoices<V extends string>(values: readonly V[], labels?: Partial<Record<V, string>>) {
  return values.map((v) => ({
    value: v,
    label: labels?.[v] ?? v.replace('x', ':'),
    icon: <RatioIcon ratio={v} />,
  }));
}
