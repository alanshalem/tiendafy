/**
 * Kits (combos): elegir la variante que se vende como kit, armarla con sus
 * componentes y cantidades, guardar (sin componentes = deja de ser kit),
 * editar uno existente y buscar en la lista por kit, SKU o componente.
 */
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fixture, mockApi, type MockApi } from '../test/api';
import { settle, watchCrashes } from '../test/explore';
import { renderApp } from '../test/render';

type Product = { name: string; variants: { id: string; sku: string }[] };
const products = fixture<{ items: Product[] }>('/api/v1/products').items;
const [first, second] = [products[0]!, products[1]!];

const KIT_PATH = '/api/v1/products/variants/:id/kit';

const kit = {
  kitVariantId: 'kit-1',
  kitLabel: 'Kit Service Completo',
  kitSku: 'KIT-SRV',
  components: [
    {
      componentVariantId: first.variants[0]!.id,
      label: first.name,
      sku: first.variants[0]!.sku,
      quantity: 2,
    },
    {
      componentVariantId: second.variants[0]!.id,
      label: second.name,
      sku: second.variants[0]!.sku,
      quantity: 1,
    },
  ],
};

let crashes: () => unknown[][];

beforeEach(() => {
  crashes = watchCrashes();
});

afterEach(() => {
  expect(crashes()).toEqual([]);
  vi.restoreAllMocks();
});

async function openKits(setup?: (api: MockApi) => void) {
  const api = mockApi();
  setup?.(api);
  const user = userEvent.setup({ delay: null, pointerEventsCheck: 0 });
  renderApp('/productos/kits');
  expect(
    await screen.findByPlaceholderText(/Buscar la variante que se vende como kit/, {}, { timeout: 5000 }),
  ).toBeInTheDocument();
  await settle(3);
  return { api, user };
}

/** Escribe en un buscador de variantes y elige la primera opción que ofrece. */
async function pick(user: ReturnType<typeof userEvent.setup>, placeholder: RegExp, query: string) {
  const input = screen.getByPlaceholderText(placeholder);
  await user.type(input, query);
  const box = input.parentElement!.parentElement!;
  const option = await within(box).findByRole('button', { name: new RegExp(query, 'i') }, { timeout: 3000 });
  await user.click(option);
}

describe('kits', () => {
  it('sin kits lo explica; armar uno nuevo con componentes y guardarlo', async () => {
    const { api, user } = await openKits((a) => {
      // Cualquier variante (el mock normaliza los ids a :id).
      a.on('PUT', KIT_PATH, { detail: 'Un kit no puede contenerse a sí mismo.' }, 400);
    });
    expect(screen.getByText(/Sin kits definidos/)).toBeInTheDocument();

    await pick(user, /Buscar la variante que se vende como kit/, first.name.slice(0, 5));
    expect(await screen.findByText(/Sin componentes — guardar así elimina/)).toBeInTheDocument();

    await pick(user, /Agregar componente/, second.name.slice(0, 5));
    const qty = await screen.findByLabelText(`Cantidad de ${second.name}`, { exact: false });
    await user.clear(qty);
    await user.type(qty, '3');

    await user.click(screen.getByRole('button', { name: /Guardar/ }));
    expect(await screen.findByText('Un kit no puede contenerse a sí mismo.')).toBeInTheDocument();
    const put = api.calls.filter((c) => c.method === 'PUT').at(-1)!;
    expect(put.path).toBe(`/api/v1/products/variants/${first.variants[0]!.id}/kit`);
    expect(put.body).toEqual({ components: [{ componentVariantId: second.variants[0]!.id, quantity: 3 }] });

    api.on('PUT', KIT_PATH, {});
    await user.click(screen.getByRole('button', { name: /Guardar/ }));
    expect(await screen.findByText('Kit guardado')).toBeInTheDocument();
    expect(
      await screen.findByPlaceholderText(/Buscar la variante que se vende como kit/),
    ).toBeInTheDocument();
  });

  it('editar uno existente: quitar componentes y, sin ninguno, deja de ser kit', async () => {
    const { api, user } = await openKits((a) => {
      a.on('GET', '/api/v1/products/kits', { items: [kit] });
      a.on('GET', '/api/v1/products/kits/suggested-costs', {
        items: [{ kitVariantId: kit.kitVariantId, suggestedCostMinor: 1_250_000 }],
      });
      a.on('PUT', `/api/v1/products/variants/${kit.kitVariantId}/kit`, {});
    });
    expect(await screen.findByText(kit.kitLabel)).toBeInTheDocument();
    expect(screen.getByText(/costo de componentes/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Editar' }));
    // Una cantidad vacía o inválida se manda como 1.
    const qty = screen.getByLabelText(`Cantidad de ${first.name}`, { exact: false });
    await user.clear(qty);
    await user.click(screen.getByRole('button', { name: `Quitar ${second.name}` }));
    await user.click(screen.getByRole('button', { name: /Guardar/ }));
    await waitFor(() =>
      expect(api.calls.filter((c) => c.method === 'PUT').at(-1)!.body).toEqual({
        components: [{ componentVariantId: first.variants[0]!.id, quantity: 1 }],
      }),
    );

    await user.click(await screen.findByRole('button', { name: 'Editar' }));
    for (const c of kit.components)
      await user.click(screen.getByRole('button', { name: `Quitar ${c.label}` }));
    await user.click(screen.getByRole('button', { name: /Guardar/ }));
    expect(await screen.findByText('Kit eliminado')).toBeInTheDocument();
  });

  it('volver sin guardar, y buscar en la lista por kit, SKU o componente', async () => {
    const { api, user } = await openKits((a) =>
      a.on('GET', '/api/v1/products/kits', { items: [kit], total: 1 }),
    );
    await user.click(await screen.findByRole('button', { name: 'Editar' }));
    await user.click(screen.getByRole('button', { name: 'Volver' }));

    // La búsqueda la resuelve el servidor (por kit, SKU o componente): la
    // lista viene paginada y filtrar solo la página a la vista no alcanza.
    const search = screen.getByPlaceholderText(/Buscar kit por nombre, SKU o componente/);
    await user.type(search, 'kit-srv');
    await waitFor(() =>
      expect(
        api.calls.some((c) => c.path.startsWith('/api/v1/products/kits?') && c.path.includes('q=kit-srv')),
      ).toBe(true),
    );
    expect(screen.getByText(kit.kitLabel)).toBeInTheDocument();

    api.on('GET', '/api/v1/products/kits', { items: [], total: 0 });
    await user.clear(search);
    await user.type(search, 'zzz');
    expect(await screen.findByText('Ningún kit coincide con la búsqueda.')).toBeInTheDocument();
    expect(screen.queryByText(kit.kitLabel)).not.toBeInTheDocument();
  });

  it('elegir una variante que ya es un kit (de otra página) la abre con sus componentes', async () => {
    const existing = { ...kit, kitVariantId: first.variants[0]!.id };
    const { api, user } = await openKits((a) =>
      a.on('GET', '/api/v1/products/kits', { items: [], total: 0 }),
    );
    api.on('GET', '/api/v1/products/kits', { items: [existing], total: 1 });
    await pick(user, /Buscar la variante que se vende como kit/, first.name.slice(0, 5));
    await waitFor(() =>
      expect(api.calls.some((c) => c.path.includes(`kitVariantId=${existing.kitVariantId}`))).toBe(true),
    );
    expect(await screen.findByText(/Componentes de:/)).toBeInTheDocument();
    // Abrirla vacía y guardar le borraba la receta.
    expect(screen.getAllByRole('spinbutton').length).toBe(existing.components.length);
  });
});
