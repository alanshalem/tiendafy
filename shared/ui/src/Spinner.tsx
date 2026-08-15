import { cn } from './cn';

export interface SpinnerProps {
  /** Ajustes del contenedor (ej. otro padding). */
  className?: string;
}

/** Spinner centrado para estados de carga de listas y paneles. */
export function Spinner({ className }: SpinnerProps) {
  return (
    <div className={cn('flex justify-center py-12', className)}>
      <svg
        className="h-6 w-6 animate-spin text-fg-subtle"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M21 12a9 9 0 1 1-6.219-8.56" />
      </svg>
    </div>
  );
}
