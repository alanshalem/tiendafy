'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { cn } from './cn';
import { topLayer } from './topLayer';

export type ToastVariant = 'success' | 'error' | 'info';

export interface ToastOptions {
  variant?: ToastVariant;
  /** Milisegundos antes de auto-cerrar. 0 = no auto-cierra. */
  durationMs?: number;
}

interface ToastItem {
  id: number;
  message: ReactNode;
  variant: ToastVariant;
}

interface ToastContextValue {
  toast: (message: ReactNode, options?: ToastOptions) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

/** Hook de consumo: `const { toast } = useToast(); toast('Producto creado', { variant: 'success' })` */
export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>');
  return ctx;
}

const variantClasses: Record<ToastVariant, string> = {
  success: 'border-success/30 bg-success-bg text-success',
  error: 'border-danger/30 bg-danger-bg text-danger',
  info: 'border-info/30 bg-info-bg text-info',
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(0);
  // Los timers de cierre se cortan al desmontar: si no, uno pendiente dispara
  // un setState sobre un provider que ya no está (en los tests, con el jsdom
  // ya desarmado: "window is not defined" y la suite falla).
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>());
  useEffect(() => {
    const pending = timers.current;
    return () => {
      pending.forEach(clearTimeout);
      pending.clear();
    };
  }, []);

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback(
    (message: ReactNode, options?: ToastOptions) => {
      const id = nextId.current++;
      const variant = options?.variant ?? 'info';
      const durationMs = options?.durationMs ?? 4000;

      setToasts((current) => [...current, { id, message, variant }]);

      if (durationMs > 0) {
        const timer = setTimeout(() => {
          timers.current.delete(timer);
          dismiss(id);
        }, durationMs);
        timers.current.add(timer);
      }
    },
    [dismiss],
  );

  // Con un modal abierto, los avisos van adentro del de arriba: afuera
  // quedaban debajo del fondo oscuro e inertes (no se podían cerrar), justo
  // los errores que dispara un form dentro del modal. Viven en un nodo propio
  // que se mueve de lugar (sin volver a montar los avisos) y va PRIMERO en el
  // modal: así no se mete entre los botones del pie.
  const [slot] = useState(() => (typeof document === 'undefined' ? null : document.createElement('div')));
  const host = useSyncExternalStore(topLayer.subscribe, topLayer.top, () => null);
  useLayoutEffect(() => {
    if (!slot) return;
    if (host) host.prepend(slot);
    else document.body.append(slot);
  }, [slot, host]);
  useEffect(() => () => slot?.remove(), [slot]);

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      {slot &&
        createPortal(
          <div
            aria-live="polite"
            className="pointer-events-none fixed bottom-4 right-4 z-[100] flex w-80 flex-col gap-2"
          >
            {toasts.map((t) => (
              <div
                key={t.id}
                role="status"
                className={cn(
                  'pointer-events-auto flex items-start justify-between gap-3 rounded-md border px-4 py-3 text-sm font-medium shadow-card',
                  variantClasses[t.variant],
                )}
              >
                <span>{t.message}</span>
                <button
                  type="button"
                  onClick={() => dismiss(t.id)}
                  aria-label="Cerrar notificación"
                  className="shrink-0 opacity-60 hover:opacity-100"
                >
                  <svg className="h-4 w-4" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                    <path
                      d="M6 6l8 8M14 6l-8 8"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                    />
                  </svg>
                </button>
              </div>
            ))}
          </div>,
          slot,
        )}
    </ToastContext.Provider>
  );
}
