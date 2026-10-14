import { cn } from './cn';

/** Lado del ícono en px (los mismos pasos que usaban los íconos a mano). */
export type SpinnerSize = 12 | 14 | 16 | 20 | 24;

const SIZE_CLASS: Record<SpinnerSize, string> = {
  12: 'h-3 w-3',
  14: 'h-3.5 w-3.5',
  16: 'h-4 w-4',
  20: 'h-5 w-5',
  24: 'h-6 w-6',
};

export interface SpinnerProps {
  /**
   * Solo el ícono, sin la caja centrada: va dentro de un botón ("Guardar")
   * o al lado de un texto ("Cargando…").
   */
  inline?: boolean;
  /** Default: 16 en línea, 24 en bloque. */
  size?: SpinnerSize;
  /**
   * Nombre para lectores de pantalla. Sin él el ícono es decorativo: casi
   * siempre lo acompaña un texto que ya dice qué está pasando.
   */
  label?: string;
  /** En bloque, ajustes del contenedor (ej. otro padding); en línea, del ícono. */
  className?: string;
}

/**
 * El indicador de carga del panel, el mismo en todos lados. Antes había un
 * ícono girando escrito a mano en cada pantalla (casi cien), con tamaños y
 * colores sueltos.
 */
export function Spinner({ inline = false, size, label, className }: SpinnerProps) {
  const icon = (
    <svg
      className={cn(
        SIZE_CLASS[size ?? (inline ? 16 : 24)],
        'shrink-0 animate-spin',
        !inline && 'text-fg-subtle',
        inline && className,
      )}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
    </svg>
  );
  if (inline) return icon;
  return <div className={cn('flex justify-center py-12', className)}>{icon}</div>;
}
