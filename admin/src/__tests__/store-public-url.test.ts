/**
 * La dirección pública de una tienda: el dominio propio, el dominio a secas
 * para la tienda principal de la instalación, o el subdominio. Antes la
 * principal aparecía como puenteoriente.puenteoriente.com.ar en "Ver tienda",
 * en los links de redes y en la vista previa de Google.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

async function load(config: Record<string, string>) {
  window.__TIENDAFY_CONFIG__ = config;
  vi.resetModules();
  return import('../lib/storefront');
}

afterEach(() => {
  delete window.__TIENDAFY_CONFIG__;
  vi.resetModules();
});

describe('dirección pública de la tienda', () => {
  it('la principal va en el dominio a secas; las demás, en su subdominio', async () => {
    const { storePublicUrl, storePublicHost, storefrontUrl } = await load({
      storefrontOrigin: 'https://{sub}.puenteoriente.com.ar',
      primaryStoreSubdomain: 'PuenteOriente',
    });
    expect(storePublicUrl({ subdomain: 'puenteoriente' })).toBe('https://puenteoriente.com.ar');
    expect(storePublicUrl({ subdomain: 'puenteoriente' }, '/productos/x')).toBe(
      'https://puenteoriente.com.ar/productos/x',
    );
    expect(storePublicHost({ subdomain: 'puenteoriente' })).toBe('puenteoriente.com.ar');
    expect(storePublicHost({ subdomain: 'volxen' })).toBe('volxen.puenteoriente.com.ar');
    // La vista previa del editor sigue yendo por el subdominio.
    expect(storefrontUrl('puenteoriente')).toBe('https://puenteoriente.puenteoriente.com.ar');
  });

  it('el dominio propio gana, venga con esquema o barra al final', async () => {
    const { storePublicUrl, storePublicHost } = await load({
      storefrontOrigin: 'https://{sub}.puenteoriente.com.ar',
      primaryStoreSubdomain: 'puenteoriente',
    });
    expect(storePublicHost({ subdomain: 'volxen', customDomain: 'volxen.com.ar' })).toBe('volxen.com.ar');
    expect(storePublicUrl({ subdomain: 'puenteoriente', customDomain: 'https://cking.com.ar/' }, '/x')).toBe(
      'https://cking.com.ar/x',
    );
  });

  it('sin tienda principal configurada (desarrollo), todo por subdominio', async () => {
    const { storePublicHost } = await load({ storefrontOrigin: 'http://{sub}.localhost:3000' });
    expect(storePublicHost({ subdomain: 'puenteoriente' })).toBe('puenteoriente.localhost:3000');
  });
});
