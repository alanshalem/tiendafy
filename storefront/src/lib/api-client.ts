import { runtimeValue } from './runtime';

/**
 * Base URL del backend para fetches del lado del CLIENTE (browser).
 *
 * Se lee en CADA llamada, no al cargar el módulo: era una constante y, si un
 * chunk se evaluaba antes que el <script> que inyecta la config (los scripts
 * async de Next pueden adelantarse), quedaba fija en el default de desarrollo
 * (localhost:5080) para toda la visita. Leerla cuesta un acceso a window.
 */
export function apiUrl(): string {
  return runtimeValue('apiUrl');
}

/**
 * fetch client-side que devuelve el JSON o `null` (ante !ok o error de red).
 * Mismo comportamiento que el patrón repetido `.then(r => r.ok ? r.json() : null).catch(() => null)`.
 * `path` es relativo (se le antepone apiUrl()). Pasá method/headers/body/credentials por `init`.
 */
export async function clientJson<T>(path: string, init?: RequestInit): Promise<T | null> {
  try {
    const res = await fetch(`${apiUrl()}${path}`, init);
    return res.ok ? ((await res.json()) as T) : null;
  } catch {
    return null;
  }
}

/** Headers estándar del storefront: tenant, y Content-Type cuando el request lleva body JSON. */
export const tenantHeaders = (tenantId: string, json = false): Record<string, string> =>
  json ? { 'Content-Type': 'application/json', 'X-Tenant-Id': tenantId } : { 'X-Tenant-Id': tenantId };

/** clientJson + header X-Tenant-Id (el patrón de casi todos los fetches del storefront). */
export const clientJsonTenant = <T>(path: string, tenantId: string, init?: RequestInit): Promise<T | null> =>
  clientJson<T>(path, { ...init, headers: { 'X-Tenant-Id': tenantId, ...init?.headers } });

/** Mensaje de error de un ProblemDetails de la API (detail → title → fallback). */
export async function problemMessage(res: Response, fallback: string): Promise<string> {
  try {
    const data = await res.json();
    return data.detail || data.title || fallback;
  } catch {
    return fallback;
  }
}
