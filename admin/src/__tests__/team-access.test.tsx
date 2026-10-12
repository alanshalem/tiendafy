/**
 * Roles y permisos en el panel: la matriz editable por rol, las excepciones de
 * cada persona, el registro de actividad, y que el menú muestre solo lo que
 * cada uno puede usar.
 */
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { fixture, mockApi, type MockApi } from '../test/api';
import { renderApp } from '../test/render';
import { settle } from '../test/explore';
import type { Perm } from '../lib/access';

interface RoleRow {
  role: string;
  label: string;
  permissions: Perm[];
  defaults: Perm[];
}
interface Matrix {
  roles: RoleRow[];
}

const ROLES = '/api/v1/members/roles';
const matrix = fixture<Matrix>(ROLES);
const me = fixture<{ role: string; permissions: Perm[] }>('/api/v1/me/permissions');
const roleRow = (role: string) => matrix.roles.find((r) => r.role === role)!;

const body = (api: MockApi, method: string, path: string) =>
  api.calls.filter((c) => c.method === method && c.path === path).at(-1)?.body as { permissions: string[] };

async function open(path: string, setup?: (api: MockApi) => void) {
  const api = mockApi();
  setup?.(api);
  const user = userEvent.setup({ delay: null, pointerEventsCheck: 0 });
  renderApp(path);
  await settle(4);
  return { api, user };
}

/** Pisa los permisos de quien mira el panel. */
const as = (role: string, permissions: Perm[]) => (api: MockApi) =>
  api.on('GET', '/api/v1/me/permissions', { role, permissions });

describe('roles y permisos: la matriz', () => {
  it('la columna del dueño no se edita; las demás sí', async () => {
    await open('/configuracion/roles');
    expect(await screen.findByRole('checkbox', { name: 'Devolver plata: Dueño' })).toBeDisabled();
    expect(screen.getByRole('checkbox', { name: 'Devolver plata: Dueño' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Devolver plata: Vendedor' })).toBeEnabled();
    expect(screen.getByRole('checkbox', { name: 'Devolver plata: Vendedor' })).not.toBeChecked();
    // Lo que es solo del dueño no se ofrece a nadie más.
    expect(
      screen.getByRole('checkbox', { name: 'Dominios, editar y borrar la tienda: Administrador' }),
    ).toBeDisabled();
  });

  it('tildar le da el permiso al rol, con su requisito', async () => {
    const { api, user } = await open('/configuracion/roles');
    await user.click(await screen.findByRole('checkbox', { name: 'Devolver plata: Catálogo' }));
    await settle(2);
    const sent = body(api, 'PUT', `${ROLES}/catalogo`).permissions;
    expect(sent).toEqual(
      expect.arrayContaining([...roleRow('catalogo').permissions, 'orders.refund', 'orders.read']),
    );
  });

  it('destildar se lo saca', async () => {
    const { api, user } = await open('/configuracion/roles');
    await user.click(await screen.findByRole('checkbox', { name: 'Hacer presupuestos: Vendedor' }));
    await settle(2);
    expect(body(api, 'PUT', `${ROLES}/vendedor`).permissions).not.toContain('quotes.manage');
  });

  it('un rol cambiado se marca y se puede restaurar', async () => {
    const vendedor = roleRow('vendedor');
    const { api, user } = await open('/configuracion/roles', (a) =>
      a.on('GET', ROLES, {
        ...matrix,
        roles: matrix.roles.map((r) =>
          r.role === 'vendedor' ? { ...r, permissions: [...vendedor.permissions, 'orders.refund'] } : r,
        ),
      }),
    );
    expect(await screen.findByRole('checkbox', { name: 'Devolver plata: Vendedor' })).toBeChecked();
    await user.click(screen.getByRole('button', { name: /Restaurar/ }));
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Restaurar' }));
    await settle(2);
    expect(api.calls.some((c) => c.method === 'DELETE' && c.path === `${ROLES}/vendedor`)).toBe(true);
  });

  it('si el backend rechaza el cambio, lo dice y vuelve atrás', async () => {
    const { user } = await open('/configuracion/roles', (a) =>
      a.on(
        'PUT',
        `${ROLES}/soporte`,
        { detail: 'Solo podés dar o quitar permisos que vos mismo tenés.' },
        403,
      ),
    );
    const box = await screen.findByRole('checkbox', { name: 'Ver estadísticas: Soporte' });
    await user.click(box);
    expect(
      await screen.findByText('Solo podés dar o quitar permisos que vos mismo tenés.'),
    ).toBeInTheDocument();
    await waitFor(() => expect(box).not.toBeChecked());
  });

  it('sin permiso para editarla, es solo lectura', async () => {
    await open(
      '/configuracion/roles',
      as(
        'admin',
        me.permissions.filter((p) => p !== 'roles.manage'),
      ),
    );
    expect(await screen.findByText(/Solo lectura/)).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Ver estadísticas: Soporte' })).toBeDisabled();
  });

  it('un administrador no toca su propio rol ni reparte lo que no tiene', async () => {
    const mine = roleRow('admin').permissions.filter((p) => p !== 'finance.manage');
    await open('/configuracion/roles', as('admin', mine));
    expect(await screen.findByRole('checkbox', { name: 'Ver estadísticas: Administrador' })).toBeDisabled();
    expect(screen.getByRole('checkbox', { name: 'Tesorería y cuentas corrientes: Vendedor' })).toBeDisabled();
    expect(screen.getByRole('checkbox', { name: 'Ver costos y rentabilidad: Vendedor' })).toBeEnabled();
  });
});

describe('usuarios: excepciones y registro', () => {
  const owner = fixture<{ items: object[] }>('/api/v1/members').items[0]!;
  const seller = {
    userId: 'u-seller',
    role: 'vendedor',
    email: 'ventas@tienda.com',
    name: 'Ventas',
    createdAtUtc: '2026-10-01T00:00:00Z',
    permissions: roleRow('vendedor').permissions,
    customized: false,
  };
  const withSeller = (s: object) => (a: MockApi) =>
    a.on('GET', '/api/v1/members', { items: [owner, s], total: 2 });

  it('a una persona se le suma algo sin cambiarle el rol', async () => {
    const { api, user } = await open('/configuracion/usuarios', withSeller(seller));
    await user.click(await screen.findByRole('button', { name: `Permisos de ${seller.email}` }));
    const dialog = within(await screen.findByRole('dialog'));
    await user.click(dialog.getByRole('checkbox', { name: 'Devolver plata' }));
    expect(dialog.getByText('agregado')).toBeInTheDocument();
    expect(dialog.getByText(/1 de más/)).toBeInTheDocument();
    await user.click(dialog.getByRole('button', { name: 'Guardar' }));
    await settle(2);
    expect(body(api, 'PUT', `/api/v1/members/${seller.userId}/permissions`).permissions).toContain(
      'orders.refund',
    );
  });

  it('una persona personalizada se marca y vuelve a lo de su rol', async () => {
    const { api, user } = await open(
      '/configuracion/usuarios',
      withSeller({ ...seller, customized: true, permissions: [...seller.permissions, 'costs.read'] }),
    );
    expect(await screen.findByText('Personalizado')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: `Permisos de ${seller.email}` }));
    await user.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: 'Volver a lo del rol' }),
    );
    await settle(2);
    expect(
      api.calls.some(
        (c) => c.method === 'DELETE' && c.path === `/api/v1/members/${seller.userId}/permissions`,
      ),
    ).toBe(true);
  });

  it('cambiarle el rol a alguien personalizado avisa que se borran sus excepciones', async () => {
    const { user } = await open('/configuracion/usuarios', withSeller({ ...seller, customized: true }));
    await user.selectOptions(await screen.findByLabelText(`Rol de ${seller.email}`), 'soporte');
    expect(await screen.findByText(/esas excepciones se borran/)).toBeInTheDocument();
  });

  it('a uno mismo no se le ofrecen excepciones', async () => {
    await open('/configuracion/usuarios');
    await screen.findByText('Vos');
    expect(screen.queryByRole('button', { name: /^Permisos de/ })).toBeNull();
  });

  it('el registro de actividad cuenta quién cambió qué', async () => {
    await open('/configuracion/usuarios', (a) =>
      a.on('GET', '/api/v1/members/activity', {
        items: [
          {
            id: 'e1',
            action: 'role.permissions',
            actorName: 'duenio@tienda.com',
            summary: 'Cambió lo que puede Vendedor: le dio Devolver plata.',
            createdAtUtc: '2026-10-12T10:00:00Z',
          },
        ],
        total: 1,
      }),
    );
    expect(
      await screen.findByText('Cambió lo que puede Vendedor: le dio Devolver plata.'),
    ).toBeInTheDocument();
    expect(screen.getByText(/duenio@tienda\.com/)).toBeInTheDocument();
  });

  it('sin actividad, explica qué va a aparecer', async () => {
    await open('/configuracion/usuarios');
    expect(await screen.findByText(/Todavía no hay cambios/)).toBeInTheDocument();
  });
});

describe('el menú según lo que cada uno puede', () => {
  it('alguien de soporte ve solo lo suyo', async () => {
    await open('/', as('soporte', roleRow('soporte').permissions));
    const nav = within(screen.getByRole('navigation'));
    for (const label of ['Ventas', 'Clientes', 'Chat posventa', 'Mensajes de contacto', 'Mercado Libre'])
      expect(nav.getByText(label)).toBeInTheDocument();
    for (const label of ['Estadísticas', 'Productos', 'Cupones', 'Tesorería', 'Configuración'])
      expect(nav.queryByText(label)).toBeNull();
  });

  it('alguien de catálogo ve productos y la configuración (por la ficha técnica)', async () => {
    await open('/', as('catalogo', roleRow('catalogo').permissions));
    const nav = within(screen.getByRole('navigation'));
    expect(nav.getByText('Productos')).toBeInTheDocument();
    expect(nav.queryByText('Ventas')).toBeNull();
    expect(screen.getByRole('link', { name: /Configuración/ })).toBeInTheDocument();
  });

  it('quien solo ve el stock mira los productos sin poder editarlos', async () => {
    await open('/productos', as('vendedor', roleRow('vendedor').permissions));
    await screen.findByRole('heading', { name: 'Productos' });
    await settle(3);
    expect(screen.queryByRole('link', { name: /Agregar producto/ })).toBeNull();
    expect(screen.queryByRole('link', { name: /Exportar e importar/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /^Acciones de/ })).toBeNull();
    expect(screen.queryByRole('checkbox', { name: 'Seleccionar todos' })).toBeNull();
    for (const price of screen.getAllByRole('textbox', { name: /^Precio de/ }))
      expect(price).toHaveAttribute('readonly');
  });

  it('una pantalla sin permiso muestra el aviso, no la pantalla', async () => {
    await open('/estadisticas', as('soporte', roleRow('soporte').permissions));
    expect(await screen.findByText('No tenés permiso para ver esta sección')).toBeInTheDocument();
  });

  it('/configuracion lleva a lo primero que la persona puede ver', async () => {
    await open('/configuracion', as('catalogo', roleRow('catalogo').permissions));
    expect(await screen.findByRole('heading', { name: 'Ficha técnica' })).toBeInTheDocument();
  });
});
