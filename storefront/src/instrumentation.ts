import { serverRuntimeConfig } from '@/lib/runtime';

// Sentry del lado del servidor (SSR/route handlers). Activo solo con DSN.
// El DSN sale de la misma config de runtime que el del browser
// (PUBLIC_SENTRY_DSN en el contenedor): antes se leía NEXT_PUBLIC_SENTRY_DSN,
// que el compose no pasa, y el servidor nunca reportaba nada.
export async function register() {
  const { sentryDsn, envName } = serverRuntimeConfig();
  const dsn = sentryDsn || process.env.SENTRY_DSN;
  if (!dsn) return;
  const Sentry = await import('@sentry/nextjs');
  Sentry.init({ dsn, environment: envName, tracesSampleRate: 0.1 });
}
