/**
 * Dos fallas que no se veían: la lista de ventas de Mercado Libre se quedaba
 * en el spinner para siempre si la API fallaba, y "Leído" en un mensaje de
 * contacto rechazaba la promesa sin decir nada.
 */
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { mockApi } from '../test/api';
import { renderApp } from '../test/render';
import { settle } from '../test/explore';

describe('fallas que antes no se veían', () => {
  it('ventas de Mercado Libre: la carga caída se muestra, y "Reintentar" vuelve a pedir', async () => {
    const api = mockApi();
    api.on('GET', '/api/v1/admin/meli/orders', {}, 500);
    const user = userEvent.setup({ delay: null, pointerEventsCheck: 0 });
    renderApp('/mercadolibre?tab=ventas');
    await settle(4);
    expect(await screen.findByText('No se pudieron cargar las ventas de Mercado Libre.')).toBeInTheDocument();

    const before = api.calls.filter((c) => c.path.startsWith('/api/v1/admin/meli/orders')).length;
    await user.click(screen.getByRole('button', { name: /Reintentar/ }));
    await settle(2);
    expect(api.calls.filter((c) => c.path.startsWith('/api/v1/admin/meli/orders')).length).toBe(before + 1);
  });

  it('mensajes: si marcar como leído falla, se avisa', async () => {
    const api = mockApi();
    api.on('POST', '/api/v1/contact/messages/:id/read', {}, 500);
    const user = userEvent.setup({ delay: null, pointerEventsCheck: 0 });
    renderApp('/mensajes');
    await settle(4);
    await user.click(screen.getAllByRole('button', { name: /Leído/ })[0]!);
    expect(await screen.findByText('No se pudo marcar como leído.')).toBeInTheDocument();
  });
});
