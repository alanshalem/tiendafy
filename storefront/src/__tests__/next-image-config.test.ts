import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * /_next/image baja una foto de donde diga la URL y la sirve desde el origen
 * de la tienda. Con `**` en http y https era un proxy abierto: cualquiera lo
 * usaba para bajar lo que quisiera (de cualquier tamaño, SVG incluidos) a
 * nombre nuestro. Los productos traen fotos de proveedores en otros hosts, así
 * que no se cierra a un host, pero sí todo lo demás.
 */
async function loadConfig(nodeEnv: string) {
  vi.stubEnv('NODE_ENV', nodeEnv);
  vi.resetModules();
  return (await import('../../next.config')).default;
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('next/image', () => {
  it('en producción baja solo por https, con tope, sin SVG y como descarga', async () => {
    const images = (await loadConfig('production')).images!;

    expect(images.remotePatterns).toEqual([{ protocol: 'https', hostname: '**' }]);
    expect(images.dangerouslyAllowLocalIP).toBe(false);
    expect(images.dangerouslyAllowSVG).toBe(false);
    expect(images.contentDispositionType).toBe('attachment');
    expect(images.contentSecurityPolicy).toContain("script-src 'none'");
    expect(images.contentSecurityPolicy).toContain('sandbox');
    expect(images.maximumResponseBody).toBeLessThanOrEqual(10_000_000);
    expect(images.maximumRedirects).toBeLessThanOrEqual(1);
    expect(images.maximumDiskCacheSize).toBeGreaterThan(0);
  });

  it('en desarrollo además deja el MinIO local por http', async () => {
    const images = (await loadConfig('development')).images!;

    expect(images.remotePatterns).toEqual([
      { protocol: 'https', hostname: '**' },
      { protocol: 'http', hostname: 'localhost' },
      { protocol: 'http', hostname: '127.0.0.1' },
    ]);
    expect(images.dangerouslyAllowLocalIP).toBe(true);
  });
});
