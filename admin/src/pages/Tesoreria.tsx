import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeftRight, Banknote, Landmark, Plus, Wallet } from 'lucide-react';
import { Badge, Button, FormField, Input, Modal, Select, Textarea, useToast } from '@tiendafy/ui';
import { useStore } from '../context/StoreContext';
import { api, errMsg } from '../lib/api';
import { formatDateTime, formatMoney } from '../lib/format';
import { NoStoreSelected } from '../components/NoStoreSelected';
import { HelpLink } from '../components/HelpLink';
import { Pagination, pageRangeLabel } from '../components/Pagination';
import { TABLE_CARD, TABLE_HEAD_STICKY, TABLE_SCROLL_X } from '../lib/styles';
import { ListStats } from '../components/stats/ListStats';
import { parseMoneyInput } from '../lib/price';

// ---------------------------------------------------------------- Tipos wire

export interface FinanceAccount {
  id: string;
  name: string;
  kind: 'cash' | 'bank';
  currency: string;
  detail: string | null;
  active: boolean;
  balanceMinor: number;
}

interface AccountsResponse {
  items: FinanceAccount[];
  totals: { currency: string; balanceMinor: number }[];
}

interface Movement {
  id: string;
  accountId: string;
  accountName: string;
  occurredAtUtc: string;
  kind: 'in' | 'out';
  amountMinor: number;
  currency: string;
  concept: string;
  reference: string | null;
  receiptId: string | null;
  transferGroupId: string | null;
}

const MOVEMENTS_PAGE_SIZE = 25;

export function TesoreriaPage() {
  const { store } = useStore();
  const [newAccount, setNewAccount] = useState(false);
  const [transfer, setTransfer] = useState(false);
  const [movement, setMovement] = useState(false);

  const { data } = useQuery({
    queryKey: ['finance-accounts', store?.id],
    queryFn: () => api.get<AccountsResponse>('/api/v1/finance/accounts'),
    enabled: !!store,
  });

  if (!store) return <NoStoreSelected />;

  const accounts = data?.items ?? [];
  const activas = accounts.filter((a) => a.active);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-[18rem] flex-1">
          <h1 className="text-xl font-semibold">Tesorería</h1>
          <p className="mt-0.5 text-sm text-fg-muted">
            Dónde está la plata: tus cajas y cuentas bancarias, con cada movimiento que las tocó. Los cobros y
            pagos que cargás en Cuentas corrientes entran acá solos.
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          {activas.length >= 2 && (
            <Button variant="secondary" onClick={() => setTransfer(true)}>
              <ArrowLeftRight className="h-4 w-4" /> Transferir
            </Button>
          )}
          {activas.length > 0 && (
            <Button variant="secondary" onClick={() => setMovement(true)}>
              <Plus className="h-4 w-4" /> Movimiento
            </Button>
          )}
          <Button onClick={() => setNewAccount(true)}>
            <Plus className="h-4 w-4" /> Nueva cuenta
          </Button>
        </div>
      </div>

      {(data?.totals ?? []).length > 0 && (
        <ListStats
          items={(data?.totals ?? []).map((t) => ({
            label: `Total en ${t.currency}`,
            value: formatMoney(t.balanceMinor, t.currency),
            hint: 'Suma de las cuentas activas de esa moneda. No se mezclan monedas: sumar pesos con dólares no significa nada.',
            tone: t.balanceMinor < 0 ? 'danger' : 'default',
          }))}
        />
      )}

      <AccountsGrid accounts={accounts} />

      <MovementsTable accounts={accounts} />

      <HelpLink id="tesoreria" />

      {newAccount && <AccountModal onClose={() => setNewAccount(false)} />}
      {transfer && <TransferModal accounts={activas} onClose={() => setTransfer(false)} />}
      {movement && <MovementModal accounts={activas} onClose={() => setMovement(false)} />}
    </div>
  );
}

// ------------------------------------------------------------------- Cuentas

function AccountsGrid({ accounts }: { accounts: FinanceAccount[] }) {
  const [editing, setEditing] = useState<FinanceAccount | null>(null);

  if (accounts.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border bg-surface/50 p-10 text-center">
        <Wallet className="mx-auto h-8 w-8 text-fg-subtle" />
        <p className="mt-2 text-sm font-medium">Todavía no cargaste ninguna caja ni cuenta bancaria</p>
        <p className="mt-1 text-sm text-fg-muted">
          Creá al menos una para poder registrar cobros y pagos. Si arrancás con plata en la caja, ponela como
          saldo inicial.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {accounts.map((a) => (
          <button
            key={a.id}
            type="button"
            onClick={() => setEditing(a)}
            className="rounded-lg border border-border bg-surface p-4 text-left shadow-card transition-colors hover:border-primary"
          >
            <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-fg-muted">
              {a.kind === 'bank' ? (
                <Landmark className="h-3.5 w-3.5" />
              ) : (
                <Banknote className="h-3.5 w-3.5" />
              )}
              {a.kind === 'bank' ? 'Banco' : 'Efectivo'}
              {!a.active && <Badge variant="neutral">Inactiva</Badge>}
            </div>
            <div className="mt-1 truncate font-medium">{a.name}</div>
            <div
              className={`mt-1 text-xl font-bold tabular-nums ${a.balanceMinor < 0 ? 'text-danger' : 'text-fg'}`}
            >
              {formatMoney(a.balanceMinor, a.currency)}
            </div>
            {a.detail && <div className="mt-1 truncate text-xs text-fg-subtle">{a.detail}</div>}
          </button>
        ))}
      </div>

      {editing && <AccountModal account={editing} onClose={() => setEditing(null)} />}
    </>
  );
}

function AccountModal({ account, onClose }: { account?: FinanceAccount; onClose: () => void }) {
  const { store } = useStore();
  const qc = useQueryClient();
  const { toast } = useToast();
  const editing = !!account;

  const [name, setName] = useState(account?.name ?? '');
  const [kind, setKind] = useState<'cash' | 'bank'>(account?.kind ?? 'cash');
  const [currency, setCurrency] = useState(account?.currency ?? 'ARS');
  const [opening, setOpening] = useState('0');
  const [detail, setDetail] = useState(account?.detail ?? '');
  const [active, setActive] = useState(account?.active ?? true);

  const save = useMutation({
    mutationFn: () =>
      editing
        ? api.patch(`/api/v1/finance/accounts/${account!.id}`, { name, detail: detail || null, active })
        : api.post('/api/v1/finance/accounts', {
            name,
            kind,
            currency,
            openingBalanceMinor: parseMoneyInput(opening || '0'),
            detail: detail || null,
          }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['finance-accounts', store?.id] });
      toast(editing ? 'Cuenta actualizada' : 'Cuenta creada', { variant: 'success' });
      onClose();
    },
    onError: (e) => toast(errMsg(e, 'No se pudo guardar'), { variant: 'error' }),
  });

  const openingInvalid = !editing && Number.isNaN(parseMoneyInput(opening || '0'));

  return (
    <Modal open onClose={onClose} title={editing ? 'Editar cuenta' : 'Nueva cuenta'}>
      <div className="space-y-3">
        <FormField label="Nombre">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Caja del local"
            autoFocus
          />
        </FormField>

        {!editing && (
          <>
            <FormField label="Tipo">
              <Select
                value={kind}
                onChange={(e) => setKind(e.target.value as 'cash' | 'bank')}
                options={[
                  { value: 'cash', label: 'Efectivo (caja)' },
                  { value: 'bank', label: 'Cuenta bancaria' },
                ]}
              />
            </FormField>
            <FormField label="Moneda">
              <Select
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                options={[
                  { value: 'ARS', label: 'Pesos (ARS)' },
                  { value: 'USD', label: 'Dólares (USD)' },
                ]}
              />
            </FormField>
            <FormField
              label="Saldo inicial"
              hint="Lo que hay hoy en esta cuenta. De acá en más el saldo lo calculan los movimientos."
              error={openingInvalid ? 'Escribí un número' : undefined}
            >
              <Input value={opening} onChange={(e) => setOpening(e.target.value)} inputMode="decimal" />
            </FormField>
          </>
        )}

        <FormField label="Detalle" hint="Opcional: banco, número de cuenta, quién la maneja.">
          <Textarea value={detail} onChange={(e) => setDetail(e.target.value)} rows={2} />
        </FormField>

        {editing && (
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
            Cuenta activa
          </label>
        )}
      </div>

      <div className="mt-5 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>
          Cancelar
        </Button>
        <Button
          onClick={() => save.mutate()}
          disabled={!name.trim() || openingInvalid || save.isPending}
          loading={save.isPending}
        >
          Guardar
        </Button>
      </div>
    </Modal>
  );
}

// --------------------------------------------------------------- Movimientos

function MovementsTable({ accounts }: { accounts: FinanceAccount[] }) {
  const { store } = useStore();
  const [accountId, setAccountId] = useState('');
  const [page, setPage] = useState(1);

  const { data } = useQuery({
    queryKey: ['finance-movements', store?.id, accountId, page],
    queryFn: () => {
      const params = new URLSearchParams({
        limit: String(MOVEMENTS_PAGE_SIZE),
        offset: String((page - 1) * MOVEMENTS_PAGE_SIZE),
      });
      if (accountId) params.set('accountId', accountId);
      return api.get<{ items: Movement[]; total: number }>(`/api/v1/finance/movements?${params}`);
    },
    enabled: !!store,
    placeholderData: (previous) => previous,
  });

  const totalPages = Math.max(1, Math.ceil((data?.total ?? 0) / MOVEMENTS_PAGE_SIZE));

  if (accounts.length === 0) return null;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="font-medium">Movimientos</h2>
          {(data?.total ?? 0) > 0 && (
            <p className="text-xs text-fg-subtle">
              {pageRangeLabel(
                page,
                MOVEMENTS_PAGE_SIZE,
                data!.total,
                data!.total === 1 ? 'movimiento' : 'movimientos',
              )}
            </p>
          )}
        </div>
        <Select
          aria-label="Filtrar por cuenta"
          className="w-56"
          value={accountId}
          onChange={(e) => {
            setAccountId(e.target.value);
            setPage(1);
          }}
          placeholder="Todas las cuentas"
          options={accounts.map((a) => ({ value: a.id, label: a.name }))}
        />
      </div>

      {(data?.items ?? []).length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-surface/50 p-8 text-center text-sm text-fg-muted">
          Todavía no hay movimientos en esta cuenta.
        </div>
      ) : (
        <div className={TABLE_CARD}>
          <div className={TABLE_SCROLL_X}>
            <table className="w-full text-sm">
              <thead className={TABLE_HEAD_STICKY}>
                <tr className="text-left text-xs uppercase tracking-wide text-fg-muted">
                  <th className="px-4 py-2 font-medium">Fecha</th>
                  <th className="px-4 py-2 font-medium">Concepto</th>
                  <th className="px-4 py-2 font-medium">Cuenta</th>
                  <th className="px-4 py-2 text-right font-medium">Importe</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {data!.items.map((m) => (
                  <tr key={m.id}>
                    <td className="whitespace-nowrap px-4 py-2 text-fg-muted">
                      {formatDateTime(m.occurredAtUtc)}
                    </td>
                    <td className="px-4 py-2">
                      <div className="flex items-center gap-2">
                        <span className="truncate">{m.concept}</span>
                        {m.transferGroupId && <Badge variant="neutral">Transferencia</Badge>}
                      </div>
                      {m.reference && <div className="text-xs text-fg-subtle">{m.reference}</div>}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2 text-fg-muted">{m.accountName}</td>
                    <td
                      className={`whitespace-nowrap px-4 py-2 text-right font-medium tabular-nums ${
                        m.kind === 'in' ? 'text-success' : 'text-danger'
                      }`}
                    >
                      {m.kind === 'in' ? '+' : '−'}
                      {formatMoney(m.amountMinor, m.currency)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {totalPages > 1 && <Pagination page={page} totalPages={totalPages} onPage={setPage} />}
    </div>
  );
}

function MovementModal({ accounts, onClose }: { accounts: FinanceAccount[]; onClose: () => void }) {
  const { store } = useStore();
  const qc = useQueryClient();
  const { toast } = useToast();

  const [accountId, setAccountId] = useState(accounts[0]?.id ?? '');
  const [kind, setKind] = useState<'in' | 'out'>('out');
  const [amount, setAmount] = useState('');
  const [concept, setConcept] = useState('');
  const [reference, setReference] = useState('');

  const amountMinor = parseMoneyInput(amount);
  const invalid = !accountId || !concept.trim() || !Number.isFinite(amountMinor) || amountMinor <= 0;

  const save = useMutation({
    mutationFn: () =>
      api.post('/api/v1/finance/movements', {
        accountId,
        kind,
        amountMinor,
        concept: concept.trim(),
        reference: reference.trim() || null,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['finance-accounts', store?.id] });
      qc.invalidateQueries({ queryKey: ['finance-movements', store?.id] });
      toast('Movimiento registrado', { variant: 'success' });
      onClose();
    },
    onError: (e) => toast(errMsg(e, 'No se pudo registrar'), { variant: 'error' }),
  });

  return (
    <Modal open onClose={onClose} title="Nuevo movimiento">
      <div className="space-y-3">
        <FormField label="Cuenta">
          <Select
            value={accountId}
            onChange={(e) => setAccountId(e.target.value)}
            options={accounts.map((a) => ({ value: a.id, label: `${a.name} (${a.currency})` }))}
          />
        </FormField>
        <FormField label="Tipo">
          <Select
            value={kind}
            onChange={(e) => setKind(e.target.value as 'in' | 'out')}
            options={[
              { value: 'out', label: 'Sale plata (gasto, retiro)' },
              { value: 'in', label: 'Entra plata (aporte, ingreso)' },
            ]}
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
        <FormField label="Concepto">
          <Input
            value={concept}
            onChange={(e) => setConcept(e.target.value)}
            placeholder="Alquiler de agosto"
          />
        </FormField>
        <FormField label="Referencia" hint="Opcional: número de comprobante, factura, cheque.">
          <Input value={reference} onChange={(e) => setReference(e.target.value)} />
        </FormField>
      </div>

      <div className="mt-5 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>
          Cancelar
        </Button>
        <Button onClick={() => save.mutate()} disabled={invalid || save.isPending} loading={save.isPending}>
          Registrar
        </Button>
      </div>
    </Modal>
  );
}

function TransferModal({ accounts, onClose }: { accounts: FinanceAccount[]; onClose: () => void }) {
  const { store } = useStore();
  const qc = useQueryClient();
  const { toast } = useToast();

  const [fromAccountId, setFrom] = useState(accounts[0]?.id ?? '');
  const [toAccountId, setTo] = useState(accounts[1]?.id ?? '');
  const [amount, setAmount] = useState('');
  const [concept, setConcept] = useState('');

  const from = accounts.find((a) => a.id === fromAccountId);
  const to = accounts.find((a) => a.id === toAccountId);
  const amountMinor = parseMoneyInput(amount);

  // Los dos motivos por los que el backend rechaza, dichos antes de mandar.
  const problem = useMemo(() => {
    if (fromAccountId && fromAccountId === toAccountId) return 'Elegí dos cuentas distintas.';
    if (from && to && from.currency !== to.currency)
      return 'Las dos cuentas tienen que ser de la misma moneda: para cambiar de moneda hace falta un tipo de cambio.';
    return null;
  }, [from, to, fromAccountId, toAccountId]);

  const invalid = !!problem || !Number.isFinite(amountMinor) || amountMinor <= 0;

  const save = useMutation({
    mutationFn: () =>
      api.post('/api/v1/finance/transfers', {
        fromAccountId,
        toAccountId,
        amountMinor,
        concept: concept.trim() || null,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['finance-accounts', store?.id] });
      qc.invalidateQueries({ queryKey: ['finance-movements', store?.id] });
      toast('Transferencia registrada', { variant: 'success' });
      onClose();
    },
    onError: (e) => toast(errMsg(e, 'No se pudo transferir'), { variant: 'error' }),
  });

  const options = accounts.map((a) => ({
    value: a.id,
    label: `${a.name} · ${formatMoney(a.balanceMinor, a.currency)}`,
  }));

  return (
    <Modal open onClose={onClose} title="Transferir entre cuentas">
      <p className="mb-3 text-sm text-fg-muted">
        Mover plata de una cuenta a otra no es un ingreso ni un gasto: quedan los dos movimientos atados, para
        que no infle los totales.
      </p>
      <div className="space-y-3">
        <FormField label="Desde">
          <Select value={fromAccountId} onChange={(e) => setFrom(e.target.value)} options={options} />
        </FormField>
        <FormField label="Hacia" error={problem ?? undefined}>
          <Select value={toAccountId} onChange={(e) => setTo(e.target.value)} options={options} />
        </FormField>
        <FormField label="Importe">
          <Input
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            inputMode="decimal"
            placeholder="0"
          />
        </FormField>
        <FormField label="Concepto" hint="Opcional: si lo dejás vacío queda 'Transferencia A → B'.">
          <Input value={concept} onChange={(e) => setConcept(e.target.value)} />
        </FormField>
      </div>

      <div className="mt-5 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>
          Cancelar
        </Button>
        <Button onClick={() => save.mutate()} disabled={invalid || save.isPending} loading={save.isPending}>
          Transferir
        </Button>
      </div>
    </Modal>
  );
}
