/**
 * Kit de gráficos liviano — SVG puro, sin librerías. Colores por tokens
 * del design system (primary = bermellón + tints). Pensado para los
 * dashboards de estadísticas.
 */
import { useId, type ReactNode } from 'react';
import { cn } from '@tiendafy/ui';

const PRIMARY = 'rgb(var(--color-primary))';
const PRIMARY_SOFT = 'rgb(var(--color-primary) / 0.45)';
const GRID = 'rgb(var(--color-fg) / 0.08)';
const AXIS = 'rgb(var(--color-fg) / 0.45)';

/* ---------------- Sparkline ---------------- */
export function Sparkline({ data, className }: { data: number[]; className?: string }) {
  const id = useId();
  const w = 280;
  const h = 64;
  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const span = max - min || 1;
  const step = w / Math.max(data.length - 1, 1);
  const pts = data.map((v, i) => [i * step, h - ((v - min) / span) * (h - 8) - 4] as const);
  const line = pts.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const area = `${line} L${w},${h} L0,${h} Z`;

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className={cn('w-full', className)} preserveAspectRatio="none">
      <defs>
        <linearGradient id={`spark-${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={PRIMARY} stopOpacity="0.22" />
          <stop offset="100%" stopColor={PRIMARY} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#spark-${id})`} />
      <path d={line} fill="none" stroke={PRIMARY} strokeWidth="2" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

/* ---------------- Vertical bar chart (grouped) ---------------- */
export interface BarSeries {
  label: string;
  color: 'primary' | 'soft';
  values: number[];
}

export function BarChart({
  categories,
  series,
  height = 220,
  formatY,
}: {
  categories: string[];
  series: BarSeries[];
  height?: number;
  formatY?: (n: number) => string;
}) {
  const allValues = series.flatMap((s) => s.values);
  const max = Math.max(...allValues, 1);
  const ticks = niceTicks(max, 4);
  const top = ticks[ticks.length - 1]!;
  const padL = 44;
  const padB = 28;
  const w = 720;
  const plotW = w - padL - 8;
  const plotH = height - padB - 8;
  const groupW = plotW / categories.length;
  const barW = Math.min(34, (groupW * 0.6) / series.length);

  return (
    <svg viewBox={`0 0 ${w} ${height}`} className="w-full">
      {ticks.map((t) => {
        const y = 8 + plotH - (t / top) * plotH;
        return (
          <g key={t}>
            <line x1={padL} y1={y} x2={w - 8} y2={y} stroke={GRID} strokeWidth="1" />
            <text x={padL - 8} y={y + 3} textAnchor="end" fontSize="10" fill={AXIS}>
              {formatY ? formatY(t) : t}
            </text>
          </g>
        );
      })}
      {categories.map((cat, ci) => {
        const groupX = padL + ci * groupW;
        const totalBarsW = barW * series.length + 4 * (series.length - 1);
        const startX = groupX + (groupW - totalBarsW) / 2;
        return (
          <g key={cat}>
            {series.map((s, si) => {
              const v = s.values[ci] ?? 0;
              const barH = (v / top) * plotH;
              const x = startX + si * (barW + 4);
              const y = 8 + plotH - barH;
              return (
                <rect
                  key={s.label}
                  x={x}
                  y={y}
                  width={barW}
                  height={Math.max(barH, 1)}
                  rx="3"
                  fill={s.color === 'primary' ? PRIMARY : PRIMARY_SOFT}
                />
              );
            })}
            <text x={groupX + groupW / 2} y={height - 8} textAnchor="middle" fontSize="10" fill={AXIS}>
              {cat}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/* ---------------- Horizontal bar chart ---------------- */
export function HBarChart({
  rows,
  formatValue,
}: {
  rows: { label: string; value: number }[];
  formatValue?: (n: number) => string;
}) {
  const max = Math.max(...rows.map((r) => r.value), 1);
  return (
    <div className="space-y-3">
      {rows.map((row) => (
        <div key={row.label} className="grid grid-cols-[8rem_1fr_auto] items-center gap-3 text-sm">
          <span className="truncate text-fg-muted" title={row.label}>
            {row.label}
          </span>
          <div className="h-5 overflow-hidden rounded-sm bg-bg-muted">
            <div
              className="h-full rounded-sm bg-primary transition-all"
              style={{ width: `${(row.value / max) * 100}%` }}
            />
          </div>
          <span className="w-12 text-right font-medium tabular-nums text-fg">
            {formatValue ? formatValue(row.value) : row.value}
          </span>
        </div>
      ))}
    </div>
  );
}

/* ---------------- Donut chart ---------------- */
export function DonutChart({
  segments,
  size = 160,
}: {
  segments: { label: string; value: number; tint: number }[];
  size?: number;
}) {
  const total = segments.reduce((s, x) => s + x.value, 0) || 1;
  const r = size / 2 - 14;
  const c = 2 * Math.PI * r;
  let offset = 0;

  return (
    <div className="flex items-center gap-5">
      <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} className="shrink-0 -rotate-90">
        {segments.map((seg) => {
          const frac = seg.value / total;
          const dash = frac * c;
          const el = (
            <circle
              key={seg.label}
              cx={size / 2}
              cy={size / 2}
              r={r}
              fill="none"
              stroke={`rgb(var(--color-primary) / ${seg.tint})`}
              strokeWidth="14"
              strokeDasharray={`${dash} ${c - dash}`}
              strokeDashoffset={-offset}
            />
          );
          offset += dash;
          return el;
        })}
      </svg>
      <ul className="space-y-1.5 text-sm">
        {segments.map((seg) => (
          <li key={seg.label} className="flex items-center gap-2">
            <span
              className="h-2.5 w-2.5 rounded-full"
              style={{ background: `rgb(var(--color-primary) / ${seg.tint})` }}
            />
            <span className="text-fg-muted">{seg.label}</span>
            <span className="ml-auto font-medium text-fg">
              {Math.round((seg.value / total) * 100)}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ---------------- Area chart ---------------- */
export function AreaChart({ data, height = 180 }: { data: number[]; height?: number }) {
  const id = useId();
  const w = 720;
  const padB = 24;
  const plotH = height - padB - 8;
  const max = Math.max(...data, 1);
  const step = w / Math.max(data.length - 1, 1);
  const pts = data.map((v, i) => [i * step, 8 + plotH - (v / max) * plotH] as const);
  const line = pts.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const area = `${line} L${w},${8 + plotH} L0,${8 + plotH} Z`;

  return (
    <svg viewBox={`0 0 ${w} ${height}`} className="w-full">
      <defs>
        <linearGradient id={`area-${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={PRIMARY} stopOpacity="0.25" />
          <stop offset="100%" stopColor={PRIMARY} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#area-${id})`} />
      <path d={line} fill="none" stroke={PRIMARY} strokeWidth="2" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

/* ---------------- Heatmap ---------------- */
export function Heatmap({ rows, cols, data }: { rows: string[]; cols: number; data: number[][] }) {
  const max = Math.max(...data.flat(), 1);
  return (
    <div className="space-y-1">
      {data.map((row, ri) => (
        <div key={ri} className="grid grid-cols-[7rem_1fr] items-center gap-2">
          <span className="truncate text-xs text-fg-muted">{rows[ri]}</span>
          <div className="flex gap-0.5">
            {row.slice(0, cols).map((v, ci) => (
              <span
                key={ci}
                className="h-4 flex-1 rounded-[2px]"
                style={{ background: `rgb(var(--color-primary) / ${(v / max) * 0.85 + 0.05})` }}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ---------------- Legend ---------------- */
export function Legend({ items }: { items: { label: string; tint: number }[] }) {
  return (
    <div className="flex flex-wrap items-center gap-4 text-xs text-fg-muted">
      {items.map((it) => (
        <span key={it.label} className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ background: `rgb(var(--color-primary) / ${it.tint})` }} />
          {it.label}
        </span>
      ))}
    </div>
  );
}

/* ---------------- helpers ---------------- */
function niceTicks(max: number, count: number): number[] {
  const raw = max / count;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const norm = raw / mag;
  const nice = norm >= 5 ? 10 : norm >= 2 ? 5 : norm >= 1 ? 2 : 1;
  const stepV = nice * mag;
  const top = Math.ceil(max / stepV) * stepV;
  const ticks: number[] = [];
  for (let v = 0; v <= top + 1e-9; v += stepV) ticks.push(Math.round(v));
  return ticks;
}

/* ---------------- Card wrapper for charts ---------------- */
export function ChartCard({
  title,
  info,
  action,
  children,
  className,
}: {
  title: string;
  info?: boolean;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('rounded-lg border border-border bg-surface p-5 shadow-card', className)}>
      <div className="mb-4 flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-1.5 text-sm font-semibold text-fg">
          {title}
          {info && <InfoDot />}
        </h3>
        {action}
      </div>
      {children}
    </div>
  );
}

export function InfoDot() {
  return (
    <span
      className="inline-flex h-3.5 w-3.5 items-center justify-center rounded-full border border-fg-subtle text-[0.55rem] font-bold text-fg-subtle"
      aria-hidden="true"
    >
      i
    </span>
  );
}
