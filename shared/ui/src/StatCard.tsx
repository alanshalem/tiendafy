import { cn } from './cn';

export interface StatCardProps {
  label: string;
  value: string;
  className?: string;
}

/** Tarjeta de métrica: label chico arriba, número grande abajo. */
export function StatCard({ label, value, className }: StatCardProps) {
  return (
    <div className={cn('rounded-lg border border-border bg-surface p-4 shadow-card', className)}>
      <div className="text-xs font-medium uppercase tracking-wider text-fg-subtle">{label}</div>
      <div className="mt-1 text-2xl font-bold tracking-tight text-fg">{value}</div>
    </div>
  );
}
