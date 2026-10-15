/**
 * Finanzas con los datos sembrados (una caja con un gasto, un cliente con una
 * venta en cuenta corriente y un cobro parcial, una deuda con el proveedor):
 * Tesorería (cuentas, movimientos, transferencias) y Cuentas corrientes
 * (saldos, estado de cuenta, cobros y pagos imputados, ajustes, anular).
 */
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { fixture, mockApi, type MockApi } from '../test/api';
import { renderApp } from '../test/render';
import { rx } from '../test/text';
import { settle } from '../test/explore';

interface Account {
  id: string;
  name: string;
  currency: string;
  balanceMinor: number;
  active: boolean;
  kind: string;
  detail: string | null;
}
const accounts = fixture<{ items: Account[]; totals: unknown[] }>('/api/v1/finance/accounts');
const caja = accounts.items[0]!;
const banco: Account = { ...caja, id: 'banco-1', name: 'Banco Galicia', kind: 'bank', balanceMinor: 0 };
const balance = fixture<{ items: { partyId: string; partyName: string }[] }>('/api/v1/finance/balances')
  .items[0]!;
const receipt = fixture<{ items: { id: string; number: string }[] }>('/api/v1/finance/receipts').items[0]!;
const party = fixture<{ items: { id: string; name: string }[] }>('/api/v1/finance/parties').items[0]!;
const pending = fixture<{ items: { id: string; pendingMinor: number }[] }>(
  '/api/v1/finance/ledger/pending',
).items;

async function open(path: string, setup?: (api: MockApi) => void) {
  const api = mockApi();
  setup?.(api);
  const user = userEvent.setup({ delay: null, pointerEventsCheck: 0 });
  renderApp(path);
  await settle(4);
  return { api, user };
}

const sent = (api: MockApi, method: string, path: string) =>
  api.calls.filter((c) => c.method === method && c.path === path).at(-1)?.body as Record<string, unknown>;

describe('tesorería', () => {
  it('nueva cuenta con saldo inicial y edición de una existente', async () => {
    const { api, user } = await open('/tesoreria');
    await user.click(screen.getByRole('button', { name: /Nueva cuenta/ }));
    let dialog = within(await screen.findByRole('dialog'));
    await user.type(dialog.getByPlaceholderText('Caja del local'), 'Banco Nación');
    await user.selectOptions(dialog.getByLabelText('Tipo'), 'bank');
    await user.type(dialog.getByLabelText('Saldo inicial'), '1500,50');
    await user.click(dialog.getByRole('button', { name: 'Guardar' }));
    await settle(2);
    expect(sent(api, 'POST', '/api/v1/finance/accounts')).toMatchObject({
      name: 'Banco Nación',
      kind: 'bank',
      openingBalanceMinor: 150050,
    });

    // La tarjeta de la cuenta abre su edición.
    await user.click(screen.getAllByRole('button', { name: rx(caja.name) })[0]!);
    dialog = within(await screen.findByRole('dialog'));
    const name = dialog.getByDisplayValue(caja.name);
    await user.clear(name);
    await user.type(name, 'Caja chica');
    await user.click(dialog.getByRole('button', { name: 'Guardar' }));
    await settle(2);
    expect(sent(api, 'PATCH', `/api/v1/finance/accounts/${caja.id}`)).toMatchObject({ name: 'Caja chica' });
  });

  it('registra un movimiento y filtra por cuenta', async () => {
    const { api, user } = await open('/tesoreria');
    expect(screen.getByText('Flete')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Movimiento/ }));
    const dialog = within(await screen.findByRole('dialog', { name: 'Nuevo movimiento' }));
    await user.selectOptions(dialog.getByLabelText('Tipo'), 'out');
    await user.type(dialog.getByLabelText('Importe'), '25000');
    await user.type(dialog.getByPlaceholderText('Alquiler de agosto'), 'Alquiler');
    await user.click(dialog.getByRole('button', { name: /Registrar|Guardar/ }));
    await settle(2);
    expect(sent(api, 'POST', '/api/v1/finance/movements')).toMatchObject({
      accountId: caja.id,
      kind: 'out',
      amountMinor: 2_500_000,
      concept: 'Alquiler',
    });

    await user.selectOptions(screen.getByLabelText('Filtrar por cuenta'), caja.id);
    await settle(2);
    expect(
      api.calls.some((c) => c.path.includes(`/api/v1/finance/movements?`) && c.path.includes(caja.id)),
    ).toBe(true);
  });

  it('transfiere entre dos cuentas (no a la misma)', async () => {
    const { api, user } = await open('/tesoreria', (a) =>
      a.on('GET', '/api/v1/finance/accounts', { ...accounts, items: [caja, banco] }),
    );
    await user.click(screen.getByRole('button', { name: /Transferir/ }));
    const dialog = within(await screen.findByRole('dialog', { name: 'Transferir entre cuentas' }));
    await user.selectOptions(dialog.getByLabelText('Desde'), caja.id);
    await user.selectOptions(dialog.getByLabelText('Hacia'), caja.id);
    expect(dialog.getByText(/misma cuenta|distinta/i)).toBeInTheDocument();
    await user.selectOptions(dialog.getByLabelText('Hacia'), banco.id);
    await user.type(dialog.getByLabelText('Importe'), '100');
    await user.click(dialog.getByRole('button', { name: /Transferir/ }));
    await settle(2);
    expect(sent(api, 'POST', '/api/v1/finance/transfers')).toMatchObject({
      fromAccountId: caja.id,
      toAccountId: banco.id,
      amountMinor: 10_000,
    });
  });
});

describe('cuentas corrientes', () => {
  it('saldos de clientes → estado de cuenta → cobro imputado a lo más viejo', async () => {
    const { api, user } = await open('/cuentas-corrientes');
    await user.click(await screen.findByText(balance.partyName));
    expect(await screen.findByText(/Factura A 0001-00000001/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Registrar cobro/ }));
    const dialog = within(await screen.findByRole('dialog', { name: 'Registrar un cobro' }));
    await user.selectOptions(dialog.getByLabelText('Entra en'), caja.id);
    await user.type(dialog.getByLabelText('Importe'), '500');
    await user.click(dialog.getByRole('button', { name: 'Imputar lo más viejo primero' }));
    await user.type(dialog.getByLabelText(/Notas/), 'Transferencia 123');
    await user.click(dialog.getByRole('button', { name: /Registrar/ }));
    await settle(2);

    const body = sent(api, 'POST', '/api/v1/finance/receipts');
    expect(body).toMatchObject({ kind: 'collection', partyKind: 'customer', partyId: balance.partyId });
    expect(body.payments).toEqual([{ accountId: caja.id, amountMinor: 50_000 }]);
    expect(body.allocations).toEqual([{ ledgerEntryId: pending[0]!.id, amountMinor: 50_000 }]);
  });

  it('el importe queda con separador de miles y sin cuentas en Tesorería lo explica', async () => {
    const { api, user } = await open('/cuentas-corrientes');
    await user.click(await screen.findByText(balance.partyName));
    await user.click(await screen.findByRole('button', { name: /Registrar cobro/ }));
    let dialog = within(await screen.findByRole('dialog', { name: 'Registrar un cobro' }));
    const amount = dialog.getByLabelText('Importe');
    await user.type(amount, '117187');
    await user.tab();
    expect(amount).toHaveValue('117.187');
    await user.click(dialog.getByRole('button', { name: 'Imputar lo más viejo primero' }));
    const first = dialog.getAllByLabelText(/Monto a imputar a/)[0]!;
    expect((first as HTMLInputElement).value).not.toMatch(/\.\d{2}$/); // ni "500.00"
    // Con el importe cargado, cancelar pregunta antes de tirarlo.
    await user.click(dialog.getByRole('button', { name: 'Cancelar' }));
    await user.click(await screen.findByRole('button', { name: 'Descartar' }));

    api.on('GET', '/api/v1/finance/accounts', { items: [], totals: [] });
    await user.click(await screen.findByRole('button', { name: /Registrar cobro/ }));
    dialog = within(await screen.findByRole('dialog', { name: 'Registrar un cobro' }));
    expect(await dialog.findByRole('link', { name: 'Crear cuenta' })).toHaveAttribute('href', '/tesoreria');
    expect(dialog.getByLabelText('Entra en')).toBeDisabled();
  });

  it('cobro desde la lista: se busca el cliente y se puede cambiar', async () => {
    const { api, user } = await open('/cuentas-corrientes');
    await user.click(screen.getByRole('button', { name: /Registrar cobro/ }));
    const dialog = within(await screen.findByRole('dialog', { name: 'Registrar un cobro' }));
    // Recién abierto no hay errores: los faltantes se marcan al intentar registrar.
    expect(dialog.queryByRole('alert')).not.toBeInTheDocument();
    await user.click(dialog.getByRole('button', { name: /Registrar/ }));
    expect(dialog.getByRole('alert')).toHaveTextContent('Elegí el cliente.');
    expect(api.calls.some((c) => c.method === 'POST' && c.path === '/api/v1/finance/receipts')).toBe(false);
    await user.type(dialog.getByPlaceholderText('Buscar por nombre...'), balance.partyName.slice(0, 5));
    // La búsqueda va con debounce: hasta que no sale el pedido con el texto, la
    // lista se vuelve a dibujar y un clic puede caer en una opción que ya no está.
    await waitFor(() =>
      expect(
        api.calls.some(
          (c) =>
            c.path.includes('/finance/parties') &&
            c.path.includes(`q=${encodeURIComponent(balance.partyName.slice(0, 5))}`),
        ),
      ).toBe(true),
    );
    await settle(2);
    await user.click(await dialog.findByRole('button', { name: rx(balance.partyName) }));
    await user.click(await dialog.findByRole('button', { name: 'Cambiar' }));
    expect(dialog.getByPlaceholderText('Buscar por nombre...')).toBeInTheDocument();
  });

  it('proveedores: ajuste de saldo con motivo', async () => {
    const { api, user } = await open('/cuentas-corrientes');
    await user.click(screen.getByRole('button', { name: 'Proveedores' }));
    await settle(2);
    // Los saldos van de a una página.
    expect(
      api.calls.some((c) => c.path === '/api/v1/finance/balances?partyKind=supplier&limit=25&offset=0'),
    ).toBe(true);

    await user.click(screen.getByRole('button', { name: /Ajuste/ }));
    const dialog = within(await screen.findByRole('dialog', { name: 'Ajuste de cuenta corriente' }));
    await user.type(dialog.getByPlaceholderText('Buscar...'), party.name.slice(0, 4));
    await user.click((await dialog.findAllByRole('button', { name: rx(party.name, true) }))[0]!);
    await user.type(dialog.getByLabelText('Importe'), '1000');
    await user.type(dialog.getByPlaceholderText('Saldo anterior al sistema'), 'Saldo inicial');
    await user.selectOptions(dialog.getByLabelText('Qué hace'), 'debit');
    await user.type(dialog.getByLabelText('Motivo'), 'Migración del sistema anterior');
    await user.click(dialog.getAllByRole('button').at(-1)!);
    await settle(2);
    expect(sent(api, 'POST', '/api/v1/finance/ledger/adjustments')).toMatchObject({
      partyKind: 'supplier',
      partyId: party.id,
      kind: 'debit',
      amountMinor: 100_000,
      label: 'Saldo inicial',
      reason: 'Migración del sistema anterior',
    });
  });

  it('anular un recibo con confirmación', async () => {
    const { api, user } = await open('/cuentas-corrientes');
    const tabs = screen
      .getAllByRole('button')
      .filter((b) => /Recibos|Comprobantes|Cobros/.test(b.textContent ?? ''));
    if (tabs[0]) await user.click(tabs[0]);
    await waitFor(() => expect(screen.getByText(receipt.number)).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: /Anular/ }));
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Anular' }));
    await settle(2);
    expect(sent(api, 'POST', `/api/v1/finance/receipts/${receipt.id}/void`)).toEqual({
      reason: 'Anulado desde el panel',
    });
  });
});
