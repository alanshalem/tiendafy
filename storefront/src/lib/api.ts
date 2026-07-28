/**
 * Cliente HTTP server-side hacia el backend. Solo se usa en Server
 * Components / route handlers — API_URL no se expone al browser.
 */

const API_URL = process.env.API_URL ?? 'http://localhost:5080';

/** apiGet + header X-Tenant-Id (evita repetirlo en cada fetch del storefront). */
export function apiGetTenant<T>(path: string, tenantId: string, init?: RequestInit): Promise<T | null> {
  // El tenant TAMBIÉN viaja en la URL (_mt): la Data Cache de Next cachea por
  // URL e IGNORA los headers — sin esto, dos tiendas con el mismo path (ej.
  // /pages/by-slug/terminos con revalidate) COMPARTÍAN entrada de caché y una
  // podía servir el contenido de la otra. El backend ignora el query extra.
  const sep = path.includes('?') ? '&' : '?';
  return apiGet<T>(`${path}${sep}_mt=${tenantId}`, {
    ...init,
    headers: { 'X-Tenant-Id': tenantId, ...init?.headers },
  });
}

export async function apiGet<T>(path: string, init?: RequestInit, attempts = 2): Promise<T | null> {
  let lastError: unknown;
  for (let i = 0; i <= attempts; i++) {
    try {
      const res = await fetch(`${API_URL}${path}`, {
        ...init,
        headers: { Accept: 'application/json', ...init?.headers },
      });

      // 404 = no existe; 401/403 = sin credenciales (p.ej. preview sin token
      // válido). En ambos casos null → el caller cae a su fallback en vez de
      // romper el Server Component (iframe/página en blanco).
      if (res.status === 404 || res.status === 401 || res.status === 403) return null;
      if (res.status >= 500) {
        // Error del servidor: reintentar.
        lastError = new Error(`API ${path} responded ${res.status}`);
      } else if (!res.ok) {
        // 4xx (no-404): no reintentar.
        throw new Error(`API ${path} responded ${res.status}`);
      } else {
        return res.json() as Promise<T>;
      }
    } catch (e) {
      lastError = e; // error de red → reintentar
    }
    if (i < attempts) await new Promise((r) => setTimeout(r, 150 * (i + 1)));
  }
  throw lastError ?? new Error(`API ${path} failed`);
}
