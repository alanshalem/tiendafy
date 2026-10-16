/**
 * Gráficos del panel de estadísticas — SVG puro, sin librerías, con los colores
 * del design system. El kit tenía una sola forma (la línea del Sparkline), así
 * que todo lo que no fuera una serie temporal terminaba mostrado como texto.
 *
 * Acá viven las tres formas que faltaban: barras por período, comparación
 * contra el período anterior y ranking horizontal (top productos, canales,
 * fuentes de tráfico).
 */
import { useId } from 'react';
import { cn } from '@tiendafy/ui';
import { formatNumber } from '../../lib/format';

const PRIMARY = 'rgb(var(--color-primary))';

/* ---------------- Barras verticales ---------------- */

interface BarPoint {
  /** Etiqueta del eje (día, mes, estado…). */
  label: string;
  value: number;
  /** Texto del tooltip nativo; por defecto, "label: value". */
  title?: string;
}

/**
 * Barras por período. Muestra hasta ~40 barras sin etiquetas apretadas: solo
 * rotula la primera, la última y la del máximo, que es lo que se lee de un
 * gráfico de días.
 */
export function BarChart({
  data,
  height = 160,
  format = (v) => formatNumber(v),
  className,
}: {
  data: BarPoint[];
  height?: number;
  format?: (value: number) => string;
  className?: string;
}) {
  if (data.length === 0) {
    return <EmptyViz height={height} />;
  }

  const max = Math.max(...data.map((d) => d.value), 1);
  const peak = data.reduce((best, d, i) => (d.value > data[best]!.value ? i : best), 0);

  return (
    <div className={cn('w-full', className)}>
      <div className="flex items-end gap-[2px]" style={{ height }}>
        {data.map((d, i) => {
          const h = Math.max(2, Math.round((d.value / max) * (height - 18)));
          const isPeak = i === peak && d.value > 0;
          return (
            <div key={`${d.label}-${i}`} className="group relative flex flex-1 flex-col justify-end">
              <div
                className={cn(
                  'w-full rounded-t transition-opacity',
                  isPeak ? 'opacity-100' : 'opacity-60 group-hover:opacity-100',
                )}
                style={{ height: h, background: PRIMARY }}
                title={d.title ?? `${d.label}: ${format(d.value)}`}
              />
            </div>
          );
        })}
      </div>
      <div className="mt-1.5 flex justify-between text-3xs text-fg-subtle">
        <span>{data[0]!.label}</span>
        {/* El pico solo se rotula si no es ya la primera ni la última: si no,
            la fecha aparece repetida en la misma línea. */}
        {data.length > 2 && peak !== 0 && peak !== data.length - 1 && (
          <span className="font-medium text-fg-muted">{data[peak]!.label}</span>
        )}
        <span>{data[data.length - 1]!.label}</span>
      </div>
    </div>
  );
}

/* ---------------- Ranking horizontal ---------------- */

interface RankRow {
  label: string;
  value: number;
  /** Texto a la derecha (importe formateado, porcentaje…). */
  display?: string;
  /** Nota bajo la etiqueta (unidades, margen…). */
  hint?: string;
}

/**
 * Top N con barra proporcional. Es la forma correcta de "los 5 que más…":
 * una tabla de números obliga a comparar de memoria, la barra se ve.
 */
export function RankBars({
  rows,
  emptyLabel = 'Sin datos todavía.',
  className,
}: {
  rows: RankRow[];
  emptyLabel?: string;
  className?: string;
}) {
  if (rows.length === 0) {
    return <p className="py-6 text-center text-sm text-fg-muted">{emptyLabel}</p>;
  }
  const max = Math.max(...rows.map((r) => r.value), 1);

  return (
    <ul className={cn('space-y-2.5', className)}>
      {rows.map((r) => (
        <li key={r.label}>
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="min-w-0 flex-1 truncate text-fg" title={r.label}>
              {r.label}
            </span>
            <span className="shrink-0 font-semibold tabular-nums text-fg">
              {r.display ?? formatNumber(r.value)}
            </span>
          </div>
          <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-bg-muted">
            <div
              className="h-full rounded-full"
              style={{ width: `${Math.max(2, (r.value / max) * 100)}%`, background: PRIMARY }}
            />
          </div>
          {r.hint && <p className="mt-0.5 text-xs text-fg-subtle">{r.hint}</p>}
        </li>
      ))}
    </ul>
  );
}

/* ---------------- Dona (participación) ---------------- */

interface Slice {
  label: string;
  value: number;
  /** Color CSS; por defecto una escala del color primario. */
  color?: string;
}

const SLICE_COLORS = [
  PRIMARY,
  'rgb(var(--color-info))',
  'rgb(var(--color-success))',
  'rgb(var(--color-warning))',
  'rgb(var(--color-fg-subtle))',
];

/** Participación de cada parte sobre el total (canales, estados, medios de pago). */
export function DonutChart({
  slices,
  size = 148,
  centerLabel,
  centerValue,
}: {
  slices: Slice[];
  size?: number;
  centerLabel?: string;
  centerValue?: string;
}) {
  const id = useId();
  const total = slices.reduce((s, x) => s + x.value, 0);
  if (total <= 0) return <EmptyViz height={size} />;

  const radius = size / 2 - 12;
  const circumference = 2 * Math.PI * radius;
  // Cada porción arranca donde terminó la anterior: los desplazamientos se
  // calculan antes de dibujar, no sumando dentro del map del render.
  const arcs = slices.reduce<
    { slice: (typeof slices)[number]; portion: number; dash: number; offset: number }[]
  >((acc, slice) => {
    const portion = slice.value / total;
    const prev = acc[acc.length - 1];
    return [
      ...acc,
      { slice, portion, dash: portion * circumference, offset: prev ? prev.offset + prev.dash : 0 },
    ];
  }, []);

  return (
    <div className="flex flex-wrap items-center gap-5">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="shrink-0">
        <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
          {arcs.map(({ slice: s, portion, dash, offset }, i) => (
            <circle
              key={`${id}-${s.label}`}
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              stroke={s.color ?? SLICE_COLORS[i % SLICE_COLORS.length]}
              strokeWidth="14"
              strokeDasharray={`${dash} ${circumference - dash}`}
              strokeDashoffset={-offset}
            >
              <title>{`${s.label}: ${Math.round(portion * 100)}%`}</title>
            </circle>
          ))}
        </g>
        {centerValue && (
          <>
            <text
              x="50%"
              y="47%"
              textAnchor="middle"
              className="fill-fg text-[0.95rem] font-bold"
              style={{ fontSize: '0.95rem' }}
            >
              {centerValue}
            </text>
            <text
              x="50%"
              y="62%"
              textAnchor="middle"
              className="fill-fg-subtle"
              style={{ fontSize: '0.6rem' }}
            >
              {centerLabel}
            </text>
          </>
        )}
      </svg>

      <ul className="min-w-[8rem] flex-1 space-y-1.5 text-sm">
        {slices.map((s, i) => (
          <li key={s.label} className="flex items-center gap-2">
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ background: s.color ?? SLICE_COLORS[i % SLICE_COLORS.length] }}
            />
            <span className="min-w-0 flex-1 truncate text-fg-muted">{s.label}</span>
            <span className="shrink-0 font-medium tabular-nums text-fg">
              {Math.round((s.value / total) * 100)}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ---------------- Comparación con el período anterior ---------------- */

/**
 * "▲ 12% vs. período anterior". Un número solo no dice nada: lo que el
 * comerciante quiere saber es si viene mejor o peor que antes.
 */
export function Delta({ current, previous }: { current: number; previous: number }) {
  if (previous <= 0) {
    return <span className="text-xs text-fg-subtle">sin período previo para comparar</span>;
  }

  const pct = ((current - previous) / previous) * 100;
  const flat = Math.abs(pct) < 0.5;
  const up = pct > 0;
  // Un período anterior casi vacío dispara porcentajes de cuatro cifras que no
  // dicen nada: a partir de ahí, el número exacto deja de ser información.
  const huge = Math.abs(pct) > 999;

  return (
    <span
      className={cn('text-xs font-medium', flat ? 'text-fg-subtle' : up ? 'text-success' : 'text-danger')}
      title="Comparado con el período anterior de la misma duración"
    >
      {flat ? '=' : up ? '▲' : '▼'} {huge ? '+999' : Math.abs(pct).toFixed(pct >= 10 || pct <= -10 ? 0 : 1)}%
      vs. antes
    </span>
  );
}

function EmptyViz({ height }: { height: number }) {
  return (
    <div
      className="flex items-center justify-center rounded-md border border-dashed border-border text-xs text-fg-subtle"
      style={{ height }}
    >
      Sin datos en este período
    </div>
  );
}
