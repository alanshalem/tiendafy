/**
 * Botones que no se pueden apretar dos veces mientras su pedido está en
 * camino (pausar un cupón, archivar una tienda), y lo que antes decía
 * "Próximamente" aunque ya existía: el campo personalizado de la ficha
 * técnica, que ahora lleva a Configuración.
 */
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { fixture, mockApi, type MockApi } from '../test/api';
import { renderApp, renderWithProviders } from '../test/render';
import { settle } from '../test/explore';
import { FilterPanel, defaultFilters } from '../pages/Products/FilterPanel';

/** Retiene las respuestas a `method path` hasta que el test las suelta. */
function hold(api: MockApi, method: string, suffix: string) {
  const waiting: (() => void)[] = [];
  vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    if ((init?.method ?? 'GET') === method && String(input).endsWith(suffix))
      await new Promise<void>((r) => waiting.push(r));
    return api.fetch(input, init);
  });
  return () => waiting.splice(0).forEach((r) => r());
}

async function open(path: string, heading: string) {
  const api = mockApi();
  const user = userEvent.setup({ delay: null, pointerEventsCheck: 0 });
  renderApp(path);
  await screen.findByRole('heading', { name: heading }, { timeout: 5000 });
  await settle(4);
  return { api, user };
}

async function menu(user: ReturnType<typeof userEvent.setup>, of: string, item: RegExp) {
  await user.click(screen.getByRole('button', { name: `Acciones de ${of}` }));
  return screen.findByRole('menuitem', { name: item });
}

describe('un click por pedido', () => {
  it('pausar un cupón: mientras va, el menú no deja repetirlo', async () => {
    const coupon = fixture<{ items: { id: string; code: string; active: boolean }[] }>(
      '/api/v1/coupons',
    ).items.find((c) => c.active)!;
    const { api, user } = await open('/descuentos', 'Cupones de descuento');
    const release = hold(api, 'POST', `/coupons/${coupon.id}/toggle`);

    await user.click(await menu(user, coupon.code, /Pausar/));
    expect(await menu(user, coupon.code, /Pausar/)).toBeDisabled();

    release();
    await settle(4);
    expect(await screen.findByText('Cupón actualizado')).toBeInTheDocument();
    expect(api.calls.filter((c) => c.path.endsWith(`/coupons/${coupon.id}/toggle`))).toHaveLength(1);
  });

  it('archivar una tienda: mientras va, el menú no deja repetirlo', async () => {
    const tenant = fixture<{ items: { id: string; name: string }[] }>('/api/v1/tenants').items[0]!;
    const { api, user } = await open('/tenants', 'Tiendas');
    const release = hold(api, 'POST', `/tenants/${tenant.id}/archive`);

    await user.click(await menu(user, tenant.name, /Archivar/));
    expect(await menu(user, tenant.name, /Archivar/)).toBeDisabled();
    release();
    await settle(4);
    expect(api.calls.filter((c) => c.path.endsWith(`/tenants/${tenant.id}/archive`))).toHaveLength(1);
  });
});

describe('un click por pedido: compras y presupuestos', () => {
  it('cambiar el estado de una compra: mientras va, los botones de estado no responden', async () => {
    const po = fixture<{ id: string; reference: string; supplierName: string }>(
      '/api/v1/purchasing/purchase-orders/:id',
    );
    const api = mockApi();
    api.on('GET', `/api/v1/purchasing/purchase-orders/${po.id}`, { ...po, status: 'CONFIRMED' });
    api.on('GET', '/api/v1/purchasing/purchase-orders', {
      items: [{ ...po, status: 'CONFIRMED', totalFob: 1, items: 1, units: 3, leadTimeDays: 50 }],
      total: 1,
    });
    const user = userEvent.setup({ delay: null, pointerEventsCheck: 0 });
    renderApp('/compras');
    await user.click(await screen.findByText(po.reference));
    await screen.findByRole('heading', { name: po.supplierName });
    await settle(2);
    const release = hold(api, 'POST', `/purchase-orders/${po.id}/status`);
    await user.click(screen.getByRole('button', { name: 'En tránsito' }));
    expect(screen.getByRole('button', { name: 'En tránsito' })).toBeDisabled();
    release();
    await settle(4);
    expect(api.calls.filter((c) => c.path.endsWith(`/purchase-orders/${po.id}/status`))).toHaveLength(1);
  });

  it('marcar un presupuesto como enviado: mientras va, no se repite', async () => {
    const quote = fixture<{ id: string; number: string }>('/api/v1/quotes/:id');
    const api = mockApi();
    const user = userEvent.setup({ delay: null, pointerEventsCheck: 0 });
    renderApp('/presupuestos');
    await user.click(await screen.findByText(quote.number));
    await settle(2);
    const release = hold(api, 'POST', `/quotes/${quote.id}/send`);
    await user.click(screen.getByRole('button', { name: 'Marcar como enviado' }));
    expect(screen.getByRole('button', { name: 'Marcar como enviado' })).toBeDisabled();
    release();
    await settle(4);
    expect(api.calls.filter((c) => c.path.endsWith(`/quotes/${quote.id}/send`))).toHaveLength(1);
  });
});

describe('nada de "Próximamente" para lo que ya existe', () => {
  it('el campo personalizado de los filtros lleva a la ficha técnica', async () => {
    mockApi();
    renderWithProviders(
      <FilterPanel
        open
        onClose={() => {}}
        filters={defaultFilters}
        categories={[]}
        onApply={() => {}}
        onClear={() => {}}
        draft={defaultFilters}
        setDraft={() => {}}
      />,
    );
    const link = await screen.findByRole('link', { name: /Crear campo personalizado/ });
    expect(link).toHaveAttribute('href', '/configuracion/ficha-tecnica');
    await waitFor(() => expect(screen.queryByText(/Próximamente/)).not.toBeInTheDocument());
  });
});
