/**
 * Compras e importaciones: el ciclo de una orden de compra con los datos de
 * la demo — editar el borrador (ítems, gastos, tipo de cambio), avanzar de
 * estado, cancelar, recibir la mercadería (con aviso si el costo nuevo aplasta
 * márgenes), cargar la factura del proveedor (a mano o leída por la IA) y
 * bajar el libro de IVA compras. También la reposición sugerida.
 */
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
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

/** `ai`: la IA lee facturas en esta tienda (el estado se pide al abrir la orden, antes de dibujarla). */
async function openPo(patch: Partial<Po> = {}, ai = false) {
  const api = mockApi();
  if (ai)
    api.on('GET', '/api/v1/ai/status', {
      tasks: [{ task: 'InvoiceRead', available: true, reason: null, code: null }],
    });
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
    expect(warning.getByText('4,2 %')).toBeInTheDocument();
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

describe('compras: el borrador con cambios sin guardar', () => {
  /** Un servidor con memoria: lo que se guarda o confirma es lo que vuelve después. */
  function serverState(api: MockApi) {
    let current: Po = { ...po, status: 'DRAFT' };
    api.on('GET', `/api/v1/purchasing/purchase-orders/${po.id}`, () => current);
    api.on('PUT', `/api/v1/purchasing/purchase-orders/${po.id}`, (body: unknown) => {
      current = { ...current, reference: (body as { reference: string }).reference };
      return current;
    });
    api.on('POST', `/api/v1/purchasing/purchase-orders/${po.id}/status`, (body: unknown) => {
      current = { ...current, status: (body as { status: string }).status };
      return current;
    });
  }

  async function editReference(user: ReturnType<typeof userEvent.setup>, value: string) {
    const reference = screen.getByLabelText('Referencia (proforma / contenedor)');
    await user.clear(reference);
    await user.type(reference, value);
    return reference;
  }

  it('"Confirmada" guarda primero lo editado y después muestra lo que quedó en el servidor', async () => {
    const { api, user } = await openPo();
    serverState(api);
    await editReference(user, 'CONT-77');

    await user.click(screen.getByRole('button', { name: 'Confirmada' }));
    await settle(3);
    const writes = api.calls.filter((c) => c.method !== 'GET' && c.path.includes(po.id));
    expect(writes.map((c) => `${c.method} ${c.path}`)).toEqual([
      `PUT /api/v1/purchasing/purchase-orders/${po.id}`,
      `POST /api/v1/purchasing/purchase-orders/${po.id}/status`,
    ]);
    expect(writes[0]!.body).toMatchObject({ reference: 'CONT-77' });

    // Ya confirmada: de solo lectura, con lo guardado, y sin "cambios sin guardar".
    const reference = screen.getByLabelText('Referencia (proforma / contenedor)');
    expect(reference).toHaveValue('CONT-77');
    expect(reference).toBeDisabled();
    expect(screen.getByRole('button', { name: 'En producción' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /^Compras$/ }));
    expect(await screen.findByRole('searchbox', { name: 'Buscar compras' })).toBeInTheDocument();
    expect(screen.queryByText('¿Descartar los cambios?')).not.toBeInTheDocument();
  });

  it('si guardar falla, el estado no cambia y lo editado sigue ahí', async () => {
    const { api, user } = await openPo();
    api.on(
      'PUT',
      `/api/v1/purchasing/purchase-orders/${po.id}`,
      { detail: 'La compra necesita al menos un ítem.' },
      400,
    );
    await editReference(user, 'CONT-88');
    await user.click(screen.getByRole('button', { name: 'Confirmada' }));
    expect(await screen.findByText('La compra necesita al menos un ítem.')).toBeInTheDocument();
    expect(api.calls.some((c) => c.method === 'POST' && c.path.endsWith('/status'))).toBe(false);
    expect(screen.getByLabelText('Referencia (proforma / contenedor)')).toHaveValue('CONT-88');
    expect(screen.getByLabelText('Referencia (proforma / contenedor)')).toBeEnabled();
  });

  it('cerrar la compra con cambios pregunta antes; seguir editando no pierde nada', async () => {
    const { user } = await openPo();
    await editReference(user, 'CONT-99');

    await user.click(screen.getByRole('button', { name: /^Compras$/ }));
    expect(await screen.findByText('¿Descartar los cambios?')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Seguir editando' }));
    expect(screen.getByRole('heading', { name: po.supplierName })).toBeInTheDocument();
    expect(screen.getByLabelText('Referencia (proforma / contenedor)')).toHaveValue('CONT-99');

    await user.click(screen.getByRole('button', { name: /^Compras$/ }));
    await user.click(await screen.findByRole('button', { name: 'Salir sin guardar' }));
    expect(await screen.findByRole('searchbox', { name: 'Buscar compras' })).toBeInTheDocument();
  });

  it('guardada, se puede salir sin que pregunte', async () => {
    const { api, user } = await openPo();
    serverState(api);
    await editReference(user, 'CONT-55');
    await user.click(screen.getByRole('button', { name: 'Guardar' }));
    expect(await screen.findByText('Compra guardada')).toBeInTheDocument();
    await settle(2);
    await user.click(screen.getByRole('button', { name: /^Compras$/ }));
    expect(await screen.findByRole('searchbox', { name: 'Buscar compras' })).toBeInTheDocument();
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
    // Con coma decimal y punto de miles, como dice el placeholder (antes viajaban como null).
    await user.type(net!, '1.000,50');
    await user.type(vat!, '210,11');
    await user.click(screen.getByRole('button', { name: /Guardar comprobante/ }));
    await settle(2);
    expect(last(api, 'PUT', `/api/v1/purchasing/purchase-orders/${po.id}/invoice`)).toMatchObject({
      supplierTaxId: '30712345678',
      invoiceType: 'A',
      invoiceNumber: '0001-00000042',
      invoiceNetArs: 1000.5,
      invoiceVatArs: 210.11,
    });
  });

  it('un importe que no se entiende no se guarda como vacío', async () => {
    await openPo({ status: 'RECEIVED' });
    const [net] = screen.getAllByPlaceholderText('0,00');
    await userEvent.setup().type(net!, '12abc');
    expect(screen.getByText('No es un importe.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Guardar comprobante/ })).toBeDisabled();
  });

  it('la IA lee la factura escaneada, se revisa y se usa', async () => {
    const { api, user } = await openPo({ status: 'RECEIVED' }, true);
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
    const { api, user } = await openPo({ status: 'RECEIVED' }, true);
    renderApp('/compras');
    const input = await waitFor(() => document.querySelector<HTMLInputElement>('input[type=file]')!);
    const huge = new File(['x'], 'enorme.pdf', { type: 'application/pdf' });
    Object.defineProperty(huge, 'size', { value: 11 * 1024 * 1024 });
    await user.upload(input, huge);
    expect(await screen.findByText('Pesa 11 MB y el máximo para PDF es 10 MB.')).toBeInTheDocument();
    expect(api.calls.some((c) => c.path.endsWith('/invoice/scan'))).toBe(false);
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

describe('compras: recibir con el escáner', () => {
  it('cada lectura suma uno al ítem (hasta lo pedido); lo ajeno o desconocido se avisa', async () => {
    const item = po.items[0]!;
    // La cámara lee, en orden: el ítem dos veces, un producto que no está en
    // la compra y un código que no existe.
    const reads = ['ITEM-A', 'ITEM-B', 'AJENO', 'NO-EXISTE'];
    const detect = vi.fn().mockImplementation(async () => {
      const code = reads.shift();
      return code ? [{ rawValue: code }] : [];
    });
    (window as { BarcodeDetector?: unknown }).BarcodeDetector = class {
      detect = detect;
    };
    Object.defineProperty(navigator, 'mediaDevices', {
      value: { getUserMedia: vi.fn().mockResolvedValue({ getTracks: () => [{ stop: vi.fn() }] }) },
      configurable: true,
    });
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
    vi.spyOn(HTMLMediaElement.prototype, 'readyState', 'get').mockReturnValue(4);

    const { api, user } = await openPo({ status: 'INCUSTOMS', items: [{ ...item, quantity: 1 }] });
    api.on('GET', '/api/v1/products/by-code/ITEM-A', { variantId: item.variantId });
    api.on('GET', '/api/v1/products/by-code/ITEM-B', { variantId: item.variantId });
    api.on('GET', '/api/v1/products/by-code/AJENO', { variantId: 'otra-variante' });
    api.on('GET', '/api/v1/products/by-code/NO-EXISTE', { detail: 'No encontrado.' }, 404);

    await user.click(screen.getByRole('button', { name: 'Recibir' }));
    const dialog = within(await screen.findByRole('dialog', { name: 'Recibir mercadería' }));
    const qty = dialog.getAllByRole('spinbutton')[1]!;
    await user.clear(qty);
    await user.click(dialog.getByRole('button', { name: /Escanear con la cámara/ }));
    await act(async () => {
      await new Promise((r) => setTimeout(r, 1600));
    });
    // Pedido 1: la segunda lectura del mismo ítem no pasa de lo pedido.
    expect(qty).toHaveValue(1);
    expect(await screen.findByText('Ese producto no está en esta compra')).toBeInTheDocument();
    expect(await screen.findByText('Código desconocido')).toBeInTheDocument();
    await user.click(dialog.getByRole('button', { name: /Apagar cámara/ }));
    delete (window as { BarcodeDetector?: unknown }).BarcodeDetector;
    vi.restoreAllMocks();
  });
});

describe('proveedores: traer de mis compras', () => {
  it('ata las compras sueltas y dice cuántas', async () => {
    const api = mockApi();
    api.on('POST', '/api/v1/suppliers/sync-from-purchases', { created: 2, linked: 3 });
    const user = userEvent.setup({ delay: null, pointerEventsCheck: 0 });
    renderApp('/proveedores');
    await screen.findByRole('heading', { name: 'Proveedores' });
    await settle(2);
    await user.click(screen.getByRole('button', { name: /Traer de mis compras/ }));
    expect(
      await screen.findByText(/Se ataron 3 compras a sus proveedores \(2 fichas nuevas\)/),
    ).toBeInTheDocument();
    expect(
      api.calls.some((c) => c.method === 'POST' && c.path === '/api/v1/suppliers/sync-from-purchases'),
    ).toBe(true);
  });
});
