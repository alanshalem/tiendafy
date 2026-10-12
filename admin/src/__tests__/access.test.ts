/**
 * La tabla de accesos del panel: qué permiso pide cada pantalla, a dónde cae
 * /configuracion y cómo se tilda respetando requisitos. Y que las claves sean
 * EXACTAMENTE las del catálogo del backend (si alguien agrega un permiso de un
 * lado y no del otro, esto falla).
 */
import { describe, expect, it } from 'vitest';
import {
  firstSettingsPath,
  PERMISSION_KEYS,
  routePerm,
  satisfies,
  SETTINGS_PERMISSIONS,
  togglePermission,
  type Perm,
  type PermissionInfo,
} from '../lib/access';
import { fixture } from '../test/api';
import { ALL_PATHS } from '../App';

const matrix = fixture<{ permissions: PermissionInfo[]; roles: { role: string; permissions: Perm[] }[] }>(
  '/api/v1/members/roles',
);
const can =
  (...perms: Perm[]) =>
  (p: Perm) =>
    perms.includes(p);

describe('las claves', () => {
  it('son las mismas que el catálogo del backend, en el mismo orden', () => {
    expect([...PERMISSION_KEYS]).toEqual(matrix.permissions.map((p) => p.key));
  });

  it('cada pantalla con permiso pide claves que existen', () => {
    for (const path of ALL_PATHS) {
      const req = routePerm(path);
      if (req === undefined) continue;
      for (const key of typeof req === 'string' ? [req] : req) expect(PERMISSION_KEYS).toContain(key);
    }
  });
});

describe('qué pide cada pantalla', () => {
  it('cada funcionalidad con su permiso', () => {
    expect(routePerm('/estadisticas')).toBe('stats.read');
    expect(routePerm('/estadisticas/rentabilidad')).toBe('costs.read');
    expect(routePerm('/presupuestos')).toBe('quotes.manage');
    expect(routePerm('/marketing')).toBe('campaigns.manage');
    expect(routePerm('/productos/listas-de-precios')).toBe('prices.manage');
    expect(routePerm('/configuracion/medios-de-envio')).toBe('shipping.config');
    expect(routePerm('/configuracion/roles')).toBe('members.read');
  });

  it('Dominios es del dueño, como en el backend', () => {
    expect(routePerm('/configuracion/dominios')).toBe('tenant.admin');
  });

  it('toda pantalla pide un permiso, salvo las que son de todos', () => {
    const deTodos = ['/', '/tenants', '/ayuda'];
    expect(ALL_PATHS.filter((p) => routePerm(p) === undefined)).toEqual(deTodos);
  });

  it('Inicio, Mis tiendas y la ayuda son de todos', () => {
    for (const path of ['/', '/tenants', '/ayuda']) expect(routePerm(path)).toBeUndefined();
  });

  it('con varios permisos alcanza con uno', () => {
    expect(satisfies(can('inventory.read'), routePerm('/productos'))).toBe(true);
    expect(satisfies(can('catalog.write'), routePerm('/productos'))).toBe(true);
    expect(satisfies(can('orders.read'), routePerm('/productos'))).toBe(false);
    expect(satisfies(can(), undefined)).toBe(true);
  });
});

describe('/configuracion', () => {
  it('lleva a la primera pantalla que la persona puede ver', () => {
    expect(firstSettingsPath(can(...PERMISSION_KEYS))).toBe('medios-de-pago');
    expect(firstSettingsPath(can('catalog.write'))).toBe('ficha-tecnica');
    expect(firstSettingsPath(can('members.read'))).toBe('usuarios');
    expect(firstSettingsPath(can('orders.read'))).toBeNull();
  });

  it('todas las pantallas de configuración tienen permiso', () => {
    for (const p of Object.keys(SETTINGS_PERMISSIONS)) expect(routePerm(`/configuracion/${p}`)).toBeDefined();
  });
});

describe('tildar respetando requisitos', () => {
  const catalog = matrix.permissions;

  it('dar algo da también su requisito', () => {
    const next = togglePermission(new Set(), 'orders.refund', true, catalog);
    expect([...next].sort()).toEqual(['orders.read', 'orders.refund']);
  });

  it('quitar el requisito se lleva lo que depende de él', () => {
    const next = togglePermission(
      new Set(['orders.read', 'orders.refund', 'orders.fulfill', 'stats.read']),
      'orders.read',
      false,
      catalog,
    );
    expect([...next]).toEqual(['stats.read']);
  });

  it('lo demás no se toca', () => {
    expect([...togglePermission(new Set(['stats.read']), 'costs.read', true, catalog)].sort()).toEqual([
      'costs.read',
      'stats.read',
    ]);
  });
});
