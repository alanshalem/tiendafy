/**
 * Kit de gráficos liviano — SVG puro, sin librerías. Colores por tokens
 * del design system (primary = bermellón + tints). Pensado para los
 * dashboards de estadísticas.
 */
import { useId, type ReactNode } from 'react';
import { cn, Tooltip } from '@tiendafy/ui';
import { SETTINGS_CARD } from '../../lib/styles';

const PRIMARY = 'rgb(var(--color-primary))';

/* ---------------- Sparkline ---------------- */
export function Sparkline({ data: raw, className }: { data: number[]; className?: string }) {
  const id = useId();
  const w = 280;
  const h = 64;

  // Sin datos el path quedaba "L280,64 L0,64 Z", sin el M inicial, y el
  // navegador lo rechazaba ("Expected moveto path command") en la consola de
  // cada período sin ventas. Vacío: una línea plana tenue, para que la tarjeta
  // no cambie de alto. Con un solo punto: ese valor de punta a punta.
  if (raw.length === 0)
    return (
      <svg
        viewBox={`0 0 ${w} ${h}`}
        className={cn('w-full', className)}
        preserveAspectRatio="none"
        aria-hidden
      >
        <path
          d={`M0,${h - 4} L${w},${h - 4}`}
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeDasharray="4 4"
          vectorEffect="non-scaling-stroke"
          className="text-border"
        />
      </svg>
    );
  const data = raw.length === 1 ? [raw[0]!, raw[0]!] : raw;

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
  /** Explicación pedagógica del card: qué muestra y cómo se calcula (tooltip del ⓘ). */
  info?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn(SETTINGS_CARD, className)}>
      <div className="mb-4 flex items-center justify-between gap-2">
        {/* h2: va directo debajo del h1 de la página; con h3 se salteaba un nivel. */}
        <h2 className="flex items-center gap-1.5 text-sm font-semibold text-fg">
          {title}
          {info && <InfoDot info={info} />}
        </h2>
        {action}
      </div>
      {children}
    </div>
  );
}

/** ⓘ con la explicación en tooltip (antes era decorativo: un icono que no hacía nada). */
export function InfoDot({ info }: { info: string }) {
  return (
    <Tooltip label={info} side="top" delayMs={150} className="inline-flex">
      <span
        tabIndex={0}
        className="inline-flex h-3.5 w-3.5 cursor-help items-center justify-center rounded-full border border-fg-subtle text-3xs font-bold text-fg-subtle"
      >
        i
      </span>
    </Tooltip>
  );
}
