import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiGet, apiGetTenant, API_TIMEOUT_MS } from '../api';

/**
 * Qué hace el server de la tienda cuando la API contesta mal: qué se reintenta
 * (la red y los 5xx), qué no (un 4xx es una respuesta; un timeout, una API que
 * ya está lenta) y que ningún pedido quede colgado para siempre.
 */

const json = (status: number, body: unknown = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.useFakeTimers();
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.useRealTimers();
});

/** Corre el pedido dejando correr los timers de las esperas entre intentos. */
async function run<T>(p: Promise<T>): Promise<T> {
  const settled = p.then(
    (v) => ({ ok: true as const, v }),
    (e: unknown) => ({ ok: false as const, e }),
  );
  await vi.runAllTimersAsync();
  const r = await settled;
  if (r.ok) return r.v;
  throw r.e;
}

describe('apiGet', () => {
  it('devuelve el JSON de una respuesta 2xx', async () => {
    fetchMock.mockResolvedValue(json(200, { name: 'Remera' }));
    expect(await run(apiGet('/api/v1/x'))).toEqual({ name: 'Remera' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each([404, 401, 403])('un %i es "no hay" (null), sin reintentar', async (status) => {
    fetchMock.mockResolvedValue(json(status));
    expect(await run(apiGet('/api/v1/x'))).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('un 400 tira enseguida: no se pide tres veces lo que va a fallar igual', async () => {
    fetchMock.mockResolvedValue(json(400));
    await expect(run(apiGet('/api/v1/x'))).rejects.toThrow('responded 400');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('un 5xx se reintenta y, si la API se recupera, sale bien', async () => {
    fetchMock.mockResolvedValueOnce(json(503)).mockResolvedValueOnce(json(200, { ok: 1 }));
    expect(await run(apiGet('/api/v1/x'))).toEqual({ ok: 1 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('un 5xx que no se recupera tira después de los reintentos', async () => {
    fetchMock.mockResolvedValue(json(500));
    await expect(run(apiGet('/api/v1/x'))).rejects.toThrow('responded 500');
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('la red caída se reintenta', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('fetch failed')).mockResolvedValueOnce(json(200, [1]));
    expect(await run(apiGet('/api/v1/x'))).toEqual([1]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('cada intento lleva un tope de tiempo, y un timeout no se reintenta', async () => {
    fetchMock.mockImplementation((_url: string, init: RequestInit) => {
      expect(init.signal).toBeInstanceOf(AbortSignal);
      const timeout = new Error('The operation was aborted due to timeout');
      timeout.name = 'TimeoutError';
      return Promise.reject(timeout);
    });
    await expect(run(apiGet('/api/v1/x'))).rejects.toThrow(`sin respuesta en ${API_TIMEOUT_MS} ms`);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('respeta la señal de quien llama (combinada con el tope)', async () => {
    const ctrl = new AbortController();
    fetchMock.mockImplementation((_url: string, init: RequestInit) => {
      ctrl.abort();
      expect(init.signal?.aborted).toBe(true);
      return Promise.resolve(json(200, {}));
    });
    await run(apiGet('/api/v1/x', { signal: ctrl.signal }));
  });
});

describe('apiGetTenant', () => {
  it('lleva el tenant en el header y en la URL (la Data Cache ignora headers)', async () => {
    fetchMock.mockResolvedValue(json(200, {}));
    await run(apiGetTenant('/api/v1/theme?x=1', 't-1'));
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/api/v1/theme?x=1&_mt=t-1');
    expect((init.headers as Record<string, string>)['X-Tenant-Id']).toBe('t-1');
  });
});
