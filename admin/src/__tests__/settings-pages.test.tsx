/**
 * Configuración de la tienda, pantalla por pantalla, con lo que viaja a la
 * API: medios de envío propios, campos de ficha técnica, redirecciones de
 * URLs viejas, dominio propio, usuarios y roles, medición (píxeles) y
 * opciones del checkout.
 */
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { fixture, mockApi, type MockApi } from '../test/api';
import { renderApp } from '../test/render';
import { settle } from '../test/explore';

async function open(path: string, setup?: (api: MockApi) => void) {
  const api = mockApi();
  setup?.(api);
  const user = userEvent.setup({ delay: null, pointerEventsCheck: 0 });
  renderApp(`/configuracion/${path}`);
  await settle(4);
  return { api, user };
}

const last = (api: MockApi, method: string, path: string) =>
  api.calls.filter((c) => c.method === method && c.path === path).at(-1)?.body as Record<string, unknown>;
const did = (api: MockApi, method: string, prefix: string) =>
  api.calls.some((c) => c.method === method && c.path.startsWith(prefix));

async function confirmDialog(button: RegExp | string) {
  await userEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: button }));
}

describe('medios de envío propios', () => {
  const pickup = fixture<{ items: { id: string; name: string }[] }>('/api/v1/admin/shipping/methods')
    .items[0]!;

  it('crea uno a domicilio y valida el retiro sin dirección', async () => {
    const { api, user } = await open('medios-de-envio');
    await user.click(screen.getAllByRole('button', { name: /Agregar medio de envío/ })[0]!);
    const dialog = within(await screen.findByRole('dialog', { name: 'Agregar medio de envío' }));

    await user.click(dialog.getByRole('button', { name: 'Crear medio de envío' }));
    expect(dialog.getByText('Ingresá un nombre.')).toBeInTheDocument();

    await user.type(dialog.getByPlaceholderText('Ej.: Envío express CABA'), 'Moto CABA');
    await user.selectOptions(dialog.getByLabelText('Tipo'), 'PICKUP');
    await user.click(dialog.getByRole('button', { name: 'Crear medio de envío' }));
    expect(api.calls.some((c) => c.method === 'POST')).toBe(false); // retiro sin dirección

    await user.selectOptions(dialog.getByLabelText('Tipo'), 'DELIVERY');
    await user.type(dialog.getByPlaceholderText('0 = gratis'), '1500,50');
    await user.type(dialog.getByPlaceholderText('Llega en 3 a 5 días hábiles'), 'En el día');
    await user.click(dialog.getByRole('switch', { name: 'Activo' }));
    await user.click(dialog.getByRole('button', { name: 'Crear medio de envío' }));
    await settle(2);
    expect(last(api, 'POST', '/api/v1/admin/shipping/methods')).toMatchObject({
      name: 'Moto CABA',
      kind: 'DELIVERY',
      price: 1500.5,
      description: 'En el día',
      pickupAddress: null,
      active: false,
    });
  });

  it('edita y elimina uno existente', async () => {
    const { api, user } = await open('medios-de-envio');
    await user.click(screen.getAllByTitle('Editar')[0]!);
    const dialog = within(await screen.findByRole('dialog', { name: 'Editar medio de envío' }));
    const name = dialog.getByDisplayValue(pickup.name);
    await user.clear(name);
    await user.type(name, 'Retiro en el depósito');
    await user.click(dialog.getByRole('button', { name: 'Guardar cambios' }));
    await settle(2);
    expect(last(api, 'PUT', `/api/v1/admin/shipping/methods/${pickup.id}`)).toMatchObject({
      name: 'Retiro en el depósito',
      kind: 'PICKUP',
    });

    await user.click(screen.getAllByTitle('Eliminar')[0]!);
    await confirmDialog(/Eliminar/);
    await settle(2);
    expect(did(api, 'DELETE', `/api/v1/admin/shipping/methods/${pickup.id}`)).toBe(true);
  });
});

describe('ficha técnica', () => {
  const material = fixture<{ items: { id: string; name: string }[] }>('/api/v1/spec-definitions').items[0]!;

  it('crea un campo de lista con opciones, filtrable y atado a ML', async () => {
    const { api, user } = await open('ficha-tecnica');
    await user.click(screen.getAllByRole('button', { name: /Agregar campo|Agregar el primero/ })[0]!);
    const dialog = within(await screen.findByRole('dialog'));
    await user.type(dialog.getByPlaceholderText('Diámetro del orificio'), 'Compatibilidad');
    await user.selectOptions(dialog.getByLabelText('Tipo'), 'LIST');
    await user.type(dialog.getByLabelText('Opciones'), 'Honda{Enter}Yamaha');
    await user.type(dialog.getByPlaceholderText('MODEL'), 'COMPATIBLE_MODELS');
    await user.click(dialog.getByRole('button', { name: /Guardar/ }));
    await settle(2);
    expect(last(api, 'POST', '/api/v1/spec-definitions/')).toMatchObject({
      name: 'Compatibilidad',
      type: 'LIST',
      options: ['Honda', 'Yamaha'],
      meliAttributeId: 'COMPATIBLE_MODELS',
    });
  });

  it('un número lleva unidad; editar y eliminar', async () => {
    const { api, user } = await open('ficha-tecnica');
    await user.click(screen.getAllByRole('button', { name: new RegExp(`Editar|${material.name}`) })[0]!);
    const dialog = within(await screen.findByRole('dialog'));
    await user.selectOptions(dialog.getByLabelText('Tipo'), 'NUMBER');
    await user.type(dialog.getByPlaceholderText('kg'), 'mm');
    await user.click(dialog.getByRole('button', { name: /Guardar/ }));
    await settle(2);
    expect(last(api, 'PUT', `/api/v1/spec-definitions/${material.id}`)).toMatchObject({
      type: 'NUMBER',
      unit: 'mm',
    });

    await user.click(screen.getAllByRole('button', { name: /Eliminar/ })[0]!);
    await confirmDialog(/Eliminar/);
    await settle(2);
    expect(did(api, 'DELETE', '/api/v1/spec-definitions/')).toBe(true);
  });
});

describe('redirecciones', () => {
  it('agrega una regla, muestra el error de la API y la elimina', async () => {
    const rule = {
      id: 'r1',
      fromPath: '/viejo',
      toPath: '/productos/nuevo',
      hits: 3,
      lastHitAtUtc: null,
      createdAtUtc: '2026-10-01T00:00:00Z',
    };
    const { api, user } = await open('redirecciones', (a) =>
      a.on('GET', '/api/v1/redirects', { items: [rule] }),
    );
    await user.type(screen.getByPlaceholderText('/producto-viejo'), '/remera-azul');
    await user.type(screen.getByPlaceholderText('/productos/nuevo-slug'), '/productos/remera');
    await user.click(screen.getByRole('button', { name: /Agregar/ }));
    await settle(2);
    expect(last(api, 'POST', '/api/v1/redirects/')).toEqual({
      from: '/remera-azul',
      to: '/productos/remera',
    });

    api.on('POST', '/api/v1/redirects', { detail: 'Ya hay una regla para esa URL.' }, 409);
    await user.type(screen.getByPlaceholderText('/producto-viejo'), '/viejo');
    await user.type(screen.getByPlaceholderText('/productos/nuevo-slug'), '/otro');
    await user.click(screen.getByRole('button', { name: /Agregar/ }));
    expect(await screen.findByText('Ya hay una regla para esa URL.')).toBeInTheDocument();

    await user.click(screen.getAllByRole('button', { name: /Eliminar|Quitar/ })[0]!);
    const dialog = screen.queryByRole('dialog');
    if (dialog) await confirmDialog(/Eliminar|Quitar/);
    await settle(2);
    expect(did(api, 'DELETE', '/api/v1/redirects/r1')).toBe(true);
  });
});

describe('dominio propio', () => {
  it('conecta un dominio, lo reverifica y lo quita', async () => {
    const { api, user } = await open('dominios');
    await user.click(screen.getByRole('button', { name: /Conectar mi dominio/ }));
    const dialog = within(await screen.findByRole('dialog', { name: 'Conectar mi dominio' }));
    await user.type(dialog.getByPlaceholderText('tumarca.com.ar'), 'pesas.com.ar');
    await user.click(dialog.getByRole('button', { name: 'Conectar' }));
    await settle(2);
    expect(
      api.calls.find((c) => c.method === 'PATCH' && c.path.startsWith('/api/v1/tenants/'))?.body,
    ).toMatchObject({
      customDomain: 'pesas.com.ar',
    });
  });

  it('con un dominio ya cargado: reverificar, copiar y quitar', async () => {
    const { api, user } = await open('dominios', (a) =>
      a.on('GET', '/api/v1/tenants/domain-status', {
        subdomain: 'seed.localhost',
        customDomain: 'pesas.com.ar',
        platformTarget: 'tiendafy.app',
        verified: false,
      }),
    );
    expect(screen.getAllByText(/pesas\.com\.ar/).length).toBeGreaterThan(0);
    await user.click(screen.getByRole('button', { name: 'Volver a verificar' }));
    await settle(2);
    await user.click(screen.getByRole('button', { name: 'Quitar' }));
    const confirm = screen.queryByRole('dialog');
    if (confirm) await user.click(within(confirm).getAllByRole('button').at(-1)!);
    await settle(2);
    expect(api.calls.filter((c) => c.method === 'PATCH').at(-1)?.body).toMatchObject({ customDomain: null });
  });
});

describe('usuarios y permisos', () => {
  const member = fixture<{ items: { userId: string; email: string }[] }>('/api/v1/members').items[0]!;
  const extra = {
    userId: 'u-2',
    role: 'vendedor',
    email: 'ventas@tienda.com',
    name: 'Ventas',
    createdAtUtc: '2026-10-01T00:00:00Z',
    permissions: ['orders.read', 'orders.fulfill'],
    customized: false,
  };

  it('agrega un usuario con su rol, le cambia el rol y lo quita', async () => {
    const { api, user } = await open('usuarios', (a) =>
      a.on('GET', '/api/v1/members', {
        items: [fixture<{ items: object[] }>('/api/v1/members').items[0], extra],
        total: 2,
      }),
    );
    await user.click(screen.getByRole('button', { name: /Agregar usuario/ }));
    await user.type(screen.getByPlaceholderText('email@ejemplo.com'), 'nuevo@tienda.com');
    await user.type(screen.getByPlaceholderText('Nombre (opcional)'), 'Nuevo');
    const roles = Array.from((screen.getByLabelText('Rol') as HTMLSelectElement).options).map((o) => o.value);
    await user.selectOptions(screen.getByLabelText('Rol'), roles.at(-1)!);
    await user.click(screen.getByRole('button', { name: 'Agregar' }));
    await settle(2);
    expect(last(api, 'POST', '/api/v1/members')).toMatchObject({
      email: 'nuevo@tienda.com',
      name: 'Nuevo',
      role: roles.at(-1),
    });

    // Después de agregar, la lista se vuelve a pedir: se toma el select ya redibujado.
    await settle(3);
    const roleOf = await screen.findByLabelText(`Rol de ${extra.email}`);
    await waitFor(() => expect(roleOf).toBeEnabled());
    const other = Array.from((roleOf as HTMLSelectElement).options)
      .map((o) => o.value)
      .find((v) => v !== (roleOf as HTMLSelectElement).value && v !== 'owner')!;
    await user.selectOptions(roleOf, other);
    const sure = screen.queryByRole('dialog');
    if (sure) await user.click(within(sure).getAllByRole('button').at(-1)!);
    await settle(2);
    expect(last(api, 'PATCH', `/api/v1/members/${extra.userId}`)).toEqual({ role: other });

    const row = screen.getByText(extra.email).closest('tr')!;
    await user.click(within(row).getByRole('button', { name: 'Quitar' }));
    const confirm = screen.queryByRole('dialog');
    if (confirm) await user.click(within(confirm).getAllByRole('button').at(-1)!);
    await settle(2);
    expect(did(api, 'DELETE', `/api/v1/members/${extra.userId}`)).toBe(true);
    expect(member.email).toBeTruthy();
  });
});

describe('medición y píxeles', () => {
  it('carga los identificadores, pide permiso y guarda', async () => {
    const { api, user } = await open('medicion');
    await user.type(screen.getByPlaceholderText('G-ABCD123456'), 'G-ABC1234');
    await user.type(screen.getByPlaceholderText('AW-123456789'), 'AW-1234567');
    await user.type(screen.getByPlaceholderText('123456789012345'), '1234567890');
    await user.type(screen.getByPlaceholderText('abcd1efg2h'), 'abc12def');
    await user.click(screen.getByRole('switch', { name: /Pedir permiso antes de medir/ }));
    await user.click(await screen.findByRole('button', { name: 'Guardar' }));
    await settle(2);
    expect(last(api, 'PUT', '/api/v1/admin/tracking/')).toMatchObject({
      ga4Id: 'G-ABC1234',
      googleAdsId: 'AW-1234567',
      metaPixelId: '1234567890',
      clarityId: 'abc12def',
      requireConsent: false,
    });
  });

  it('si la API rechaza, lo dice', async () => {
    const { user } = await open('medicion', (a) =>
      a.on('PUT', '/api/v1/admin/tracking', { detail: 'El ID de GA4 no es válido.' }, 400),
    );
    await user.type(screen.getByPlaceholderText('G-ABCD123456'), 'mal');
    await user.click(await screen.findByRole('button', { name: 'Guardar' }));
    expect(await screen.findByText('El ID de GA4 no es válido.')).toBeInTheDocument();
  });
});

describe('opciones del checkout', () => {
  it('pide teléfono y DNI, nota y mensaje final, y guarda', async () => {
    const { api, user } = await open('opciones-del-checkout');
    await user.click(
      within(screen.getByRole('group', { name: 'DNI o CUIT' })).getByRole('radio', { name: 'Obligatorio' }),
    );
    await user.click(screen.getByRole('switch', { name: 'Mostrar mensaje al terminar la compra' }));
    const message = await screen.findByPlaceholderText(/Preparamos los pedidos/);
    await user.type(message, 'Despachamos en 24 h.');
    await user.click(screen.getByRole('button', { name: 'Guardar' }));
    await settle(2);
    await waitFor(() =>
      expect(last(api, 'PUT', '/api/v1/admin/checkout/settings')).toMatchObject({
        requireDocument: true,
        orderMessageEnabled: true,
        orderMessageText: 'Despachamos en 24 h.',
      }),
    );
  });
});

describe('búsqueda', () => {
  const settings = {
    synonyms: [
      ['mancuerna', 'dumbbell'],
      ['pesa rusa', 'kettlebell'],
    ],
    isDefault: true,
    updatedAt: null,
    defaults: [['mancuerna', 'dumbbell']],
  };
  const queries = {
    top: [{ term: 'mancuerna', count: 12, results: 8 }],
    withoutResults: [{ term: 'barra olimpica', count: 3, results: 0 }],
  };
  const setup = (a: MockApi) => {
    a.on('GET', '/api/v1/search/settings', settings);
    a.on('GET', '/api/v1/search/queries', queries);
    a.on('PUT', '/api/v1/search/settings', (body: unknown) => ({
      ...settings,
      isDefault: false,
      synonyms: (body as { synonyms: string[][] }).synonyms,
    }));
  };

  it('edita los sinónimos, suma uno desde lo que no encontró nada y guarda', async () => {
    const { api, user } = await open('busqueda', setup);
    expect(await screen.findByText('Usando la lista sugerida')).toBeInTheDocument();
    expect(screen.getByDisplayValue('mancuerna, dumbbell')).toBeInTheDocument();
    expect(screen.getByText(/12 búsquedas · 8 resultados/)).toBeInTheDocument();

    // Lo que no encontró nada pasa a un grupo nuevo, listo para completar.
    await user.click(screen.getByRole('button', { name: 'Agregar como sinónimo' }));
    const added = screen.getByLabelText('Grupo de sinónimos 3');
    expect(added).toHaveValue('barra olimpica, ');
    await user.type(added, 'barbell');
    await user.click(screen.getByRole('button', { name: 'Quitar el grupo pesa rusa, kettlebell' }));

    await user.click(screen.getByRole('button', { name: 'Guardar' }));
    await settle(2);
    expect(last(api, 'PUT', '/api/v1/search/settings')).toEqual({
      synonyms: [
        ['mancuerna', 'dumbbell'],
        ['barra olimpica', 'barbell'],
      ],
    });
    expect(await screen.findByRole('button', { name: /Volver a la lista sugerida/ })).toBeInTheDocument();
  });

  it('vuelve a la lista sugerida', async () => {
    const { api, user } = await open('busqueda', (a) => {
      setup(a);
      a.on('GET', '/api/v1/search/settings', { ...settings, isDefault: false, synonyms: [] });
      a.on('DELETE', '/api/v1/search/settings', settings);
    });
    expect(await screen.findByText(/Sin sinónimos/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Volver a la lista sugerida/ }));
    await confirmDialog(/Volver a la sugerida/);
    await settle(2);
    expect(did(api, 'DELETE', '/api/v1/search/settings')).toBe(true);
    expect(await screen.findByDisplayValue('pesa rusa, kettlebell')).toBeInTheDocument();
  });
});
