import { cn } from './cn';
import { Tooltip } from './Tooltip';

export interface StatCardProps {
  label: string;
  value: string;
  /** Explicación del número: qué mide y cómo se calcula (tooltip del ⓘ). */
  hint?: string;
  className?: string;
}

/** Tarjeta de métrica: label chico arriba, número grande abajo. */
export function StatCard({ label, value, hint, className }: StatCardProps) {
  return (
    <div className={cn('rounded-lg border border-border bg-surface p-4 shadow-card', className)}>
      <div className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-fg-subtle">
        {label}
        {hint && (
          <Tooltip label={hint} side="top" delayMs={150} className="inline-flex normal-case tracking-normal">
            <span
              tabIndex={0}
              className="inline-flex h-3.5 w-3.5 cursor-help items-center justify-center rounded-full border border-fg-subtle text-3xs font-bold"
            >
              i
            </span>
          </Tooltip>
        )}
      </div>
      <div className="mt-1 text-2xl font-bold tracking-tight text-fg">{value}</div>
    </div>
  );
}
