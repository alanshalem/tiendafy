/**
 * La agenda con lo que compró cada uno (columnas, segmentos, orden) y la
 * ficha del cliente: su historia de ventas con link a cada una, el contacto de
 * un toque, las notas y las etiquetas.
 */
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mockApi, type MockApi } from '../test/api';
import { settle, watchCrashes } from '../test/explore';
import { renderApp } from '../test/render';
import { customerWhatsappHref } from '../pages/CustomerProfile';

const ANA = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Ana Gómez',
  email: 'ana@test.local',
  phone: '11 4567-8901',
  address: null,
  notes: 'Paga en efectivo',
  priceListId: null,
  createdAtUtc: '2026-01-10T12:00:00Z',
  tags: ['Mayorista'],
  ordersCount: 3,
  totalSpentMinor: 45_000_00,
  lastOrderAtUtc: '2026-09-01T12:00:00Z',
};
const NUEVO = {
  ...ANA,
  id: '22222222-2222-4222-8222-222222222222',
  name: 'Beto Nuevo',
  email: 'beto@test.local',
  phone: null,
  tags: [],
  ordersCount: 0,
  totalSpentMinor: 0,
  lastOrderAtUtc: null,
};
const ORDER_ID = 'abcdef12-3456-4789-8abc-def012345678';
const PROFILE = {
  customer: ANA,
  stats: {
    ordersCount: 3,
    totalSpentMinor: 45_000_00,
    averageTicketMinor: 15_000_00,
    lastOrderAtUtc: '2026-09-01T12:00:00Z',
    firstOrderAtUtc: '2026-02-01T12:00:00Z',
    currency: 'ARS',
  },
  orders: [
    {
      id: ORDER_ID,
      number: 1042,
      status: 'PAID',
      createdAtUtc: '2026-09-01T12:00:00Z',
      paidAtUtc: '2026-09-01T12:05:00Z',
      totalMinor: 20_000_00,
      currency: 'ARS',
      itemsCount: 2,
      firstItem: 'Mancuerna 10 kg',
    },
  ],
  hasMoreOrders: false,
};

let crashes: () => unknown[][];
beforeEach(() => {
  crashes = watchCrashes();
});
afterEach(() => expect(crashes()).toEqual([]));

async function open(path: string, heading: string | RegExp, setup?: (api: MockApi) => void) {
  const api = mockApi();
  api.on('GET', '/api/v1/customers', { items: [ANA, NUEVO], total: 2 });
  api.on('GET', '/api/v1/customers/tags', { items: [{ tag: 'Mayorista', count: 1 }] });
  api.on('GET', '/api/v1/customers/:id', PROFILE);
  api.on('GET', '/api/v1/finance/ledger', {
    balanceMinor: 5_000_00,
    currency: 'ARS',
    items: [
      {
        id: 'l1',
        occurredAtUtc: '2026-09-02T00:00:00Z',
        docLabel: 'Venta #ABCDEF12',
        debitMinor: 5_000_00,
        creditMinor: 0,
      },
    ],
  });
  setup?.(api);
  const user = userEvent.setup({ delay: null, pointerEventsCheck: 0 });
  renderApp(path);
  await screen.findByRole('heading', { name: heading }, { timeout: 5000 });
  await settle(3);
  return { api, user };
}

const lastListCall = (api: MockApi) =>
  api.calls.filter((c) => c.path.startsWith('/api/v1/customers?')).at(-1)!.path;

describe('clientes: agenda con resumen de compras', () => {
  it('muestra compras, total gastado y última compra de cada uno', async () => {
    await open('/clientes', 'Clientes');
    const row = (await screen.findByRole('button', { name: 'Ana Gómez' })).closest('tr')!;
    expect(within(row).getByText('3')).toBeInTheDocument();
    expect(within(row).getByText(/45\.000/)).toBeInTheDocument();
    expect(within(row).getByText('Mayorista')).toBeInTheDocument();
    const nuevo = screen.getByRole('button', { name: 'Beto Nuevo' }).closest('tr')!;
    expect(within(nuevo).getByText('Nunca')).toBeInTheDocument();
  });

  it('el segmento, la etiqueta y el orden viajan a la API', async () => {
    const { api, user } = await open('/clientes', 'Clientes');
    await user.selectOptions(screen.getByRole('combobox', { name: 'Segmento' }), 'inactivos-90');
    await waitFor(() => expect(lastListCall(api)).toContain('inactiveDays=90'));
    await user.selectOptions(screen.getByRole('combobox', { name: 'Etiqueta' }), 'Mayorista');
    await waitFor(() => expect(lastListCall(api)).toContain('tag=Mayorista'));
    await user.click(screen.getByRole('button', { name: /Ordenar por total gastado/ }));
    await waitFor(() => expect(lastListCall(api)).toMatch(/sort=spent&desc=true/));
    // Otro click invierte.
    await user.click(screen.getByRole('button', { name: /Ordenar por total gastado/ }));
    await waitFor(() => expect(lastListCall(api)).toMatch(/sort=spent&desc=false/));
  });

  it('en el teléfono cada cliente es una tarjeta que abre la ficha', async () => {
    // Pantalla de teléfono: la media query "max-width" del listado da que sí.
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: query.includes('max-width'),
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }));
    const { user } = await open('/clientes', 'Clientes');
    const cards = screen.getByRole('list', { name: 'Clientes' });
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(within(cards).getByText('3 compras · última 1/9/2026')).toBeInTheDocument();
    expect(within(cards).getByText('Todavía no compró')).toBeInTheDocument();
    await user.click(within(cards).getByText('Ana Gómez'));
    expect(await screen.findByRole('heading', { name: 'Ana Gómez' })).toBeInTheDocument();
  });

  it('tocar el nombre abre la ficha', async () => {
    const { user } = await open('/clientes', 'Clientes');
    await user.click(await screen.findByRole('button', { name: 'Ana Gómez' }));
    expect(await screen.findByRole('heading', { name: 'Ana Gómez' })).toBeInTheDocument();
  });
});

describe('clientes: ficha', () => {
  it('resume lo que compró y linkea cada venta', async () => {
    await open(`/clientes/${ANA.id}`, 'Ana Gómez');
    expect(screen.getByText('Ticket promedio')).toBeInTheDocument();
    expect(screen.getByText(/15\.000/)).toBeInTheDocument();
    const link = screen.getByRole('link', { name: '#1042' });
    expect(link).toHaveAttribute('href', `/ventas?order=${ORDER_ID}`);
    expect(screen.getByText(/Mancuerna 10 kg y 1 producto más/)).toBeInTheDocument();
  });

  it('WhatsApp y email de un toque', async () => {
    await open(`/clientes/${ANA.id}`, 'Ana Gómez');
    expect(screen.getByRole('link', { name: /WhatsApp/ }).getAttribute('href')).toMatch(
      /^https:\/\/wa\.me\/5491145678901\?text=Hola%20Ana!/,
    );
    expect(screen.getByRole('link', { name: /ana@test\.local/ })).toHaveAttribute(
      'href',
      'mailto:ana@test.local',
    );
  });

  it('la cuenta corriente muestra el saldo y linkea a la cuenta completa', async () => {
    await open(`/clientes/${ANA.id}`, 'Ana Gómez');
    expect(await screen.findByText('Te debe')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ver la cuenta completa' })).toHaveAttribute(
      'href',
      `/cuentas-corrientes?contacto=${ANA.id}`,
    );
  });

  it('las notas escritas y sin guardar no se pierden por salir de la ficha', async () => {
    const { user } = await open(`/clientes/${ANA.id}`, 'Ana Gómez');
    const notes = screen.getByRole('textbox', { name: 'Notas internas' });
    await user.type(notes, ' los viernes');
    await user.click(screen.getAllByRole('link', { name: 'Clientes' })[0]!);
    expect(await screen.findByText('¿Descartar los cambios?')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Seguir editando' }));
    expect(screen.getByRole('textbox', { name: 'Notas internas' })).toHaveValue(
      'Paga en efectivo los viernes',
    );

    // Volver a dejarlas como estaban no es un cambio: sale sin preguntar.
    await user.clear(notes);
    await user.type(notes, 'Paga en efectivo');
    await user.click(screen.getAllByRole('link', { name: 'Clientes' })[0]!);
    expect(await screen.findByRole('heading', { name: 'Clientes' })).toBeInTheDocument();
    expect(screen.queryByText('¿Descartar los cambios?')).not.toBeInTheDocument();
  });

  it('guarda notas y etiquetas sin abrir el formulario', async () => {
    const { api, user } = await open(`/clientes/${ANA.id}`, 'Ana Gómez');
    const notes = screen.getByRole('textbox', { name: 'Notas internas' });
    await user.clear(notes);
    await user.type(notes, 'Llamar los lunes');
    await user.click(screen.getByRole('button', { name: 'Guardar notas' }));
    await waitFor(() =>
      expect(api.calls.find((c) => c.method === 'PATCH')?.body).toEqual({ notes: 'Llamar los lunes' }),
    );

    await user.type(screen.getByRole('combobox', { name: 'Nueva etiqueta' }), 'VIP{Enter}');
    await waitFor(() =>
      expect(api.calls.filter((c) => c.method === 'PATCH').at(-1)?.body).toEqual({
        tags: ['Mayorista', 'VIP'],
      }),
    );
    await user.click(screen.getByRole('button', { name: 'Quitar la etiqueta Mayorista' }));
    await waitFor(() =>
      expect(api.calls.filter((c) => c.method === 'PATCH').at(-1)?.body).toEqual({ tags: [] }),
    );
  });

  it('sin permiso de ventas lo dice en vez de mostrar una lista vacía', async () => {
    await open(`/clientes/${ANA.id}`, 'Ana Gómez', (a) =>
      a.on('GET', '/api/v1/customers/:id', { ...PROFILE, orders: null }),
    );
    expect(screen.getByText(/no puede ver las ventas/)).toBeInTheDocument();
  });
});

describe('customerWhatsappHref', () => {
  it('arma el número internacional con un teléfono dictado en Argentina', () => {
    expect(customerWhatsappHref('11 4567-8901')).toBe('https://wa.me/5491145678901');
    expect(customerWhatsappHref('011 4567 8901')).toBe('https://wa.me/5491145678901');
    expect(customerWhatsappHref('+54 9 351 555 0000')).toBe('https://wa.me/5493515550000');
    expect(customerWhatsappHref(null)).toBeNull();
    expect(customerWhatsappHref('123')).toBeNull();
  });
});
