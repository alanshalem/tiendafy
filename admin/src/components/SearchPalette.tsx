import { useEffect, useRef, useState, type ReactNode } from 'react';
import { CornerDownLeft, Loader2, Search } from 'lucide-react';
import { cn } from '@tiendafy/ui';

/* ============================================================
   La paleta de búsqueda: un campo arriba y una lista que se
   maneja con flechas, Enter y Escape.

   La usan el buscador del panel (Ctrl+K) y el de opciones del
   editor de diseño. Eran dos copias de lo mismo —el fondo, el
   foco, las flechas que no pasan del primero ni del último, el
   clic afuera que cierra— y ya se habían separado: una marcaba
   las opciones como opciones y la otra como botones sueltos, y
   solo una seguía la opción activa al moverse con flechas.
   ============================================================ */

export interface PaletteItem {
  /** Única en la lista. */
  key: string;
  label: ReactNode;
  /** A la derecha: de qué tipo es, dónde vive ("Producto", "Configuración"). */
  hint?: ReactNode;
  /** A la izquierda: una foto, un ícono. */
  icon?: ReactNode;
  /** Debajo del nombre, en chico: un email, un estado. */
  detail?: ReactNode;
  /** Título del grupo: los ítems de un mismo grupo van juntos y en orden. */
  group?: string;
}

export interface SearchPaletteProps {
  /** Nombre del diálogo para lectores de pantalla. */
  label: string;
  /** Nombre del campo. */
  inputLabel: string;
  placeholder: string;
  query: string;
  onQueryChange: (q: string) => void;
  items: PaletteItem[];
  onPick: (item: PaletteItem) => void;
  onClose: () => void;
  /** Lo que se ve con el campo vacío y sin ítems. */
  idle?: ReactNode;
  /** Lo que se ve cuando la búsqueda no encontró nada. */
  empty?: ReactNode;
  /** Buscando en el servidor: un indicador al lado del campo. */
  loading?: boolean;
  /** Pie con los atajos. */
  footer?: ReactNode;
}

export function SearchPalette({
  label,
  inputLabel,
  placeholder,
  query,
  onQueryChange,
  items,
  onPick,
  onClose,
  idle,
  empty,
  loading = false,
  footer,
}: SearchPaletteProps) {
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  // Si la lista se achica (llegaron menos resultados del servidor), la opción
  // activa no puede quedar apuntando a la nada.
  const current = Math.min(active, Math.max(items.length - 1, 0));

  useEffect(() => inputRef.current?.focus(), []);

  // Mantener la opción activa a la vista al navegar con flechas.
  useEffect(() => {
    listRef.current?.querySelector('[aria-selected="true"]')?.scrollIntoView?.({ block: 'nearest' });
  }, [current]);

  const pick = (item: PaletteItem | undefined) => {
    if (item) onPick(item);
  };

  return (
    // El diálogo es la capa entera: tocar el fondo es tocar afuera de la caja y cierra.
    <div
      role="dialog"
      aria-modal="true"
      aria-label={label}
      className="fixed inset-0 z-[90] flex items-start justify-center bg-black/40 px-4 pt-[12vh]"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg overflow-hidden rounded-xl border border-border bg-surface shadow-overlay"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2.5 border-b border-border px-4">
          <Search className="h-4 w-4 shrink-0 text-fg-subtle" aria-hidden="true" />
          <input
            ref={inputRef}
            type="search"
            aria-label={inputLabel}
            value={query}
            onChange={(e) => {
              onQueryChange(e.target.value);
              setActive(0); // otra búsqueda, otra lista: se arranca por el primero
            }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setActive(Math.min(current + 1, items.length - 1));
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setActive(Math.max(current - 1, 0));
              } else if (e.key === 'Enter') {
                e.preventDefault();
                pick(items[current]);
              } else if (e.key === 'Escape') {
                onClose();
              }
            }}
            placeholder={placeholder}
            className="h-12 w-full bg-transparent text-sm text-fg outline-none placeholder:text-fg-subtle [&::-webkit-search-cancel-button]:hidden"
          />
          {loading && (
            <Loader2 className="h-4 w-4 shrink-0 animate-spin text-fg-subtle" aria-label="Buscando" />
          )}
          <kbd className="hidden shrink-0 rounded border border-border px-1.5 py-0.5 text-[0.65rem] text-fg-subtle sm:inline">
            Esc
          </kbd>
        </div>
        <div
          ref={listRef}
          className="max-h-[60vh] overflow-y-auto p-1.5 sm:max-h-96"
          role="listbox"
          aria-label="Resultados"
        >
          {items.length === 0 && (
            <div className="px-3 py-6 text-center text-sm text-fg-muted">{query.trim() ? empty : idle}</div>
          )}
          {items.map((item, i) => {
            const isActive = i === current;
            const newGroup = item.group && item.group !== items[i - 1]?.group;
            return (
              <div key={item.key} role="presentation">
                {newGroup && (
                  <div
                    role="presentation"
                    className="px-3 pb-1 pt-2.5 text-[0.65rem] font-bold uppercase tracking-wider text-fg-subtle"
                  >
                    {item.group}
                  </div>
                )}
                <button
                  type="button"
                  role="option"
                  aria-selected={isActive}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => pick(item)}
                  className={cn(
                    'flex min-h-10 w-full items-center gap-2.5 rounded-md px-3 py-2 text-left text-sm',
                    isActive ? 'bg-primary/10 text-fg' : 'text-fg-muted',
                  )}
                >
                  {item.icon}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{item.label}</span>
                    {item.detail && (
                      <span className="block truncate text-xs text-fg-subtle">{item.detail}</span>
                    )}
                  </span>
                  {item.hint && <span className="shrink-0 text-xs text-fg-subtle">{item.hint}</span>}
                  {isActive && (
                    <CornerDownLeft className="h-3.5 w-3.5 shrink-0 text-fg-subtle" aria-hidden="true" />
                  )}
                </button>
              </div>
            );
          })}
        </div>
        {footer && (
          <div className="border-t border-border px-4 py-2 text-[0.7rem] text-fg-subtle">{footer}</div>
        )}
      </div>
    </div>
  );
}
