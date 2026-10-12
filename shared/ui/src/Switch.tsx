'use client';

import { useId, type ReactNode } from 'react';
import { cn } from './cn';

export interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  /** Label clickeable a la izquierda del switch. */
  label?: ReactNode;
  description?: ReactNode;
  className?: string;
  /** Nombre accesible cuando el switch va sin `label` (ej. en una grilla). */
  'aria-label'?: string;
}

/** Toggle on/off estilo iOS. Usado en opciones de checkout, emails, mensajes. */
export function Switch({
  checked,
  onChange,
  disabled,
  label,
  description,
  className,
  'aria-label': ariaLabel,
}: SwitchProps) {
  const id = useId();

  const toggle = (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
        'disabled:cursor-not-allowed disabled:opacity-50',
        checked ? 'bg-primary' : 'bg-border-strong',
      )}
    >
      <span
        className={cn(
          'inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform',
          checked ? 'translate-x-5' : 'translate-x-0.5',
        )}
      />
    </button>
  );

  if (!label && !description) return <span className={className}>{toggle}</span>;

  return (
    <div className={cn('flex items-start justify-between gap-4', className)}>
      <div className="min-w-0">
        {label && (
          <label htmlFor={id} className="block text-sm font-medium text-fg">
            {label}
          </label>
        )}
        {description && <p className="mt-0.5 text-sm text-fg-muted">{description}</p>}
      </div>
      {toggle}
    </div>
  );
}
