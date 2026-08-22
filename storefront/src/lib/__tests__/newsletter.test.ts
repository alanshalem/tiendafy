import { afterEach, describe, expect, it, vi } from 'vitest';
import { subscribeNewsletter } from '../newsletter';

afterEach(() => vi.unstubAllGlobals());

describe('subscribeNewsletter', () => {
  it('manda el email, el origen y el honeypot con el header de la tienda', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{"ok":true}'));
    vi.stubGlobal('fetch', fetchMock);

    expect(await subscribeNewsletter('t1', '  Alguien@Example.com ', 'footer')).toBe(true);

    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain('/api/v1/newsletter');
    expect(init.method).toBe('POST');
    expect(init.headers['X-Tenant-Id']).toBe('t1');
    expect(JSON.parse(init.body)).toEqual({
      email: 'Alguien@Example.com',
      source: 'footer',
      website: '',
    });
  });

  it('devuelve false ante error del servidor o de red, sin tirar', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('nope', { status: 400 })));
    expect(await subscribeNewsletter('t1', 'a@b.com', 'home')).toBe(false);

    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    expect(await subscribeNewsletter('t1', 'a@b.com', 'home')).toBe(false);
  });
});
