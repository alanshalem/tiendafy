'use client';

import { useContext, useEffect, useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { cn } from './cn';
import { ConfirmContext } from './confirmContext';
import { topLayer } from './topLayer';

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  /** Footer para acciones (Cancelar / Confirmar). */
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  /**
   * `right`: panel lateral a toda la altura (filtros, detalles). Es el mismo
   * <dialog> —foco atrapado, Escape, fondo— en vez de un cajón armado a mano
   * con un div fijo que no hacía ninguna de esas tres cosas.
   */
  placement?: 'center' | 'right';
  /**
   * Hay cambios sin guardar: cerrar con la X, con Escape o con un click afuera
   * pregunta "¿Descartar los cambios?" antes. Lo que cierra el propio form (al
   * guardar, su botón Cancelar) no pasa por acá.
   */
  dirty?: boolean;
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
 * los da el browser. Click en el fondo cierra.
 */
export function Modal({
  open,
  onClose,
  title,
  footer,
  size = 'md',
  placement = 'center',
  dirty = false,
  children,
}: ModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  // El título nombra al diálogo: sin esto un lector de pantalla anuncia
  // "diálogo" a secas, sin decir cuál.
  const titleId = useId();
  const confirm = useContext(ConfirmContext);
  // Si el apretón empezó en el fondo. Un click "en el fondo" también es el de
  // seleccionar texto de un campo y soltar el mouse afuera de la tarjeta: el
  // navegador lo manda al ancestro común —el <dialog>— y se perdía el form.
  const pressedBackdrop = useRef(false);
  const asking = useRef(false);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    // Se anota siempre que esté abierto, no solo al abrirlo: en StrictMode el
    // efecto corre, se limpia (y se borra de la pila) y vuelve a correr con
    // el diálogo ya abierto.
    if (open) {
      if (!dialog.open) dialog.showModal();
      topLayer.push(dialog);
    } else {
      if (dialog.open) dialog.close();
      topLayer.remove(dialog);
    }
    return () => topLayer.remove(dialog);
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

  /** Cerrar a pedido de la persona: con cambios, primero se confirma. */
  const requestClose = async () => {
    if (!dirty) return onClose();
    if (asking.current) return;
    asking.current = true;
    try {
      const discard = confirm
        ? await confirm({
            title: '¿Descartar los cambios?',
            message: 'Lo que cargaste y no guardaste se va a perder.',
            confirmLabel: 'Descartar',
            cancelLabel: 'Seguir editando',
            variant: 'danger',
          })
        : window.confirm('¿Descartar los cambios?');
      if (discard) onClose();
    } finally {
      asking.current = false;
    }
  };

  if (typeof document === 'undefined') return null; // SSR

  return createPortal(
    <dialog
      ref={dialogRef}
      aria-labelledby={title ? titleId : undefined}
      onCancel={(e) => {
        // Escape: con cambios, el diálogo no se cierra solo; se pregunta.
        if (dirty) {
          e.preventDefault();
          void requestClose();
        }
      }}
      onClose={() => {
        const dialog = dialogRef.current;
        if (dialog) topLayer.remove(dialog);
        // El navegador puede cerrarlo sin dejar frenar el Escape (dos
        // seguidos, sin otro gesto en el medio). Con cambios y todavía
        // abierto para la pantalla, se vuelve a mostrar y se pregunta.
        if (open && dirty && dialog && !dialog.open) {
          dialog.showModal();
          topLayer.push(dialog);
          void requestClose();
          return;
        }
        onClose();
      }}
      onPointerDown={(e) => {
        pressedBackdrop.current = e.target === dialogRef.current;
      }}
      onClick={(e) => {
        // Click en el fondo (el dialog mismo, no su contenido), apretado y
        // soltado ahí: cierra.
        if (pressedBackdrop.current && e.target === dialogRef.current) void requestClose();
        pressedBackdrop.current = false;
      }}
      className={cn(
        // overflow-hidden pisa el `overflow: auto` que el browser le pone a
        // <dialog>: sin esto scrollea el diálogo entero y en un modal largo se
        // van de pantalla el título, la X de cerrar y los botones del pie.
        // text-fg no es decorativo: el browser le pone `color: CanvasText` al
        // <dialog>, que en tema oscuro es negro. Sin esto, todo lo que hereda
        // el color —los <input>, por el preflight de Tailwind— sale ilegible.
        'w-full overflow-hidden rounded-lg bg-surface p-0 text-fg shadow-overlay backdrop:bg-black/50',
        sizeClasses[size],
        placement === 'right'
          ? 'my-0 ml-auto mr-0 h-dvh max-h-dvh max-w-[min(24rem,90vw)] rounded-none'
          : 'm-auto', // centrado
      )}
    >
      {/* El alto lo pone este div y no el <dialog>, así el cuerpo es lo único
          que scrollea. min-h-0 es lo que deja al cuerpo achicarse: sin eso un
          hijo de flex nunca baja de su alto de contenido y no scrollea nada. */}
      <div
        className={cn('flex flex-col', placement === 'right' ? 'h-full' : 'max-h-[85dvh]')}
        onClick={(e) => e.stopPropagation()}
      >
        {title && (
          <div className="flex shrink-0 items-center justify-between border-b border-border px-5 py-4">
            <h2 id={titleId} className="text-base font-semibold text-fg">
              {title}
            </h2>
            <button
              type="button"
              onClick={() => void requestClose()}
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
