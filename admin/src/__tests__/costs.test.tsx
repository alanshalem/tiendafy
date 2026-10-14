/**
 * Costos por variante y repreciación masiva: cargar o borrar un costo (con el
 * margen que se recalcula al escribir), filtrar lo que falta cargar, buscar,
 * y subir o bajar precios en bloque con confirmación.
 */
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fixture, mockApi, type MockApi } from '../test/api';
import { settle, watchCrashes } from '../test/explore';
import { renderApp } from '../test/render';

type Product = { id: string; name: string; variants: { id: string; sku: string; optionValues: string[] }[] };
const product = fixture<{ items: Product[] }>('/api/v1/products').items[0]!;
const variant = product.variants[0]!;
const costLabel = `Costo de ${product.name}${variant.optionValues.length ? ` (${variant.optionValues.join(' / ')})` : ''}`;

let crashes: () => unknown[][];

beforeEach(() => {
  crashes = watchCrashes();
});

afterEach(() => {
  expect(crashes()).toEqual([]);
  vi.restoreAllMocks();
});

async function openCosts(setup?: (api: MockApi) => void, path = '/productos/costos') {
  const api = mockApi();
  api.on('GET', '/api/v1/products/costs', {
    items: [
      {
        variantId: variant.id,
        sku: variant.sku,
        description: 'Única',
        priceAmount: 2_500_000,
        costAmount: 1_000_000,
        currency: 'ARS',
      },
    ],
  });
  setup?.(api);
  const user = userEvent.setup({ delay: null, pointerEventsCheck: 0 });
  renderApp(path);
  expect(await screen.findByLabelText(costLabel, {}, { timeout: 5000 })).toBeInTheDocument();
  await settle(3);
  return { api, user };
}

describe('costos', () => {
  it('cargar un costo recalcula el margen y se guarda en centavos; borrarlo manda null', async () => {
    const { api, user } = await openCosts((a) =>
      a.on('PUT', `/api/v1/products/${product.id}/costs`, { detail: 'El costo no puede ser negativo.' }, 400),
    );
    const cost = screen.getByLabelText(costLabel);
    const row = cost.closest('tr') as HTMLElement;
    expect(cost).toHaveValue(10000);
    expect(within(row).getByText('60 %')).toBeInTheDocument();
    const save = within(row).getByRole('button', { name: 'Guardar' });
    expect(save).toBeDisabled();

    // Casi al costo: el margen se pinta de rojo.
    await user.clear(cost);
    await user.type(cost, '24000.5');
    expect(within(row).getByText('4 %')).toHaveClass('text-danger');
    await user.click(save);
    expect(await screen.findByText('El costo no puede ser negativo.')).toBeInTheDocument();
    expect(api.calls.find((c) => c.method === 'PUT')!.body).toEqual({
      costs: [{ variantId: variant.id, costAmount: 2_400_050 }],
    });

    api.on('PUT', `/api/v1/products/${product.id}/costs`, {});
    await user.clear(cost);
    expect(within(row).getByText('—')).toBeInTheDocument();
    await user.click(save);
    expect(await screen.findByText('Costo actualizado')).toBeInTheDocument();
    expect(api.calls.filter((c) => c.method === 'PUT').at(-1)!.body).toEqual({
      costs: [{ variantId: variant.id, costAmount: null }],
    });
  });

  it('"Falta cargar" filtra lo que no tiene costo; "Ver todos" vuelve', async () => {
    const { api, user } = await openCosts((a) =>
      a.on('GET', '/api/v1/products/health', {
        ...fixture<object>('/api/v1/products/health'),
        variantsWithCost: 3,
        variantsWithoutCost: 2,
        lowMarginVariants: 1,
      }),
    );
    await user.click(screen.getByRole('button', { name: /Falta cargar/ }));
    expect(await screen.findByText(/Mostrando solo los productos con alguna variante/)).toBeInTheDocument();
    await waitFor(() => expect(api.calls.some((c) => c.path.includes('missingCost=true'))).toBe(true));

    await user.click(screen.getByRole('button', { name: 'Ver todos' }));
    expect(screen.queryByText(/Mostrando solo los productos con alguna variante/)).not.toBeInTheDocument();

    await user.type(screen.getByPlaceholderText('Buscar por producto o SKU…'), 'remera');
    await waitFor(() => expect(api.calls.some((c) => c.path.includes('q=remera'))).toBe(true), {
      timeout: 3000,
    });
  });

  it('sin productos, invita a cargarlos primero', async () => {
    mockApi().on('GET', '/api/v1/products', { items: [], total: 0 });
    renderApp('/productos/costos');
    expect(await screen.findByText('Primero, productos', {}, { timeout: 5000 })).toBeInTheDocument();
  });
});

describe('repreciación masiva', () => {
  /** La confirmación (tiene el mismo título que el modal: se la reconoce por su aviso). */
  const confirmDialog = () =>
    screen.getAllByRole('dialog').find((d) => /no se puede deshacer en bloque/.test(d.textContent ?? ''))!;

  async function openReprice(setup?: (api: MockApi) => void) {
    const ctx = await openCosts(setup);
    await ctx.user.click(screen.getByRole('button', { name: /Repreciar en masa/ }));
    const dialog = within(await screen.findByRole('dialog', { name: 'Repreciar en masa' }));
    return { ...ctx, dialog };
  }

  it('con un porcentaje en cero no hace nada; cancelar la confirmación tampoco', async () => {
    const { api, user, dialog } = await openReprice();
    const apply = dialog.getByRole('button', { name: /^Repreciar$/ });
    expect(apply).toBeDisabled();
    await user.type(dialog.getByLabelText('Porcentaje (+ sube / - baja)'), '0');
    await user.click(apply);
    expect(await screen.findByText('Ingresá un porcentaje distinto de cero.')).toBeInTheDocument();

    await user.clear(dialog.getByLabelText('Porcentaje (+ sube / - baja)'));
    await user.type(dialog.getByLabelText('Porcentaje (+ sube / - baja)'), '-5');
    await user.click(apply);
    expect(await screen.findByText(/Se bajan los precios 5 % de TODO el catálogo/)).toBeInTheDocument();
    await user.click(within(confirmDialog()).getByRole('button', { name: 'Cancelar' }));
    expect(api.calls.some((c) => c.path === '/api/v1/products/reprice')).toBe(false);
  });

  it('aplica a una categoría con el redondeo elegido; si falla, lo dice', async () => {
    const categories = fixture<{ items: { id: string; name: string }[] }>('/api/v1/categories').items;
    const { api, user, dialog } = await openReprice((a) =>
      a.on('POST', '/api/v1/products/reprice', { detail: 'Hay una repreciación en curso.' }, 409),
    );
    await user.type(dialog.getByLabelText('Porcentaje (+ sube / - baja)'), '12');
    await user.selectOptions(dialog.getByLabelText('Alcance'), categories[0]!.id);
    await user.selectOptions(dialog.getByLabelText('Redondeo'), '100');
    const run = async () => {
      await user.click(dialog.getByRole('button', { name: /^Repreciar$/ }));
      expect(
        await screen.findByText(/Se aumentan los precios 12 % de la categoría elegida/),
      ).toBeInTheDocument();
      await user.click(within(confirmDialog()).getByRole('button', { name: 'Repreciar' }));
    };
    await run();
    expect(await screen.findByText('Hay una repreciación en curso.')).toBeInTheDocument();
    expect(api.calls.find((c) => c.path === '/api/v1/products/reprice')!.body).toEqual({
      percent: 12,
      categoryId: categories[0]!.id,
      rounding: '100',
    });

    api.on('POST', '/api/v1/products/reprice', { products: 4, variants: 9 });
    await run();
    expect(await screen.findByText('Listo: 9 precios actualizados en 4 productos.')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });
});
