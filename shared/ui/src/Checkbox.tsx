import { forwardRef, useEffect, useId, useRef, type InputHTMLAttributes, type ReactNode } from 'react';
import { cn } from './cn';
import { LabeledControl } from './labeled';

export interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  /** Label clickeable a la derecha. Sin label, pasar aria-label. */
  label?: ReactNode;
  /** Texto secundario debajo del label. */
  description?: ReactNode;
  /**
   * Estado mixto: algunos de los hijos tildados, no todos. Es el "seleccionar
   * todo" de una tabla cuando hay una selección parcial.
   */
  indeterminate?: boolean;
}

/**
 * Casilla con estilo propio.
 *
 * El check nativo del navegador no toma el color del tema: en modo oscuro se
 * dibuja con la paleta clara del sistema y queda un cuadrado blanco encima del
 * fondo negro. Se pinta a mano: el input real sigue ahí (accesible, enfocable,
 * parte del formulario) pero sin apariencia, y el recuadro con el tilde va
 * arriba con los colores del tema.
 */
export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(
  ({ label, description, className, id: idProp, indeterminate = false, ...props }, ref) => {
    const generatedId = useId();
    const id = idProp ?? generatedId;

    // `indeterminate` no existe como atributo HTML, solo como propiedad del DOM.
    const inner = useRef<HTMLInputElement | null>(null);
    useEffect(() => {
      if (inner.current) inner.current.indeterminate = indeterminate;
    }, [indeterminate]);

    const input = (
      <span className={cn('relative inline-flex h-[1.125rem] w-[1.125rem] shrink-0', className)}>
        <input
          ref={(node) => {
            inner.current = node;
            if (typeof ref === 'function') ref(node);
            else if (ref) ref.current = node;
          }}
          id={id}
          type="checkbox"
          className={cn(
            'peer h-full w-full cursor-pointer appearance-none rounded-[0.3rem] border transition-colors',
            'border-border-strong bg-surface',
            'hover:border-primary/60',
            'checked:border-primary checked:bg-primary indeterminate:border-primary indeterminate:bg-primary',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-1 focus-visible:ring-offset-surface',
            'disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-border-strong',
          )}
          {...props}
        />
        {/* Las marcas viven fuera del input (que no puede tener hijos) y dejan
            pasar el click al que está debajo. El paquete de UI no depende de
            una librería de iconos: son dos trazos. */}
        <Mark className="peer-checked:opacity-100 peer-indeterminate:opacity-0" path="M4 8.5 L7 11.5 L12 5" />
        <Mark className="peer-indeterminate:opacity-100" path="M4 8 L12 8" />
      </span>
    );

    if (!label) return input;

    return <LabeledControl input={input} id={id} label={label} description={description} />;
  },
);

Checkbox.displayName = 'Checkbox';

/** Trazo del tilde (o del guión del estado mixto) sobre el recuadro. */
function Mark({ path, className }: { path: string; className: string }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn(
        'pointer-events-none absolute inset-0 m-auto h-full w-full text-primary-fg opacity-0 transition-opacity',
        className,
      )}
    >
      <path d={path} />
    </svg>
  );
}
