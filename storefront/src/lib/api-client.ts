/**
 * Base URL del backend para fetches del lado del CLIENTE (browser).
 * `NEXT_PUBLIC_` → queda inline en el bundle del navegador. Antes esta constante
 * estaba duplicada (~15 veces, con nombres API/CART_API) en cada client component.
 */
export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:5080';

/**
 * fetch client-side que devuelve el JSON o `null` (ante !ok o error de red).
 * Mismo comportamiento que el patrón repetido `.then(r => r.ok ? r.json() : null).catch(() => null)`.
 * `path` es relativo (se le antepone API_URL). Pasá method/headers/body/credentials por `init`.
 */
export async function clientJson<T>(path: string, init?: RequestInit): Promise<T | null> {
  try {
    const res = await fetch(`${API_URL}${path}`, init);
    return res.ok ? ((await res.json()) as T) : null;
  } catch {
    return null;
  }
}
