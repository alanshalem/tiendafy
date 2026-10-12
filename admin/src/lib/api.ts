import type { ApiError } from '@tiendafy/types';

import { runtime } from './runtime';

export const API_URL = runtime.apiUrl;

export class ApiRequestError extends Error {
  constructor(
    public readonly status: number,
    public readonly error: ApiError,
    /** El servidor explicó el error (el `detail` de RFC 7807), o es el genérico de acá. */
    public readonly explained = true,
  ) {
    super(error.message);
  }
}

/**
 * Mensaje de error legible: el que explicó la API; si no lo explicó (un 500
 * vacío, un 502 del proxy) o no es un error de la API, el de la pantalla.
 * Antes el "Request failed with status 502" técnico le ganaba al mensaje
 * pensado para el comercio.
 */
export function errMsg(e: unknown, fallback = 'Error'): string {
  return e instanceof ApiRequestError && e.explained ? e.message : fallback;
}

/** Construye el ApiRequestError a partir de una respuesta no-ok (RFC 7807). */
async function toApiError(res: Response, fallbackMessage: string): Promise<ApiRequestError> {
  // La API devuelve RFC 7807: { title: código, detail: mensaje }.
  const problem = await res.json().catch(() => null);
  return new ApiRequestError(
    res.status,
    {
      code: problem?.title ?? `HTTP.${res.status}`,
      message: problem?.detail ?? fallbackMessage,
    },
    typeof problem?.detail === 'string',
  );
}

/** Tienda activa — la setea StoreContext; viaja como X-Tenant-Id. */
let activeTenantId: string | null = null;

export function setActiveTenant(tenantId: string | null) {
  activeTenantId = tenantId;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    credentials: 'include', // manda la cookie de sesión del admin
    headers: {
      'Content-Type': 'application/json',
      ...(activeTenantId ? { 'X-Tenant-Id': activeTenantId } : {}),
      ...init?.headers,
    },
  });

  if (!res.ok) throw await toApiError(res, `Request failed with status ${res.status}`);

  return res.status === 204 ? (undefined as T) : res.json();
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body: unknown) => request<T>(path, { method: 'POST', body: JSON.stringify(body) }),
  patch: <T>(path: string, body: unknown) =>
    request<T>(path, { method: 'PATCH', body: JSON.stringify(body) }),
  /** `init` opcional (p.ej. { keepalive: true } para flushes al cerrar la pestaña). */
  put: <T>(path: string, body: unknown, init?: RequestInit) =>
    request<T>(path, { method: 'PUT', body: JSON.stringify(body), ...init }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
  /** multipart/form-data — el browser setea el Content-Type con boundary. */
  upload: async <T>(path: string, file: File): Promise<T> => {
    const form = new FormData();
    form.append('file', file);
    return sendForm<T>(path, form);
  },
  /** multipart/form-data con campos extra además del archivo. */
  postForm: <T>(path: string, form: FormData): Promise<T> => sendForm<T>(path, form),
  /** Descarga un archivo (CSV/binario) y devuelve el Blob, con el header de tenant. */
  download: async (path: string): Promise<Blob> => {
    const res = await fetch(`${API_URL}${path}`, {
      credentials: 'include',
      headers: activeTenantId ? { 'X-Tenant-Id': activeTenantId } : undefined,
    });
    if (!res.ok) throw await toApiError(res, `Download failed with status ${res.status}`);
    return res.blob();
  },
};

async function sendForm<T>(path: string, form: FormData): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    method: 'POST',
    credentials: 'include',
    headers: activeTenantId ? { 'X-Tenant-Id': activeTenantId } : undefined,
    body: form,
  });
  if (!res.ok) throw await toApiError(res, `Upload failed with status ${res.status}`);
  return res.status === 204 ? (undefined as T) : res.json();
}
