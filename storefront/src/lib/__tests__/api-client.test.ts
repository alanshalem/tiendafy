import { afterEach, describe, expect, it, vi } from 'vitest';
import { clientJson, clientJsonTenant, problemMessage, tenantHeaders } from '../api-client';

afterEach(() => vi.unstubAllGlobals());

describe('tenantHeaders', () => {
  it('solo tenant por defecto', () => {
    expect(tenantHeaders('t1')).toEqual({ 'X-Tenant-Id': 't1' });
  });

  it('agrega Content-Type para requests con body JSON', () => {
    expect(tenantHeaders('t1', true)).toEqual({
      'Content-Type': 'application/json',
      'X-Tenant-Id': 't1',
    });
  });
});

describe('clientJson / clientJsonTenant', () => {
  it('devuelve el JSON cuando la respuesta es ok', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: 1 }))));
    expect(await clientJson('/api/v1/x')).toEqual({ ok: 1 });
  });

  it('devuelve null ante !ok y ante error de red', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('nope', { status: 500 })));
    expect(await clientJson('/api/v1/x')).toBeNull();

    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    expect(await clientJson('/api/v1/x')).toBeNull();
  });

  it('clientJsonTenant manda el header del tenant y respeta init', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}'));
    vi.stubGlobal('fetch', fetchMock);
    await clientJsonTenant('/api/v1/x', 't1', { headers: { Accept: 'application/json' } });
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.headers).toEqual({ 'X-Tenant-Id': 't1', Accept: 'application/json' });
  });
});

describe('problemMessage', () => {
  const res = (body: string, status = 400) => new Response(body, { status });

  it('prefiere detail, después title', async () => {
    expect(await problemMessage(res('{"detail":"Cupón vencido.","title":"Bad Request"}'), 'f')).toBe(
      'Cupón vencido.',
    );
    expect(await problemMessage(res('{"title":"Bad Request"}'), 'f')).toBe('Bad Request');
  });

  it('cae al fallback con body vacío o no-JSON', async () => {
    expect(await problemMessage(res('{}'), 'algo salió mal')).toBe('algo salió mal');
    expect(await problemMessage(res('<html>'), 'algo salió mal')).toBe('algo salió mal');
  });
});
