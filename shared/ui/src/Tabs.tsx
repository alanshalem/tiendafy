import { cn } from './cn';

export interface TabItem<T extends string> {
  id: T;
  label: string;
}

export interface TabsProps<T extends string> {
  items: TabItem<T>[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
}

/** Fila de tabs tipo "pill" para alternar vistas dentro de una página. */
export function Tabs<T extends string>({ items, value, onChange, className }: TabsProps<T>) {
  return (
    <div
      className={cn(
        // Los nombres no se parten al medio; si no entran, la fila corre de
        // costado en vez de apretar a los demás.
        'flex overflow-x-auto rounded-lg border border-border bg-surface p-0.5 shadow-card',
        className,
      )}
    >
      {items.map((t) => (
        <button
          key={t.id}
          type="button"
          onClick={() => onChange(t.id)}
          className={cn(
            'shrink-0 whitespace-nowrap rounded-md px-3.5 py-1.5 text-sm font-medium transition-colors',
            value === t.id ? 'bg-primary text-primary-fg' : 'text-fg-muted hover:text-fg',
          )}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}
