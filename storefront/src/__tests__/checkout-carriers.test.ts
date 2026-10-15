import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  CARRIERS,
  enabledCarriers,
  quoteHint,
  requestCarrierQuote,
} from '../components/store/checkout-carriers';
import { apiUrl } from '../lib/api-client';

describe('correos que cotizan en el checkout', () => {
  it('se leen activos de /shipping/methods, cada uno con su campo', () => {
    expect(enabledCarriers({ items: [] })).toEqual([]);
    expect(
      enabledCarriers({
        correoArgentino: { enabled: true },
        zipnova: { enabled: false },
        andreani: { enabled: true },
      }),
    ).toEqual(['andreani', 'correo']);
  });

  it('el texto de ayuda nombra a todos los activos, en singular o plural', () => {
    expect(quoteHint(['andreani'])).toBe('Andreani cotiza al instante para tu dirección.');
    expect(quoteHint(['andreani', 'correo'])).toBe(
      'Andreani y Correo Argentino cotizan al instante para tu dirección.',
    );
    expect(quoteHint(['andreani', 'zipnova', 'correo'])).toBe(
      'Andreani, Zipnova y Correo Argentino cotizan al instante para tu dirección.',
    );
  });

  it('cada respuesta se lleva a la misma forma: retiro, sucursal y plazo', () => {
    const price = { amount: 100, currency: 'ARS' };
    expect(CARRIERS.andreani.toOption({ token: 't', name: 'A', price, toBranch: true })).toMatchObject({
      pickup: true,
      needsAgency: false,
      detail: 'Lo retirás en una sucursal de Andreani',
    });
    expect(
      CARRIERS.correo.toOption({ token: 't', kind: 'S', name: 'C', price, etaMin: '2', etaMax: '2' }),
    ).toMatchObject({ pickup: true, needsAgency: true, detail: 'Llega en 2 días hábiles' });
    expect(
      CARRIERS.zipnova.toOption({ token: 't', name: 'Z', price, estimatedDelivery: null }),
    ).toMatchObject({ pickup: false, detail: null });
  });
});

describe('requestCarrierQuote: el pedido de cotización, igual desde el checkout y la ficha', () => {
  const input = {
    postalCode: '1043',
    city: 'CABA',
    province: 'Buenos Aires',
    units: 2,
    items: [{ variantId: 'v1', quantity: 2 }],
    declaredValue: 3000,
  };
  afterEach(() => vi.restoreAllMocks());

  it('POST al correo con el cuerpo que él espera, el tenant y el tope de espera de quien llama', async () => {
    const fetch = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(JSON.stringify({ options: [{ token: 't' }] }), { status: 200 }));
    const timeout = vi.spyOn(AbortSignal, 'timeout');

    const res = await requestCarrierQuote('zipnova', 'tenant-1', input, 12_000);

    expect(res).toEqual({ ok: true, data: { options: [{ token: 't' }] } });
    const [url, init] = fetch.mock.calls[0]!;
    expect(url).toBe(`${apiUrl()}${CARRIERS.zipnova.path}`);
    expect(init).toMatchObject({
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Tenant-Id': 'tenant-1' },
      body: JSON.stringify(CARRIERS.zipnova.body(input)),
    });
    expect(init?.signal).toBeInstanceOf(AbortSignal);
    expect(timeout).toHaveBeenCalledWith(12_000);
  });

  it('un error de la API vuelve con su cuerpo (el detalle lo decide quien llama); sin JSON, null', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ detail: 'Andreani no responde.' }), { status: 502 }),
    );
    expect(await requestCarrierQuote('andreani', 't', input, 10_000)).toEqual({
      ok: false,
      data: { detail: 'Andreani no responde.' },
    });

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response('<html>', { status: 500 }));
    expect(await requestCarrierQuote('correo', 't', input, 10_000)).toEqual({ ok: false, data: null });
  });

  it('sin red tira: cada pantalla dice lo suyo', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(requestCarrierQuote('correo', 't', input, 10_000)).rejects.toThrow('Failed to fetch');
  });
});
