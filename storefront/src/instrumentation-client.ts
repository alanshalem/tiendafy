// Sentry del lado del browser del storefront. Activo solo con DSN (prod);
// sin DSN no se inicializa nada. Next carga este archivo automáticamente.
import { sentryScrubbers } from '@tiendafy/types';
import { runtimeValue } from '@/lib/runtime';

// DSN y ambiente salen de la config de runtime: la misma imagen corre en
// staging y en producción, y los errores de cada una quedan separados.
//
// Import dinámico: con el import estático el SDK (~73 KB gzip, casi un cuarto
// del JS de la tienda) viajaba a cada visitante aunque no hubiera DSN.
//
// Los scrubbers tapan los secretos que viajan en la URL de la página antes de
// mandar nada: el link firmado del seguimiento y de las reseñas (?t=), la
// vista previa del editor (?pt=), los links de clave y verificación (?token=).
const dsn = runtimeValue('sentryDsn');
if (dsn) {
  void import('@sentry/nextjs').then((Sentry) =>
    Sentry.init({ dsn, environment: runtimeValue('envName'), tracesSampleRate: 0.1, ...sentryScrubbers }),
  );
}
