/**
 * Listas de precios: crear (sobre el precio del producto o sobre otra lista,
 * sin poder armar un ciclo), editar, borrar con confirmación, y los precios
 * de una lista: fijar uno a mano, volverlo a la regla, y lo que no es un
 * número.
 */
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fixture, mockApi, type MockApi } from '../test/api';
import { settle, watchCrashes } from '../test/explore';
import { renderApp } from '../test/render';

const LISTS = '/api/v1/price-lists';
type List = { id: string; name: string; basedOnPriceListId: string | null; basedOnName: string | null };
const mayorista = fixture<{ items: List[] }>(LISTS).items[0]!;
const reventa: List & Record<string, unknown> = {
  ...mayorista,
  id: 'reventa-1',
  name: 'Reventa',
  basedOnPriceListId: mayorista.id,
  basedOnName: mayorista.name,
  adjustmentPercent: 10,
  rounding: '100',
  manualPrices: 1,
  active: false,
};
type Price = {
  variantId: string;
  productName: string;
  variantDescription: string;
  priceMinor: number;
  isManual: boolean;
};
const prices = fixture<{ items: Price[]; total: number }>(`${LISTS}/:id/prices`);

let crashes: () => unknown[][];

beforeEach(() => {
  crashes = watchCrashes();
});

afterEach(() => {
  expect(crashes()).toEqual([]);
  vi.restoreAllMocks();
});

async function openLists(setup?: (api: MockApi) => void) {
  const api = mockApi();
  api.on('GET', LISTS, { items: [mayorista, reventa] });
  setup?.(api);
  const user = userEvent.setup({ delay: null, pointerEventsCheck: 0 });
  renderApp('/productos/listas-de-precios');
  expect(await screen.findByText(reventa.name, {}, { timeout: 5000 })).toBeInTheDocument();
  await settle(3);
  return { api, user };
}

const modal = async (name: string) => within(await screen.findByRole('dialog', { name }));

describe('listas de precios', () => {
  it('muestra la regla de cada una: porcentaje, base, redondeo y precios a mano', async () => {
    await openLists();
    expect(screen.getByText(/\+10% sobre Mayorista/)).toBeInTheDocument();
    expect(screen.getByText(/1 precio a mano/)).toBeInTheDocument();
    expect(screen.getByText('Inactiva')).toBeInTheDocument();
  });

  it('crear: valida el nombre y el porcentaje, y guarda la regla', async () => {
    const { api, user } = await openLists((a) =>
      a.on('POST', LISTS, { detail: 'Ya existe una lista con ese nombre.' }, 409),
    );
    await user.click(screen.getByRole('button', { name: /Nueva lista/ }));
    const m = await modal('Nueva lista de precios');
    const save = m.getAllByRole('button').at(-1)!;
    await user.type(m.getByPlaceholderText('Mayorista'), 'R');
    expect(save).toBeDisabled(); // nombre de una letra
    await user.type(m.getByPlaceholderText('Mayorista'), 'evendedores');
    const percent = m.getByLabelText('Ajuste (%)', { exact: false });
    await user.clear(percent);
    await user.type(percent, '-100');
    expect(save).toBeDisabled(); // no se puede regalar
    await user.clear(percent);
    await user.type(percent, '-12,5');
    expect(save).toBeEnabled();
    await user.selectOptions(m.getByLabelText('Se calcula sobre', { exact: false }), mayorista.id);
    await user.selectOptions(m.getByLabelText('Moneda', { exact: false }), 'USD');
    await user.click(save);
    expect(await screen.findByText('Ya existe una lista con ese nombre.')).toBeInTheDocument();
    expect(api.calls.find((c) => c.method === 'POST')!.body).toMatchObject({
      name: 'Revendedores',
      adjustmentPercent: -12.5,
      basedOnPriceListId: mayorista.id,
      currency: 'USD',
    });

    api.on('POST', LISTS, { id: 'nueva' });
    await user.click(save);
    expect(await screen.findByText('Lista creada')).toBeInTheDocument();
  });

  it('editar no ofrece como base a la misma lista ni a las que dependen de ella', async () => {
    const { api, user } = await openLists((a) => a.on('PATCH', `${LISTS}/:id`, {}));
    await user.click(screen.getByRole('button', { name: `Editar ${mayorista.name}` }));
    const m = await modal('Editar lista');
    const base = m.getByLabelText('Se calcula sobre', { exact: false });
    const options = within(base)
      .getAllByRole('option')
      .map((o) => o.textContent);
    expect(options).not.toContain(mayorista.name);
    expect(options).not.toContain(reventa.name); // depende de Mayorista: sería un ciclo
    await user.click(m.getAllByRole('button').at(-1)!);
    expect(await screen.findByText('Lista actualizada')).toBeInTheDocument();
    expect(api.calls.some((c) => c.method === 'PATCH')).toBe(true);
  });

  it('borrar pide confirmación; si falla, lo dice', async () => {
    const { api, user } = await openLists((a) =>
      a.on('DELETE', `${LISTS}/${reventa.id}`, { detail: 'Está asignada a clientes.' }, 409),
    );
    const del = () => screen.getByRole('button', { name: `Borrar ${reventa.name}` });
    await user.click(del());
    await user.click((await modal(`Borrar ${reventa.name}`)).getByRole('button', { name: 'Cancelar' }));
    expect(api.calls.some((c) => c.method === 'DELETE')).toBe(false);
    await user.click(del());
    await user.click((await modal(`Borrar ${reventa.name}`)).getByRole('button', { name: 'Borrar' }));
    expect(await screen.findByText('Está asignada a clientes.')).toBeInTheDocument();
    api.on('DELETE', `${LISTS}/${reventa.id}`, {});
    await user.click(del());
    await user.click((await modal(`Borrar ${reventa.name}`)).getByRole('button', { name: 'Borrar' }));
    expect(await screen.findByText('Lista borrada')).toBeInTheDocument();
  });

  it('sin listas explica para qué sirven', async () => {
    mockApi().on('GET', LISTS, { items: [] });
    renderApp('/productos/listas-de-precios');
    expect(
      await screen.findByText(
        /El precio que cargás en cada producto es el que ve todo el mundo/,
        {},
        { timeout: 5000 },
      ),
    ).toBeInTheDocument();
  });
});

describe('precios de una lista', () => {
  const row = prices.items[0]!;
  const manual: Price = { ...prices.items[1]!, isManual: true };
  const label = (p: Price) =>
    `Precio de ${p.productName}${p.variantDescription ? ` · ${p.variantDescription}` : ''}`;

  async function openPrices(setup?: (api: MockApi) => void) {
    const ctx = await openLists((a) => {
      a.on('GET', `${LISTS}/:id/prices`, { ...prices, items: [row, manual, ...prices.items.slice(2)] });
      a.on('PUT', `${LISTS}/:id/prices/:id`, {});
      setup?.(a);
    });
    await ctx.user.click(screen.getAllByRole('button', { name: /Ver precios/ })[0]!);
    expect(await screen.findByLabelText(label(row), {}, { timeout: 3000 })).toBeInTheDocument();
    return ctx;
  }

  const puts = (api: MockApi) => api.calls.filter((c) => c.method === 'PUT');

  it('fijar un precio a mano (con Enter), y vaciar uno a mano lo vuelve a la regla', async () => {
    const { api, user } = await openPrices();
    const input = screen.getByLabelText(label(row));
    await user.clear(input);
    await user.type(input, '12.345,50{Enter}');
    await waitFor(() => expect(puts(api)).toHaveLength(1));
    expect(puts(api)[0]!.body).toEqual({ priceMinor: 1_234_550 });

    const fixed = screen.getByLabelText(label(manual));
    await user.clear(fixed);
    await user.tab();
    await waitFor(() => expect(puts(api)).toHaveLength(2));
    expect(puts(api)[1]!.body).toEqual({ priceMinor: null });
  });

  it('lo que no es un número se avisa; vaciar uno que sigue la regla no hace nada; sin cambios tampoco', async () => {
    const { api, user } = await openPrices((a) =>
      a.on('PUT', `${LISTS}/:id/prices/:id`, { detail: 'Lista inactiva.' }, 409),
    );
    const input = screen.getByLabelText(label(row));
    await user.clear(input);
    await user.type(input, 'abc');
    await user.tab();
    expect(await screen.findByText('Ese precio no es un número válido.')).toBeInTheDocument();

    await user.clear(input);
    await user.tab();
    expect(puts(api)).toHaveLength(0);

    // El manual con su mismo valor: no se vuelve a guardar.
    await user.click(screen.getByLabelText(label(manual)));
    await user.tab();
    expect(puts(api)).toHaveLength(0);

    await user.clear(input);
    await user.type(input, '999');
    await user.tab();
    expect(await screen.findByText('Lista inactiva.')).toBeInTheDocument();
  });

  it('buscar consulta a la base; sin coincidencias lo dice; volver a las listas', async () => {
    const { api, user } = await openPrices();
    api.on('GET', `${LISTS}/:id/prices`, { items: [], total: 0 });
    await user.type(screen.getByPlaceholderText('Buscar por nombre o SKU...'), 'zzz');
    expect(
      await screen.findByText('Ningún producto coincide con la búsqueda.', {}, { timeout: 3000 }),
    ).toBeInTheDocument();
    expect(api.calls.some((c) => c.path.includes('q=zzz'))).toBe(true);
    await user.click(screen.getAllByRole('button').find((b) => /Listas|Volver/.test(b.textContent ?? ''))!);
    expect(await screen.findByText(reventa.name)).toBeInTheDocument();
  });
});
