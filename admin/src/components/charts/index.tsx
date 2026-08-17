/**
 * Kit de gráficos liviano — SVG puro, sin librerías. Colores por tokens
 * del design system (primary = bermellón + tints). Pensado para los
 * dashboards de estadísticas.
 */
import { useId, type ReactNode } from 'react';
import { cn } from '@tiendafy/ui';
import { SETTINGS_CARD } from '../../lib/styles';

const PRIMARY = 'rgb(var(--color-primary))';

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
    <div className={cn(SETTINGS_CARD, className)}>
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

function InfoDot() {
  return (
    <span
      className="inline-flex h-3.5 w-3.5 items-center justify-center rounded-full border border-fg-subtle text-[0.55rem] font-bold text-fg-subtle"
      aria-hidden="true"
    >
      i
    </span>
  );
}
