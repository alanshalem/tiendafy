import type { ReactNode } from 'react';

/**
 * Wrapper label + descripción de Checkbox/Radio (idéntico en ambos).
 * Interno del paquete: no va en el barrel.
 */
export function LabeledControl({
  input,
  id,
  label,
  description,
}: {
  input: ReactNode;
  id: string;
  label: ReactNode;
  description?: ReactNode;
}) {
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
}
