/**
 * Acceso a localStorage tolerante a SSR y a errores (quota / JSON inválido /
 * modo privado). Centraliza el patrón try/catch + JSON.parse que estaba repetido
 * en cart, favorites, auth, etc. Mismo comportamiento: ante cualquier fallo,
 * devuelve el fallback (nunca tira).
 */
export function readJson<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function writeJson(key: string, value: unknown): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* quota / modo privado: se ignora, igual que antes */
  }
}

export function removeKey(key: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(key);
  } catch {
    /* modo privado: se ignora */
  }
}
