import { sentryScrubbers } from '@tiendafy/types';
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

/**
 * Prende Sentry si hay DSN. El ambiente sale de la config de runtime, así que
 * los errores de staging y los de producción quedan separados aunque la imagen
 * sea la misma. Los scrubbers tapan los secretos que viajan en URLs (el
 * `?token=` de restablecer la clave, por ejemplo) antes de mandar nada.
 */
export function initSentry(): Promise<void> | undefined {
  if (!runtime.sentryDsn) return undefined;
  return import('@sentry/react').then((Sentry) => {
    Sentry.init({
      dsn: runtime.sentryDsn,
      environment: runtime.envName,
      tracesSampleRate: 0.1,
      ...sentryScrubbers,
    });
  });
}
