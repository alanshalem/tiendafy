'use client';

import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import { Modal } from './Modal';
import { Button, type ButtonVariant } from './Button';

export interface ConfirmOptions {
  title?: string;
  message: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Estilo del botón de confirmación (p.ej. 'danger' para acciones destructivas). */
  variant?: ButtonVariant;
}

type ConfirmFn = (opts: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn | null>(null);

/**
 * Provider de un único diálogo de confirmación global. `useConfirm()` devuelve
 * una función `confirm(opts): Promise<boolean>` — reemplaza a `window.confirm`
 * con un modal que respeta el tema, sin crear un Modal por cada caso.
 */
export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<{ opts: ConfirmOptions; resolve: (v: boolean) => void } | null>(null);

  const confirm = useCallback<ConfirmFn>(
    (opts) => new Promise<boolean>((resolve) => setState({ opts, resolve })),
    [],
  );

  const settle = (result: boolean) => {
    state?.resolve(result);
    setState(null);
  };

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <Modal
        open={!!state}
        onClose={() => settle(false)}
        size="sm"
        title={state?.opts.title ?? 'Confirmar'}
        footer={
          <>
            <Button variant="secondary" onClick={() => settle(false)}>
              {state?.opts.cancelLabel ?? 'Cancelar'}
            </Button>
            <Button variant={state?.opts.variant ?? 'primary'} onClick={() => settle(true)}>
              {state?.opts.confirmLabel ?? 'Confirmar'}
            </Button>
          </>
        }
      >
        <div className="text-sm text-fg-muted">{state?.opts.message}</div>
      </Modal>
    </ConfirmContext.Provider>
  );
}

export function useConfirm(): ConfirmFn {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error('useConfirm debe usarse dentro de <ConfirmProvider>');
  return ctx;
}
