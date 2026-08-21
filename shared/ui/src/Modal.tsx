'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { cn } from './cn';

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  /** Footer para acciones (Cancelar / Confirmar). */
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  children: ReactNode;
}

const sizeClasses = {
  sm: 'max-w-sm',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
  xl: 'max-w-5xl',
};

/**
 * Modal controlado sobre <dialog> nativo: Escape, focus trap y top-layer
 * los da el browser. Backdrop click cierra.
 */
export function Modal({ open, onClose, title, footer, size = 'md', children }: ModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  // Scroll lock del body mientras está abierto.
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  if (typeof document === 'undefined') return null; // SSR

  return createPortal(
    <dialog
      ref={dialogRef}
      onClose={onClose}
      onClick={(e) => {
        // Click en el backdrop (el dialog mismo, no su contenido) cierra.
        if (e.target === dialogRef.current) onClose();
      }}
      className={cn(
        // overflow-hidden pisa el `overflow: auto` que el browser le pone a
        // <dialog>: sin esto scrollea el diálogo entero y en un modal largo se
        // van de pantalla el título, la X de cerrar y los botones del pie.
        // text-fg no es decorativo: el browser le pone `color: CanvasText` al
        // <dialog>, que en tema oscuro es negro. Sin esto, todo lo que hereda
        // el color —los <input>, por el preflight de Tailwind— sale ilegible.
        'w-full overflow-hidden rounded-lg bg-surface p-0 text-fg shadow-overlay backdrop:bg-black/50',
        'm-auto', // centrado
        sizeClasses[size],
      )}
    >
      {/* El alto lo pone este div y no el <dialog>, así el cuerpo es lo único
          que scrollea. min-h-0 es lo que deja al cuerpo achicarse: sin eso un
          hijo de flex nunca baja de su alto de contenido y no scrollea nada. */}
      <div className="flex max-h-[85dvh] flex-col" onClick={(e) => e.stopPropagation()}>
        {title && (
          <div className="flex shrink-0 items-center justify-between border-b border-border px-5 py-4">
            <h2 className="text-base font-semibold text-fg">{title}</h2>
            <button
              type="button"
              onClick={onClose}
              aria-label="Cerrar"
              className="rounded-sm p-1 text-fg-muted hover:bg-bg-muted hover:text-fg"
            >
              <svg className="h-5 w-5" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                <path d="M6 6l8 8M14 6l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        )}
        {/* El padding de arriba y abajo va adentro y no en el contenedor que
            scrollea: si no, un encabezado `sticky top-0` se ancla debajo del
            padding y deja pasar una franja de contenido por encima. */}
        <div className="min-h-0 flex-1 overflow-auto px-5">
          <div className="py-4">{children}</div>
        </div>
        {footer && (
          <div className="flex shrink-0 justify-end gap-2 border-t border-border px-5 py-4">{footer}</div>
        )}
      </div>
    </dialog>,
    document.body,
  );
}
