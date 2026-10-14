import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Check, MoreHorizontal, type LucideIcon } from 'lucide-react';
import { cn } from '@tiendafy/ui';

/**
 * Menú de acciones "⋯" de una fila (secciones del inicio, y lo que venga).
 *
 * El Dropdown de @tiendafy/ui tiene ítems de 36 px y no maneja el foco: con
 * el dedo se erraba y con el teclado no se podía entrar al menú. Este:
 *   - ítems de 40 px o más;
 *   - al abrir, el foco va al primer ítem; flechas, Inicio y Fin recorren;
 *     Escape cierra y devuelve el foco al botón; Tab cierra;
 *   - un ítem apagado se puede leer (aria-disabled) y dice por qué (`hint`);
 *   - opciones excluyentes como `menuitemradio` (`checked`);
 *   - va en un portal con posición fija: el panel con scroll no lo recorta, y
 *     si no entra abajo se abre para arriba.
 *
 *   <ActionMenu
 *     label="Acciones de «Carrusel»"
 *     entries={[
 *       { label: 'Duplicar', icon: Copy, onSelect: duplicar },
 *       { type: 'separator' },
 *       { label: 'Eliminar', icon: Trash2, onSelect: borrar, danger: true },
 *     ]}
 *   />
 */
export type ActionMenuEntry =
  | {
      type?: 'item';
      label: string;
      onSelect: () => void;
      icon?: LucideIcon;
      disabled?: boolean;
      /** Por qué está apagado (o una aclaración): se lee debajo del nombre. */
      hint?: string;
      danger?: boolean;
      /** Si se pasa, es una opción de un grupo excluyente (menuitemradio). */
      checked?: boolean;
    }
  | { type: 'label'; label: string }
  | { type: 'separator' };

const MENU_GAP = 4;
const EDGE = 8;

export function ActionMenu({
  label,
  entries,
  className,
  children,
}: {
  /** Nombre del botón para lectores de pantalla ("Acciones de «Carrusel»"). */
  label: string;
  entries: ActionMenuEntry[];
  className?: string;
  /** Contenido del botón; por defecto, "⋯". */
  children?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  // El menú ya ubicado: si el ref se vuelve a llamar (un render del padre
  // mientras está abierto), no se lo mueve ni se le roba el foco al ítem.
  const placed = useRef<HTMLDivElement | null>(null);

  const close = (returnFocus: boolean) => {
    setOpen(false);
    if (returnFocus) triggerRef.current?.focus();
  };

  // Click afuera o scroll de cualquier otra cosa: se cierra (como el Dropdown).
  useEffect(() => {
    if (!open) return;
    const inside = (t: EventTarget | null) =>
      t instanceof Node && (menuRef.current?.contains(t) || triggerRef.current?.contains(t));
    const onPointerDown = (e: PointerEvent) => {
      if (!inside(e.target)) setOpen(false);
    };
    const onScroll = (e: Event) => {
      if (!inside(e.target)) setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onScroll);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onScroll);
    };
  }, [open]);

  const items = () => Array.from(menuRef.current?.querySelectorAll<HTMLElement>('[data-menu-item]') ?? []);
  const focusAt = (i: number) => {
    const list = items();
    if (list.length === 0) return;
    list[(i + list.length) % list.length]!.focus();
  };

  // Posición y foco al montar el menú: en el ref (sin estado ni efecto). Se
  // ubica debajo del botón, alineado a su borde derecho; si no entra, arriba.
  const placeMenu = (el: HTMLDivElement | null) => {
    menuRef.current = el;
    const trigger = triggerRef.current;
    if (!el || !trigger || placed.current === el) return;
    placed.current = el;
    const r = trigger.getBoundingClientRect();
    const h = el.offsetHeight;
    const below = r.bottom + MENU_GAP;
    const top =
      below + h > window.innerHeight - EDGE && r.top - MENU_GAP - h >= EDGE ? r.top - MENU_GAP - h : below;
    el.style.top = `${Math.max(EDGE, top)}px`;
    el.style.right = `${Math.max(EDGE, window.innerWidth - r.right)}px`;
    (el.querySelector<HTMLElement>('[data-menu-item]:not([aria-disabled="true"])') ?? el).focus();
  };

  const onMenuKey = (e: KeyboardEvent) => {
    const list = items();
    const i = list.indexOf(document.activeElement as HTMLElement);
    if (e.key === 'ArrowDown') focusAt(i + 1);
    else if (e.key === 'ArrowUp') focusAt(i - 1);
    else if (e.key === 'Home') focusAt(0);
    else if (e.key === 'End') focusAt(list.length - 1);
    else if (e.key === 'Escape') {
      e.stopPropagation();
      close(true);
    } else if (e.key === 'Tab') {
      setOpen(false);
      return;
    } else return;
    e.preventDefault();
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => {
          // Flecha abajo abre el menú, como en un menú de escritorio.
          if (e.key === 'ArrowDown' && !open) {
            e.preventDefault();
            setOpen(true);
          }
        }}
        className={cn(
          'flex h-10 w-10 shrink-0 items-center justify-center rounded-md text-fg-muted hover:bg-bg-muted hover:text-fg',
          open && 'bg-bg-muted text-fg',
          className,
        )}
      >
        {children ?? <MoreHorizontal className="h-5 w-5" aria-hidden />}
      </button>
      {open &&
        createPortal(
          <div
            ref={placeMenu}
            id={menuId}
            role="menu"
            aria-label={label}
            tabIndex={-1}
            onKeyDown={onMenuKey}
            style={{ position: 'fixed', top: 0, right: EDGE }}
            className="z-[85] max-h-[calc(100dvh-1rem)] w-64 max-w-[calc(100vw-1rem)] overflow-y-auto rounded-lg border border-border bg-surface py-1 shadow-overlay focus:outline-none"
          >
            {entries.map((entry, i) => {
              if (entry.type === 'separator')
                return <div key={i} role="separator" className="my-1 border-t border-border" />;
              if (entry.type === 'label')
                return (
                  <div
                    key={i}
                    role="presentation"
                    className="px-3 pb-1 pt-2 text-[0.7rem] font-semibold uppercase tracking-wide text-fg-subtle"
                  >
                    {entry.label}
                  </div>
                );
              const Icon = entry.icon;
              const radio = entry.checked !== undefined;
              return (
                <button
                  key={i}
                  type="button"
                  data-menu-item
                  role={radio ? 'menuitemradio' : 'menuitem'}
                  aria-checked={radio ? entry.checked : undefined}
                  aria-disabled={entry.disabled || undefined}
                  tabIndex={-1}
                  onClick={() => {
                    if (entry.disabled) return;
                    close(true);
                    entry.onSelect();
                  }}
                  className={cn(
                    'flex min-h-10 w-full items-center gap-2.5 px-3 py-2 text-left text-sm focus:bg-bg-muted focus:outline-none',
                    entry.disabled
                      ? 'cursor-not-allowed text-fg-subtle'
                      : entry.danger
                        ? 'text-danger hover:bg-danger-bg focus:bg-danger-bg'
                        : 'text-fg hover:bg-bg-muted',
                  )}
                >
                  {radio ? (
                    <Check
                      className={cn('h-4 w-4 shrink-0', entry.checked ? 'text-primary' : 'invisible')}
                      aria-hidden
                    />
                  ) : (
                    Icon && <Icon className="h-4 w-4 shrink-0" aria-hidden />
                  )}
                  <span className="min-w-0">
                    <span className="block">{entry.label}</span>
                    {entry.hint && <span className="block text-xs text-fg-subtle">{entry.hint}</span>}
                  </span>
                </button>
              );
            })}
          </div>,
          document.body,
        )}
    </>
  );
}
