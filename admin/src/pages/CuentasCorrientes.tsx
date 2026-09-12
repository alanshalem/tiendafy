import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Ban, Plus, Receipt, Scale, Users } from 'lucide-react';
import {
  Badge,
  Button,
  FormField,
  Input,
  Modal,
  Select,
  Tabs,
  Textarea,
  useConfirm,
  useToast,
} from '@tiendafy/ui';
import { useStore } from '../context/StoreContext';
import { api, errMsg } from '../lib/api';
import { formatDate, formatDateTime, formatMoney } from '../lib/format';
import { NoStoreSelected } from '../components/NoStoreSelected';
import { HelpLink } from '../components/HelpLink';
import { TABLE_CARD, TABLE_HEAD_STICKY } from '../lib/styles';
import { ListStats } from '../components/stats/ListStats';
import { useDebouncedValue } from '../lib/useDebouncedValue';
import { toMinor, type FinanceAccount } from './Tesoreria';

// ---------------------------------------------------------------- Tipos wire

type PartyKind = 'customer' | 'supplier';

interface BalanceRow {
  partyId: string;
  partyName: string;
  currency: string;
  balanceMinor: number;
  lastAtUtc: string;
}

interface LedgerRow {
  id: string;
  occurredAtUtc: string;
  docType: string;
  docLabel: string;
  docId: string | null;
  debitMinor: number;
  creditMinor: number;
  pendingMinor: number;
  balanceMinor: number;
  currency: string;
  notes: string | null;
}

interface LedgerResponse {
  partyId: string;
  partyName: string;
  balanceMinor: number;
  currency: string;
  items: LedgerRow[];
}

interface PendingRow {
  id: string;
  occurredAtUtc: string;
  docLabel: string;
  amountMinor: number;
  settledMinor: number;
  pendingMinor: number;
  currency: string;
}

interface ReceiptRow {
  id: string;
  number: string;
  kind: 'collection' | 'payment';
  partyKind: PartyKind;
  partyId: string;
  partyName: string;
  occurredAtUtc: string;
  totalMinor: number;
  currency: string;
  voided: boolean;
  notes: string | null;
}

interface PartyOption {
  id: string;
  name: string;
  detail: string | null;
}

const DOC_LABEL: Record<string, string> = {
  openingbalance: 'Saldo inicial',
  sale: 'Venta',
  creditnote: 'Nota de crédito',
  receipt: 'Recibo',
  purchase: 'Compra',
  payment: 'Pago',
  adjustment: 'Ajuste',
};

/**
 * El texto cambia según de qué lado se mire, y es lo único que evita leer un
 * saldo al revés: para un cliente, positivo = nos debe; para un proveedor,
 * negativo = le debemos.
 */
function balanceLabel(kind: PartyKind, minor: number): string {
  if (minor === 0) return 'Al día';
  if (kind === 'customer') return minor > 0 ? 'Nos debe' : 'Saldo a favor';
  return minor < 0 ? 'Le debemos' : 'Saldo a favor';
}

export function CuentasCorrientesPage() {
  const { store } = useStore();
  // En la URL y no en estado: desde la ficha de un proveedor se entra derecho a
  // su cuenta, y volver atrás en el navegador tiene que hacer lo que parece.
  const [params, setParams] = useSearchParams();
  const kind: PartyKind = params.get('tipo') === 'supplier' ? 'supplier' : 'customer';
  const partyId = params.get('contacto');

  if (!store) return <NoStoreSelected />;

  const go = (next: { tipo?: PartyKind; contacto?: string | null }) => {
    const value = new URLSearchParams();
    const tipo = next.tipo ?? kind;
    if (tipo === 'supplier') value.set('tipo', tipo);
    if (next.contacto) value.set('contacto', next.contacto);
    setParams(value);
  };

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      {partyId ? (
        <PartyStatement partyKind={kind} partyId={partyId} onBack={() => go({ contacto: null })} />
      ) : (
        <BalancesList
          kind={kind}
          onKind={(tipo) => go({ tipo, contacto: null })}
          onOpen={(contacto) => go({ contacto })}
        />
      )}
    </div>
  );
}

// ------------------------------------------------------------------- Saldos

function BalancesList({
  kind,
  onKind,
  onOpen,
}: {
  kind: PartyKind;
  onKind: (k: PartyKind) => void;
  onOpen: (partyId: string) => void;
}) {
  const { store } = useStore();
  const [receipt, setReceipt] = useState(false);
  const [adjust, setAdjust] = useState(false);

  const { data } = useQuery({
    queryKey: ['finance-balances', store?.id, kind],
    queryFn: () =>
      api.get<{ items: BalanceRow[]; totalMinor: number }>(`/api/v1/finance/balances?partyKind=${kind}`),
    enabled: !!store,
  });

  const rows = data?.items ?? [];
  // Lo que nos deben y lo que debemos son dos preguntas distintas: un neto solo
  // las tapa.
  const aFavor = rows.filter((r) => r.balanceMinor > 0).reduce((s, r) => s + r.balanceMinor, 0);
  const enContra = rows.filter((r) => r.balanceMinor < 0).reduce((s, r) => s + r.balanceMinor, 0);
  const currency = rows[0]?.currency ?? 'ARS';

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-[18rem] flex-1">
          <h1 className="text-xl font-semibold">Cuentas corrientes</h1>
          <p className="mt-0.5 text-sm text-fg-muted">
            Quién te debe y a quién le debés, comprobante por comprobante. Cada cobro o pago que registrás acá
            mueve también la caja o el banco donde entró la plata.
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button variant="secondary" onClick={() => setAdjust(true)}>
            <Scale className="h-4 w-4" /> Ajuste
          </Button>
          <Button onClick={() => setReceipt(true)}>
            <Plus className="h-4 w-4" /> {kind === 'customer' ? 'Registrar cobro' : 'Registrar pago'}
          </Button>
        </div>
      </div>

      <Tabs
        items={[
          { id: 'customer', label: 'Clientes' },
          { id: 'supplier', label: 'Proveedores' },
        ]}
        value={kind}
        onChange={(v) => onKind(v as PartyKind)}
      />

      {rows.length > 0 && (
        <ListStats
          items={[
            {
              label: 'Contactos con saldo',
              value: String(rows.length),
            },
            {
              label: kind === 'customer' ? 'Nos deben' : 'Saldo a favor nuestro',
              value: formatMoney(aFavor, currency),
              tone: aFavor > 0 ? 'warning' : 'default',
              hint: 'Suma de los saldos a nuestro favor: comprobantes emitidos que todavía no nos pagaron.',
            },
            {
              label: kind === 'customer' ? 'Saldo a favor de ellos' : 'Le debemos',
              value: formatMoney(Math.abs(enContra), currency),
              tone: enContra < 0 ? 'danger' : 'default',
              hint: 'Suma de los saldos en contra: lo que nos facturaron y todavía no pagamos, o lo que nos pagaron de más.',
            },
          ]}
        />
      )}

      {rows.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-surface/50 p-10 text-center">
          <Users className="mx-auto h-8 w-8 text-fg-subtle" />
          <p className="mt-2 text-sm font-medium">
            Ningún {kind === 'customer' ? 'cliente' : 'proveedor'} tiene saldo pendiente
          </p>
          <p className="mt-1 text-sm text-fg-muted">
            {kind === 'customer'
              ? 'Las ventas con medio de pago "Cuenta corriente" aparecen acá solas. También podés cargar un saldo inicial con un ajuste.'
              : 'Las facturas que cargás en una orden de compra aparecen acá solas. También podés cargar un saldo inicial con un ajuste.'}
          </p>
        </div>
      ) : (
        <div className={TABLE_CARD}>
          <table className="w-full text-sm">
            <thead className={TABLE_HEAD_STICKY}>
              <tr className="text-left text-xs uppercase tracking-wide text-fg-muted">
                <th className="px-4 py-2 font-medium">{kind === 'customer' ? 'Cliente' : 'Proveedor'}</th>
                <th className="px-4 py-2 font-medium">Último movimiento</th>
                <th className="px-4 py-2 text-right font-medium">Saldo</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((r) => (
                <tr
                  key={r.partyId}
                  onClick={() => onOpen(r.partyId)}
                  className="cursor-pointer hover:bg-bg-muted"
                >
                  <td className="px-4 py-2 font-medium">{r.partyName}</td>
                  <td className="whitespace-nowrap px-4 py-2 text-fg-muted">{formatDate(r.lastAtUtc)}</td>
                  <td className="whitespace-nowrap px-4 py-2 text-right">
                    <div
                      className={`font-medium tabular-nums ${r.balanceMinor > 0 ? 'text-warning' : 'text-danger'}`}
                    >
                      {formatMoney(Math.abs(r.balanceMinor), r.currency)}
                    </div>
                    <div className="text-xs text-fg-subtle">{balanceLabel(kind, r.balanceMinor)}</div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <ReceiptsList kind={kind} />

      <HelpLink id="cuentasCorrientes" />

      {receipt && <ReceiptModal partyKind={kind} onClose={() => setReceipt(false)} />}
      {adjust && <AdjustmentModal partyKind={kind} onClose={() => setAdjust(false)} />}
    </>
  );
}

// -------------------------------------------------------- Estado de cuenta

function PartyStatement({
  partyKind,
  partyId,
  onBack,
}: {
  partyKind: PartyKind;
  partyId: string;
  onBack: () => void;
}) {
  const { store } = useStore();
  const [receipt, setReceipt] = useState(false);

  const { data } = useQuery({
    queryKey: ['finance-ledger', store?.id, partyKind, partyId],
    queryFn: () =>
      api.get<LedgerResponse>(`/api/v1/finance/ledger?partyKind=${partyKind}&partyId=${partyId}`),
    enabled: !!store,
  });

  const rows = data?.items ?? [];

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-[18rem] flex-1">
          <button
            type="button"
            onClick={onBack}
            className="flex items-center gap-1 text-sm text-fg-muted hover:text-fg"
          >
            <ArrowLeft className="h-4 w-4" /> Cuentas corrientes
          </button>
          <h1 className="mt-1 text-xl font-semibold">{data?.partyName ?? '...'}</h1>
          <p className="mt-0.5 text-sm text-fg-muted">
            Todo lo que pasó con {partyKind === 'customer' ? 'este cliente' : 'este proveedor'}, en orden, con
            el saldo después de cada movimiento.
          </p>
        </div>
        <Button onClick={() => setReceipt(true)}>
          <Plus className="h-4 w-4" /> {partyKind === 'customer' ? 'Registrar cobro' : 'Registrar pago'}
        </Button>
      </div>

      {data && (
        <ListStats
          items={[
            {
              label: 'Saldo actual',
              value: formatMoney(Math.abs(data.balanceMinor), data.currency),
              tone: data.balanceMinor === 0 ? 'success' : data.balanceMinor > 0 ? 'warning' : 'danger',
              hint: balanceLabel(partyKind, data.balanceMinor),
            },
            { label: 'Movimientos', value: String(rows.length) },
          ]}
        />
      )}

      {rows.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-surface/50 p-10 text-center text-sm text-fg-muted">
          Sin movimientos.
        </div>
      ) : (
        <div className={TABLE_CARD}>
          <table className="w-full text-sm">
            <thead className={TABLE_HEAD_STICKY}>
              <tr className="text-left text-xs uppercase tracking-wide text-fg-muted">
                <th className="px-4 py-2 font-medium">Fecha</th>
                <th className="px-4 py-2 font-medium">Comprobante</th>
                <th className="px-4 py-2 text-right font-medium">Debe</th>
                <th className="px-4 py-2 text-right font-medium">Haber</th>
                <th className="px-4 py-2 text-right font-medium">Saldo</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="whitespace-nowrap px-4 py-2 text-fg-muted">{formatDate(r.occurredAtUtc)}</td>
                  <td className="px-4 py-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span>{r.docLabel}</span>
                      <Badge variant="neutral">{DOC_LABEL[r.docType] ?? r.docType}</Badge>
                      {r.pendingMinor > 0 && r.pendingMinor < r.debitMinor && (
                        <Badge variant="warning">Pendiente {formatMoney(r.pendingMinor, r.currency)}</Badge>
                      )}
                    </div>
                    {r.notes && <div className="text-xs text-fg-subtle">{r.notes}</div>}
                  </td>
                  <td className="whitespace-nowrap px-4 py-2 text-right tabular-nums">
                    {r.debitMinor > 0 ? formatMoney(r.debitMinor, r.currency) : '—'}
                  </td>
                  <td className="whitespace-nowrap px-4 py-2 text-right tabular-nums">
                    {r.creditMinor > 0 ? formatMoney(r.creditMinor, r.currency) : '—'}
                  </td>
                  <td className="whitespace-nowrap px-4 py-2 text-right font-medium tabular-nums">
                    {formatMoney(r.balanceMinor, r.currency)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {receipt && (
        <ReceiptModal
          partyKind={partyKind}
          fixedParty={{ id: partyId, name: data?.partyName ?? '', detail: null }}
          onClose={() => setReceipt(false)}
        />
      )}
    </>
  );
}

// ------------------------------------------------------------------ Recibos

function ReceiptsList({ kind }: { kind: PartyKind }) {
  const { store } = useStore();
  const qc = useQueryClient();
  const { toast } = useToast();
  const confirm = useConfirm();

  const receiptKind = kind === 'customer' ? 'collection' : 'payment';

  const { data } = useQuery({
    queryKey: ['finance-receipts', store?.id, receiptKind],
    queryFn: () =>
      api.get<{ items: ReceiptRow[]; total: number }>(
        `/api/v1/finance/receipts?kind=${receiptKind}&limit=25`,
      ),
    enabled: !!store,
  });

  const voidReceipt = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      api.post(`/api/v1/finance/receipts/${id}/void`, { reason }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['finance-receipts', store?.id] });
      qc.invalidateQueries({ queryKey: ['finance-balances', store?.id] });
      qc.invalidateQueries({ queryKey: ['finance-ledger', store?.id] });
      qc.invalidateQueries({ queryKey: ['finance-accounts', store?.id] });
      toast('Comprobante anulado', { variant: 'success' });
    },
    onError: (e) => toast(errMsg(e, 'No se pudo anular'), { variant: 'error' }),
  });

  const rows = data?.items ?? [];
  if (rows.length === 0) return null;

  return (
    <div className="space-y-2">
      <h2 className="font-medium">{kind === 'customer' ? 'Recibos de cobro' : 'Órdenes de pago'}</h2>
      <div className={TABLE_CARD}>
        <table className="w-full text-sm">
          <thead className={TABLE_HEAD_STICKY}>
            <tr className="text-left text-xs uppercase tracking-wide text-fg-muted">
              <th className="px-4 py-2 font-medium">Número</th>
              <th className="px-4 py-2 font-medium">Contacto</th>
              <th className="px-4 py-2 font-medium">Fecha</th>
              <th className="px-4 py-2 text-right font-medium">Importe</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((r) => (
              <tr key={r.id} className={r.voided ? 'text-fg-subtle line-through' : undefined}>
                <td className="whitespace-nowrap px-4 py-2 font-medium">{r.number}</td>
                <td className="px-4 py-2">{r.partyName}</td>
                <td className="whitespace-nowrap px-4 py-2 text-fg-muted">
                  {formatDateTime(r.occurredAtUtc)}
                </td>
                <td className="whitespace-nowrap px-4 py-2 text-right tabular-nums">
                  {formatMoney(r.totalMinor, r.currency)}
                </td>
                <td className="px-4 py-2 text-right">
                  {r.voided ? (
                    <Badge variant="neutral">Anulado</Badge>
                  ) : (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={async () => {
                        const ok = await confirm({
                          title: `Anular ${r.number}`,
                          message:
                            'Se revierte todo lo que hizo: vuelve la deuda, se descuenta la plata de la cuenta donde entró y se liberan las imputaciones. El comprobante queda a la vista como anulado.',
                          confirmLabel: 'Anular',
                          variant: 'danger',
                        });
                        if (ok) voidReceipt.mutate({ id: r.id, reason: 'Anulado desde el panel' });
                      }}
                    >
                      <Ban className="h-3.5 w-3.5" /> Anular
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/**
 * Cobrar o pagar. Lo único que hace distinto a un movimiento suelto de caja es
 * la imputación: decir a qué comprobantes se aplica la plata. Sin eso, el saldo
 * baja pero nadie sabe qué factura quedó saldada.
 */
function ReceiptModal({
  partyKind,
  fixedParty,
  onClose,
}: {
  partyKind: PartyKind;
  fixedParty?: PartyOption;
  onClose: () => void;
}) {
  const { store } = useStore();
  const qc = useQueryClient();
  const { toast } = useToast();

  const [party, setParty] = useState<PartyOption | null>(fixedParty ?? null);
  const [search, setSearch] = useState('');
  const debounced = useDebouncedValue(search, 300).trim();
  const [pickedAccountId, setAccountId] = useState('');
  const [amount, setAmount] = useState('');
  const [notes, setNotes] = useState('');
  const [allocations, setAllocations] = useState<Record<string, string>>({});

  const { data: parties } = useQuery({
    queryKey: ['finance-parties', store?.id, partyKind, debounced],
    queryFn: () =>
      api.get<{ items: PartyOption[] }>(
        `/api/v1/finance/parties?partyKind=${partyKind}&q=${encodeURIComponent(debounced)}`,
      ),
    enabled: !!store && !party,
  });

  const { data: accounts } = useQuery({
    queryKey: ['finance-accounts', store?.id],
    queryFn: () => api.get<{ items: FinanceAccount[] }>('/api/v1/finance/accounts'),
    enabled: !!store,
  });

  const { data: pending } = useQuery({
    queryKey: ['finance-pending', store?.id, partyKind, party?.id],
    queryFn: () =>
      api.get<{ items: PendingRow[] }>(
        `/api/v1/finance/ledger/pending?partyKind=${partyKind}&partyId=${party!.id}`,
      ),
    enabled: !!store && !!party,
  });

  const activeAccounts = useMemo(() => (accounts?.items ?? []).filter((a) => a.active), [accounts]);
  // La primera cuenta viene elegida —con una sola caja, que es lo normal, eso
  // ahorra un clic por cobro—. Se deriva en vez de sincronizarse con un efecto:
  // las cuentas llegan después del primer render y copiar el valor a estado
  // significaba renderizar dos veces para mostrar lo mismo.
  const accountId = pickedAccountId || activeAccounts[0]?.id || '';

  const amountMinor = toMinor(amount);
  const allocated = Object.values(allocations).reduce((s, v) => {
    const n = toMinor(v || '0');
    return s + (Number.isFinite(n) ? n : 0);
  }, 0);

  const problem = useMemo(() => {
    if (!party) return 'Elegí a quién.';
    if (!accountId) return 'Elegí la cuenta donde entra o sale la plata.';
    if (!Number.isFinite(amountMinor) || amountMinor <= 0) return 'Escribí el importe.';
    if (allocated > amountMinor) return 'Estás imputando más de lo que cobrás: bajá alguna de las filas.';
    return null;
  }, [party, accountId, amountMinor, allocated]);

  const save = useMutation({
    mutationFn: () =>
      api.post<{ id: string; number: string }>('/api/v1/finance/receipts', {
        kind: partyKind === 'customer' ? 'collection' : 'payment',
        partyKind,
        partyId: party!.id,
        partyName: party!.name,
        notes: notes.trim() || null,
        payments: [{ accountId, amountMinor }],
        allocations: Object.entries(allocations)
          .map(([ledgerEntryId, v]) => ({ ledgerEntryId, amountMinor: toMinor(v || '0') }))
          .filter((a) => Number.isFinite(a.amountMinor) && a.amountMinor > 0),
      }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['finance-balances', store?.id] });
      qc.invalidateQueries({ queryKey: ['finance-ledger', store?.id] });
      qc.invalidateQueries({ queryKey: ['finance-receipts', store?.id] });
      qc.invalidateQueries({ queryKey: ['finance-accounts', store?.id] });
      qc.invalidateQueries({ queryKey: ['finance-movements', store?.id] });
      toast(`${res.number} registrado`, { variant: 'success' });
      onClose();
    },
    onError: (e) => toast(errMsg(e, 'No se pudo registrar'), { variant: 'error' }),
  });

  const title = partyKind === 'customer' ? 'Registrar un cobro' : 'Registrar un pago';

  return (
    <Modal open onClose={onClose} title={title} size="lg">
      <div className="space-y-3">
        {party ? (
          <div className="flex items-center justify-between rounded-md border border-border bg-bg-subtle px-3 py-2">
            <div>
              <div className="font-medium">{party.name}</div>
              {party.detail && <div className="text-xs text-fg-subtle">{party.detail}</div>}
            </div>
            {!fixedParty && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setParty(null);
                  setAllocations({});
                }}
              >
                Cambiar
              </Button>
            )}
          </div>
        ) : (
          <FormField label={partyKind === 'customer' ? 'Cliente' : 'Proveedor'}>
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por nombre..."
              autoFocus
            />
          </FormField>
        )}

        {!party && (parties?.items ?? []).length > 0 && (
          <div className="max-h-48 overflow-y-auto rounded-md border border-border">
            {parties!.items.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setParty(p)}
                className="flex w-full items-center justify-between border-b border-border px-3 py-2 text-left text-sm last:border-0 hover:bg-bg-muted"
              >
                <span>{p.name}</span>
                {p.detail && <span className="text-xs text-fg-subtle">{p.detail}</span>}
              </button>
            ))}
          </div>
        )}

        {!party && (parties?.items ?? []).length === 0 && debounced && (
          <p className="text-sm text-fg-muted">
            Sin resultados.{' '}
            {partyKind === 'supplier'
              ? 'Podés crear el proveedor desde la pantalla Proveedores.'
              : 'Podés crear el cliente desde la pantalla Clientes.'}
          </p>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          <FormField label={partyKind === 'customer' ? 'Entra en' : 'Sale de'}>
            <Select
              value={accountId}
              onChange={(e) => setAccountId(e.target.value)}
              options={activeAccounts.map((a) => ({
                value: a.id,
                label: `${a.name} · ${formatMoney(a.balanceMinor, a.currency)}`,
              }))}
              placeholder={activeAccounts.length === 0 ? 'Creá una cuenta en Tesorería' : undefined}
            />
          </FormField>
          <FormField label="Importe">
            <Input
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              inputMode="decimal"
              placeholder="0"
            />
          </FormField>
        </div>

        {party && (pending?.items ?? []).length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium">Imputar a</h3>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  // Se va llenando de arriba hacia abajo, que es el orden en que
                  // se cancela una cuenta corriente: primero lo más viejo.
                  let left = Number.isFinite(amountMinor) ? amountMinor : 0;
                  const next: Record<string, string> = {};
                  for (const row of pending!.items) {
                    if (left <= 0) break;
                    const take = Math.min(left, row.pendingMinor);
                    next[row.id] = (take / 100).toFixed(2);
                    left -= take;
                  }
                  setAllocations(next);
                }}
              >
                Imputar lo más viejo primero
              </Button>
            </div>

            <div className="divide-y divide-border rounded-md border border-border">
              {pending!.items.map((row) => (
                <div key={row.id} className="flex flex-wrap items-center gap-2 px-3 py-2 text-sm">
                  <div className="min-w-[10rem] flex-1">
                    <div>{row.docLabel}</div>
                    <div className="text-xs text-fg-subtle">
                      {formatDate(row.occurredAtUtc)} · pendiente{' '}
                      {formatMoney(row.pendingMinor, row.currency)}
                    </div>
                  </div>
                  <Input
                    className="w-32"
                    inputMode="decimal"
                    placeholder="0"
                    value={allocations[row.id] ?? ''}
                    onChange={(e) => setAllocations((cur) => ({ ...cur, [row.id]: e.target.value }))}
                  />
                </div>
              ))}
            </div>

            <p className="text-xs text-fg-subtle">
              Imputado {formatMoney(allocated, pending!.items[0]?.currency ?? 'ARS')} de{' '}
              {formatMoney(
                Number.isFinite(amountMinor) ? amountMinor : 0,
                pending!.items[0]?.currency ?? 'ARS',
              )}
              .{allocated < amountMinor && Number.isFinite(amountMinor) && ' Lo que sobra queda a cuenta.'}
            </p>
          </div>
        )}

        <FormField label="Notas" hint="Opcional: número de cheque, transferencia, quién lo recibió.">
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
        </FormField>

        {problem && <p className="text-sm text-danger">{problem}</p>}
      </div>

      <div className="mt-5 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>
          Cancelar
        </Button>
        <Button onClick={() => save.mutate()} disabled={!!problem || save.isPending} loading={save.isPending}>
          <Receipt className="h-4 w-4" /> Registrar
        </Button>
      </div>
    </Modal>
  );
}

/**
 * La única forma de tocar un saldo a mano. Queda como un movimiento más, con
 * motivo: un saldo que cambia sin dejar rastro es un saldo que nadie puede
 * defender frente al cliente.
 */
function AdjustmentModal({ partyKind, onClose }: { partyKind: PartyKind; onClose: () => void }) {
  const { store } = useStore();
  const qc = useQueryClient();
  const { toast } = useToast();

  const [party, setParty] = useState<PartyOption | null>(null);
  const [search, setSearch] = useState('');
  const debounced = useDebouncedValue(search, 300).trim();
  const [kind, setKind] = useState<'debit' | 'credit'>(partyKind === 'customer' ? 'debit' : 'credit');
  const [amount, setAmount] = useState('');
  const [label, setLabel] = useState('');
  const [reason, setReason] = useState('');

  const { data: parties } = useQuery({
    queryKey: ['finance-parties', store?.id, partyKind, debounced],
    queryFn: () =>
      api.get<{ items: PartyOption[] }>(
        `/api/v1/finance/parties?partyKind=${partyKind}&q=${encodeURIComponent(debounced)}`,
      ),
    enabled: !!store && !party,
  });

  const amountMinor = toMinor(amount);
  const invalid = !party || !Number.isFinite(amountMinor) || amountMinor <= 0 || !reason.trim();

  const save = useMutation({
    mutationFn: () =>
      api.post('/api/v1/finance/ledger/adjustments', {
        partyKind,
        partyId: party!.id,
        kind,
        amountMinor,
        currency: 'ARS',
        label: label.trim() || 'Ajuste',
        reason: reason.trim(),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['finance-balances', store?.id] });
      qc.invalidateQueries({ queryKey: ['finance-ledger', store?.id] });
      toast('Ajuste registrado', { variant: 'success' });
      onClose();
    },
    onError: (e) => toast(errMsg(e, 'No se pudo ajustar'), { variant: 'error' }),
  });

  // El mismo signo dicho como lo diría una persona, según de qué lado mire.
  const options =
    partyKind === 'customer'
      ? [
          { value: 'debit', label: 'Aumenta lo que nos debe' },
          { value: 'credit', label: 'Baja lo que nos debe (saldo a favor)' },
        ]
      : [
          { value: 'credit', label: 'Aumenta lo que le debemos' },
          { value: 'debit', label: 'Baja lo que le debemos' },
        ];

  return (
    <Modal open onClose={onClose} title="Ajuste de cuenta corriente">
      <p className="mb-3 text-sm text-fg-muted">
        Para cargar un saldo que viene de antes del sistema, o corregir una diferencia. Queda registrado como
        un movimiento más, con el motivo a la vista.
      </p>
      <div className="space-y-3">
        {party ? (
          <div className="flex items-center justify-between rounded-md border border-border bg-bg-subtle px-3 py-2">
            <span className="font-medium">{party.name}</span>
            <Button size="sm" variant="ghost" onClick={() => setParty(null)}>
              Cambiar
            </Button>
          </div>
        ) : (
          <>
            <FormField label={partyKind === 'customer' ? 'Cliente' : 'Proveedor'}>
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar..."
                autoFocus
              />
            </FormField>
            {(parties?.items ?? []).length > 0 && (
              <div className="max-h-48 overflow-y-auto rounded-md border border-border">
                {parties!.items.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setParty(p)}
                    className="block w-full border-b border-border px-3 py-2 text-left text-sm last:border-0 hover:bg-bg-muted"
                  >
                    {p.name}
                  </button>
                ))}
              </div>
            )}
          </>
        )}

        <FormField label="Qué hace">
          <Select
            value={kind}
            onChange={(e) => setKind(e.target.value as 'debit' | 'credit')}
            options={options}
          />
        </FormField>
        <FormField label="Importe">
          <Input
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            inputMode="decimal"
            placeholder="0"
          />
        </FormField>
        <FormField label="Descripción" hint="Cómo se va a ver en el estado de cuenta.">
          <Input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Saldo anterior al sistema"
          />
        </FormField>
        <FormField
          label="Motivo"
          hint="Obligatorio: por qué se ajusta. Es lo que va a leer quien revise esto en seis meses."
        >
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} />
        </FormField>
      </div>

      <div className="mt-5 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>
          Cancelar
        </Button>
        <Button onClick={() => save.mutate()} disabled={invalid || save.isPending} loading={save.isPending}>
          Registrar ajuste
        </Button>
      </div>
    </Modal>
  );
}
