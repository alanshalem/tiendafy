import { runtimeValue } from './runtime';

/**
 * Manda un error a Sentry si hay DSN; si no, no hace nada (quien llama ya lo
 * deja en la consola). El SDK se baja recién acá, y solo con DSN: importarlo
 * de forma estática lo metía en el JS de todas las páginas.
 */
export function reportError(error: unknown, context: { tags?: Record<string, string>; extra?: object }) {
  if (!runtimeValue('sentryDsn')) return;
  void import('@sentry/nextjs').then((Sentry) =>
    Sentry.captureException(error, { tags: context.tags, extra: { ...context.extra } }),
  );
}
