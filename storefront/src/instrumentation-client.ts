// Sentry del lado del browser del storefront. Activo solo con DSN (prod);
// sin DSN no se inicializa nada. Next carga este archivo automáticamente.
import * as Sentry from '@sentry/nextjs';
import { runtimeValue } from '@/lib/runtime';

// DSN y ambiente salen de la config de runtime: la misma imagen corre en
// staging y en producción, y los errores de cada una quedan separados.
const dsn = runtimeValue('sentryDsn');
if (dsn) {
  Sentry.init({ dsn, environment: runtimeValue('envName'), tracesSampleRate: 0.1 });
}
