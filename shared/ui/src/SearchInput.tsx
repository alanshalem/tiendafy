import { forwardRef } from 'react';
import { cn } from './cn';
import { Input, type InputProps } from './Input';

export interface SearchInputProps extends Omit<InputProps, 'type'> {
  /** Clases del input en sí; `className` va al contenedor (ancho, márgenes). */
  inputClassName?: string;
}

/**
 * La caja de búsqueda de los listados: un Input con la lupa adentro.
 *
 * Algunas pantallas la tenían y otras no (Compras, Presupuestos, Inventario,
 * Costos, Cupones, Kits, Mensajes): sin la lupa, la búsqueda se confundía con
 * un campo más del formulario.
 */
export const SearchInput = forwardRef<HTMLInputElement, SearchInputProps>(
  ({ className, inputClassName, ...props }, ref) => (
    <div className={cn('relative', className)}>
      <svg
        className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-subtle"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <circle cx="11" cy="11" r="8" />
        <path d="m21 21-4.3-4.3" />
      </svg>
      <Input ref={ref} type="search" className={cn('pl-8', inputClassName)} {...props} />
    </div>
  ),
);

SearchInput.displayName = 'SearchInput';
