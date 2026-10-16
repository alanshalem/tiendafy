/**
 * Lo que Sentry no tiene que guardar del panel ni de la tienda: los secretos
 * que viajan en una URL.
 *
 * El SDK guarda la URL entera de la página en cada error (`request.url`), las
 * de cada navegación y cada fetch como breadcrumbs, y las de los spans si hay
 * tracing. Y varias URLs nuestras son llaves: el link firmado del seguimiento
 * y de las reseñas (`?t=`), la vista previa del editor (`?pt=`), los links de
 * restablecer la clave y de verificar el email (`?token=`). Sentry no tapa
 * nada de eso solo.
 *
 * Es la misma regla que la API aplica a su Sentry (Api/Startup/SentryScrubber.cs):
 * el token de un bot de Telegram en el path y el valor de los parámetros con
 * nombre de secreto. Se engancha en `beforeBreadcrumb`, `beforeSend` y
 * `beforeSendTransaction` con `sentryScrubbers`. No depende del SDK: los tipos
 * de acá son la parte de los de Sentry que se toca.
 */

const SENTRY_FILTERED = '[Filtered]';

const SENSITIVE_EXACT = new Set([
  't', // link firmado del mail: seguimiento del pedido, reseñas, clics de campañas
  'pt', // vista previa del editor de la tienda
  'key',
  'sig',
  'signature',
  'pwd',
  'authorization',
  'proxy-authorization',
  'cookie',
  'set-cookie',
]);

/** Nombre de parámetro, header o dato que lleva un secreto. */
function isSensitiveName(name: string): boolean {
  const n = name.trim().toLowerCase();
  return SENSITIVE_EXACT.has(n) || /token|secret|password|passwd/.test(n) || /(_key|-key|apikey)$/.test(n);
}

/** El path de la API de bots de Telegram: /bot<id>:<secreto>/… */
const BOT_TOKEN = /(\/bot)\d+:[A-Za-z0-9_-]+/g;
/** Un parámetro de query con su valor, adentro de cualquier texto. */
const QUERY_PARAM = /([?&;])([^=&#\s?;]+)=([^&#\s;"'<>]*)/g;

function decodeName(raw: string): string {
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

/**
 * Tapa el token del bot de Telegram en el path y el valor de los parámetros
 * sensibles de la query. Sirve para una URL suelta o un texto que la
 * contiene (un mensaje de error); lo demás queda igual, letra por letra.
 */
export function redactSecrets(text: string): string;
export function redactSecrets(text: string | undefined): string | undefined;
export function redactSecrets(text: string | undefined): string | undefined {
  if (!text) return text;
  let out = text.includes('/bot') ? text.replace(BOT_TOKEN, `$1${SENTRY_FILTERED}`) : text;
  if (out.includes('=')) {
    out = out.replace(QUERY_PARAM, (match, sep: string, name: string, value: string) =>
      value && isSensitiveName(decodeName(name)) ? `${sep}${name}=${SENTRY_FILTERED}` : match,
    );
  }
  return out;
}

/** Una query string suelta, con o sin "?" ("a=1&token=x"). */
function redactQuery(query: string): string {
  return query.startsWith('?') ? redactSecrets(query) : redactSecrets(`?${query}`).slice(1);
}

/** Un dato con nombre: si el nombre ya es de un secreto, se tapa entero. */
function redactNamed(key: string, value: unknown): unknown {
  if (typeof value !== 'string' || !value) return value;
  if (key === 'http.query') return redactQuery(value);
  return isSensitiveName(key) ? SENTRY_FILTERED : redactSecrets(value);
}

function scrubRecord(record: Record<string, unknown> | undefined): void {
  if (!record) return;
  for (const key of Object.keys(record)) record[key] = redactNamed(key, record[key]);
}

interface BreadcrumbLike {
  message?: string;
  data?: Record<string, unknown>;
}

type QueryLike = string | Record<string, string> | [string, string][];

interface EventLike {
  message?: string;
  transaction?: string;
  request?: {
    url?: string;
    query_string?: QueryLike;
    headers?: Record<string, string>;
    cookies?: Record<string, string>;
  };
  exception?: { values?: { value?: string }[] };
  breadcrumbs?: BreadcrumbLike[];
  spans?: { description?: string; data?: Record<string, unknown> }[];
  contexts?: Record<string, Record<string, unknown> | undefined>;
  extra?: Record<string, unknown>;
  tags?: Record<string, unknown>;
}

/** Breadcrumbs: el de cada fetch y cada navegación lleva URLs en sus datos. */
export function scrubSentryBreadcrumb<T extends BreadcrumbLike>(crumb: T): T {
  crumb.message = redactSecrets(crumb.message);
  scrubRecord(crumb.data);
  return crumb;
}

/** Errores y transacciones: la URL de la página, los mensajes y los spans. */
export function scrubSentryEvent<T extends EventLike>(event: T): T {
  event.message = redactSecrets(event.message);
  event.transaction = redactSecrets(event.transaction);

  const request = event.request;
  if (request) {
    request.url = redactSecrets(request.url);
    const q = request.query_string;
    if (typeof q === 'string') request.query_string = redactQuery(q);
    else if (Array.isArray(q))
      request.query_string = q.map(([k, v]): [string, string] => [k, redactNamed(k, v) as string]);
    else if (q) scrubRecord(q);
    if (request.headers) {
      for (const key of Object.keys(request.headers)) {
        request.headers[key] = isSensitiveName(key) ? SENTRY_FILTERED : redactSecrets(request.headers[key]!);
      }
    }
    if (request.cookies) request.cookies = {};
  }

  for (const ex of event.exception?.values ?? []) ex.value = redactSecrets(ex.value);
  for (const crumb of event.breadcrumbs ?? []) scrubSentryBreadcrumb(crumb);
  for (const span of event.spans ?? []) {
    span.description = redactSecrets(span.description);
    scrubRecord(span.data);
  }
  const trace = event.contexts?.trace;
  if (trace && typeof trace.data === 'object' && trace.data)
    scrubRecord(trace.data as Record<string, unknown>);
  scrubRecord(event.extra);
  scrubRecord(event.tags);
  return event;
}

/** Para `Sentry.init({ ...sentryScrubbers })` en el panel y en la tienda. */
export const sentryScrubbers = {
  beforeBreadcrumb: scrubSentryBreadcrumb,
  beforeSend: scrubSentryEvent,
  beforeSendTransaction: scrubSentryEvent,
};
