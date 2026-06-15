import { forwardRef, useId, type InputHTMLAttributes, type ReactNode } from 'react';
import { cn } from './cn';

export interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  /** Label clickeable a la derecha. Sin label, pasar aria-label. */
  label?: ReactNode;
  /** Texto secundario debajo del label. */
  description?: ReactNode;
}

export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(
  ({ label, description, className, id: idProp, ...props }, ref) => {
    const generatedId = useId();
    const id = idProp ?? generatedId;

    const input = (
      <input
        ref={ref}
        id={id}
        type="checkbox"
        className={cn(
          'h-4 w-4 shrink-0 rounded-sm border-border-strong text-primary',
          'focus:ring-2 focus:ring-primary focus:ring-offset-1',
          'disabled:cursor-not-allowed disabled:opacity-50',
          className,
        )}
        {...props}
      />
    );

    if (!label) return input;

    return (
      <div className="flex items-start gap-2">
        <div className="flex h-5 items-center">{input}</div>
        <div className="text-sm">
          <label htmlFor={id} className="font-medium text-fg">
            {label}
          </label>
          {description && <p className="text-fg-muted">{description}</p>}
        </div>
      </div>
    );
  },
);

Checkbox.displayName = 'Checkbox';
