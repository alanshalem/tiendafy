/**
 * Cliente HTTP server-side hacia el backend. Solo se usa en Server
 * Components / route handlers — API_URL no se expone al browser.
 */

const API_URL = process.env.API_URL ?? 'http://localhost:5080';

export async function apiGet<T>(path: string, init?: RequestInit): Promise<T | null> {
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: { Accept: 'application/json', ...init?.headers },
  });

  if (res.status === 404) return null;
  if (!res.ok) {
    throw new Error(`API ${path} responded ${res.status}`);
  }

  return res.json() as Promise<T>;
}
