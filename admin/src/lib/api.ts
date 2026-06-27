import type { ApiError } from '@tiendafy/types';

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:5080';

export class ApiRequestError extends Error {
  constructor(
    public readonly status: number,
    public readonly error: ApiError,
  ) {
    super(error.message);
  }
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

  if (!res.ok) {
    // La API devuelve RFC 7807: { title: código, detail: mensaje }.
    const problem = await res.json().catch(() => null);
    throw new ApiRequestError(res.status, {
      code: problem?.title ?? `HTTP.${res.status}`,
      message: problem?.detail ?? `Request failed with status ${res.status}`,
    });
  }

  return res.status === 204 ? (undefined as T) : res.json();
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body: unknown) =>
    request<T>(path, { method: 'POST', body: JSON.stringify(body) }),
  patch: <T>(path: string, body: unknown) =>
    request<T>(path, { method: 'PATCH', body: JSON.stringify(body) }),
  put: <T>(path: string, body: unknown) =>
    request<T>(path, { method: 'PUT', body: JSON.stringify(body) }),
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
    if (!res.ok) {
      const problem = await res.json().catch(() => null);
      throw new ApiRequestError(res.status, {
        code: problem?.title ?? `HTTP.${res.status}`,
        message: problem?.detail ?? `Download failed with status ${res.status}`,
      });
    }
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
  if (!res.ok) {
    const problem = await res.json().catch(() => null);
    throw new ApiRequestError(res.status, {
      code: problem?.title ?? `HTTP.${res.status}`,
      message: problem?.detail ?? `Upload failed with status ${res.status}`,
    });
  }
  return res.status === 204 ? (undefined as T) : res.json();
}
