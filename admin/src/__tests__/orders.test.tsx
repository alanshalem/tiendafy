/**
 * Ventas: el detalle de una venta pagada (marcarla enviada con seguimiento,
 * reembolsarla total o parcial con o sin reingreso de stock), la facturación
 * de cada venta (estados de ARCA, emitir con consulta al padrón, reintentar,
 * descargar el PDF) y la venta manual (efectivo, link de pago, cuenta
 * corriente).
 */
import axe from 'axe-core';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { a11yViolations } from '../../../test-fixtures/a11y';
import { FiscalPanel } from '../pages/orders-fiscal';
import { fixture, mockApi, type MockApi } from '../test/api';
import { renderApp, renderWithProviders } from '../test/render';
import { rx } from '../test/text';
import { settle } from '../test/explore';

interface Order {
  id: string;
  status: string;
  buyerEmail: string;
  paymentId: string | null;
  total: { amount: number; currency: string };
}
const orders = fixture<{ items: Order[]; total: number }>('/api/v1/orders');
const paid = { ...orders.items.find((o) => o.status === 'PAID')!, paymentId: 'mp-123' };
const product = fixture<{ items: { name: string }[] }>('/api/v1/products').items[0]!;

async function openOrder(order: Order & { isPickup?: boolean } = paid) {
  const api = mockApi();
  api.on('GET', '/api/v1/orders', { items: [order], total: 1 });
  const user = userEvent.setup({ delay: null, pointerEventsCheck: 0 });
  renderApp('/ventas');
  await user.click(await screen.findByText(order.buyerEmail));
  await settle(3);
  return { api, user };
}

const body = (api: MockApi, method: string, path: string) =>
  api.calls.filter((c) => c.method === method && c.path === path).at(-1)?.body as Record<string, unknown>;

describe('ventas: una venta pagada', () => {
  it('se marca enviada con el número de seguimiento', async () => {
    const { api, user } = await openOrder();
    await user.click(screen.getByRole('button', { name: /Marcar enviada/ }));
    const dialog = within(await screen.findByRole('dialog'));
    await user.type(dialog.getByRole('textbox'), 'TRK-77');
    await user.click(dialog.getByRole('button', { name: 'Marcar enviada' }));
    await settle(2);
    expect(body(api, 'POST', `/api/v1/orders/${paid.id}/fulfill`)).toEqual({ tracking: 'TRK-77' });
  });

  it('de retiro en el local: se avisa "lista para retirar", sin seguimiento ni carriers', async () => {
    const { api, user } = await openOrder({ ...paid, isPickup: true });
    expect(screen.queryByRole('button', { name: /Marcar enviada/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Correo/ })).toBeNull();
    await user.click(screen.getByRole('button', { name: /Lista para retirar/ }));
    const dialog = within(await screen.findByRole('dialog'));
    expect(dialog.queryByRole('textbox')).toBeNull();
    await user.click(dialog.getByRole('button', { name: 'Avisar' }));
    await settle(2);
    expect(body(api, 'POST', `/api/v1/orders/${paid.id}/fulfill`)).toEqual({ tracking: null });
  });

  it('de retiro ya avisada: el estado dice "Lista para retirar" y no ofrece editar seguimiento', async () => {
    await openOrder({ ...paid, status: 'FULFILLED', isPickup: true });
    expect(screen.getAllByText('Lista para retirar').length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: /seguimiento/i })).toBeNull();
  });

  it('de retiro: si falla el aviso, lo dice', async () => {
    const { api, user } = await openOrder({ ...paid, isPickup: true });
    api.on('POST', `/api/v1/orders/${paid.id}/fulfill`, {}, 500);
    await user.click(screen.getByRole('button', { name: /Lista para retirar/ }));
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Avisar' }));
    expect(await screen.findByText(/No se pudo marcar como lista para retirar/)).toBeTruthy();
  });

  it('el detalle muestra cliente (con su ficha), envío y cobro', async () => {
    await openOrder({
      ...paid,
      buyerName: 'Ana Gómez',
      shippingMethod: 'Correo Argentino',
      shippingAddress: 'Av. Siempreviva 742, Springfield',
      tracking: 'AR-555',
      paymentMethod: 'online',
      channel: 'web',
    } as typeof paid);
    const detail = within(document.getElementById(`venta-${paid.id}`)!);
    expect(detail.getByText('Av. Siempreviva 742, Springfield')).toBeInTheDocument();
    expect(screen.getByText('AR-555')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Ver en Clientes/ })).toHaveAttribute(
      'href',
      `/clientes?q=${encodeURIComponent(paid.buyerEmail)}`,
    );
    expect(detail.getByText('Tienda online')).toBeInTheDocument();
  });

  it('reembolsar una venta en cuenta corriente baja la deuda: no habla de Mercado Pago', async () => {
    const { user } = await openOrder({
      ...paid,
      paymentId: 'manual-cuenta_corriente',
      paymentMethod: 'cuenta_corriente',
    } as typeof paid);
    await user.click(screen.getByRole('button', { name: /Reembolsar/ }));
    const dialog = within(await screen.findByRole('dialog', { name: 'Reembolsar pedido' }));
    expect(dialog.getByText(/se le baja la deuda al cliente/i)).toBeInTheDocument();
    await user.click(dialog.getByRole('button', { name: /Reembolsar/ }));
    const confirm = await screen.findByRole('dialog', { name: 'Confirmar reembolso' });
    expect(confirm).toHaveTextContent(/baja la deuda/);
    expect(confirm).not.toHaveTextContent(/Mercado Pago/);
  });

  it('una venta en efectivo: la plata la devolvés vos', async () => {
    const { user } = await openOrder({ ...paid, paymentId: 'manual-cash' });
    await user.click(screen.getByRole('button', { name: /Reembolsar/ }));
    const dialog = within(await screen.findByRole('dialog', { name: 'Reembolsar pedido' }));
    expect(dialog.getByText(/la devolución la hacés vos/)).toBeInTheDocument();
  });

  it('una venta sin cobrar se cancela con motivo (y no se reembolsa)', async () => {
    const pending = {
      ...paid,
      status: 'PENDINGPAYMENT',
      paymentId: null,
      preferenceId: 'pref-1',
    } as unknown as typeof paid;
    const { api, user } = await openOrder(pending);
    api.on('POST', `/api/v1/orders/${paid.id}/cancel`, { linkExpired: true, order: {} });
    expect(screen.queryByRole('button', { name: /Reembolsar/ })).toBeNull();
    await user.click(screen.getByRole('button', { name: /Cancelar venta/ }));
    const dialog = within(await screen.findByRole('dialog'));
    await user.type(dialog.getByRole('textbox'), 'No pagó');
    await user.click(dialog.getByRole('button', { name: 'Cancelar venta' }));
    await settle(2);
    expect(body(api, 'POST', `/api/v1/orders/${paid.id}/cancel`)).toEqual({ reason: 'No pagó' });
    expect(await screen.findByText(/stock liberado y link de pago anulado/)).toBeInTheDocument();
  });

  it('reembolso parcial validado, con historial', async () => {
    const { api, user } = await openOrder();
    api.on('GET', `/api/v1/orders/${paid.id}/refunds`, {
      items: [
        {
          id: 'r1',
          amount: { amount: 1000, currency: 'ARS' },
          reason: 'Falla',
          requestedBy: 'ana@tienda',
          createdAtUtc: '2026-10-01T00:00:00Z',
        },
      ],
    });
    await user.click(screen.getByRole('button', { name: /Reembolsar/ }));
    const dialog = within(await screen.findByRole('dialog', { name: 'Reembolsar pedido' }));
    expect(await dialog.findByText('Reembolsos anteriores')).toBeInTheDocument();

    await user.click(dialog.getByRole('button', { name: 'Parcial' }));
    const amount = dialog.getByPlaceholderText(/^Hasta/);
    await user.type(amount, '999999999');
    expect(dialog.getByText(/Ingresá un monto mayor a 0/)).toBeInTheDocument();
    await user.clear(amount);
    await user.type(amount, '100,5');
    await user.type(dialog.getByPlaceholderText(/producto dañado/), 'Llegó roto');
    await user.click(dialog.getByRole('button', { name: /Reembolsar/ }));
    await user.click(
      within(await screen.findByRole('dialog', { name: 'Confirmar reembolso' })).getByRole('button', {
        name: 'Reembolsar',
      }),
    );
    await settle(2);
    expect(body(api, 'POST', `/api/v1/orders/${paid.id}/refund`)).toEqual({
      amount: 100.5,
      reason: 'Llegó roto',
      restock: false,
    });
  });

  it('reembolso total reingresa el stock (o no, si se destilda)', async () => {
    const { api, user } = await openOrder();
    await user.click(screen.getByRole('button', { name: /Reembolsar/ }));
    const dialog = within(await screen.findByRole('dialog', { name: 'Reembolsar pedido' }));
    await user.click(dialog.getByRole('checkbox'));
    await user.click(dialog.getByRole('button', { name: /Reembolsar/ }));
    await user.click(
      within(await screen.findByRole('dialog', { name: 'Confirmar reembolso' })).getByRole('button', {
        name: 'Reembolsar',
      }),
    );
    await settle(2);
    expect(body(api, 'POST', `/api/v1/orders/${paid.id}/refund`)).toEqual({
      amount: null,
      reason: null,
      restock: false,
    });
  });

  it('cobrada con Payway: el reembolso dice que la plata vuelve por Payway, no por Mercado Pago', async () => {
    const { api, user } = await openOrder({ ...paid, paymentMethod: 'online' } as typeof paid);
    api.on('GET', `/api/v1/orders/${paid.id}/refunds`, { items: [], gateway: 'payway' });
    await user.click(screen.getByRole('button', { name: /Reembolsar/ }));
    const dialog = within(await screen.findByRole('dialog', { name: 'Reembolsar pedido' }));
    expect(await dialog.findByText(/por Payway/)).toBeInTheDocument();
    expect(dialog.queryByText(/Mercado Pago/)).toBeNull();
    await user.click(dialog.getByRole('button', { name: /Reembolsar/ }));
    const confirm = within(await screen.findByRole('dialog', { name: 'Confirmar reembolso' }));
    expect(confirm.getByText(/por Payway/)).toBeInTheDocument();
  });
});

describe('ventas: facturación de la venta', () => {
  const docs = (documents: object[], jobs: object[] = []) => ({ documents, jobs });
  const factura = {
    id: 'd1',
    cbteTipo: 'FacturaB',
    ptoVta: 3,
    number: 42,
    result: 'Authorized',
    cae: '7412',
    caeVto: '20261031',
    errors: null,
  };

  async function panel(status: object, orderStatus = 'PAID') {
    const api = mockApi();
    api.on('GET', `/api/v1/orders/${paid.id}/fiscal`, status);
    const user = userEvent.setup({ delay: null, pointerEventsCheck: 0 });
    renderWithProviders(
      <FiscalPanel orderId={paid.id} orderStatus={orderStatus} buyerDoc="30111222" canEmit />,
    );
    await settle(2);
    return { api, user };
  }

  it('sin factura: emite consultando el padrón por CUIT', async () => {
    const { api, user } = await panel(docs([]));
    api.on('GET', '/api/v1/fiscal/padron/30712345678', {
      cuit: '30712345678',
      name: 'Gimnasio del Centro SA',
      address: 'Av. Siempreviva 742',
      condicion: 'RESPONSABLEINSCRIPTO',
    });
    api.on('POST', `/api/v1/orders/${paid.id}/invoice`, { authorized: true, cae: '74123456789012' });
    await user.click(screen.getByRole('button', { name: /Facturar ahora/ }));
    const dialog = within(await screen.findByRole('dialog', { name: 'Facturar la venta' }));
    expect(await a11yViolations(axe, screen.getByRole('dialog'))).toEqual([]);

    const doc = dialog.getByPlaceholderText('20-12345678-6');
    expect(dialog.getByRole('button', { name: /Consultar en ARCA/ })).toBeDisabled(); // un DNI no se consulta
    await user.clear(doc);
    await user.type(doc, '30-71234567-8');
    await user.click(dialog.getByRole('button', { name: /Consultar en ARCA/ }));
    expect(await dialog.findByText('Gimnasio del Centro SA')).toBeInTheDocument();
    await user.click(dialog.getByRole('button', { name: 'Facturar' }));
    await settle(2);
    expect(body(api, 'POST', `/api/v1/orders/${paid.id}/invoice`)).toEqual({
      buyerDoc: '30-71234567-8',
      buyerIvaCondition: 'RESPONSABLEINSCRIPTO',
    });
    expect(await screen.findByText(/Factura autorizada · CAE 74123456789012/)).toBeInTheDocument();
  });

  it('ARCA rechaza o el padrón falla: lo dice', async () => {
    const { api, user } = await panel(docs([]));
    api.on('GET', '/api/v1/fiscal/padron/30712345678', { detail: 'CUIT inexistente.' }, 404);
    api.on('POST', `/api/v1/orders/${paid.id}/invoice`, {
      authorized: false,
      cae: null,
      errors: [{ code: '10015', message: 'Doc inválido' }],
    });
    await user.click(screen.getByRole('button', { name: /Facturar ahora/ }));
    const dialog = within(await screen.findByRole('dialog', { name: 'Facturar la venta' }));
    await user.clear(dialog.getByPlaceholderText('20-12345678-6'));
    await user.type(dialog.getByPlaceholderText('20-12345678-6'), '30712345678');
    await user.click(dialog.getByRole('button', { name: /Consultar en ARCA/ }));
    expect(await dialog.findByText('CUIT inexistente.')).toBeInTheDocument();
    await user.click(dialog.getByRole('button', { name: 'Facturar' }));
    expect(await screen.findByText(/Rechazada por ARCA: Doc inválido/)).toBeInTheDocument();
  });

  it('con factura y nota de crédito: muestra ambas y baja cada PDF', async () => {
    const nc = { ...factura, id: 'd2', cbteTipo: 'NotaCreditoB', number: 7, cae: '9999' };
    const { api, user } = await panel(docs([factura, nc]), 'REFUNDED');
    expect(screen.getByText(/Factura B 0003-00000042 · CAE 7412 \(vence 20261031\)/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Facturar ahora/ })).not.toBeInTheDocument();
    const pdfs = screen.getAllByRole('button', { name: /PDF/ });
    await user.click(pdfs[0]!);
    await user.click(pdfs[1]!);
    await waitFor(() =>
      expect(api.calls.some((c) => c.path === `/api/v1/orders/${paid.id}/invoice.pdf?type=creditnote`)).toBe(
        true,
      ),
    );
    expect(api.calls.some((c) => c.path === `/api/v1/orders/${paid.id}/invoice.pdf`)).toBe(true);
  });

  it('en producción, la factura de homologación no cuenta: se dice de prueba y se puede facturar', async () => {
    const prueba = { ...factura, environment: 'HOMOLOGACION' };
    await panel({ environment: 'PRODUCCION', documents: [prueba], jobs: [] });
    expect(
      screen.getByText(/La Factura B 0003-00000042 es de homologación: de prueba, sin validez fiscal/),
    ).toBeInTheDocument();
    expect(screen.queryByText(/· CAE 7412/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Facturar ahora/ })).toBeInTheDocument();
  });

  it('facturando en homologación, la factura se marca de prueba', async () => {
    await panel({
      environment: 'HOMOLOGACION',
      documents: [{ ...factura, environment: 'HOMOLOGACION' }],
      jobs: [],
    });
    expect(screen.getByText(/Factura B 0003-00000042 · CAE 7412/)).toBeInTheDocument();
    expect(screen.getByText('· de prueba (homologación)')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Facturar ahora/ })).not.toBeInTheDocument();
  });

  it('esperando a ARCA no ofrece volver a facturar; en proceso lo dice', async () => {
    await panel(docs([{ ...factura, result: 'Pending', cae: null }]));
    expect(screen.getByText(/Esperando confirmación de ARCA/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Facturar ahora/ })).not.toBeInTheDocument();
  });

  it('facturación en proceso', async () => {
    await panel(
      docs([], [{ id: 'j1', kind: 'Invoice', status: 'Processing', attempts: 1, lastError: null }]),
    );
    expect(screen.getByText('Facturación en proceso…')).toBeInTheDocument();
  });

  it('si la automática falló, se reintenta', async () => {
    const { api, user } = await panel(
      docs([], [{ id: 'j9', kind: 'Invoice', status: 'Failed', attempts: 3, lastError: 'Timeout de ARCA' }]),
    );
    expect(screen.getByText(/Falló la facturación automática: Timeout de ARCA/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Reintentar/ }));
    await settle(2);
    expect(api.calls.some((c) => c.method === 'POST' && c.path === '/api/v1/fiscal/jobs/j9/retry')).toBe(
      true,
    );
  });
});

describe('ventas: venta manual', () => {
  async function openManual() {
    const api = mockApi();
    api.on('POST', '/api/v1/orders/manual', { id: 'o-new' });
    const user = userEvent.setup({ delay: null, pointerEventsCheck: 0 });
    renderApp('/ventas');
    await user.click(await screen.findByRole('button', { name: /Venta manual/ }));
    const dialog = await screen.findByRole('dialog');
    await user.type(
      within(dialog).getByPlaceholderText('Buscar producto o SKU para agregar…'),
      product.name.slice(0, 5),
    );
    // La búsqueda espera a que se deje de tipear (debounce) antes de ir a la API.
    await user.click(
      await within(dialog).findByRole('button', { name: rx(product.name) }, { timeout: 4000 }),
    );
    return { api, user, dialog: within(dialog), root: dialog };
  }

  it('el modal es accesible con productos cargados', async () => {
    const { root } = await openManual();
    expect(await a11yViolations(axe, root)).toEqual([]);
  });

  it('en efectivo, con cantidad y precio propios', async () => {
    const { api, user, dialog } = await openManual();
    const qty = dialog.getByLabelText(rx(`Cantidad de ${product.name}`));
    await user.clear(qty);
    await user.type(qty, '2');
    await user.type(dialog.getByLabelText(rx(`Precio de ${product.name}`)), '1500');
    await user.type(dialog.getByRole('combobox', { name: /Cliente/ }), 'Ana');
    await user.type(dialog.getByPlaceholderText('Ej: vendido por Instagram, retira el sábado'), 'Retira hoy');
    await user.click(dialog.getAllByRole('button').at(-1)!);
    await settle(2);
    expect(body(api, 'POST', '/api/v1/orders/manual')).toMatchObject({
      paymentMethod: 'cash',
      buyerName: 'Ana',
      notes: 'Retira hoy',
    });
  });

  it('link de pago exige email y muestra el link para copiar', async () => {
    const { api, user, dialog } = await openManual();
    api.on('POST', '/api/v1/orders/manual', { id: 'o-new', paymentLink: 'https://mp.example.com/link/1' });
    await user.selectOptions(dialog.getByLabelText('Cobro'), 'link');
    await user.click(dialog.getAllByRole('button').at(-1)!);
    expect(await screen.findByText(/hace falta el email del comprador/)).toBeInTheDocument();
    await user.type(dialog.getByPlaceholderText('Para el email de confirmación'), 'ana@example.com');
    await user.click(dialog.getAllByRole('button').at(-1)!);
    expect(await screen.findByDisplayValue('https://mp.example.com/link/1')).toBeInTheDocument();
  });

  it('un solo campo de cliente: elegirlo de la agenda trae su ficha', async () => {
    const { api, user, dialog } = await openManual();
    api.on('GET', '/api/v1/customers', {
      items: [{ id: 'c-ana', name: 'Ana Pérez', email: 'ana@perez.com', phone: '1155', priceListId: null }],
      total: 1,
    });
    // Ya no hay un segundo campo "Cliente de la agenda".
    expect(dialog.queryByText(/Cliente de la agenda \(opcional\)/)).toBeNull();
    await user.type(dialog.getByRole('combobox', { name: /Cliente/ }), 'Ana');
    await user.click(await dialog.findByRole('button', { name: /Ana Pérez/ }, { timeout: 4000 }));
    expect(dialog.getByPlaceholderText('Para el email de confirmación')).toHaveValue('ana@perez.com');
    await user.selectOptions(dialog.getByLabelText('Cobro'), 'cuenta_corriente');
    await user.click(dialog.getAllByRole('button').at(-1)!);
    await settle(2);
    expect(body(api, 'POST', '/api/v1/orders/manual')).toMatchObject({
      paymentMethod: 'cuenta_corriente',
      customerId: 'c-ana',
      buyerName: 'Ana Pérez',
      buyerEmail: 'ana@perez.com',
    });
  });

  it('si no está en la agenda, se crea desde el mismo campo', async () => {
    const { api, user, dialog } = await openManual();
    api.on('GET', '/api/v1/customers', { items: [], total: 0 });
    api.on('POST', '/api/v1/customers', {
      id: 'c-zoe',
      name: 'Zoe Nueva',
      email: null,
      phone: null,
      priceListId: null,
    });
    await user.type(dialog.getByRole('combobox', { name: /Cliente/ }), 'Zoe Nueva');
    await user.click(
      await dialog.findByRole('button', { name: /Crear «Zoe Nueva» en la agenda/ }, { timeout: 4000 }),
    );
    await settle(2);
    expect(body(api, 'POST', '/api/v1/customers')).toMatchObject({ name: 'Zoe Nueva' });
    expect(dialog.getByText(/Cliente de la agenda\./)).toBeInTheDocument();
  });

  it('el link de pago lleva a la venta para cancelarla si no paga', async () => {
    const { api, user, dialog } = await openManual();
    api.on('POST', '/api/v1/orders/manual', { id: paid.id, paymentLink: 'https://mp.example.com/link/2' });
    await user.selectOptions(dialog.getByLabelText('Cobro'), 'link');
    await user.type(dialog.getByPlaceholderText('Para el email de confirmación'), 'ana@example.com');
    await user.click(dialog.getAllByRole('button').at(-1)!);
    expect(await screen.findByText(/tocá/)).toHaveTextContent('Cancelar venta');
    expect(screen.getByRole('link', { name: /Ver la venta/ })).toHaveAttribute(
      'href',
      `/ventas?order=${paid.id}`,
    );
  });

  it('cuenta corriente exige un cliente de la agenda; se puede quitar un producto', async () => {
    const { user, dialog } = await openManual();
    await user.selectOptions(dialog.getByLabelText('Cobro'), 'cuenta_corriente');
    await user.click(dialog.getAllByRole('button').at(-1)!);
    expect(await screen.findByText(/elegí un cliente de la agenda/)).toBeInTheDocument();
    await user.click(dialog.getByRole('button', { name: rx(`Quitar ${product.name}`) }));
    expect(dialog.queryByLabelText(rx(`Cantidad de ${product.name}`))).not.toBeInTheDocument();
  });
});
