/**
 * Un envío que el carrier pudo haber creado sin que quedara guardado en
 * Tiendafy: la venta lo avisa en vez de ofrecer crear otro (sería un
 * duplicado que se paga), y se resuelve desde ahí: o se carga el número que
 * figura en el carrier, o se libera después de confirmar que no se creó.
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
const claimedAtUtc = '2026-10-15T12:00:00Z';

const posts = (api: ReturnType<typeof mockApi>, path: string) =>
  api.calls.filter((c) => c.method === 'POST' && c.path === path);

describe('Envío a revisar', () => {
  it('Andreani: avisa, no deja crear otro y carga el número que figura en Andreani', async () => {
    const api = mockApi();
    api.on('GET', '/api/v1/admin/shipping/andreani', { configured: true, canCreateShipments: true });
    api.on('GET', `${base}/andreani-shipment`, {
      exists: false,
      review: { note: 'seguimiento 360000000077770', claimedAtUtc },
    });
    api.on('POST', `${base}/andreani-shipment/review/record`, {
      exists: true,
      alreadyExisted: false,
      trackingNumber: '360000000077770',
      allTrackingNumbers: ['360000000077770'],
      label: 'Creado',
      hasLabel: false,
    });
    const user = userEvent.setup();
    renderWithProviders(<AndreaniShipmentButton order={order} />);

    const notice = await screen.findByRole('alert');
    expect(notice).toHaveTextContent(/no quedó guardado acá/);
    expect(notice).toHaveTextContent(/seguimiento 360000000077770/);
    expect(screen.queryByRole('button', { name: /Crear envío en Andreani/ })).not.toBeInTheDocument();

    await user.click(within(notice).getByRole('button', { name: /Se creó: cargar el número/ }));
    const prompt = within(await screen.findByRole('dialog'));
    await user.type(prompt.getByRole('textbox'), ' 360000000077770 ');
    await user.click(prompt.getByRole('button', { name: 'Guardar' }));

    await waitFor(() => expect(posts(api, `${base}/andreani-shipment/review/record`)).toHaveLength(1));
    expect(posts(api, `${base}/andreani-shipment/review/record`)[0]!.body).toEqual({
      number: '360000000077770',
    });
    // Queda como un envío normal, con su seguimiento.
    expect(await screen.findByText(/Andreani 360000000077770/)).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('Zipnova: liberar pide confirmación, y cancelar no toca nada', async () => {
    const api = mockApi();
    api.on('GET', '/api/v1/admin/shipping/zipnova', { configured: true, active: true });
    api.on('GET', `${base}/zipnova-shipment`, {
      exists: false,
      review: { note: 'envío #8800009', claimedAtUtc },
    });
    api.on('POST', `${base}/zipnova-shipment/review/release`, {});
    const user = userEvent.setup();
    renderWithProviders(<ZipnovaShipmentButton order={order} />);

    const notice = await screen.findByRole('alert');
    await user.click(within(notice).getByRole('button', { name: /no se creó/ }));
    let confirm = within(await screen.findByRole('dialog'));
    expect(confirm.getByText(/envío duplicado que se paga/)).toBeInTheDocument();
    await user.click(confirm.getByRole('button', { name: 'Cancelar' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(posts(api, `${base}/zipnova-shipment/review/release`)).toHaveLength(0);

    await user.click(within(screen.getByRole('alert')).getByRole('button', { name: /no se creó/ }));
    confirm = within(await screen.findByRole('dialog'));
    await user.click(confirm.getByRole('button', { name: /No se creó: liberar/ }));

    await waitFor(() => expect(posts(api, `${base}/zipnova-shipment/review/release`)).toHaveLength(1));
    // Liberado, se puede volver a crear.
    expect(await screen.findByRole('button', { name: /Crear envío en Zipnova/ })).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('Zipnova: si ya lo resolvió otro, muestra el error y deja el aviso', async () => {
    const api = mockApi();
    api.on('GET', '/api/v1/admin/shipping/zipnova', { configured: true, active: true });
    api.on('GET', `${base}/zipnova-shipment`, { exists: false, review: { note: null, claimedAtUtc } });
    api.on(
      'POST',
      `${base}/zipnova-shipment/review/release`,
      { title: 'Shipping.NotInReview', detail: 'Este envío ya no está a revisar.' },
      409,
    );
    const user = userEvent.setup();
    renderWithProviders(<ZipnovaShipmentButton order={order} />);

    await user.click(within(await screen.findByRole('alert')).getByRole('button', { name: /no se creó/ }));
    await user.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: /No se creó: liberar/ }),
    );
    expect(await screen.findByText('Este envío ya no está a revisar.')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  it('Correo Argentino: "se creó" registra el alta sin pedir número', async () => {
    const api = mockApi();
    api.on('GET', '/api/v1/admin/shipping/correo', { configured: true, active: true });
    api.on('GET', `${base}/correo-shipment`, {
      exists: false,
      review: { note: 'alta de la venta #1001', claimedAtUtc },
    });
    api.on('POST', `${base}/correo-shipment/review/record`, {
      exists: true,
      ok: true,
      alreadyExisted: false,
      deliveryType: 'D',
      agency: null,
      createdAt: null,
    });
    const user = userEvent.setup();
    renderWithProviders(<CorreoShipmentButton order={order} />);

    await user.click(
      within(await screen.findByRole('alert')).getByRole('button', { name: /Se creó: registrarlo/ }),
    );
    const confirm = within(await screen.findByRole('dialog'));
    expect(confirm.queryByRole('textbox')).not.toBeInTheDocument();
    await user.click(confirm.getByRole('button', { name: /Se creó: registrarlo/ }));

    await waitFor(() => expect(posts(api, `${base}/correo-shipment/review/record`)).toHaveLength(1));
    expect(await screen.findByText(/alta en MiCorreo/)).toBeInTheDocument();
  });
});
