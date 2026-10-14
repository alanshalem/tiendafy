/**
 * Accesibilidad (axe, ver test-fixtures/a11y.ts) de lo que no aparece al
 * entrar a una pantalla: las fichas abiertas por la URL, las otras pestañas y
 * los modales. a11y.test.tsx revisa cada ruta recién abierta; los campos sin
 * nombre que quedaban estaban justamente acá, detrás de un click.
 */
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import { describe, expect, it } from 'vitest';
import { a11yViolations } from '../../../test-fixtures/a11y';
import { fixture, mockApi, type MockApi } from '../test/api';
import { settle } from '../test/explore';
import { renderApp, renderWithProviders } from '../test/render';
import { ComposerModal } from '../pages/redes-composer';

const po = fixture<{ id: string }>('/api/v1/purchasing/purchase-orders/:id');
const quote = fixture<{ id: string }>('/api/v1/quotes/:id');
const supplier = fixture<{ items: { id: string }[] }>('/api/v1/suppliers').items[0]!;

async function open(path: string, setup?: (api: MockApi) => void) {
  const api = mockApi();
  setup?.(api);
  const user = userEvent.setup({ delay: null, pointerEventsCheck: 0 });
  renderApp(path);
  await settle(6);
  return { api, user };
}

const clean = async () => expect(await a11yViolations(axe)).toEqual([]);

describe('accesibilidad de fichas, pestañas y modales', () => {
  it.each([
    `/compras?orden=${po.id}`,
    `/presupuestos?presupuesto=${quote.id}`,
    '/presupuestos?presupuesto=nuevo',
    `/proveedores?proveedor=${supplier.id}`,
    '/mercadolibre?tab=preguntas',
    '/mercadolibre?tab=publicaciones',
    '/mercadolibre?tab=reclamos',
  ])('%s', { timeout: 30_000 }, async (path) => {
    await open(path);
    await clean();
  });

  it('editar un proveedor', { timeout: 30_000 }, async () => {
    const { user } = await open(`/proveedores?proveedor=${supplier.id}`);
    await user.click(await screen.findByRole('button', { name: 'Editar' }));
    await screen.findByRole('dialog', { name: 'Editar proveedor' });
    await clean();
  });

  it('publicar en Mercado Libre', { timeout: 30_000 }, async () => {
    const { user } = await open('/mercadolibre?tab=publicaciones');
    await user.click(await screen.findByRole('button', { name: /Publicar un producto en ML/ }));
    await screen.findByRole('dialog', { name: 'Publicar en Mercado Libre' });
    await clean();
  });

  it('chat de una venta de Mercado Libre', { timeout: 30_000 }, async () => {
    const { user } = await open('/mercadolibre?tab=ventas');
    await user.click((await screen.findAllByRole('button', { name: /Mensajes/ }))[0]!);
    await screen.findByRole('dialog', { name: /^Chat con/ });
    await settle(2);
    await clean();
  });

  it('una campaña nueva', { timeout: 30_000 }, async () => {
    const { user } = await open('/marketing');
    await user.click((await screen.findAllByRole('button', { name: /Nueva campaña|Crear campaña/ }))[0]!);
    await screen.findByRole('dialog');
    await settle(4);
    await clean();
  });

  it('el compositor de redes, con una red abierta para personalizar', { timeout: 30_000 }, async () => {
    mockApi();
    const user = userEvent.setup({ delay: null, pointerEventsCheck: 0 });
    const account = {
      id: 'meta_facebook-0000-0000-0000-00000000',
      provider: 'meta_facebook',
      providerId: 'fb-1',
      name: 'Tienda FB',
      username: 'tiendafb',
      avatarUrl: null,
      authorized: true,
      connectedAtUtc: '2026-10-01T00:00:00Z',
    } as unknown as Parameters<typeof ComposerModal>[0]['accounts'][number];
    renderWithProviders(
      <ComposerModal
        post={null}
        channels={fixture('/api/v1/admin/social/channels')}
        accounts={[account]}
        initialDate={null}
        onClose={() => {}}
        onSaved={() => {}}
      />,
    );
    const dialog = within(await screen.findByRole('dialog', {}, { timeout: 5000 }));
    await user.click(dialog.getByRole('button', { name: 'Tienda FB', pressed: false }));
    expect(dialog.getByRole('button', { name: 'Tienda FB', pressed: true })).toBeInTheDocument();
    await settle(2);
    // La personalización por red se despliega con su botón.
    await user.click(dialog.getByRole('button', { name: /Tienda FB/, expanded: false }));
    expect(dialog.getByRole('textbox', { name: /Texto solo para Tienda FB/ })).toBeInTheDocument();
    await clean();
  });

  it('crear un cupón', { timeout: 30_000 }, async () => {
    const { user } = await open('/descuentos');
    await user.click(await screen.findByRole('button', { name: /Crear cupón/ }));
    await within(await screen.findByRole('dialog', { name: 'Crear cupón' })).findByText('Código');
    await clean();
  });
});
