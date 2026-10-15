/**
 * Cliente HTTP server-side hacia el backend. Solo se usa en Server
 * Components / route handlers — API_URL no se expone al browser.
 */

const API_URL = process.env.API_URL ?? 'http://localhost:5080';

/**
 * Cuánto se espera a la API por intento. Sin tope, una API colgada dejaba la
 * página (y el worker de Node que la arma) esperando para siempre; con esto la
 * página cae a su error en segundos en vez de que el visitante mire una
 * pestaña cargando.
 */
export const API_TIMEOUT_MS = 8_000;

/**
 * apiGet + header X-Tenant-Id (evita repetirlo en cada fetch del storefront).
 * `attempts`: reintentos ante red caída o 5xx (ver apiGet); 0 para lo que no
 * vale la pena esperar.
 */
export function apiGetTenant<T>(
  path: string,
  tenantId: string,
  init?: RequestInit,
  attempts?: number,
): Promise<T | null> {
  // El tenant TAMBIÉN viaja en la URL (_mt): la Data Cache de Next cachea por
  // URL e IGNORA los headers — sin esto, dos tiendas con el mismo path (ej.
  // /pages/by-slug/terminos con revalidate) COMPARTÍAN entrada de caché y una
  // podía servir el contenido de la otra. El backend ignora el query extra.
  const sep = path.includes('?') ? '&' : '?';
  return apiGet<T>(
    `${path}${sep}_mt=${tenantId}`,
    {
      ...init,
      headers: { 'X-Tenant-Id': tenantId, ...init?.headers },
    },
    attempts,
  );
}

/** Un abort (por el tope de tiempo o porque el que llamó canceló): no se reintenta. */
function isAbort(e: unknown): boolean {
  return e instanceof Error && (e.name === 'TimeoutError' || e.name === 'AbortError');
}

/**
 * GET a la API. Devuelve null cuando la API dice que no hay nada que mostrar
 * (404) o que no hay credenciales (401/403); tira en cualquier otro error.
 *
 * Solo se reintenta lo que puede salir bien al segundo intento: la red caída y
 * los 5xx. Un 4xx es una respuesta, no una falla pasajera — antes el `throw`
 * quedaba adentro del mismo try que atrapaba los errores de red y un 400 se
 * pedía tres veces, con esperas. Tampoco se reintenta un timeout: si la API
 * tardó 8 s, insistir solo le suma carga y le suma espera al visitante.
 */
export async function apiGet<T>(path: string, init?: RequestInit, attempts = 2): Promise<T | null> {
  let lastError: unknown;
  for (let i = 0; i <= attempts; i++) {
    const timeout = AbortSignal.timeout(API_TIMEOUT_MS);
    let res: Response;
    try {
      res = await fetch(`${API_URL}${path}`, {
        ...init,
        headers: { Accept: 'application/json', ...init?.headers },
        signal: init?.signal ? AbortSignal.any([init.signal, timeout]) : timeout,
      });
    } catch (e) {
      if (isAbort(e)) throw new Error(`API ${path}: sin respuesta en ${API_TIMEOUT_MS} ms`, { cause: e });
      lastError = e; // error de red → reintentar
      if (i < attempts) await backoff(i);
      continue;
    }

    // 404 = no existe; 401/403 = sin credenciales (p.ej. preview sin token
    // válido). En ambos casos null → el caller cae a su fallback en vez de
    // romper el Server Component (iframe/página en blanco).
    if (res.status === 404 || res.status === 401 || res.status === 403) return null;
    if (res.ok) return (await res.json()) as T;
    if (res.status < 500) throw new Error(`API ${path} responded ${res.status}`);

    lastError = new Error(`API ${path} responded ${res.status}`); // 5xx → reintentar
    if (i < attempts) await backoff(i);
  }
  throw lastError ?? new Error(`API ${path} failed`);
}

const backoff = (i: number) => new Promise((r) => setTimeout(r, 150 * (i + 1)));
