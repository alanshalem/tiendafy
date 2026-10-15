/**
 * La URL de la API en el navegador se lee en cada llamada. Era una constante
 * que se calculaba al cargar el módulo: si un chunk se evaluaba antes que el
 * <script> con la config de runtime, quedaba fija en localhost:5080 para toda
 * la visita y el carrito, el login y los favoritos le pegaban a la nada.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiUrl, clientJson } from '../api-client';

afterEach(() => {
  delete window.__TIENDAFY_CONFIG__;
  vi.restoreAllMocks();
});

describe('apiUrl', () => {
  it('toma la config inyectada aunque llegue después de cargar el módulo', async () => {
    // El módulo ya está cargado (import de arriba) y recién ahora aparece la config.
    window.__TIENDAFY_CONFIG__ = { apiUrl: 'https://api.tienda.com.ar' };
    expect(apiUrl()).toBe('https://api.tienda.com.ar');

    const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{"ok":true}'));
    await clientJson('/api/v1/cosa');
    expect(fetch).toHaveBeenCalledWith('https://api.tienda.com.ar/api/v1/cosa', undefined);
  });

  it('sin config inyectada cae a la del entorno', () => {
    expect(apiUrl()).toMatch(/^https?:\/\//);
  });
});
