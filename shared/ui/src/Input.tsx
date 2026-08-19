import { forwardRef, type InputHTMLAttributes } from 'react';
import { cn } from './cn';
import { fieldChrome } from './field';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  /** Pinta borde rojo + aria-invalid. El mensaje va en FormError, no acá. */
  error?: boolean;
  /**
   * Alto reducido, para celdas de tabla (cantidades, costos, stock). Es una
   * prop y no una clase suelta a propósito: `cn` concatena sin resolver
   * conflictos de Tailwind, así que un `className="h-8"` pierde contra el
   * `h-10` de la base y queda de adorno — que es exactamente lo que pasaba en
   * once pantallas. El ANCHO sigue yendo en un div que envuelve al control.
   */
  compact?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ error = false, compact = false, className, ...props }, ref) => (
    <input
      ref={ref}
      aria-invalid={error || undefined}
      className={cn(
        'w-full rounded-md border bg-surface text-sm text-fg',
        compact ? 'h-8 px-2.5' : 'h-10 px-3',
        'placeholder:text-fg-subtle',
        ...fieldChrome(error),
        className,
      )}
      {...props}
    />
  ),
);

Input.displayName = 'Input';
