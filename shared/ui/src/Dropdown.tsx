'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { cn } from './cn';

interface DropdownContextValue {
  open: boolean;
  setOpen: (open: boolean) => void;
  menuId: string;
  triggerRef: React.RefObject<HTMLButtonElement>;
  menuRef: React.RefObject<HTMLDivElement>;
}

const DropdownContext = createContext<DropdownContextValue | null>(null);

function useDropdown(): DropdownContextValue {
  const ctx = useContext(DropdownContext);
  if (!ctx) throw new Error('Dropdown.* must be used inside <Dropdown>');
  return ctx;
}

export interface DropdownProps {
  children: ReactNode;
  className?: string;
}

/**
 * Menú desplegable composable. El menú se renderiza en un portal al <body>
 * con posición fija calculada desde el trigger — así ningún `overflow:hidden`
 * de un contenedor (tablas, cards) lo recorta. Cierra con Escape, scroll y
 * click afuera.
 */
export function Dropdown({ children, className }: DropdownProps) {
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (triggerRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    const onScroll = () => setOpen(false);

    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    window.addEventListener('scroll', onScroll, true);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, [open]);

  return (
    <DropdownContext.Provider value={{ open, setOpen, menuId, triggerRef, menuRef }}>
      <div className={cn('relative inline-block', className)}>{children}</div>
    </DropdownContext.Provider>
  );
}

export interface DropdownTriggerProps {
  children: ReactNode;
  className?: string;
  /** Sin caja ni chevron — para triggers de solo ícono (ej. ⋮). El estilo lo da className. */
  bare?: boolean;
}

function Trigger({ children, className, bare = false }: DropdownTriggerProps) {
  const { open, setOpen, menuId, triggerRef } = useDropdown();
  return (
    <button
      ref={triggerRef}
      type="button"
      aria-haspopup="menu"
      aria-expanded={open}
      aria-controls={menuId}
      onClick={() => setOpen(!open)}
      className={cn(
        bare
          ? 'inline-flex items-center focus-visible:outline-none'
          : 'inline-flex h-10 items-center gap-1 rounded-md border border-border-strong bg-surface px-3 text-sm font-medium text-fg hover:bg-bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
        className,
      )}
    >
      {children}
      {!bare && (
        <svg className="h-4 w-4 text-fg-muted" viewBox="0 0 20 20" fill="none" aria-hidden="true">
          <path d="m6 8 4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </button>
  );
}

export interface DropdownMenuProps {
  children: ReactNode;
  /** Alineación del menú respecto del trigger. */
  align?: 'start' | 'end';
  className?: string;
}

function Menu({ children, align = 'start', className }: DropdownMenuProps) {
  const { open, menuId, triggerRef, menuRef } = useDropdown();
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  useLayoutEffect(() => {
    if (!open || !triggerRef.current) {
      setPos(null);
      return;
    }
    const rect = triggerRef.current.getBoundingClientRect();
    setPos({ top: rect.bottom + 4, left: align === 'end' ? rect.right : rect.left });
  }, [open, align, triggerRef]);

  if (!open || !pos || typeof document === 'undefined') return null;

  return createPortal(
    <div
      ref={menuRef}
      id={menuId}
      role="menu"
      style={{
        position: 'fixed',
        top: pos.top,
        left: align === 'end' ? undefined : pos.left,
        right: align === 'end' ? window.innerWidth - pos.left : undefined,
      }}
      className={cn(
        'z-[200] min-w-[10rem] rounded-md border border-border bg-surface py-1 shadow-overlay',
        className,
      )}
    >
      {children}
    </div>,
    document.body,
  );
}

export interface DropdownItemProps {
  onSelect: () => void;
  /** Pinta el item en rojo (acciones destructivas). */
  destructive?: boolean;
  disabled?: boolean;
  children: ReactNode;
}

function Item({ onSelect, destructive = false, disabled = false, children }: DropdownItemProps) {
  const { setOpen } = useDropdown();
  const handleSelect = useCallback(() => {
    setOpen(false);
    onSelect();
  }, [onSelect, setOpen]);

  return (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      onClick={handleSelect}
      className={cn(
        'block w-full px-3 py-2 text-left text-sm',
        'disabled:pointer-events-none disabled:opacity-50',
        destructive ? 'text-danger hover:bg-danger-bg' : 'text-fg hover:bg-bg-muted',
      )}
    >
      {children}
    </button>
  );
}

Dropdown.Trigger = Trigger;
Dropdown.Menu = Menu;
Dropdown.Item = Item;
