// Sentry del lado del servidor (SSR/route handlers). Activo solo con DSN.
export async function register() {
  const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN || process.env.SENTRY_DSN;
  if (!dsn) return;
  const Sentry = await import('@sentry/nextjs');
  Sentry.init({ dsn, environment: process.env.NODE_ENV, tracesSampleRate: 0.1 });
}
