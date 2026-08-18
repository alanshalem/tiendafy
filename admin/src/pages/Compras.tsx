import { useCallback, useMemo, useState, type Dispatch, type SetStateAction } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Package, Plus, Ship, Trash2 } from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  Input,
  Select,
  Tabs,
  useConfirm,
  useToast,
  type BadgeVariant,
} from '@tiendafy/ui';
import { useStore } from '../context/StoreContext';
import { api, errMsg } from '../lib/api';
import { formatDate, formatMoney } from '../lib/format';
import { HelpLink } from '../components/HelpLink';
import { NoStoreSelected } from '../components/NoStoreSelected';
import { VariantPicker } from '../components/VariantPicker';
import { TABLE_CARD } from '../lib/styles';
import { CameraBox, useScanner } from './Products/Scanner';

// ---------------------------------------------------------------- Tipos wire

interface PoListItem {
  id: string;
  supplierName: string;
  reference: string | null;
  status: string;
  currency: string;
  totalFob: number;
  items: number;
  units: number;
  createdAtUtc: string;
  leadTimeDays: number | null;
}

interface PoItem {
  variantId: string;
  productName: string;
  variantDescription: string;
  sku: string;
  quantity: number;
  unitCost: number;
  receivedQuantity: number | null;
  landedUnitCostArsMinor: number;
}

interface PoDetail {
  id: string;
  supplierName: string;
  reference: string | null;
  notes: string | null;
  status: string;
  currency: string;
  exchangeRate: number;
  leadTimeDays: number | null;
  createdAtUtc: string;
  totalFob: number;
  totalExpensesArs: number;
  items: PoItem[];
  expenses: { label: string; amount: number; isLocal: boolean }[];
}

interface Suggestion {
  variantId: string;
  product: string;
  variant: string;
  sku: string;
  unitsPerDay: number;
  available: number;
  coverageDays: number;
  suggestedQty: number;
}

const PO_STATUS: Record<string, { label: string; variant: BadgeVariant }> = {
  DRAFT: { label: 'Borrador', variant: 'neutral' },
  CONFIRMED: { label: 'Confirmada', variant: 'info' },
  INPRODUCTION: { label: 'En producción', variant: 'info' },
  INTRANSIT: { label: 'En tránsito', variant: 'warning' },
  INCUSTOMS: { label: 'En aduana', variant: 'warning' },
  RECEIVED: { label: 'Recibida', variant: 'success' },
  CANCELLED: { label: 'Cancelada', variant: 'danger' },
};

/** Próximos pasos posibles del ciclo, por estado actual (Recibir va aparte). */
const NEXT_STEPS: Record<string, string[]> = {
  DRAFT: ['CONFIRMED'],
  CONFIRMED: ['INPRODUCTION', 'INTRANSIT'],
  INPRODUCTION: ['INTRANSIT'],
  INTRANSIT: ['INCUSTOMS'],
  INCUSTOMS: [],
};

// Draft del form (montos como strings — se parsean al guardar).
interface FormItem {
  variantId: string;
  label: string;
  sku: string;
  quantity: string;
  unitCost: string;
}

interface FormExpense {
  label: string;
  amount: string;
  isLocal: boolean;
}

interface PoForm {
  supplierName: string;
  reference: string;
  notes: string;
  currency: string;
  exchangeRate: string;
  leadTimeDays: string;
  items: FormItem[];
  expenses: FormExpense[];
}

export function ComprasPage() {
  const { store } = useStore();
  const [view, setView] = useState<'list' | 'detail' | 'new'>('list');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  if (!store) return <NoStoreSelected />;

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      {view === 'list' && (
        <ComprasList
          onNew={() => setView('new')}
          onOpen={(id) => {
            setSelectedId(id);
            setView('detail');
          }}
        />
      )}
      {view === 'new' && <PoEditor poId={null} onBack={() => setView('list')} />}
      {view === 'detail' && selectedId && <PoEditor poId={selectedId} onBack={() => setView('list')} />}
    </div>
  );
}

// ------------------------------------------------------------------- Lista

function ComprasList({ onNew, onOpen }: { onNew: () => void; onOpen: (id: string) => void }) {
  const { store } = useStore();
  const [tab, setTab] = useState('ordenes');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  const { data } = useQuery({
    queryKey: ['purchase-orders', store?.id],
    queryFn: () => api.get<{ items: PoListItem[] }>('/api/v1/purchasing/purchase-orders'),
    enabled: !!store,
  });

  return (
    <>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Compras</h1>
          <p className="mt-0.5 text-sm text-fg-muted">
            Órdenes de compra a proveedores, ciclo de importación y landed cost: el costo real de cada unidad
            puesta en el depósito alimenta Rentabilidad.
          </p>
        </div>
        <Button className="shrink-0" onClick={onNew}>
          <Plus className="h-4 w-4" /> Nueva compra
        </Button>
      </div>

      <Tabs
        items={[
          { id: 'ordenes', label: 'Órdenes de compra' },
          { id: 'reposicion', label: 'Reposición sugerida' },
        ]}
        value={tab}
        onChange={setTab}
      />

      {tab === 'ordenes' ? (
        <>
          <div className="flex gap-2">
            <div className="min-w-0 flex-1">
              <Input
                placeholder="Buscar por proveedor o referencia…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            {/* Ancho SIEMPRE por wrapper: el w-full base de Select/Input le gana
                a un w-* pasado por className (cn no resuelve conflictos). */}
            <div className="w-44 shrink-0">
              <Select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                options={[
                  { value: '', label: 'Todos los estados' },
                  ...Object.entries(PO_STATUS).map(([value, s]) => ({ value, label: s.label })),
                ]}
              />
            </div>
          </div>
          <div className={TABLE_CARD}>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-bg-subtle text-left text-fg-muted">
                  <th className="px-4 py-2.5 font-medium">Proveedor</th>
                  <th className="px-4 py-2.5 font-medium">Referencia</th>
                  <th className="px-4 py-2.5 font-medium">Estado</th>
                  <th className="px-4 py-2.5 text-right font-medium">FOB</th>
                  <th className="px-4 py-2.5 text-right font-medium">Unidades</th>
                  <th className="px-4 py-2.5 font-medium">Creada</th>
                </tr>
              </thead>
              <tbody>
                {(data?.items ?? [])
                  .filter((po) => {
                    const q = search.trim().toLowerCase();
                    const matchesText =
                      q === '' ||
                      po.supplierName.toLowerCase().includes(q) ||
                      (po.reference ?? '').toLowerCase().includes(q);
                    return matchesText && (statusFilter === '' || po.status === statusFilter);
                  })
                  .map((po) => (
                    <tr
                      key={po.id}
                      className="cursor-pointer border-b border-border last:border-b-0 hover:bg-bg-subtle"
                      onClick={() => onOpen(po.id)}
                    >
                      <td className="px-4 py-2.5 font-medium text-fg">{po.supplierName}</td>
                      <td className="px-4 py-2.5 text-fg-muted">{po.reference ?? '—'}</td>
                      <td className="px-4 py-2.5">
                        <Badge variant={PO_STATUS[po.status]?.variant ?? 'neutral'}>
                          {PO_STATUS[po.status]?.label ?? po.status}
                        </Badge>
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-fg">
                        {po.currency} {po.totalFob.toLocaleString('es-AR')}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-fg-muted">{po.units}</td>
                      <td className="px-4 py-2.5 text-fg-muted">{formatDate(po.createdAtUtc)}</td>
                    </tr>
                  ))}
                {(data?.items ?? []).length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-10 text-center text-sm text-fg-muted">
                      <Ship className="mx-auto mb-2 h-6 w-6 opacity-50" />
                      Todavía no hay compras. Creá la primera con «Nueva compra».
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <Reposicion />
      )}
      <HelpLink id="compras" />
    </>
  );
}

// -------------------------------------------------------------- Reposición

function Reposicion() {
  const { store } = useStore();
  const [leadInput, setLeadInput] = useState('');
  const lead = Number(leadInput);
  const leadParam = leadInput !== '' && Number.isFinite(lead) && lead > 0 ? `?leadTimeDays=${lead}` : '';

  const { data } = useQuery({
    queryKey: ['reorder-suggestions', store?.id, leadParam],
    queryFn: () =>
      api.get<{ leadTimeDays: number; items: Suggestion[] }>(
        `/api/v1/purchasing/reorder-suggestions${leadParam}`,
      ),
    enabled: !!store,
  });

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-sm text-fg-muted">
        <span>
          Con lo vendido en 60 días y un lead time de{' '}
          <span className="font-medium text-fg">{data?.leadTimeDays ?? '…'} días</span>, esto se agota antes
          de que llegue el próximo embarque:
        </span>
        <Input
          type="number"
          min={1}
          placeholder="Ajustar días"
          className="h-8 w-28"
          value={leadInput}
          onChange={(e) => setLeadInput(e.target.value)}
        />
      </div>
      <div className={TABLE_CARD}>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-bg-subtle text-left text-fg-muted">
              <th className="px-4 py-2.5 font-medium">Producto</th>
              <th className="px-4 py-2.5 font-medium">SKU</th>
              <th className="px-4 py-2.5 text-right font-medium">Venta/día</th>
              <th className="px-4 py-2.5 text-right font-medium">Stock</th>
              <th className="px-4 py-2.5 text-right font-medium">Cobertura</th>
              <th className="px-4 py-2.5 text-right font-medium">Pedir</th>
            </tr>
          </thead>
          <tbody>
            {(data?.items ?? []).map((s) => (
              <tr key={s.variantId} className="border-b border-border last:border-b-0">
                <td className="px-4 py-2.5 text-fg">
                  {s.product}
                  {s.variant && <span className="text-fg-muted"> · {s.variant}</span>}
                </td>
                <td className="px-4 py-2.5 text-fg-subtle">{s.sku}</td>
                <td className="px-4 py-2.5 text-right tabular-nums text-fg-muted">{s.unitsPerDay}</td>
                <td className="px-4 py-2.5 text-right tabular-nums text-fg">{s.available}</td>
                <td className="px-4 py-2.5 text-right tabular-nums text-danger">{s.coverageDays} días</td>
                <td className="px-4 py-2.5 text-right tabular-nums font-semibold text-fg">
                  {s.suggestedQty} u
                </td>
              </tr>
            ))}
            {(data?.items ?? []).length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-sm text-fg-muted">
                  <Package className="mx-auto mb-2 h-6 w-6 opacity-50" />
                  Nada por reponer con este lead time: el stock cubre las ventas proyectadas.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ------------------------------------------------------- Detalle / creación

function PoEditor({ poId, onBack }: { poId: string | null; onBack: () => void }) {
  const { store } = useStore();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const confirm = useConfirm();

  const { data: po } = useQuery({
    queryKey: ['purchase-order', store?.id, poId],
    queryFn: () => api.get<PoDetail>(`/api/v1/purchasing/purchase-orders/${poId}`),
    enabled: !!store && !!poId,
  });

  const editable = poId === null || po?.status === 'DRAFT';

  // Form state (se hidrata del detalle una vez que llega).
  const [form, setForm] = useState<PoForm | null>(
    poId === null
      ? {
          supplierName: '',
          reference: '',
          notes: '',
          currency: 'USD',
          exchangeRate: '',
          leadTimeDays: '90',
          items: [],
          expenses: [],
        }
      : null,
  );

  if (poId !== null && po && form === null) {
    setForm({
      supplierName: po.supplierName,
      reference: po.reference ?? '',
      notes: po.notes ?? '',
      currency: po.currency,
      exchangeRate: String(po.exchangeRate),
      leadTimeDays: po.leadTimeDays != null ? String(po.leadTimeDays) : '',
      items: po.items.map((i) => ({
        variantId: i.variantId,
        label: `${i.productName}${i.variantDescription ? ` · ${i.variantDescription}` : ''}`,
        sku: i.sku,
        quantity: String(i.quantity),
        unitCost: String(i.unitCost),
      })),
      expenses: po.expenses.map((e) => ({ label: e.label, amount: String(e.amount), isLocal: e.isLocal })),
    });
  }

  const save = useMutation({
    mutationFn: (body: unknown) =>
      poId === null
        ? api.post<PoDetail>('/api/v1/purchasing/purchase-orders', body)
        : api.put<PoDetail>(`/api/v1/purchasing/purchase-orders/${poId}`, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['purchase-orders', store?.id] });
      queryClient.invalidateQueries({ queryKey: ['purchase-order', store?.id, poId] });
      toast('Compra guardada', { variant: 'success' });
      if (poId === null) onBack();
    },
    onError: (e) => toast(errMsg(e, 'No se pudo guardar la compra'), { variant: 'error' }),
  });

  const setStatus = useMutation({
    mutationFn: (status: string) =>
      api.post<PoDetail>(`/api/v1/purchasing/purchase-orders/${poId}/status`, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['purchase-orders', store?.id] });
      queryClient.invalidateQueries({ queryKey: ['purchase-order', store?.id, poId] });
      toast('Estado actualizado', { variant: 'success' });
    },
    onError: (e) => toast(errMsg(e, 'No se pudo cambiar el estado'), { variant: 'error' }),
  });

  const doSave = () => {
    if (!form) return;
    save.mutate({
      supplierName: form.supplierName,
      reference: form.reference || null,
      notes: form.notes || null,
      currency: form.currency,
      exchangeRate: Number(form.exchangeRate) > 0 ? Number(form.exchangeRate) : 1,
      leadTimeDays: form.leadTimeDays !== '' ? Number(form.leadTimeDays) : null,
      items: form.items.map((i) => ({
        variantId: i.variantId,
        quantity: Number(i.quantity) || 0,
        unitCost: Number(i.unitCost) || 0,
      })),
      expenses: form.expenses
        .filter((e) => e.label.trim() !== '')
        .map((e) => ({ label: e.label, amount: Number(e.amount) || 0, isLocal: e.isLocal })),
    });
  };

  const status = poId === null ? 'DRAFT' : (po?.status ?? 'DRAFT');
  const canReceive = po && !['DRAFT', 'RECEIVED', 'CANCELLED'].includes(po.status);

  return (
    <>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={onBack}>
            <ArrowLeft className="h-4 w-4" /> Compras
          </Button>
          <h1 className="text-xl font-semibold">
            {poId === null ? 'Nueva compra' : (po?.supplierName ?? '…')}
          </h1>
          <Badge variant={PO_STATUS[status]?.variant ?? 'neutral'}>
            {PO_STATUS[status]?.label ?? status}
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          {editable && form && (
            <Button onClick={doSave} loading={save.isPending}>
              Guardar
            </Button>
          )}
          {poId !== null &&
            (NEXT_STEPS[status] ?? []).map((next) => (
              <Button key={next} variant="secondary" onClick={() => setStatus.mutate(next)}>
                {PO_STATUS[next]?.label ?? next}
              </Button>
            ))}
          {canReceive && <ReceiveButton po={po!} onDone={onBack} />}
          {poId !== null && !['RECEIVED', 'CANCELLED'].includes(status) && (
            <Button
              variant="ghost"
              onClick={async () => {
                if (
                  await confirm({
                    title: '¿Cancelar esta compra?',
                    message: 'No impacta stock ni costos.',
                    confirmLabel: 'Cancelar OC',
                    variant: 'danger',
                  })
                )
                  setStatus.mutate('CANCELLED');
              }}
            >
              Cancelar OC
            </Button>
          )}
        </div>
      </div>

      {form && (
        <>
          <Card>
            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-fg">Proveedor</label>
                <Input
                  value={form.supplierName}
                  disabled={!editable}
                  onChange={(e) => setForm({ ...form, supplierName: e.target.value })}
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-fg">
                  Referencia (proforma / contenedor)
                </label>
                <Input
                  value={form.reference}
                  disabled={!editable}
                  onChange={(e) => setForm({ ...form, reference: e.target.value })}
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-fg">Lead time (días)</label>
                <Input
                  type="number"
                  min={0}
                  value={form.leadTimeDays}
                  disabled={!editable}
                  onChange={(e) => setForm({ ...form, leadTimeDays: e.target.value })}
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-fg">Moneda de la OC</label>
                <Select
                  value={form.currency}
                  disabled={!editable}
                  onChange={(e) => setForm({ ...form, currency: e.target.value })}
                  options={['USD', 'ARS', 'EUR', 'CNY'].map((c) => ({ value: c, label: c }))}
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-fg">{`Tipo de cambio (ARS por ${form.currency})`}</label>
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  value={form.exchangeRate}
                  disabled={!editable}
                  onChange={(e) => setForm({ ...form, exchangeRate: e.target.value })}
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-fg">Notas</label>
                <Input
                  value={form.notes}
                  disabled={!editable}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                />
              </div>
            </div>
          </Card>

          <ItemsEditor
            form={form}
            setForm={setForm}
            editable={editable}
            currency={form.currency}
            po={po ?? null}
          />
          <ExpensesEditor form={form} setForm={setForm} editable={editable} currency={form.currency} />

          {po && (
            <p className="text-xs text-fg-muted">
              FOB {po.currency} {po.totalFob.toLocaleString('es-AR')} · Gastos{' '}
              {formatMoney(Math.round(po.totalExpensesArs * 100))} · El «landed» por unidad ya prorratea los
              gastos del embarque por valor.
            </p>
          )}
        </>
      )}
    </>
  );
}

// --------------------------------------------------------- Ítems y gastos

function ItemsEditor({
  form,
  setForm,
  editable,
  currency,
  po,
}: {
  form: PoForm;
  setForm: Dispatch<SetStateAction<PoForm | null>>;
  editable: boolean;
  currency: string;
  po: PoDetail | null;
}) {
  const excluded = useMemo(() => new Set(form.items.map((i) => i.variantId)), [form.items]);
  const update = (patch: Partial<PoForm>) => setForm((f) => (f ? { ...f, ...patch } : f));
  const landedBy = new Map((po?.items ?? []).map((i) => [i.variantId, i.landedUnitCostArsMinor]));

  return (
    <Card>
      <h2 className="text-sm font-semibold text-fg">Ítems</h2>
      {editable && (
        <div className="mt-2">
          <VariantPicker
            placeholder="Buscar producto o SKU para agregar…"
            exclude={excluded}
            onPick={(m) =>
              update({
                items: [
                  ...form.items,
                  { variantId: m.variantId, label: m.label, sku: m.sku, quantity: '1', unitCost: '' },
                ],
              })
            }
          />
        </div>
      )}

      <table className="mt-3 w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left text-xs text-fg-muted">
            <th className="py-2 font-medium">Producto</th>
            <th className="py-2 font-medium">SKU</th>
            <th className="py-2 text-right font-medium">Cantidad</th>
            <th className="py-2 text-right font-medium">Costo unit. ({currency})</th>
            <th className="py-2 text-right font-medium">Landed (ARS)</th>
            {editable && <th className="py-2" />}
          </tr>
        </thead>
        <tbody>
          {form.items.map((item: FormItem, idx: number) => (
            <tr key={item.variantId} className="border-b border-border last:border-b-0">
              <td className="py-2 text-fg">{item.label}</td>
              <td className="py-2 text-fg-subtle">{item.sku}</td>
              <td className="py-2 text-right">
                <Input
                  type="number"
                  min={1}
                  className="ml-auto h-8 w-20 text-right"
                  value={item.quantity}
                  disabled={!editable}
                  onChange={(e) => {
                    const items = [...form.items];
                    items[idx] = { ...item, quantity: e.target.value };
                    update({ items });
                  }}
                />
              </td>
              <td className="py-2 text-right">
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  className="ml-auto h-8 w-24 text-right"
                  value={item.unitCost}
                  disabled={!editable}
                  onChange={(e) => {
                    const items = [...form.items];
                    items[idx] = { ...item, unitCost: e.target.value };
                    update({ items });
                  }}
                />
              </td>
              <td className="py-2 text-right tabular-nums text-fg-muted">
                {landedBy.has(item.variantId) ? formatMoney(landedBy.get(item.variantId)!) : '—'}
              </td>
              {editable && (
                <td className="py-2 text-right">
                  <button
                    type="button"
                    className="text-fg-subtle hover:text-danger"
                    onClick={() =>
                      update({ items: form.items.filter((_: FormItem, i: number) => i !== idx) })
                    }
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </td>
              )}
            </tr>
          ))}
          {form.items.length === 0 && (
            <tr>
              <td colSpan={6} className="py-6 text-center text-sm text-fg-muted">
                Sin ítems todavía.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </Card>
  );
}

function ExpensesEditor({
  form,
  setForm,
  editable,
  currency,
}: {
  form: PoForm;
  setForm: Dispatch<SetStateAction<PoForm | null>>;
  editable: boolean;
  currency: string;
}) {
  const update = (expenses: FormExpense[]) => setForm((f) => (f ? { ...f, expenses } : f));

  return (
    <Card>
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-fg">Gastos del embarque</h2>
        {editable && (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => update([...form.expenses, { label: '', amount: '', isLocal: false }])}
          >
            <Plus className="h-4 w-4" /> Gasto
          </Button>
        )}
      </div>
      <p className="mt-1 text-xs text-fg-muted">
        Flete, seguro, aranceles, despachante, IVA aduana… Se prorratean al costo de cada unidad.
      </p>
      <div className="mt-3 space-y-2">
        {form.expenses.map((e, idx) => (
          <div key={idx} className="flex items-center gap-2">
            <div className="min-w-0 flex-1">
              <Input
                placeholder="Concepto (ej. Flete marítimo)"
                value={e.label}
                disabled={!editable}
                onChange={(ev) => {
                  const expenses = [...form.expenses];
                  expenses[idx] = { ...e, label: ev.target.value };
                  update(expenses);
                }}
              />
            </div>
            <div className="w-32 shrink-0">
              <Input
                type="number"
                min={0}
                step="0.01"
                placeholder="Monto"
                className="text-right"
                value={e.amount}
                disabled={!editable}
                onChange={(ev) => {
                  const expenses = [...form.expenses];
                  expenses[idx] = { ...e, amount: ev.target.value };
                  update(expenses);
                }}
              />
            </div>
            <div className="w-28 shrink-0">
              <Select
                value={e.isLocal ? 'ars' : 'po'}
                disabled={!editable}
                onChange={(ev) => {
                  const expenses = [...form.expenses];
                  expenses[idx] = { ...e, isLocal: ev.target.value === 'ars' };
                  update(expenses);
                }}
                options={[
                  { value: 'po', label: currency },
                  { value: 'ars', label: 'ARS' },
                ]}
              />
            </div>
            {editable && (
              <button
                type="button"
                className="text-fg-subtle hover:text-danger"
                onClick={() => update(form.expenses.filter((_, i) => i !== idx))}
              >
                <Trash2 className="h-4 w-4" />
              </button>
            )}
          </div>
        ))}
        {form.expenses.length === 0 && <p className="text-sm text-fg-muted">Sin gastos cargados.</p>}
      </div>
    </Card>
  );
}

// ------------------------------------------------------------- Recepción

function ReceiveButton({ po, onDone }: { po: PoDetail; onDone: () => void }) {
  const { store } = useStore();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [qtys, setQtys] = useState<Record<string, string>>({});
  const [rate, setRate] = useState(String(po.exchangeRate));

  const onScan = useCallback(
    async (code: string) => {
      try {
        const found = await api.get<{ variantId: string }>(
          `/api/v1/products/by-code/${encodeURIComponent(code)}`,
        );
        const item = po.items.find((i) => i.variantId === found.variantId);
        if (!item) {
          toast('Ese producto no está en esta compra', { variant: 'error' });
          return;
        }
        setQtys((q) => {
          const current = Number(q[item.variantId] ?? 0);
          if (current >= item.quantity) return q;
          return { ...q, [item.variantId]: String(current + 1) };
        });
      } catch {
        toast('Código desconocido', { variant: 'error' });
      }
    },
    [po.items, toast],
  );
  const scanner = useScanner(onScan);

  const receive = useMutation({
    mutationFn: () =>
      api.post(`/api/v1/purchasing/purchase-orders/${po.id}/receive`, {
        exchangeRate: Number(rate) > 0 ? Number(rate) : null,
        items: po.items.map((i) => ({
          variantId: i.variantId,
          receivedQuantity: qtys[i.variantId] !== undefined ? Number(qtys[i.variantId]) : i.quantity,
        })),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['purchase-orders', store?.id] });
      queryClient.invalidateQueries({ queryKey: ['inventory', store?.id] });
      queryClient.invalidateQueries({ queryKey: ['variant-costs', store?.id] });
      toast('Compra recibida: stock actualizado y costos fijados al landed cost', { variant: 'success' });
      setOpen(false);
      onDone();
    },
    onError: (e) => toast(errMsg(e, 'No se pudo recibir la compra'), { variant: 'error' }),
  });

  return (
    <>
      <Button onClick={() => setOpen(true)}>Recibir</Button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-lg border border-border bg-surface p-5 shadow-card">
            <h2 className="text-base font-semibold text-fg">Recibir mercadería</h2>
            <p className="mt-1 text-sm text-fg-muted">
              Confirmá lo que llegó: el stock sube y el costo de cada variante queda fijado al landed cost con
              el tipo de cambio definitivo.
            </p>
            <label className="mt-3 block text-sm font-medium text-fg">{`Tipo de cambio definitivo (ARS por ${po.currency})`}</label>
            <Input
              type="number"
              min={0}
              step="0.01"
              className="mt-1"
              value={rate}
              onChange={(e) => setRate(e.target.value)}
            />
            <div className="mt-3">
              <CameraBox scanner={scanner} />
              <p className="mt-1 text-xs text-fg-muted">
                Escaneá lo que baja del contenedor: el contador de cada ítem sube solo (arranca en lo pedido —
                corregí a mano lo que falte).
              </p>
            </div>
            <div className="mt-3 max-h-64 space-y-2 overflow-y-auto">
              {po.items.map((i) => (
                <div key={i.variantId} className="flex items-center justify-between gap-3 text-sm">
                  <span className="min-w-0 flex-1 truncate text-fg">
                    {i.productName}
                    {i.variantDescription && <span className="text-fg-muted"> · {i.variantDescription}</span>}
                  </span>
                  <span className="text-xs text-fg-subtle">pedidas {i.quantity}</span>
                  <div className="w-20 shrink-0">
                    <Input
                      type="number"
                      min={0}
                      max={i.quantity}
                      className="h-8 text-right"
                      value={qtys[i.variantId] ?? String(i.quantity)}
                      onChange={(e) => setQtys((q) => ({ ...q, [i.variantId]: e.target.value }))}
                    />
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setOpen(false)}>
                Volver
              </Button>
              <Button onClick={() => receive.mutate()} loading={receive.isPending}>
                Confirmar recepción
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
