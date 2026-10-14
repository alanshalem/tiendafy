/**
 * Cada página con su título (el layout le suma " · <Tienda>") y las privadas
 * fuera de Google. Antes contacto, checkout, la cuenta, favoritos y la vista
 * previa salían todas como "Tienda online".
 */
import type { Metadata } from 'next';
import { describe, expect, it } from 'vitest';
import { NOT_INDEXED } from '../lib/seo';

const meta = async (load: () => Promise<{ metadata: Metadata }>) => (await load()).metadata;

describe('títulos', () => {
  it.each([
    ['contacto', () => import('../app/contacto/page'), 'Contacto'],
    ['cuenta', () => import('../app/cuenta/layout'), 'Mi cuenta'],
    ['cambio de clave', () => import('../app/cuenta/reset/page'), 'Nueva contraseña'],
    ['verificar email', () => import('../app/cuenta/verificar/page'), 'Verificar email'],
    ['favoritos', () => import('../app/favoritos/page'), 'Mis favoritos'],
    ['checkout', () => import('../app/checkout/layout'), 'Finalizar compra'],
    ['pago aprobado', () => import('../app/checkout/success/layout'), 'Pago aprobado'],
    ['pago rechazado', () => import('../app/checkout/failure/layout'), 'No se pudo completar el pago'],
    ['pago pendiente', () => import('../app/checkout/pending/layout'), 'Pago pendiente'],
    ['términos', () => import('../app/terminos/page'), 'Términos y condiciones'],
    ['vista previa', () => import('../app/preview/page'), 'Vista previa'],
  ] as const)('%s', async (_, load, title) => {
    expect((await meta(load as () => Promise<{ metadata: Metadata }>)).title).toBe(title);
  });
});

describe('fuera de Google (noindex, sin bloquearlas en robots.txt)', () => {
  it.each([
    ['la cuenta', () => import('../app/cuenta/layout')],
    ['el checkout y sus resultados', () => import('../app/checkout/layout')],
    ['favoritos', () => import('../app/favoritos/page')],
    ['la vista previa del editor', () => import('../app/preview/page')],
  ] as const)('%s', async (_, load) => {
    expect((await meta(load as () => Promise<{ metadata: Metadata }>)).robots).toEqual(NOT_INDEXED);
  });

  it('los layouts nuevos solo envuelven', async () => {
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
