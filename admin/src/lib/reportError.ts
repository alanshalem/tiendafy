import { runtime } from './runtime';

/**
 * Manda un error a Sentry si está configurado (DSN de runtime); si no, al
 * console. Sentry se carga aparte (main.tsx) para no sumar peso cuando no hay
 * DSN, así que acá también se importa a demanda.
 */
export function reportError(error: unknown, extra?: Record<string, unknown>) {
  if (!runtime.sentryDsn) {
    console.error(error);
    return;
  }
  void import('@sentry/react').then((Sentry) => Sentry.captureException(error, { extra }));
}
