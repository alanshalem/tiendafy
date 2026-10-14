/**
 * El aviso del backend para vencer la Data Cache al toque (publicar un
 * diseño, cambiar productos o categorías), y las etiquetas que lleva cada
 * pedido cacheado para que ese aviso sirva.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const revalidateTag = vi.hoisted(() => vi.fn());
vi.mock('next/cache', () => ({ revalidateTag }));

import { POST } from '../app/internal/revalidate/route';
import { cacheFor, cacheTag } from '../lib/cache';

const TENANT = '08f81530-fcdc-46b4-a764-d7fdd54d1881';
const SECRET = 'un-secreto-de-prueba';

const post = (body: unknown, secret: string | null = SECRET) =>
  POST(
    new Request('http://tienda/internal/revalidate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(secret !== null ? { 'X-Revalidate-Secret': secret } : {}),
      },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    }),
  );

beforeEach(() => {
  revalidateTag.mockReset();
  vi.stubEnv('REVALIDATE_SECRET', SECRET);
});
afterEach(() => vi.unstubAllEnvs());

describe('POST /internal/revalidate', () => {
  it('vence al instante las etiquetas de esa tienda', async () => {
    const res = await post({ tenantId: TENANT, scopes: ['theme', 'catalog', 'categories'] });
    expect(res.status).toBe(200);
    expect(revalidateTag.mock.calls).toEqual([
      [`theme:${TENANT}`, { expire: 0 }],
      [`catalog:${TENANT}`, { expire: 0 }],
      [`categories:${TENANT}`, { expire: 0 }],
    ]);
  });

  it('el estado de una tienda refresca la resolución por host (sin id)', async () => {
    await post({ tenantId: TENANT, scopes: ['tenant'] });
    expect(revalidateTag).toHaveBeenCalledWith('tenants', { expire: 0 });
  });

  it('sin el secreto, o con otro, no toca nada', async () => {
    expect((await post({ tenantId: TENANT, scopes: ['theme'] }, null)).status).toBe(401);
    expect((await post({ tenantId: TENANT, scopes: ['theme'] }, 'otro')).status).toBe(401);
    expect(revalidateTag).not.toHaveBeenCalled();
  });

  it('en producción, sin REVALIDATE_SECRET está apagada (no hay modo abierto)', async () => {
    vi.stubEnv('REVALIDATE_SECRET', '');
    vi.stubEnv('NODE_ENV', 'production');
    expect((await post({ tenantId: TENANT, scopes: ['theme'] }, '')).status).toBe(503);
    expect((await post({ tenantId: TENANT, scopes: ['theme'] }, 'dev-revalidate-secret')).status).toBe(503);
    expect(revalidateTag).not.toHaveBeenCalled();
  });

  it('en desarrollo, sin configurar nada, acepta el secreto de appsettings.Development.json', async () => {
    vi.stubEnv('REVALIDATE_SECRET', '');
    vi.stubEnv('NODE_ENV', 'development');
    expect((await post({ tenantId: TENANT, scopes: ['theme'] }, 'dev-revalidate-secret')).status).toBe(200);
  });

  it('un cuerpo inválido es 400: tienda que no es un id, familias desconocidas o JSON roto', async () => {
    expect((await post({ tenantId: 'x', scopes: ['theme'] })).status).toBe(400);
    expect((await post({ tenantId: TENANT, scopes: ['todo'] })).status).toBe(400);
    expect((await post('{roto')).status).toBe(400);
    expect(revalidateTag).not.toHaveBeenCalled();
  });
});

describe('etiquetas de la Data Cache', () => {
  it('cada familia por tienda, con su ventana de tiempo de respaldo', () => {
    expect(cacheFor('theme', TENANT)).toEqual({ next: { revalidate: 30, tags: [`theme:${TENANT}`] } });
    expect(cacheFor('catalog', TENANT, 3600).next).toEqual({ revalidate: 3600, tags: [`catalog:${TENANT}`] });
    expect(cacheTag('tenant', TENANT)).toBe('tenants');
  });
});
