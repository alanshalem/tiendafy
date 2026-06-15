import { forwardRef, type InputHTMLAttributes } from 'react';
import { cn } from './cn';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  /** Pinta borde rojo + aria-invalid. El mensaje va en FormError, no acá. */
  error?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ error = false, className, ...props }, ref) => (
    <input
      ref={ref}
      aria-invalid={error || undefined}
      className={cn(
        'h-10 w-full rounded-md border bg-surface px-3 text-sm text-fg',
        'placeholder:text-fg-subtle',
        'focus:outline-none focus:ring-2 focus:ring-offset-1',
        'disabled:cursor-not-allowed disabled:bg-bg-muted disabled:opacity-70',
        error
          ? 'border-danger focus:ring-danger'
          : 'border-border-strong focus:border-primary focus:ring-primary',
        className,
      )}
      {...props}
    />
  ),
);

Input.displayName = 'Input';
