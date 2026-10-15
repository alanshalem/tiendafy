import { cn } from './cn';

export interface TabItem<T extends string> {
  id: T;
  label: string;
  /** Un número al lado del nombre ("Pendientes 3"). Con 0 o sin valor no se muestra. */
  count?: number | null;
  /** `warning` o `danger` cuando el número pide atención (reseñas por revisar, arrepentimientos). */
  countTone?: 'default' | 'warning' | 'danger';
}

export interface TabsProps<T extends string> {
  items: TabItem<T>[];
  value: T;
  onChange: (value: T) => void;
  /** Qué alterna la fila, para lectores de pantalla ("Estado de las reseñas"). */
  label?: string;
  className?: string;
}

/**
 * Fila de tabs tipo "pill" para alternar vistas o filtros dentro de una página.
 *
 * Es el único estilo de pestañas del panel: había también uno subrayado
 * (Mensajes, Reseñas, Exportar e importar) y otra fila de pills armada a mano
 * (Bandeja). Se quedó este porque en el teléfono corre de costado sin cortar
 * nombres, y el subrayado necesitaba todo el ancho.
 */
export function Tabs<T extends string>({ items, value, onChange, label, className }: TabsProps<T>) {
  return (
    <div
      role="group"
      aria-label={label}
      className={cn(
        // Del ancho de su contenido (no de toda la fila) y, si no entra, corre
        // de costado en vez de apretar o partir los nombres.
        'flex w-fit max-w-full overflow-x-auto rounded-lg border border-border bg-surface p-0.5 shadow-card',
        className,
      )}
    >
      {items.map((t) => {
        const active = value === t.id;
        return (
          <button
            key={t.id}
            type="button"
            // La activa se distinguía solo por el color: un lector de pantalla no
            // decía cuál estaba elegida.
            aria-pressed={active}
            onClick={() => onChange(t.id)}
            className={cn(
              'inline-flex shrink-0 items-center whitespace-nowrap rounded-md px-3.5 py-1.5 text-sm font-medium transition-colors',
              active ? 'bg-primary text-primary-fg' : 'text-fg-muted hover:text-fg',
            )}
          >
            {t.label}
            {!!t.count && (
              <span
                className={cn(
                  'ml-1.5 rounded-full px-1.5 text-2xs font-semibold tabular-nums',
                  active
                    ? 'bg-primary-fg/20 text-primary-fg'
                    : t.countTone === 'danger'
                      ? 'bg-danger-bg text-danger'
                      : t.countTone === 'warning'
                        ? 'bg-warning-bg text-warning'
                        : 'bg-bg-muted text-fg-muted',
                )}
              >
                {t.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
