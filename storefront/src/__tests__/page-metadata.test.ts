// Importar cada página en frío (con la cobertura instrumentando) tarda: de ahí
// los timeouts largos, como en pages.test.

/**
 * Cada página con su título (el layout le suma " · <Tienda>") y las privadas
 * fuera de Google. Antes contacto, checkout, la cuenta, favoritos y la vista
 * previa salían todas como "Tienda online".
 */
import type { Metadata } from 'next';
import { describe, expect, it } from 'vitest';
import { NOT_INDEXED } from '../lib/seo';
import { fixture, fixtureTenantId, mockApi } from '../test/api';

const meta = async (load: () => Promise<{ metadata: Metadata }>) => (await load()).metadata;

describe('títulos', () => {
  it.each([
    ['contacto', () => import('../app/contacto/page'), 'Contacto'],
    ['cambio de clave', () => import('../app/cuenta/reset/page'), 'Nueva contraseña'],
    ['verificar email', () => import('../app/cuenta/verificar/page'), 'Verificar email'],
    ['favoritos', () => import('../app/favoritos/page'), 'Mis favoritos'],
    ['pago aprobado', () => import('../app/checkout/success/layout'), 'Pago aprobado'],
    ['pago rechazado', () => import('../app/checkout/failure/layout'), 'No se pudo completar el pago'],
    ['pago pendiente', () => import('../app/checkout/pending/layout'), 'Pago pendiente'],
    ['términos', () => import('../app/terminos/page'), 'Términos y condiciones'],
    ['vista previa', () => import('../app/preview/page'), 'Vista previa'],
  ] as const)('%s', { timeout: 60_000 }, async (_, load, title) => {
    expect((await meta(load as () => Promise<{ metadata: Metadata }>)).title).toBe(title);
  });
});

describe('secciones con páginas adentro (la cuenta, el checkout)', () => {
  it.each([
    ['la cuenta', () => import('../app/cuenta/layout'), 'Mi cuenta'],
    ['el checkout', () => import('../app/checkout/layout'), 'Finalizar compra'],
  ] as const)(
    '%s: su título con la tienda, y la plantilla para las de adentro; fuera de Google',
    { timeout: 60_000 },
    async (_, load, name) => {
      mockApi();
      const tenant = fixture<{ name: string }>(`/api/v1/tenants/${fixtureTenantId}`).name;
      const m = await (await load()).generateMetadata();
      // Un título fijo acá cortaba la plantilla del layout raíz: "Pago aprobado" sin la tienda.
      // El default va pelado: la plantilla del layout raíz ya le suma la tienda.
      expect(m.title).toEqual({ template: `%s · ${tenant}`, default: name });
      expect(m.robots).toEqual(NOT_INDEXED);
    },
  );

  it('sin tienda, el nombre solo', { timeout: 60_000 }, async () => {
    mockApi().on('GET', '/api/v1/tenants/resolve', {}, 404);
    expect((await (await import('../app/cuenta/layout')).generateMetadata()).title).toBe('Mi cuenta');
  });
});

describe('fuera de Google (noindex, sin bloquearlas en robots.txt)', () => {
  it.each([
    ['favoritos', () => import('../app/favoritos/page')],
    ['la vista previa del editor', () => import('../app/preview/page')],
  ] as const)('%s', { timeout: 60_000 }, async (_, load) => {
    expect((await meta(load as () => Promise<{ metadata: Metadata }>)).robots).toEqual(NOT_INDEXED);
  });

  it('los layouts nuevos solo envuelven', { timeout: 60_000 }, async () => {
    for (const load of [
      () => import('../app/cuenta/layout'),
      () => import('../app/checkout/layout'),
      () => import('../app/checkout/success/layout'),
      () => import('../app/checkout/failure/layout'),
      () => import('../app/checkout/pending/layout'),
    ]) {
      const Layout = (await load()).default;
      expect(Layout({ children: 'hola' })).toBe('hola');
    }
  });
});
