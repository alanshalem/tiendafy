'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { cn } from './cn';

export interface MultiSelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface MultiSelectProps {
  options: MultiSelectOption[];
  /** Valores seleccionados (controlado). */
  value: string[];
  onChange: (value: string[]) => void;
  placeholder?: string;
  error?: boolean;
  disabled?: boolean;
  id?: string;
  className?: string;
}

/**
 * Selección múltiple con checkboxes en popover. Controlado.
 * Uso típico: asignar categorías a producto, scopes a API key.
 */
export function MultiSelect({
  options,
  value,
  onChange,
  placeholder = 'Seleccionar...',
  error = false,
  disabled = false,
  id,
  className,
}: MultiSelectProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const listboxId = useId();

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const toggle = (optionValue: string) => {
    onChange(
      value.includes(optionValue)
        ? value.filter((v) => v !== optionValue)
        : [...value, optionValue],
    );
  };

  const selectedLabels = options.filter((o) => value.includes(o.value)).map((o) => o.label);

  return (
    <div ref={rootRef} className={cn('relative', className)}>
      <button
        id={id}
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listboxId}
        aria-invalid={error || undefined}
        onClick={() => setOpen(!open)}
        className={cn(
          'flex h-10 w-full items-center justify-between gap-2 rounded-md border bg-surface px-3 text-sm',
          'focus:outline-none focus:ring-2 focus:ring-offset-1',
          'disabled:cursor-not-allowed disabled:bg-bg-muted disabled:opacity-70',
          error
            ? 'border-danger focus:ring-danger'
            : 'border-border-strong focus:border-primary focus:ring-primary',
        )}
      >
        <span className={cn('truncate text-left', selectedLabels.length === 0 ? 'text-fg-subtle' : 'text-fg')}>
          {selectedLabels.length > 0 ? selectedLabels.join(', ') : placeholder}
        </span>
        <span className="flex shrink-0 items-center gap-1">
          {selectedLabels.length > 0 && (
            <span className="rounded-full bg-primary/10 px-1.5 text-xs font-medium text-primary">
              {selectedLabels.length}
            </span>
          )}
          <svg className="h-4 w-4 text-fg-muted" viewBox="0 0 20 20" fill="none" aria-hidden="true">
            <path d="m6 8 4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      </button>

      {open && (
        <div
          id={listboxId}
          role="listbox"
          aria-multiselectable="true"
          className="absolute z-50 mt-1 max-h-60 w-full overflow-auto rounded-md border border-border bg-surface py-1 shadow-overlay"
        >
          {options.map((option) => {
            const checked = value.includes(option.value);
            return (
              <button
                key={option.value}
                type="button"
                role="option"
                aria-selected={checked}
                disabled={option.disabled}
                onClick={() => toggle(option.value)}
                className={cn(
                  'flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-fg',
                  'hover:bg-bg-muted disabled:pointer-events-none disabled:opacity-50',
                )}
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    'flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border',
                    checked ? 'border-primary bg-primary text-primary-fg' : 'border-border-strong bg-surface',
                  )}
                >
                  {checked && (
                    <svg className="h-3 w-3" viewBox="0 0 12 12" fill="none">
                      <path d="m2.5 6 2.5 2.5 4.5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </span>
                {option.label}
              </button>
            );
          })}
          {options.length === 0 && (
            <p className="px-3 py-2 text-sm text-fg-muted">Sin opciones</p>
          )}
        </div>
      )}
    </div>
  );
}
