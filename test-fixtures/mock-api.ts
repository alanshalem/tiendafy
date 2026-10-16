/**
 * `fetch` simulado con las respuestas REALES de la API (api.json, exportado por
 * el backend con `pnpm fixtures:api`). Lo usan los tests de componentes del
 * admin y del storefront; cada proyecto lo instala con su propio `vi`.
 *
 * Sin dependencias de framework a propósito: solo Response, URL y JSON, así
 * resuelve igual desde los dos proyectos del workspace.
 *
 * Las rutas se buscan normalizadas igual que las exporta el backend (GUID →
 * `:id`, id numérico largo → `:n`, slug → `:slug`); con `?offset`, si existe,
 * la variante paginada (`ruta#paged`). Lo que no está responde 404, como la
 * API con un id inexistente. Las escrituras responden 200 con `{}` salvo que
 * el test diga otra cosa con `on`.
 */
import fixtures from './api.json';

type Json = unknown;

interface ApiCall {
  method: string;
  path: string;
  body: Json;
  headers: Record<string, string>;
}

export interface MockApi {
  calls: ApiCall[];
  /** Pisa la respuesta de una ruta (path normalizado o exacto) para un método. */
  on(method: string, path: string, respond: Json | ((body: Json) => Json), status?: number): void;
  fetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
}

const routes = (fixtures as { routes: Record<string, Json> }).routes;
export const fixtureTenantId = (fixtures as { tenantId: string }).tenantId;

/** La misma normalización que ApiFixturesExport.Normalize del backend. */
export function normalize(pathname: string): string {
  const segments = pathname.replace(/\/+$/, '').split('/');
  return segments
    .map((s, i) => {
      if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)) return ':id';
      if (/^\d{6,}$/.test(s)) return ':n';
      if (i > 0 && segments[i - 1] === 'by-slug') return ':slug';
      return s;
    })
    .join('/');
}

function response(status: number, body: Json): Response {
  return new Response(status === 204 ? null : JSON.stringify(body ?? {}), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function headersOf(init?: RequestInit): Record<string, string> {
  const out: Record<string, string> = {};
  new Headers(init?.headers).forEach((value, key) => (out[key] = value));
  return out;
}

export function createMockApi(): MockApi {
  const calls: ApiCall[] = [];
  const overrides = new Map<string, { status: number; respond: Json | ((body: Json) => Json) }>();

  const fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(
      typeof input === 'string' ? input : input instanceof URL ? input.href : input.url,
      'http://localhost',
    );
    const method = (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase();
    let body: Json = undefined;
    if (typeof init?.body === 'string') {
      try {
        body = JSON.parse(init.body);
      } catch {
        body = init.body;
      }
    }
    calls.push({ method, path: url.pathname + url.search, body, headers: headersOf(init) });

    const key = normalize(url.pathname);
    const override = overrides.get(`${method} ${url.pathname}`) ?? overrides.get(`${method} ${key}`);
    if (override) {
      const value =
        typeof override.respond === 'function'
          ? (override.respond as (b: Json) => Json)(body)
          : override.respond;
      return response(override.status, value);
    }

    if (method !== 'GET') return response(200, {});
    if (url.searchParams.has('offset') && `${key}#paged` in routes)
      return response(200, routes[`${key}#paged`]);
    return key in routes
      ? response(200, routes[key])
      : response(404, { title: 'NotFound', detail: 'No encontrado.' });
  };

  return {
    calls,
    fetch,
    on(method, path, respond, status = 200) {
      overrides.set(`${method.toUpperCase()} ${path}`, { status, respond });
    },
  };
}

/** El body de una ruta de las fixtures, para armar expectativas con datos reales. */
export function fixture<T = Json>(path: string): T {
  const key = normalize(path);
  if (!(key in routes)) throw new Error(`No hay fixture para ${key}. ¿Regenerar con pnpm fixtures:api?`);
  return routes[key] as T;
}
