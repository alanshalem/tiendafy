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
async function toApiError(path: string, res: Response, fallbackMessage: string): Promise<ApiRequestError> {
  return problemToError(path, res.status, await res.json().catch(() => null), fallbackMessage);
}

export const SESSION_EXPIRED_MESSAGE = 'Tu sesión venció. Volvé a ingresar.';

/** Lo avisa AuthContext: con la sesión vencida se pide la clave encima de la pantalla. */
let onSessionExpired: (() => void) | null = null;

export function setSessionExpiredHandler(handler: (() => void) | null) {
  onSessionExpired = handler;
}

/**
 * Un 401 de cualquier pedido del panel es la sesión que venció (la cookie dura
 * 12 h desde el último uso). Antes llegaba con el cuerpo vacío y se mostraba
 * el genérico "No se pudo guardar…", y React Query lo reintentaba. Los de
 * /auth/ quedan afuera: ahí un 401 es una clave mal escrita o no tener sesión,
 * y los maneja la pantalla de ingreso.
 */
function isSessionExpiry(path: string, status: number): boolean {
  return status === 401 && !path.startsWith('/api/v1/auth/');
}

function problemToError(
  path: string,
  status: number,
  problem: unknown,
  fallbackMessage: string,
): ApiRequestError {
  if (isSessionExpiry(path, status)) {
    onSessionExpired?.();
    return new ApiRequestError(401, { code: 'Auth.SessionExpired', message: SESSION_EXPIRED_MESSAGE });
  }
  // La API devuelve RFC 7807: { title: código, detail: mensaje }. Algunos
  // endpoints de importación todavía responden { error: mensaje }.
  const p = (problem ?? {}) as { title?: string; detail?: unknown; error?: unknown };
  const detail = typeof p.detail === 'string' ? p.detail : typeof p.error === 'string' ? p.error : null;
  return new ApiRequestError(
    status,
    { code: p.title ?? `HTTP.${status}`, message: detail ?? fallbackMessage },
    detail !== null,
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

  if (!res.ok) throw await toApiError(path, res, `Request failed with status ${res.status}`);

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
  upload: async <T>(path: string, file: File, progress?: UploadProgress): Promise<T> => {
    const form = new FormData();
    form.append('file', file);
    return sendForm<T>(path, form, progress);
  },
  /** multipart/form-data con campos extra además del archivo. */
  postForm: <T>(path: string, form: FormData, progress?: UploadProgress): Promise<T> =>
    sendForm<T>(path, form, progress),
  /** Descarga un archivo (CSV/binario) y devuelve el Blob, con el header de tenant. */
  download: async (path: string): Promise<Blob> => {
    const res = await fetch(`${API_URL}${path}`, {
      credentials: 'include',
      headers: activeTenantId ? { 'X-Tenant-Id': activeTenantId } : undefined,
    });
    if (!res.ok) throw await toApiError(path, res, `Download failed with status ${res.status}`);
    return res.blob();
  },
};

export interface UploadProgress {
  /** Fracción enviada, de 0 a 1. */
  onProgress?: (fraction: number) => void;
  signal?: AbortSignal;
}

/** La subida que se canceló a pedido (no es un error para mostrar). */
export class UploadAbortedError extends Error {
  constructor() {
    super('Subida cancelada');
  }
}

/**
 * POST multipart con avance real. `fetch` no informa cuánto del cuerpo ya
 * salió; XMLHttpRequest sí, y un video de 20 MB por wifi de local tarda lo
 * suficiente como para que "Subiendo…" a secas parezca colgado.
 */
function sendForm<T>(path: string, form: FormData, progress?: UploadProgress): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${API_URL}${path}`);
    xhr.withCredentials = true;
    if (activeTenantId) xhr.setRequestHeader('X-Tenant-Id', activeTenantId);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && e.total > 0) progress?.onProgress?.(e.loaded / e.total);
    };
    xhr.onload = () => {
      let body: unknown;
      try {
        body = xhr.responseText ? JSON.parse(xhr.responseText) : null;
      } catch {
        body = null;
      }
      if (xhr.status >= 200 && xhr.status < 300) resolve((xhr.status === 204 ? undefined : body) as T);
      else reject(problemToError(path, xhr.status, body, `Upload failed with status ${xhr.status}`));
    };
    xhr.onerror = () => reject(new TypeError('Network error'));
    xhr.onabort = () => reject(new UploadAbortedError());
    if (progress?.signal) {
      if (progress.signal.aborted) return reject(new UploadAbortedError());
      progress.signal.addEventListener('abort', () => xhr.abort(), { once: true });
    }
    xhr.send(form);
  });
}
