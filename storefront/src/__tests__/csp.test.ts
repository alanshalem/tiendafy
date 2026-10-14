/**
 * El Content-Security-Policy deja que el navegador hable con la API de ESTE
 * ambiente.
 *
 * En producción quedó `connect-src 'self'  https://*.mercadopago.com …`, sin
 * la API: el CSP se armaba al compilar con NEXT_PUBLIC_API_URL, que en una
 * imagen sin ambiente está vacía, y el navegador bloqueaba el login de los
 * compradores, el menú, el checkout y la medición. Ahora lo arma el proxy en
 * cada pedido con la URL que recibe el contenedor al arrancar.
 */
import { NextRequest } from 'next/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import nextConfig from '../../next.config';
import { apiOrigin, buildCsp } from '../lib/csp';
import { proxy } from '../proxy';

const directive = (csp: string, name: string) =>
  csp
    .split(';')
    .map((d) => d.trim())
    .find((d) => d.startsWith(`${name} `)) ?? '';

afterEach(() => vi.unstubAllEnvs());

describe('CSP de la tienda', () => {
  it('connect-src incluye el origen de la API, sin huecos', () => {
    const connect = directive(buildCsp('https://api.puenteoriente.com.ar/'), 'connect-src');
    expect(connect).toMatch(
      /^connect-src 'self' https:\/\/api\.puenteoriente\.com\.ar https:\/\/\*\.mercadopago\.com/,
    );
    expect(connect).not.toMatch(/ {2}/);
  });

  it('solo el origen de la API (sin ruta) y nada si la URL no sirve', () => {
    expect(apiOrigin('http://localhost:5080/api')).toBe('http://localhost:5080');
    expect(apiOrigin('')).toBeNull();
    expect(apiOrigin('no es una url')).toBeNull();
    expect(directive(buildCsp(''), 'connect-src')).toMatch(
      /^connect-src 'self' https:\/\/\*\.mercadopago\.com/,
    );
  });

  it('el proxy lo arma con la API del entorno con que arrancó el contenedor', async () => {
    vi.stubEnv('PUBLIC_API_URL', 'https://api.tienda-de-prueba.com');
    vi.stubEnv('NEXT_PUBLIC_API_URL', '');
    const response = proxy(new NextRequest('https://tienda-de-prueba.com/productos'));
    const csp = response.headers.get('Content-Security-Policy') ?? '';
    expect(directive(csp, 'connect-src')).toContain('https://api.tienda-de-prueba.com');
    expect(directive(csp, 'script-src')).toContain('https://sdk.mercadopago.com');
  });

  it('next.config no vuelve a fijar un CSP al compilar (pisaría al del proxy)', async () => {
    const rules = (await nextConfig.headers?.()) ?? [];
    const keys = rules.flatMap((r) => r.headers.map((h) => h.key.toLowerCase()));
    expect(keys).not.toContain('content-security-policy');
    expect(keys).toContain('x-content-type-options');
  });

  it('deja lo que usa la sección Video: el reproductor sin cookies de YouTube, Vimeo, sus miniaturas y los MP4', () => {
    const csp = buildCsp('https://api.x.com');
    const frames = directive(csp, 'frame-src');
    expect(frames).toContain('https://www.youtube-nocookie.com');
    expect(frames).toContain('https://player.vimeo.com');
    // Nada de comodines: un iframe de cualquier sitio no entra.
    expect(frames).not.toMatch(/ https: | \*/);
    expect(directive(csp, 'img-src')).toContain('https:'); // i.ytimg.com (miniatura)
    expect(directive(csp, 'media-src')).toContain('https:'); // el MP4 subido
  });
});
