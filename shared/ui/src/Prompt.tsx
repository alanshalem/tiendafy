'use client';

import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import { Modal } from './Modal';
import { Button } from './Button';
import { Input } from './Input';

export interface PromptOptions {
  title?: string;
  message?: ReactNode;
  defaultValue?: string;
  placeholder?: string;
  confirmLabel?: string;
  cancelLabel?: string;
}

type PromptFn = (opts: PromptOptions) => Promise<string | null>;

const PromptContext = createContext<PromptFn | null>(null);

/**
 * Provider de un único diálogo de entrada de texto global. `usePrompt()` devuelve
 * `prompt(opts): Promise<string | null>` — reemplaza a `window.prompt` con un modal
 * temático. Resuelve `null` si se cancela.
 */
export function PromptProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<{ opts: PromptOptions; resolve: (v: string | null) => void } | null>(
    null,
  );
  const [value, setValue] = useState('');

  const prompt = useCallback<PromptFn>(
    (opts) =>
      new Promise<string | null>((resolve) => {
        setValue(opts.defaultValue ?? '');
        setState({ opts, resolve });
      }),
    [],
  );

  const settle = (result: string | null) => {
    state?.resolve(result);
    setState(null);
  };

  return (
    <PromptContext.Provider value={prompt}>
      {children}
      <Modal
        open={!!state}
        onClose={() => settle(null)}
        size="sm"
        title={state?.opts.title ?? ''}
        footer={
          <>
            <Button variant="secondary" onClick={() => settle(null)}>
              {state?.opts.cancelLabel ?? 'Cancelar'}
            </Button>
            <Button variant="primary" onClick={() => settle(value)}>
              {state?.opts.confirmLabel ?? 'Aceptar'}
            </Button>
          </>
        }
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            settle(value);
          }}
        >
          {state?.opts.message && <p className="mb-2 text-sm text-fg-muted">{state.opts.message}</p>}
          {/* eslint-disable-next-line jsx-a11y/no-autofocus */}
          <Input
            autoFocus
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={state?.opts.placeholder}
          />
        </form>
      </Modal>
    </PromptContext.Provider>
  );
}

export function usePrompt(): PromptFn {
  const ctx = useContext(PromptContext);
  if (!ctx) throw new Error('usePrompt debe usarse dentro de <PromptProvider>');
  return ctx;
}
