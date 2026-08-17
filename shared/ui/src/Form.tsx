'use client';

import { cloneElement, isValidElement, useId, type ReactElement, type ReactNode } from 'react';
import { cn } from './cn';

interface FormErrorProps {
  /** Sin children no renderiza nada (uso directo con errors opcionales). */
  children?: ReactNode;
  id?: string;
  className?: string;
}

function FormError({ children, id, className }: FormErrorProps) {
  if (!children) return null;
  return (
    <p id={id} role="alert" className={cn('text-sm text-danger', className)}>
      {children}
    </p>
  );
}

export interface FormFieldProps {
  label: ReactNode;
  /** Mensaje de error. Presente = pinta el control + aria-describedby. */
  error?: string;
  /** Texto de ayuda debajo del control (oculto si hay error). */
  hint?: ReactNode;
  /** Marca visual de requerido (*). La validación real va en el schema. */
  required?: boolean;
  /** Un único control (Input, Select, Textarea...). Recibe id/error/aria por clone. */
  children: ReactElement;
  className?: string;
}

/**
 * Cablea label + control + error: genera id, asocia htmlFor,
 * inyecta error + aria-describedby al control hijo.
 */
export function FormField({ label, error, hint, required = false, children, className }: FormFieldProps) {
  const id = useId();
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;

  const control = isValidElement<Record<string, unknown>>(children)
    ? cloneElement(children, {
        id: (children.props.id as string | undefined) ?? id,
        error: error ? true : children.props.error,
        'aria-describedby': error ? errorId : hint ? hintId : undefined,
      })
    : children;

  return (
    <div className={cn('space-y-1.5', className)}>
      <label
        htmlFor={(isValidElement<Record<string, unknown>>(children) && (children.props.id as string)) || id}
        className="block text-sm font-medium text-fg"
      >
        {label}
        {required && (
          <span aria-hidden="true" className="ml-0.5 text-danger">
            *
          </span>
        )}
      </label>
      {control}
      {error ? (
        <FormError id={errorId}>{error}</FormError>
      ) : (
        hint && (
          <p id={hintId} className="text-sm text-fg-muted">
            {hint}
          </p>
        )
      )}
    </div>
  );
}
