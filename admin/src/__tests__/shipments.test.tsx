/**
 * Despachar una venta con cada carrier desde el panel: el botón aparece solo
 * si el carrier está configurado, el modal sale precargado con los datos de
 * la venta, y lo que se manda a la API es lo que el carrier necesita. Con un
 * envío ya creado, se baja la etiqueta y se consulta el seguimiento.
 */
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { AndreaniShipmentButton } from '../components/AndreaniShipment';
import { CorreoShipmentButton } from '../components/CorreoShipment';
import { ZipnovaShipmentButton } from '../components/ZipnovaShipment';
import type { ShippingOrderLike } from '../lib/shipping';
import { mockApi, type MockApi } from '../test/api';
import { fill } from '../test/explore';
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

const download = vi.hoisted(() => vi.fn());
vi.mock('../lib/download', () => ({ downloadBlob: download }));

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

describe('casos borde de los despachos', () => {
  const lastPost = (api: MockApi, path: string) =>
    api.calls.filter((c) => c.method === 'POST' && c.path === path).at(-1)?.body;

  it('Andreani a sucursal pide el ID (no la dirección); si ya existía, lo dice', async () => {
    const api = mockApi();
    api.on('GET', '/api/v1/admin/shipping/andreani', { configured: true, canCreateShipments: true });
    api.on('GET', `${base}/andreani-shipment`, { exists: false });
    api.on('POST', `${base}/andreani-shipment`, { detail: 'Código postal inexistente.' }, 400);
    const user = userEvent.setup();
    renderWithProviders(<AndreaniShipmentButton order={order} />);

    await user.click(await screen.findByRole('button', { name: /Crear envío en Andreani/ }));
    const modal = await dialog();
    await user.type(modal.getByLabelText('Piso, depto. u observaciones'), '2B');
    await user.click(modal.getByRole('button', { name: /Crear envío/ }));
    expect(await screen.findByText('Código postal inexistente.')).toBeInTheDocument();
    expect(lastPost(api, `${base}/andreani-shipment`)).toMatchObject({
      extras: '2B',
      toBranch: false,
      branchId: null,
    });

    await user.click(modal.getByRole('switch', { name: /Retiro en sucursal de Andreani/ }));
    expect(modal.queryByLabelText('Calle')).not.toBeInTheDocument();
    await user.type(modal.getByLabelText('ID de la sucursal de retiro'), ' PRC ');
    api.on('POST', `${base}/andreani-shipment`, {
      exists: true,
      alreadyExisted: true,
      trackingNumber: '360000123',
      allTrackingNumbers: ['360000123', '360000124'],
      label: 'Ingresado',
      hasLabel: true,
    });
    await user.click(modal.getByRole('button', { name: /Crear envío/ }));
    expect(await screen.findByText('Esta venta ya tenía un envío en Andreani')).toBeInTheDocument();
    expect(lastPost(api, `${base}/andreani-shipment`)).toMatchObject({ toBranch: true, branchId: 'PRC' });
    // Un envío con varios bultos los cuenta.
    expect(screen.getByText(/2 bultos/)).toBeInTheDocument();
  });

  it('Andreani: la etiqueta se baja con el número de seguimiento; los errores se muestran', async () => {
    download.mockReset();
    const api = mockApi();
    api.on('GET', '/api/v1/admin/shipping/andreani', { configured: true, canCreateShipments: true });
    api.on('GET', `${base}/andreani-shipment`, { exists: true, trackingNumber: '360000123', hasLabel: true });
    api.on('GET', `${base}/andreani-label`, {});
    api.on('GET', `${base}/andreani-tracking`, { status: 'EN_CAMINO', label: 'En camino' });
    const user = userEvent.setup();
    renderWithProviders(<AndreaniShipmentButton order={order} />);

    await user.click(await screen.findByRole('button', { name: /Etiqueta PDF/ }));
    await waitFor(() =>
      expect(download).toHaveBeenCalledWith(expect.anything(), 'etiqueta-andreani-360000123.pdf'),
    );
    await user.click(screen.getByRole('button', { name: /Seguimiento/ }));
    expect(await screen.findByText('Andreani: En camino')).toBeInTheDocument();

    api.on('GET', `${base}/andreani-label`, { detail: 'La etiqueta todavía no está lista.' }, 409);
    await user.click(screen.getByRole('button', { name: /Etiqueta PDF/ }));
    expect(await screen.findByText('La etiqueta todavía no está lista.')).toBeInTheDocument();
    api.on('GET', `${base}/andreani-tracking`, { detail: 'Andreani no responde.' }, 502);
    await user.click(screen.getByRole('button', { name: /Seguimiento/ }));
    expect(await screen.findByText('Andreani no responde.')).toBeInTheDocument();
  });

  it('Zipnova: con envío muestra transporte y seguimiento; si ya existía, lo dice', async () => {
    const api = mockApi();
    api.on('GET', '/api/v1/admin/shipping/zipnova', { configured: true });
    api.on('GET', `${base}/zipnova-shipment`, { exists: false });
    api.on('POST', `${base}/zipnova-shipment`, {
      exists: true,
      alreadyExisted: true,
      carrier: 'OCA',
      carrierTrackingId: 'OCA-99',
      trackingUrl: 'https://tracking.example/ZN-1',
    });
    api.on('GET', `${base}/zipnova-label`, { detail: 'Etiqueta no disponible.' }, 404);
    const user = userEvent.setup();
    renderWithProviders(<ZipnovaShipmentButton order={order} />);

    await user.click(await screen.findByRole('button', { name: /Crear envío en Zipnova/ }));
    const modal = await dialog();
    await user.type(modal.getByLabelText('Piso / depto (opcional)'), '2B');
    await user.click(modal.getByRole('button', { name: /Crear envío/ }));
    expect(await screen.findByText('Esta venta ya tenía un envío en Zipnova')).toBeInTheDocument();
    expect(screen.getByText(/OCA-99/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Seguimiento/ })).toHaveAttribute(
      'href',
      'https://tracking.example/ZN-1',
    );
    await user.click(screen.getByRole('button', { name: /Etiqueta/ }));
    expect(await screen.findByText('Etiqueta no disponible.')).toBeInTheDocument();
  });

  it('Correo: a domicilio con piso, depto y provincia; si MiCorreo rechaza, lo dice', async () => {
    const api = mockApi();
    api.on('GET', '/api/v1/admin/shipping/correo', { configured: true, active: true });
    api.on('POST', `${base}/correo-shipment`, { detail: 'Provincia inválida.' }, 400);
    const user = userEvent.setup();
    renderWithProviders(<CorreoShipmentButton order={order} />);

    await user.click(await screen.findByRole('button', { name: /Crear envío en Correo Argentino/ }));
    const modal = await dialog();
    expect(modal.getByLabelText('Tipo de entrega')).toHaveValue('D');
    await user.type(modal.getByLabelText('Piso'), '2');
    await user.type(modal.getByLabelText('Depto'), 'B');
    await user.selectOptions(modal.getByLabelText('Provincia'), 'X');
    await user.click(modal.getByRole('button', { name: /Crear envío/ }));
    expect(await screen.findByText('Provincia inválida.')).toBeInTheDocument();
    expect(lastPost(api, `${base}/correo-shipment`)).toMatchObject({
      deliveryType: 'D',
      floor: '2',
      apartment: 'B',
      provinceCode: 'X',
      agency: null,
    });

    // Cambiar a sucursal esconde la dirección; volver la muestra.
    await user.selectOptions(modal.getByLabelText('Tipo de entrega'), 'S');
    expect(modal.queryByLabelText('Calle')).not.toBeInTheDocument();
    await user.selectOptions(modal.getByLabelText('Tipo de entrega'), 'D');
    expect(modal.getByLabelText('Calle')).toBeInTheDocument();

    api.on('POST', `${base}/correo-shipment`, { ok: true, createdAt: null });
    await user.click(modal.getByRole('button', { name: /Crear envío/ }));
    await user.click(await screen.findByRole('button', { name: 'Listo' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });
});

describe('cada campo del formulario de envío viaja a la API', () => {
  const CASES = [
    { name: 'Andreani', ui: <AndreaniShipmentButton order={order} />, key: 'andreani', ship: true },
    { name: 'Zipnova', ui: <ZipnovaShipmentButton order={order} />, key: 'zipnova', ship: true },
    { name: 'Correo Argentino', ui: <CorreoShipmentButton order={order} />, key: 'correo', ship: false },
  ];

  it.each(CASES)('$name', async ({ name, ui, key, ship }) => {
    const api = mockApi();
    api.on('GET', `/api/v1/admin/shipping/${key}`, {
      configured: true,
      active: true,
      canCreateShipments: true,
    });
    if (ship) api.on('GET', `${base}/${key}-shipment`, { exists: false });
    api.on('POST', `${base}/${key}-shipment`, {
      exists: true,
      ok: true,
      createdAt: null,
      trackingNumber: 'T-1',
    });
    const user = userEvent.setup();
    renderWithProviders(ui);

    await user.click(await screen.findByRole('button', { name: new RegExp(`Crear envío en ${name}`) }));
    const modal = screen.getByRole('dialog');
    // Todo se edita (los campos de texto con un valor nuevo, los selects con otra opción).
    await fill(user, modal, 100);
    await user.click(within(modal).getByRole('button', { name: /Crear envío/ }));
    await waitFor(() => expect(api.calls.some((c) => c.method === 'POST')).toBe(true));
    const sent = JSON.stringify(api.calls.find((c) => c.method === 'POST')!.body);
    expect(sent).toContain('Prueba 12');
  });
});
