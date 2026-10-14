/**
 * Presupuestos: armar uno (cliente de la agenda o a nombre libre, productos
 * con el precio de su lista, descuento, validez), las validaciones antes de
 * guardar, y su ciclo — enviado, aceptado (se convierte en venta con el medio
 * de cobro elegido; en cuenta corriente exige cliente de la agenda),
 * rechazado, reabierto, extendido si venció.
 */
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { fixture, mockApi, type MockApi } from '../test/api';
import { renderApp } from '../test/render';
import { rx } from '../test/text';
import { settle } from '../test/explore';

interface Quote {
  id: string;
  number: string;
  status: string;
  expired: boolean;
  editable: boolean;
  customerId: string | null;
  customerName: string;
}
const quote = fixture<Quote>('/api/v1/quotes/:id');
const customer = fixture<{ items: { id: string; name: string }[] }>('/api/v1/customers').items[0]!;
const product = fixture<{ items: { name: string; variants: { id: string }[] }[] }>('/api/v1/products')
  .items[0]!;

async function openQuote(patch: Partial<Quote> = {}) {
  const api = mockApi();
  api.on('GET', `/api/v1/quotes/${quote.id}`, { ...fixture<object>(`/api/v1/quotes/:id`), ...patch });
  const user = userEvent.setup({ delay: null, pointerEventsCheck: 0 });
  renderApp('/presupuestos');
  await user.click(await screen.findByText(quote.number));
  await screen.findByRole('heading', { name: rx(quote.number) });
  await settle(2);
  return { api, user };
}

const posted = (api: MockApi, suffix: string) =>
  api.calls.filter((c) => c.method === 'POST' && c.path.endsWith(suffix)).at(-1)?.body;

describe('presupuestos: armar uno', () => {
  it('nuevo: cliente de la agenda, producto con su precio, descuento y validez', async () => {
    const api = mockApi();
    api.on('POST', '/api/v1/quotes', { ...fixture<object>(`/api/v1/quotes/:id`), number: 'PRE-0002' });
    // El precio que le toca al cliente (su lista de precios).
    api.on('GET', '/api/v1/quotes/prices', {
      priceListApplied: 'Mayorista',
      items: [{ variantId: product.variants[0]!.id, priceMinor: 2_000_000 }],
    });
    const user = userEvent.setup({ delay: null, pointerEventsCheck: 0 });
    renderApp('/presupuestos');
    // El primer dibujo del panel (sesión, tienda, permisos) tarda más con la
    // suite entera corriendo: el mismo margen que el resto de los tests de
    // pantalla le dan a su primera espera.
    await user.click(await screen.findByRole('button', { name: /Nuevo presupuesto/ }, { timeout: 5000 }));
    await screen.findByRole('heading', { name: /Nuevo presupuesto/ });

    const save = screen.getByRole('button', { name: /Guardar/ });
    expect(screen.getByText('Poné a nombre de quién va el presupuesto.')).toBeInTheDocument();

    // Las dos búsquedas esperan a que se deje de tipear (300 ms) antes de ir a
    // la API: eso, más el pedido y el dibujo, a veces pasaba el segundo por
    // defecto de findBy con la suite cargada. Es una espera pedida a
    // propósito, no una lentitud de la pantalla: si la búsqueda no llegara,
    // igual falla (a los 5 s).
    const debounced = { timeout: 5000 };
    await user.type(screen.getByPlaceholderText('Buscar o escribir un nombre…'), customer.name.slice(0, 4));
    await user.click(await screen.findByRole('button', { name: rx(customer.name) }, debounced));
    expect(screen.getByText('Agregá al menos un producto.')).toBeInTheDocument();

    await user.type(
      screen.getByPlaceholderText('Buscar producto o SKU para agregar…'),
      product.name.slice(0, 5),
    );
    await user.click(await screen.findByRole('button', { name: rx(product.name) }, debounced));
    await settle(2);

    // Precio vacío: al salir del campo toma el de la lista del cliente.
    const price = screen.getByLabelText(rx(`Precio de ${product.name}`));
    await user.click(price);
    await user.tab();
    expect((price as HTMLInputElement).value).not.toBe('');
    await user.clear(screen.getByLabelText(rx(`Cantidad de ${product.name}`)));
    await user.type(screen.getByLabelText(rx(`Cantidad de ${product.name}`)), '0');
    expect(screen.getByText('Las cantidades tienen que ser positivas.')).toBeInTheDocument();
    await user.type(screen.getByLabelText(rx(`Cantidad de ${product.name}`)), '{backspace}2');

    await user.type(screen.getByLabelText(/Descuento/), '999999999');
    expect(screen.getByText('El descuento no puede superar el total.')).toBeInTheDocument();
    await user.clear(screen.getByLabelText(/Descuento/));
    await user.type(screen.getByLabelText(/Descuento/), '10');
    await user.type(screen.getByLabelText('Notas'), 'Entrega en 7 días');

    await user.click(save);
    await settle(2);
    expect(posted(api, '/api/v1/quotes')).toMatchObject({
      customerId: customer.id,
      customerName: customer.name,
      currency: 'ARS',
      discountMinor: 1000,
      notes: 'Entrega en 7 días',
    });
  });

  it('cambia el cliente, quita una línea y valida la fecha', async () => {
    const { api, user } = await openQuote({ customerId: customer.id, customerName: customer.name });
    await user.click(screen.getByRole('button', { name: 'Cambiar' }));
    await user.type(screen.getByPlaceholderText('Buscar o escribir un nombre…'), 'Club Atlético');

    const validity = screen.getByLabelText('Válido hasta');
    await user.clear(validity);
    await user.type(validity, '2020-01-01');
    expect(screen.getByText('La validez tiene que ser posterior a hoy.')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Quitar' }));
    expect(screen.getByText('Agregá al menos un producto.')).toBeInTheDocument();
    expect(api.calls.some((c) => c.method === 'PUT')).toBe(false);
  });
});

describe('presupuestos: su ciclo', () => {
  it('marcar enviado y guardar cambios', async () => {
    const { api, user } = await openQuote();
    await user.click(screen.getByRole('button', { name: 'Marcar como enviado' }));
    await settle(2);
    expect(api.calls.some((c) => c.path === `/api/v1/quotes/${quote.id}/send`)).toBe(true);

    await user.click(screen.getByRole('button', { name: /Guardar/ }));
    await settle(2);
    expect(api.calls.some((c) => c.method === 'PUT' && c.path === `/api/v1/quotes/${quote.id}`)).toBe(true);
  });

  it('aceptado: crea la venta con el medio de cobro y lleva a Ventas', async () => {
    const { api, user } = await openQuote();
    api.on('POST', `/api/v1/quotes/${quote.id}/accept`, { orderId: 'order-1' });
    await user.click(screen.getByRole('button', { name: 'El cliente aceptó' }));
    const dialog = within(await screen.findByRole('dialog', { name: `Aceptar ${quote.number}` }));

    // En cuenta corriente hace falta un cliente de la agenda.
    await user.selectOptions(dialog.getByRole('combobox'), 'cuenta_corriente');
    expect(dialog.getByRole('button', { name: 'Crear la venta' })).toBeDisabled();
    await user.selectOptions(dialog.getByRole('combobox'), 'transfer');
    await user.click(dialog.getByRole('button', { name: 'Crear la venta' }));
    await settle(2);
    expect(posted(api, '/accept')).toEqual({ paymentMethod: 'transfer' });
    await waitFor(() =>
      expect(screen.queryByRole('heading', { name: rx(quote.number) })).not.toBeInTheDocument(),
    );
  });

  it('rechazado, con confirmación', async () => {
    const { api, user } = await openQuote();
    await user.click(screen.getByRole('button', { name: 'El cliente lo rechazó' }));
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Rechazar' }));
    await settle(2);
    expect(posted(api, '/reject')).toEqual({ reason: null });
  });

  it('uno rechazado se reabre para renegociar', async () => {
    const r = await openQuote({
      status: 'rejected',
      editable: false,
      rejectionReason: 'Muy caro',
    } as Partial<Quote>);
    expect(screen.getByText('Rechazado: Muy caro')).toBeInTheDocument();
    await r.user.click(screen.getByRole('button', { name: 'Reabrir para renegociar' }));
    await settle(2);
    expect(r.api.calls.some((c) => c.path.endsWith('/reopen'))).toBe(true);
  });

  it('vencido: se extiende 15 días', async () => {
    const { api, user } = await openQuote({ expired: true });
    expect(screen.getByRole('button', { name: 'El cliente aceptó' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Extender 15 días más' }));
    await settle(2);
    expect((posted(api, '/extend') as { validUntilUtc: string }).validUntilUtc).toMatch(/T00:00:00/);
  });

  it('aceptado: congelado, con link a la venta', async () => {
    await openQuote({ status: 'accepted', editable: false, convertedOrderId: 'order-1' } as Partial<Quote>);
    expect(screen.getByText(/Ya se convirtió en venta/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /verla en Ventas/ })).toBeInTheDocument();
  });

  it('una acción con cambios sin guardar los guarda primero', async () => {
    const { api, user } = await openQuote();
    await user.type(screen.getByLabelText('Notas'), ' — cambio');
    await user.click(screen.getByRole('button', { name: 'Marcar como enviado' }));
    await settle(3);
    const writes = api.calls.filter(
      (c) => c.method !== 'GET' && c.path.startsWith(`/api/v1/quotes/${quote.id}`),
    );
    expect(writes.map((c) => `${c.method} ${c.path}`)).toEqual([
      `PUT /api/v1/quotes/${quote.id}`,
      `POST /api/v1/quotes/${quote.id}/send`,
    ]);
    expect((writes[0]!.body as { notes: string }).notes).toMatch(/— cambio$/);
  });

  it('con cambios inválidos, la acción no sale y dice qué corregir', async () => {
    const { api, user } = await openQuote();
    const qty = screen.getAllByLabelText(/^Cantidad de /)[0]!;
    await user.clear(qty);
    await user.type(qty, '0');
    await user.click(screen.getByRole('button', { name: 'Marcar como enviado' }));
    expect(
      await screen.findByText('Antes, corregí lo que cambiaste: Las cantidades tienen que ser positivas.'),
    ).toBeInTheDocument();
    expect(api.calls.some((c) => c.method !== 'GET' && c.path.includes(quote.id))).toBe(false);
  });

  it('volver con cambios sin guardar pregunta antes', async () => {
    const { user } = await openQuote();
    await user.type(screen.getByLabelText('Notas'), ' — cambio');
    await user.click(screen.getByRole('button', { name: /^Presupuestos$/ }));
    expect(await screen.findByText('¿Descartar los cambios?')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Seguir editando' }));
    expect((screen.getByLabelText('Notas') as HTMLTextAreaElement).value).toMatch(/— cambio$/);

    await user.click(screen.getByRole('button', { name: /^Presupuestos$/ }));
    await user.click(await screen.findByRole('button', { name: 'Salir sin guardar' }));
    expect(await screen.findByRole('searchbox', { name: 'Buscar presupuestos' })).toBeInTheDocument();
  });

  it('un error de la API se muestra', async () => {
    const { api, user } = await openQuote();
    api.on('POST', `/api/v1/quotes/${quote.id}/send`, { detail: 'Sin email del cliente.' }, 400);
    await user.click(screen.getByRole('button', { name: 'Marcar como enviado' }));
    expect(await screen.findByText('Sin email del cliente.')).toBeInTheDocument();
  });
});
