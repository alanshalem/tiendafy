import { createContext, type ReactNode } from 'react';
import type { ButtonVariant } from './Button';

export interface ConfirmOptions {
  title?: string;
  message: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Estilo del botón de confirmación (p.ej. 'danger' para acciones destructivas). */
  variant?: ButtonVariant;
}

export type ConfirmFn = (opts: ConfirmOptions) => Promise<boolean>;

/**
 * Aparte de Confirm.tsx porque el Modal también pregunta ("¿Descartar los
 * cambios?") y Confirm dibuja un Modal: así no se importan en círculo.
 */
export const ConfirmContext = createContext<ConfirmFn | null>(null);
