/**
 * Despachar una venta con cada carrier desde el panel: el botón aparece solo
 * si el carrier está configurado, el modal sale precargado con los datos de
 * la venta, y lo que se manda a la API es lo que el carrier necesita. Con un
 * envío ya creado, se baja la etiqueta y se consulta el seguimiento.
 */
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { AndreaniShipmentButton } from '../components/AndreaniShipment';
import { CorreoShipmentButton } from '../components/CorreoShipment';
import { ZipnovaShipmentButton } from '../components/ZipnovaShipment';
import type { ShippingOrderLike } from '../lib/shipping';
import { mockApi } from '../test/api';
import { renderWithProviders } from '../test/render';

const order: ShippingOrderLike = {
  id: '11111111-2222-3333-4444-555555555555',
  buyerEmail: 'ana@mail.com',
  buyerName: 'Ana Pérez',
  buyerPhone: '1155556666',
  docNumber: '30111222',
  shippingMethod: 'Envío a domicilio',
  shippingAddress: 'Av. Corrientes 1234, 2B, CABA, CP 1043',
  total: { amount: 50_000_00, currency: 'ARS' },
};

const base = `/api/v1/admin/orders/${order.id}`;

/** El modal abierto (el del carrier). */
async function dialog() {
  return within(await screen.findByRole('dialog'));
}

describe('Andreani', () => {
  it('no aparece si Andreani no está configurado', async () => {
    const api = mockApi();
    api.on('GET', '/api/v1/admin/shipping/andreani', { configured: false });
    renderWithProviders(<AndreaniShipmentButton order={order} />);
    await waitFor(() =>
      expect(api.calls.some((c) => c.path === '/api/v1/admin/shipping/andreani')).toBe(true),
    );
    expect(screen.queryByText(/Crear envío en Andreani/)).not.toBeInTheDocument();
  });

  it('sin datos del remitente avisa en vez de dejar despachar', async () => {
    const api = mockApi();
    api.on('GET', '/api/v1/admin/shipping/andreani', { configured: true, canCreateShipments: false });
    api.on('GET', `${base}/andreani-shipment`, { exists: false });
    renderWithProviders(<AndreaniShipmentButton order={order} />);
    expect(await screen.findByText(/Completá los datos del remitente/)).toBeInTheDocument();
  });

  it('crea el envío con los datos de la venta', async () => {
    const api = mockApi();
    api.on('GET', '/api/v1/admin/shipping/andreani', { configured: true, canCreateShipments: true });
    api.on('GET', `${base}/andreani-shipment`, { exists: false });
    api.on('POST', `${base}/andreani-shipment`, {
      exists: true,
      trackingNumber: '360000000036820',
      allTrackingNumbers: ['360000000036820', '360000000036830'],
      label: 'Creado',
      hasLabel: true,
    });
    const user = userEvent.setup();
    renderWithProviders(<AndreaniShipmentButton order={order} />);

    await user.click(await screen.findByRole('button', { name: /Crear envío en Andreani/ }));
    const modal = await dialog();
    expect(modal.getByText(/no permite cancelar/)).toBeInTheDocument();
    await user.click(modal.getByRole('button', { name: /Crear envío/ }));

    await waitFor(() => expect(api.calls.some((c) => c.method === 'POST')).toBe(true));
    const sent = api.calls.find((c) => c.method === 'POST')!.body as Record<string, unknown>;
    expect(sent).toMatchObject({
      name: 'Ana Pérez',
      email: 'ana@mail.com',
      documentNumber: '30111222',
      street: 'Av. Corrientes',
      streetNumber: '1234',
      postalCode: '1043',
      declaredValue: 50_000,
      toBranch: false,
    });
    expect(await screen.findByText(/2 bultos/)).toBeInTheDocument();
  });

  it('frena un email de más de 40 caracteres antes de mandarlo', async () => {
    const api = mockApi();
    api.on('GET', '/api/v1/admin/shipping/andreani', { configured: true, canCreateShipments: true });
    api.on('GET', `${base}/andreani-shipment`, { exists: false });
    const user = userEvent.setup();
    renderWithProviders(
      <AndreaniShipmentButton order={{ ...order, buyerEmail: `${'a'.repeat(35)}@mail.com` }} />,
    );

    await user.click(await screen.findByRole('button', { name: /Crear envío en Andreani/ }));
    const modal = await dialog();
    expect(modal.getByText(/no acepta emails de más de 40 caracteres/)).toBeInTheDocument();
    expect(modal.getByRole('button', { name: /Crear envío/ })).toBeDisabled();
  });

  it('con el envío creado: etiqueta y seguimiento', async () => {
    const api = mockApi();
    api.on('GET', '/api/v1/admin/shipping/andreani', { configured: true, canCreateShipments: true });
    api.on('GET', `${base}/andreani-shipment`, {
      exists: true,
      trackingNumber: '360000000036820',
      hasLabel: true,
      label: 'Creado',
    });
    api.on('GET', `${base}/andreani-tracking`, { status: 'OUT_FOR_DELIVERY', label: 'En distribución' });
    const user = userEvent.setup();
    renderWithProviders(<AndreaniShipmentButton order={order} />);

    await user.click(await screen.findByRole('button', { name: /Etiqueta PDF/ }));
    await waitFor(() => expect(api.calls.some((c) => c.path === `${base}/andreani-label`)).toBe(true));
    // El botón de seguimiento es solo ícono: el que sigue a la etiqueta.
    const label = screen.getByRole('button', { name: /Etiqueta PDF/ });
    await user.click(label.nextElementSibling as HTMLElement);
    await waitFor(() => expect(api.calls.some((c) => c.path === `${base}/andreani-tracking`)).toBe(true));
  });
});

describe('Zipnova', () => {
  it('crea el envío y baja la etiqueta', async () => {
    const api = mockApi();
    api.on('GET', '/api/v1/admin/shipping/zipnova', { configured: true, active: true });
    api.on('GET', `${base}/zipnova-shipment`, { exists: false });
    api.on('POST', `${base}/zipnova-shipment`, {
      exists: true,
      shipmentId: 778899,
      carrier: 'OCA',
      status: 'new',
    });
    const user = userEvent.setup();
    renderWithProviders(<ZipnovaShipmentButton order={order} />);

    await user.click(await screen.findByRole('button', { name: /Crear envío en Zipnova/ }));
    const modal = await dialog();
    await user.click(modal.getByRole('button', { name: /Crear envío/ }));
    await waitFor(() => expect(api.calls.some((c) => c.method === 'POST')).toBe(true));
    expect(api.calls.find((c) => c.method === 'POST')!.body).toMatchObject({
      name: 'Ana Pérez',
      email: 'ana@mail.com',
      street: 'Av. Corrientes',
      zipcode: '1043',
    });

    await user.click(await screen.findByRole('button', { name: /Etiqueta/ }));
    await waitFor(() => expect(api.calls.some((c) => c.path === `${base}/zipnova-label`)).toBe(true));
  });

  it('si Zipnova rechaza, avisa y no cierra', async () => {
    const api = mockApi();
    api.on('GET', '/api/v1/admin/shipping/zipnova', { configured: true, active: true });
    api.on('GET', `${base}/zipnova-shipment`, { exists: false });
    api.on(
      'POST',
      `${base}/zipnova-shipment`,
      { title: 'Zipnova.CreateFailed', detail: 'Zipnova: destino inválido' },
      400,
    );
    const user = userEvent.setup();
    renderWithProviders(<ZipnovaShipmentButton order={order} />);

    await user.click(await screen.findByRole('button', { name: /Crear envío en Zipnova/ }));
    const modal = await dialog();
    await user.click(modal.getByRole('button', { name: /Crear envío/ }));
    expect(await screen.findByText('Zipnova: destino inválido')).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });
});

describe('Correo Argentino', () => {
  it('a domicilio manda la dirección; a sucursal, el código de la sucursal', async () => {
    const api = mockApi();
    api.on('GET', '/api/v1/admin/shipping/correo', { configured: true, active: true });
    api.on('POST', `${base}/correo-shipment`, { ok: true, createdAt: '2026-10-11T12:00:00' });
    const user = userEvent.setup();
    renderWithProviders(
      <CorreoShipmentButton
        order={{
          ...order,
          shippingMethod: 'Correo a sucursal',
          shippingAddress: 'Sucursal Olivos (B0101) — Maipú 1200',
        }}
      />,
    );

    await user.click(await screen.findByRole('button', { name: /Crear envío en Correo Argentino/ }));
    const modal = await dialog();
    await user.click(modal.getByRole('button', { name: /Crear envío/ }));
    await waitFor(() => expect(api.calls.some((c) => c.method === 'POST')).toBe(true));
    expect(api.calls.find((c) => c.method === 'POST')!.body).toMatchObject({
      deliveryType: 'S',
      agency: 'B0101',
      recipientEmail: 'ana@mail.com',
    });
    expect(await screen.findByRole('button', { name: 'Listo' })).toBeInTheDocument();
  });

  it('no aparece sin Correo configurado', async () => {
    const api = mockApi();
    api.on('GET', '/api/v1/admin/shipping/correo', { configured: false });
    renderWithProviders(<CorreoShipmentButton order={order} />);
    await waitFor(() => expect(api.calls.length).toBeGreaterThan(0));
    expect(screen.queryByText(/Crear envío en Correo/)).not.toBeInTheDocument();
  });
});
