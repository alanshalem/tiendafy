/**
 * Compras e importaciones: el ciclo de una orden de compra con los datos de
 * la demo — editar el borrador (ítems, gastos, tipo de cambio), avanzar de
 * estado, cancelar, recibir la mercadería (con aviso si el costo nuevo aplasta
 * márgenes), cargar la factura del proveedor (a mano o leída por la IA) y
 * bajar el libro de IVA compras. También la reposición sugerida.
 */
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { fixture, mockApi, type MockApi } from '../test/api';
import { renderApp } from '../test/render';
import { settle } from '../test/explore';

interface Po {
  id: string;
  supplierName: string;
  reference: string;
  status: string;
  items: { variantId: string; productName: string; quantity: number }[];
}
const po = fixture<Po>('/api/v1/purchasing/purchase-orders/:id');
const supplier = fixture<{ items: { id: string; name: string }[] }>('/api/v1/suppliers').items[0]!;

async function openPo(patch: Partial<Po> = {}) {
  const api = mockApi();
  api.on('GET', `/api/v1/purchasing/purchase-orders/${po.id}`, { ...po, ...patch });
  api.on('GET', '/api/v1/purchasing/purchase-orders', {
    items: [{ ...po, ...patch, totalFob: 1, items: po.items.length, units: 3, leadTimeDays: 50 }],
    total: 1,
  });
  const user = userEvent.setup({ delay: null, pointerEventsCheck: 0 });
  renderApp('/compras');
  await user.click(await screen.findByText(po.reference));
  await screen.findByRole('heading', { name: po.supplierName });
  await settle(2);
  return { api, user };
}

const last = (api: MockApi, method: string, path: string) =>
  api.calls.filter((c) => c.method === method && c.path === path).at(-1)?.body as Record<string, unknown>;

describe('compras: la orden', () => {
  it('edita el borrador y lo guarda con ítems y gastos', async () => {
    const { api, user } = await openPo();
    await user.selectOptions(screen.getAllByRole('combobox')[0]!, supplier.id);
    const reference = screen.getByDisplayValue(po.reference);
    await user.clear(reference);
    await user.type(reference, 'CONT-77');

    await user.click(screen.getByRole('button', { name: 'Gasto' }));
    const concept = screen.getAllByPlaceholderText('Concepto (ej. Flete marítimo)').at(-1)!;
    await user.type(concept, 'Seguro');
    await user.type(screen.getAllByPlaceholderText('Monto').at(-1)!, '150');

    // Uno de más, vacío: se quita con su botón.
    await user.click(screen.getByRole('button', { name: 'Gasto' }));
    await user.click(screen.getByRole('button', { name: 'Quitar el gasto 4' }));

    await user.click(screen.getByRole('button', { name: 'Guardar' }));
    await settle(2);
    const body = last(api, 'PUT', `/api/v1/purchasing/purchase-orders/${po.id}`);
    expect(body).toMatchObject({
      supplierId: supplier.id,
      supplierName: supplier.name,
      reference: 'CONT-77',
    });
    expect(body.expenses).toContainEqual({ label: 'Seguro', amount: 150, isLocal: false });
    expect((body.items as unknown[]).length).toBe(po.items.length);
  });

  it('avanza de estado y se puede cancelar', async () => {
    const { api, user } = await openPo({ status: 'CONFIRMED' });
    await user.click(screen.getByRole('button', { name: 'En tránsito' }));
    await settle(2);
    expect(last(api, 'POST', `/api/v1/purchasing/purchase-orders/${po.id}/status`)).toEqual({
      status: 'INTRANSIT',
    });

    await user.click(screen.getByRole('button', { name: 'Cancelar OC' }));
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Cancelar OC' }));
    await settle(2);
    expect(last(api, 'POST', `/api/v1/purchasing/purchase-orders/${po.id}/status`)).toEqual({
      status: 'CANCELLED',
    });
  });

  it('recibe la mercadería con el tipo de cambio definitivo y avisa márgenes aplastados', async () => {
    const { api, user } = await openPo({ status: 'INCUSTOMS' });
    api.on('POST', `/api/v1/purchasing/purchase-orders/${po.id}/receive`, {
      lowMargin: [
        {
          variantId: po.items[0]!.variantId,
          product: po.items[0]!.productName,
          variant: 'Única',
          marginPct: 4.2,
        },
      ],
    });
    await user.click(screen.getByRole('button', { name: 'Recibir' }));
    const dialog = within(await screen.findByRole('dialog', { name: 'Recibir mercadería' }));
    const [rate, ...qtys] = dialog.getAllByRole('spinbutton');
    await user.clear(rate!);
    await user.type(rate!, '1400');
    await user.clear(qtys[0]!);
    await user.type(qtys[0]!, '1');
    await user.click(dialog.getByRole('button', { name: 'Confirmar recepción' }));
    await settle(2);

    const body = last(api, 'POST', `/api/v1/purchasing/purchase-orders/${po.id}/receive`);
    expect(body.exchangeRate).toBe(1400);
    expect((body.items as { receivedQuantity: number }[])[0]!.receivedQuantity).toBe(1);

    const warning = within(await screen.findByRole('dialog', { name: /Márgenes aplastados/ }));
    expect(warning.getByText(/4,2%|4\.2%/)).toBeInTheDocument();
    await user.click(warning.getByRole('button', { name: 'Después' }));
  });

  it('si la recepción falla, lo dice y deja reintentar', async () => {
    const { api, user } = await openPo({ status: 'INTRANSIT' });
    api.on(
      'POST',
      `/api/v1/purchasing/purchase-orders/${po.id}/receive`,
      { detail: 'Ya fue recibida.' },
      409,
    );
    await user.click(screen.getByRole('button', { name: 'Recibir' }));
    const dialog = within(await screen.findByRole('dialog', { name: 'Recibir mercadería' }));
    await user.click(dialog.getByRole('button', { name: 'Confirmar recepción' }));
    expect(await screen.findByText('Ya fue recibida.')).toBeInTheDocument();
    await user.click(dialog.getByRole('button', { name: 'Volver' }));
  });
});

describe('compras: factura del proveedor', () => {
  it('se carga a mano y queda para el libro de IVA', async () => {
    const { api, user } = await openPo({ status: 'RECEIVED' });
    await user.type(screen.getByPlaceholderText('30-12345678-9'), '30712345678');
    await user.type(screen.getByPlaceholderText('A / B / Despacho'), 'A');
    await user.type(screen.getByPlaceholderText('0001-00001234'), '0001-00000042');
    await user.type(screen.getByLabelText('Fecha'), '2026-10-01');
    const [net, vat] = screen.getAllByPlaceholderText('0,00');
    await user.type(net!, '1000,50');
    await user.type(vat!, '210,11');
    await user.click(screen.getByRole('button', { name: /Guardar comprobante/ }));
    await settle(2);
    expect(last(api, 'PUT', `/api/v1/purchasing/purchase-orders/${po.id}/invoice`)).toMatchObject({
      supplierTaxId: '30712345678',
      invoiceType: 'A',
      invoiceNumber: '0001-00000042',
    });
  });

  it('la IA lee la factura escaneada, se revisa y se usa', async () => {
    const { api, user } = await openPo({ status: 'RECEIVED' });
    api.on('GET', '/api/v1/ai/status', { enabled: true });
    api.on('POST', `/api/v1/purchasing/purchase-orders/${po.id}/invoice/scan`, {
      supplierName: 'Shenzhen Trading Co.',
      supplierTaxId: '30711111119',
      invoiceType: 'Despacho',
      invoiceNumber: '26001IC04000123X',
      invoiceDateUtc: '2026-09-15T00:00:00Z',
      netAmount: 1500000,
      vatAmount: 315000,
      totalAmount: 1815000,
      currency: 'USD',
      currencyMismatch: true,
      confidence: 'media',
      warnings: ['El total no coincide con la suma de las líneas.'],
      lines: [{ description: 'Mancuernas', quantity: 10, unitPrice: 150000 }],
    });
    // El botón de leer con IA aparece con la IA habilitada: se vuelve a abrir la orden.
    renderApp('/compras');
    const file = await waitFor(() => {
      const input = document.querySelector<HTMLInputElement>('input[type=file]');
      if (!input) throw new Error('sin input de archivo');
      return input;
    });
    await user.upload(file, new File(['%PDF'], 'factura.pdf', { type: 'application/pdf' }));
    expect(await screen.findByText(/Confianza media/)).toBeInTheDocument();
    expect(screen.getByText(/La factura está en USD/)).toBeInTheDocument();
    expect(screen.getByText('El total no coincide con la suma de las líneas.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Usar estos datos' }));
    expect(screen.getByDisplayValue('26001IC04000123X')).toBeInTheDocument();
  });

  it('un escaneo de más de 10 MB se rechaza antes de subirlo', async () => {
    const { api, user } = await openPo({ status: 'RECEIVED' });
    api.on('GET', '/api/v1/ai/status', { enabled: true });
    renderApp('/compras');
    const input = await waitFor(() => document.querySelector<HTMLInputElement>('input[type=file]')!);
    const huge = new File(['x'], 'enorme.pdf', { type: 'application/pdf' });
    Object.defineProperty(huge, 'size', { value: 11 * 1024 * 1024 });
    await user.upload(input, huge);
    expect(await screen.findByText(/supera los 10 MB/)).toBeInTheDocument();
  });

  it('libro de IVA compras del mes', async () => {
    const { api, user } = await openPo();
    await user.click(screen.getByRole('button', { name: /Compras$/ }));
    const month = await screen.findByLabelText('Mes del libro de IVA compras');
    await user.clear(month);
    await user.type(month, '2026-08');
    await user.click(screen.getByTitle('Libro de IVA compras del mes'));
    await waitFor(() =>
      expect(api.calls.some((c) => c.path === '/api/v1/purchasing/vat-book?year=2026&month=8')).toBe(true),
    );
  });
});

describe('compras: reposición sugerida', () => {
  it('arma una orden nueva con lo que se agota', async () => {
    const api = mockApi();
    const user = userEvent.setup({ delay: null, pointerEventsCheck: 0 });
    renderApp('/compras');
    await user.click(await screen.findByRole('button', { name: 'Reposición sugerida' }));
    await user.type(await screen.findByPlaceholderText('Ajustar días'), '30');
    await settle(2);
    expect(api.calls.some((c) => c.path.startsWith('/api/v1/purchasing/reorder-suggestions?'))).toBe(true);
    await user.click(screen.getByRole('button', { name: /Armar orden de compra/ }));
    expect(await screen.findByRole('heading', { name: 'Nueva compra' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Guardar' }));
    await settle(2);
    expect(
      (last(api, 'POST', '/api/v1/purchasing/purchase-orders').items as unknown[]).length,
    ).toBeGreaterThan(0);
  });
});
