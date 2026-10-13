import { forwardRef, type SelectHTMLAttributes } from 'react';
import { cn } from './cn';
import { fieldChrome } from './field';

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  options: SelectOption[];
  /** Opción vacía inicial, ej "Seleccionar...". */
  placeholder?: string;
  error?: boolean;
}

/**
 * La flechita va por `style` y no por clases a propósito.
 *
 * Como imagen de fondo compartía prefijo con el color de fondo, y `cn` resuelve
 * los choques: `bg-[right_0.5rem_center]` se llevaba puesto al `bg-surface`, el
 * select quedaba transparente y —peor— el menú desplegable, que el browser
 * pinta con el color de fondo del control, salía claro con el texto casi
 * blanco. Ilegible, y en tema oscuro no se notaba hasta abrirlo.
 *
 * Acá abajo no compite con nada, y además deja que desde afuera se pueda
 * cambiar el fondo sin pelearse con la flecha.
 */
const ARROW =
  'url("data:image/svg+xml;charset=utf-8,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 fill=%27none%27 viewBox=%270 0 20 20%27%3E%3Cpath stroke=%27%236b7280%27 stroke-linecap=%27round%27 stroke-linejoin=%27round%27 stroke-width=%271.5%27 d=%27m6 8 4 4 4-4%27/%3E%3C/svg%3E")';

const arrowStyle = {
  backgroundImage: ARROW,
  backgroundSize: '1.25rem',
  backgroundPosition: 'right 0.5rem center',
  backgroundRepeat: 'no-repeat',
} as const;

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ options, placeholder, error = false, className, defaultValue, style, ...props }, ref) => (
    <select
      ref={ref}
      aria-invalid={error || undefined}
      // El placeholder arranca elegido solo en un select NO controlado: con
      // `value` y `defaultValue` a la vez React avisa en cada render y el
      // segundo se ignora igual.
      defaultValue={
        props.value !== undefined ? undefined : (defaultValue ?? (placeholder !== undefined ? '' : undefined))
      }
      style={{ ...arrowStyle, ...style }}
      className={cn(
        'h-10 w-full appearance-none rounded-md border bg-surface px-3 pr-9 text-sm text-fg',
        ...fieldChrome(error),
        className,
      )}
      {...props}
    >
      {placeholder !== undefined && (
        <option value="" disabled className="bg-surface text-fg">
          {placeholder}
        </option>
      )}
      {options.map((option) => (
        <option
          key={option.value}
          value={option.value}
          disabled={option.disabled}
          className="bg-surface text-fg"
        >
          {option.label}
        </option>
      ))}
    </select>
  ),
);

Select.displayName = 'Select';
