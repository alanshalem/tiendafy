/**
 * Cliente HTTP server-side hacia el backend. Solo se usa en Server
 * Components / route handlers — API_URL no se expone al browser.
 */

const API_URL = process.env.API_URL ?? 'http://localhost:5080';

export async function apiGet<T>(path: string, init?: RequestInit, attempts = 2): Promise<T | null> {
  let lastError: unknown;
  for (let i = 0; i <= attempts; i++) {
    try {
      const res = await fetch(`${API_URL}${path}`, {
        ...init,
        headers: { Accept: 'application/json', ...init?.headers },
      });

      if (res.status === 404) return null;
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
