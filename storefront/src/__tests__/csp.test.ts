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
import { apiOrigin, buildCsp, isCardChallengePage, PAYWAY_SDK_URL } from '../lib/csp';
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

  it('sin unsafe-eval fuera de desarrollo, y con unsafe-inline (la caché impide los nonces)', () => {
    const prod = directive(buildCsp('https://api.x.com'), 'script-src').split(' ');
    expect(prod).not.toContain("'unsafe-eval'");
    expect(prod).toContain("'unsafe-inline'");
    expect(directive(buildCsp('https://api.x.com', { dev: true }), 'script-src')).toContain("'unsafe-eval'");
  });

  it('solo ella misma y el panel pueden enmarcar la tienda', () => {
    const csp = buildCsp('https://api.x.com', { adminOrigin: 'https://admin.x.com/' });
    expect(directive(csp, 'frame-ancestors')).toBe("frame-ancestors 'self' https://admin.x.com");
    expect(directive(buildCsp('https://api.x.com'), 'frame-ancestors')).toBe("frame-ancestors 'self'");
    expect(directive(csp, 'base-uri')).toBe("base-uri 'self'");
    expect(directive(csp, 'object-src')).toBe("object-src 'none'");
  });

  it('el proxy toma el origen del panel del entorno del contenedor', () => {
    vi.stubEnv('PUBLIC_ADMIN_ORIGIN', 'https://admin.tienda-de-prueba.com');
    const csp =
      proxy(new NextRequest('https://tienda-de-prueba.com/')).headers.get('Content-Security-Policy') ?? '';
    expect(directive(csp, 'frame-ancestors')).toContain('https://admin.tienda-de-prueba.com');
  });

  it('deja cargar el SDK de Payway y tokenizar contra sus hosts, y nada más de Payway', () => {
    const csp = buildCsp('https://api.x.com');
    const scripts = directive(csp, 'script-src');
    // El archivo exacto que carga el formulario de tarjeta, no el host entero.
    expect(scripts).toContain(PAYWAY_SDK_URL);
    expect(scripts.split(' ')).not.toContain('https://ventasonline.payway.com.ar');
    expect(PAYWAY_SDK_URL).toBe('https://ventasonline.payway.com.ar/static/v2.6.4/decidir.js');

    const connect = directive(csp, 'connect-src').split(' ');
    // Sandbox, el productivo del backend y el productivo alternativo.
    expect(connect).toContain('https://developers.decidir.com');
    expect(connect).toContain('https://live.decidir.com');
    expect(connect).toContain('https://ventasonline.payway.com.ar');
    // Sin comodines ni la huella de Cybersource (antifraude no implementado).
    expect(connect.filter((s) => /decidir|payway/.test(s) && s.includes('*'))).toEqual([]);
    expect(csp).not.toContain('online-metrix');
  });

  it('deja cargar los Bricks de Mercado Pago: su código y sus textos vienen de http2.mlstatic.com', () => {
    const csp = buildCsp('https://api.x.com');
    expect(directive(csp, 'script-src').split(' ')).toContain('https://http2.mlstatic.com');
    expect(directive(csp, 'connect-src').split(' ')).toContain('https://http2.mlstatic.com');
  });

  it('el desafío del banco (3DS) se puede mostrar en la página de pago, y solo ahí', () => {
    // El Status Screen Brick arma un iframe y le postea un formulario al
    // servidor del banco de la tarjeta, que no se conoce de antemano.
    const pay = buildCsp('https://api.x.com', { cardChallenge: true });
    expect(directive(pay, 'frame-src').split(' ')).toContain('https:');
    expect(directive(pay, 'form-action').split(' ')).toContain('https:');
    // Nada de http: ni de comodines fuera de eso.
    expect(directive(pay, 'frame-src').split(' ')).not.toContain('http:');
    expect(directive(pay, 'frame-src')).not.toMatch(/ \*( |$)/);

    const other = buildCsp('https://api.x.com');
    expect(directive(other, 'frame-src').split(' ')).not.toContain('https:');
    expect(directive(other, 'form-action').split(' ')).not.toContain('https:');

    expect(isCardChallengePage('/checkout')).toBe(true);
    expect(isCardChallengePage('/checkout/success')).toBe(false);
    expect(isCardChallengePage('/productos')).toBe(false);
  });

  it('el proxy abre el desafío del banco solo en /checkout', () => {
    vi.stubEnv('PUBLIC_API_URL', 'https://api.tienda-de-prueba.com');
    const csp = (path: string) =>
      proxy(new NextRequest(`https://tienda-de-prueba.com${path}`)).headers.get('Content-Security-Policy') ??
      '';
    expect(directive(csp('/checkout'), 'form-action').split(' ')).toContain('https:');
    expect(directive(csp('/checkout/pending'), 'form-action').split(' ')).not.toContain('https:');
    expect(directive(csp('/'), 'frame-src').split(' ')).not.toContain('https:');
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
