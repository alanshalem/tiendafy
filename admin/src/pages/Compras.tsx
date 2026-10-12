import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Package, Plus, Ship } from 'lucide-react';
import { Badge, Button, Card, Input, Select, Tabs, useConfirm, useToast } from '@tiendafy/ui';
import { useStore } from '../context/StoreContext';
import { api, errMsg } from '../lib/api';
import { formatDate, formatMoney, formatNumber } from '../lib/format';
import { HelpLink } from '../components/HelpLink';
import { NoStoreSelected } from '../components/NoStoreSelected';
import { TABLE_CARD, TABLE_HEAD_STICKY_SUBTLE } from '../lib/styles';
import { StatusLegend } from '../components/StatusLegend';
import { InfoDot } from '../components/charts';
import { Pagination, pageRangeLabel } from '../components/Pagination';
import { ListStats } from '../components/stats/ListStats';
import { useDebouncedValue } from '../lib/useDebouncedValue';
import { PO_PAGE_SIZE, PO_STATUS, NEXT_STEPS } from './compras-tipos';
import type { PoListItem, PoDetail, Suggestion, FormItem, PoForm, PurchasingSummary } from './compras-tipos';
import { VatBookDownload, SupplierInvoiceCard } from './compras-factura';
import { ItemsEditor } from './compras-items';
import { ExpensesEditor } from './compras-gastos';
import { ReceiveButton, SupplierField } from './compras-recepcion';

export function ComprasPage() {
  const { store } = useStore();
  const [view, setView] = useState<'list' | 'detail' | 'new'>('list');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // Items precargados al armar una OC desde las sugerencias de reposición.
  const [draftItems, setDraftItems] = useState<FormItem[] | null>(null);

  if (!store) return <NoStoreSelected />;

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      {view === 'list' && (
        <ComprasList
          onNew={(items) => {
            setDraftItems(items ?? null);
            setView('new');
          }}
          onOpen={(id) => {
            setSelectedId(id);
            setView('detail');
          }}
        />
      )}
      {view === 'new' && (
        <PoEditor poId={null} initialItems={draftItems ?? undefined} onBack={() => setView('list')} />
      )}
      {view === 'detail' && selectedId && <PoEditor poId={selectedId} onBack={() => setView('list')} />}
    </div>
  );
}

// ------------------------------------------------------------------- Lista

function ComprasList({
  onNew,
  onOpen,
}: {
  onNew: (items?: FormItem[]) => void;
  onOpen: (id: string) => void;
}) {
  const { store } = useStore();
  const [tab, setTab] = useState('ordenes');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  const [page, setPage] = useState(1);
  // Grupo de estados que prendió una métrica: "abiertas" o "en camino" no son
  // un estado sino varios, así que no entran en el desplegable de estado.
  const [group, setGroup] = useState<'' | 'open' | 'inTransit' | 'invoiceMissing'>('');
  const debouncedSearch = useDebouncedValue(search, 350).trim();

  // Búsqueda, estado y grupo se resuelven en la base: filtrar en el navegador
  // solo alcanzaba a las 25 órdenes de la página visible.
  const { data } = useQuery({
    queryKey: ['purchase-orders', store?.id, page, debouncedSearch, statusFilter, group],
    queryFn: () => {
      const params = new URLSearchParams({
        limit: String(PO_PAGE_SIZE),
        offset: String((page - 1) * PO_PAGE_SIZE),
      });
      if (debouncedSearch) params.set('q', debouncedSearch);
      if (statusFilter) params.set('status', statusFilter);
      if (group) params.set('group', group);
      return api.get<{ items: PoListItem[]; total: number }>(`/api/v1/purchasing/purchase-orders?${params}`);
    },
    enabled: !!store,
    placeholderData: (previous) => previous,
  });

  // Un grupo y un estado suelto se pisan: prender uno limpia el otro.
  const toggleGroup = (next: 'open' | 'inTransit' | 'invoiceMissing') => {
    setGroup((current) => (current === next ? '' : next));
    setStatusFilter('');
    setPage(1);
  };
  const totalPages = Math.max(1, Math.ceil((data?.total ?? 0) / PO_PAGE_SIZE));

  // Sobre TODAS las órdenes, no sobre la página: cuánta plata está comprometida
  // en mercadería que todavía no llegó es la pregunta que abre esta pantalla.
  const { data: summary } = useQuery({
    queryKey: ['purchasing-summary', store?.id],
    queryFn: () => api.get<PurchasingSummary>('/api/v1/purchasing/summary'),
    enabled: !!store,
  });

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-[18rem] flex-1">
          <h1 className="text-xl font-semibold">Compras e importaciones</h1>
          <p className="mt-0.5 text-sm text-fg-muted">
            Órdenes de compra a proveedores, ciclo de importación y landed cost: el costo real de cada unidad
            puesta en el depósito alimenta Rentabilidad.
          </p>
          {(data?.total ?? 0) > 0 && (
            <p className="mt-1 text-xs text-fg-subtle">
              {pageRangeLabel(page, PO_PAGE_SIZE, data!.total, data!.total === 1 ? 'compra' : 'compras')}
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <VatBookDownload />
          <Button onClick={() => onNew()}>
            <Plus className="h-4 w-4" /> Nueva compra
          </Button>
        </div>
      </div>

      {summary && summary.total > 0 && (
        <ListStats
          items={[
            {
              label: 'Órdenes abiertas',
              value: formatNumber(summary.open),
              hint: `Todo lo que todavía no se recibió ni se canceló, de ${formatNumber(summary.total)} órdenes en total.`,
              onClick: () => toggleGroup('open'),
              active: group === 'open',
            },
            {
              label: 'En camino',
              value: formatNumber(summary.inTransit),
              hint: 'Órdenes en tránsito o en aduana: mercadería embarcada que aún no entró al depósito.',
              onClick: () => toggleGroup('inTransit'),
              active: group === 'inTransit',
            },
            {
              label: 'Plata comprometida',
              value: `${summary.currency} ${formatNumber(summary.committedFob, { maximumFractionDigits: 0 })}`,
              hint: 'FOB de las órdenes abiertas: lo pactado con proveedores por mercadería que todavía no llegó. No incluye flete ni impuestos.',
            },
            {
              label: 'Recibidas sin factura',
              value: formatNumber(summary.withoutInvoice),
              hint: 'Compras ya recibidas a las que les falta cargar la factura del proveedor: no entran al libro de IVA.',
              tone: summary.withoutInvoice > 0 ? 'warning' : 'default',
              onClick: () => toggleGroup('invoiceMissing'),
              active: group === 'invoiceMissing',
            },
          ]}
        />
      )}

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
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
              />
            </div>
            {/* Ancho por wrapper: acá el control comparte fila con el buscador,
                así que el que manda es el layout, no el control. */}
            <div className="w-44 shrink-0">
              <Select
                aria-label="Filtrar por estado"
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value);
                  setGroup('');
                  setPage(1);
                }}
                options={[
                  { value: '', label: 'Todos los estados' },
                  ...Object.entries(PO_STATUS).map(([value, s]) => ({ value, label: s.label })),
                ]}
              />
            </div>
          </div>
          <StatusLegend
            flow
            items={[
              { dot: 'bg-gray-400', text: 'Borrador' },
              { dot: 'bg-info', text: 'Confirmada' },
              { dot: 'bg-info', text: 'En producción' },
              { dot: 'bg-warning', text: 'En tránsito' },
              { dot: 'bg-warning', text: 'En aduana' },
              { dot: 'bg-success', text: 'Recibida (sube stock y fija costos)' },
            ]}
          />
          <div className={TABLE_CARD}>
            <table className="w-full text-sm">
              <thead className={TABLE_HEAD_STICKY_SUBTLE}>
                <tr className="border-b border-border bg-bg-subtle text-left text-fg-muted">
                  <th className="px-4 py-2.5 font-medium">Proveedor</th>
                  <th className="px-4 py-2.5 font-medium">Referencia</th>
                  <th className="px-4 py-2.5 font-medium">Estado</th>
                  <th className="px-4 py-2.5 text-right font-medium">
                    <span className="inline-flex items-center gap-1">
                      FOB{' '}
                      <InfoDot info="Lo que cobra el proveedor por la mercadería, sin flete, seguro ni impuestos." />
                    </span>
                  </th>
                  <th className="px-4 py-2.5 text-right font-medium">Unidades</th>
                  <th className="px-4 py-2.5 font-medium">Creada</th>
                </tr>
              </thead>
              <tbody>
                {(data?.items ?? []).map((po) => (
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
                      {po.currency} {formatNumber(po.totalFob)}
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
          <Pagination page={page} totalPages={totalPages} onPage={setPage} />
        </>
      ) : (
        <Reposicion onCreateOrder={(items) => onNew(items)} />
      )}
      <HelpLink id="compras" />
    </>
  );
}

// -------------------------------------------------------------- Reposición

function Reposicion({ onCreateOrder }: { onCreateOrder: (items: FormItem[]) => void }) {
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

  const suggestions = data?.items ?? [];
  const buildOrder = () =>
    onCreateOrder(
      suggestions.map((s) => ({
        variantId: s.variantId,
        label: s.variant ? `${s.product} · ${s.variant}` : s.product,
        sku: s.sku,
        quantity: String(s.suggestedQty),
        unitCost: '',
      })),
    );

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-sm text-fg-muted">
        <span>
          Con lo vendido en 60 días y un lead time de{' '}
          <span className="font-medium text-fg">{data?.leadTimeDays ?? '…'} días</span>, esto se agota antes
          de que llegue el próximo embarque:
        </span>
        <div className="w-28 shrink-0">
          <Input
            compact
            type="number"
            min={1}
            placeholder="Ajustar días"
            value={leadInput}
            onChange={(e) => setLeadInput(e.target.value)}
          />
        </div>
        {suggestions.length > 0 && (
          <Button className="ml-auto shrink-0" onClick={buildOrder}>
            <Plus className="h-4 w-4" /> Armar orden de compra ({suggestions.length})
          </Button>
        )}
      </div>
      <div className={TABLE_CARD}>
        <table className="w-full text-sm">
          <thead className={TABLE_HEAD_STICKY_SUBTLE}>
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

function PoEditor({
  poId,
  initialItems,
  onBack,
}: {
  poId: string | null;
  initialItems?: FormItem[];
  onBack: () => void;
}) {
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
          supplierId: '',
          supplierName: '',
          reference: '',
          notes: '',
          currency: 'USD',
          exchangeRate: '',
          leadTimeDays: '90',
          items: initialItems ?? [],
          expenses: [],
        }
      : null,
  );

  if (poId !== null && po && form === null) {
    setForm({
      supplierId: po.supplierId ?? '',
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
      supplierId: form.supplierId || null,
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
              <SupplierField
                supplierId={form.supplierId}
                supplierName={form.supplierName}
                disabled={!editable}
                onChange={(supplierId, supplierName) => setForm({ ...form, supplierId, supplierName })}
              />
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
          {po && <SupplierInvoiceCard po={po} />}

          {po && (
            <p className="text-xs text-fg-muted">
              FOB {po.currency} {formatNumber(po.totalFob)} · Gastos{' '}
              {formatMoney(Math.round(po.totalExpensesArs * 100))} · El «landed» por unidad ya prorratea los
              gastos del embarque por valor.
            </p>
          )}
        </>
      )}
    </>
  );
}

// ------------------------------------------- Comprobante del proveedor (IVA)

/**
 * Libro de IVA compras del mes: el crédito fiscal de lo que se compró, en el
 * mismo formato que el libro de ventas. Entran las compras que tienen cargado
 * el comprobante del proveedor.
 */
