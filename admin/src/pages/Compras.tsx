import { useState, useId } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Package, Plus, Ship } from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  clickableRowProps,
  cn,
  Input,
  Select,
  Tabs,
  useConfirm,
  useToast,
  PageHeader,
  SearchInput,
} from '@tiendafy/ui';
import { useStore } from '../context/StoreContext';
import { api, errMsg } from '../lib/api';
import { formatAmount, formatDate, formatMoney, formatNumber } from '../lib/format';
import { HelpLink } from '../components/HelpLink';
import { NoStoreSelected } from '../components/NoStoreSelected';
import { TABLE_CARD, TABLE_HEAD_STICKY_SUBTLE, TABLE_SCROLL_X } from '../lib/styles';
import { StatusLegend } from '../components/StatusLegend';
import { InfoDot } from '../components/charts';
import { Pagination, pageRangeLabel } from '../components/Pagination';
import { ListStats } from '../components/stats/ListStats';
import { useListParams, useListSearch, useRecordParam } from '../lib/useListParams';
import { useUnsavedChanges } from '../lib/useUnsavedChanges';
import { PO_PAGE_SIZE, PO_STATUS, NEXT_STEPS } from './compras-tipos';
import type { PoListItem, PoDetail, Suggestion, FormItem, PoForm, PurchasingSummary } from './compras-tipos';
import { VatBookDownload, SupplierInvoiceCard } from './compras-factura';
import { ItemsEditor } from './compras-items';
import { ExpensesEditor } from './compras-gastos';
import { ReceiveButton, SupplierField } from './compras-recepcion';

/** Valor de `?orden=` para una compra que se está armando. */
const NEW_PO = 'nueva';

export function ComprasPage() {
  const { store } = useStore();
  // La compra abierta va en la URL (?orden=<id>): Atrás vuelve a la lista en
  // vez de salir de Compras, recargar no la cierra y se puede linkear (la
  // ficha de un proveedor lleva directo a cada una de sus compras).
  const record = useRecordParam('orden');
  // Items precargados al armar una OC desde las sugerencias de reposición
  // (acá mismo o desde Productos › Stock bajo, que los manda en el state).
  const location = useLocation();
  const [draftItems, setDraftItems] = useState<FormItem[] | null>(
    () => (location.state as { draftItems?: FormItem[] } | null)?.draftItems ?? null,
  );

  if (!store) return <NoStoreSelected />;

  return (
    <div className="space-y-4">
      {!record.id && (
        <ComprasList
          onNew={(items) => {
            setDraftItems(items ?? null);
            record.open(NEW_PO);
          }}
          recordLink={(id) => ({ search: record.searchFor(id), state: record.linkState })}
          onOpen={record.open}
        />
      )}
      {record.id === NEW_PO && (
        <PoEditor poId={null} initialItems={draftItems ?? undefined} onBack={record.close} />
      )}
      {record.id && record.id !== NEW_PO && (
        <PoEditor key={record.id} poId={record.id} onBack={record.close} />
      )}
    </div>
  );
}

// ------------------------------------------------------------------- Lista

/** Pestaña, búsqueda, estado, grupo y página, en la URL (ver useListParams). */
const LIST_DEFAULTS = { vista: 'ordenes', q: '', estado: '', grupo: '', pagina: 1 };
type PoGroup = '' | 'open' | 'inTransit' | 'invoiceMissing';
const GROUPS: readonly string[] = ['open', 'inTransit', 'invoiceMissing'];

function ComprasList({
  onNew,
  onOpen,
  recordLink,
}: {
  onNew: (items?: FormItem[]) => void;
  onOpen: (id: string) => void;
  /** Adónde lleva el link de cada compra (la misma lista con ?orden=<id>). */
  recordLink: (id: string) => { search: string; state: unknown };
}) {
  const { store } = useStore();
  const list = useListParams(LIST_DEFAULTS);
  const [search, setSearch] = useListSearch(list);
  const tab = list.values.vista === 'reposicion' ? 'reposicion' : 'ordenes';
  const setTab = (vista: string) => list.set({ vista });
  const statusFilter = list.values.estado;
  const page = list.values.pagina;
  const setPage = (p: number) => list.set({ pagina: p });
  // Grupo de estados que prendió una métrica: "abiertas" o "en camino" no son
  // un estado sino varios, así que no entran en el desplegable de estado.
  const group = (GROUPS.includes(list.values.grupo) ? list.values.grupo : '') as PoGroup;
  const debouncedSearch = list.values.q.trim();

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
    placeholderData: keepPreviousData,
  });

  // Un grupo y un estado suelto se pisan: prender uno limpia el otro.
  const toggleGroup = (next: Exclude<PoGroup, ''>) =>
    list.set({ grupo: group === next ? '' : next, estado: '' });
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
      <PageHeader
        title="Compras e importaciones"
        subtitle="Órdenes de compra a proveedores, ciclo de importación y landed cost: el costo real de cada unidad puesta en el depósito alimenta Rentabilidad."
        count={
          (data?.total ?? 0) > 0 &&
          pageRangeLabel(page, PO_PAGE_SIZE, data!.total, data!.total === 1 ? 'compra' : 'compras')
        }
        actions={
          <>
            <VatBookDownload />
            <Button onClick={() => onNew()}>
              <Plus className="h-4 w-4" /> Nueva compra
            </Button>
          </>
        }
      />

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
              hint: 'Compras ya recibidas a las que les falta cargar la factura del proveedor: no entran al libro de IVA compras.',
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
              <SearchInput
                aria-label="Buscar compras"
                placeholder="Buscar por proveedor o referencia…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            {/* Ancho por wrapper: acá el control comparte fila con el buscador,
                así que el que manda es el layout, no el control. */}
            <div className="w-44 shrink-0">
              <Select
                aria-label="Filtrar por estado"
                value={statusFilter}
                onChange={(e) => list.set({ estado: e.target.value, grupo: '' })}
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
              { dot: 'bg-fg-subtle', text: 'Borrador' },
              { dot: 'bg-info', text: 'Confirmada' },
              { dot: 'bg-info', text: 'En producción' },
              { dot: 'bg-warning', text: 'En tránsito' },
              { dot: 'bg-warning', text: 'En aduana' },
              { dot: 'bg-success', text: 'Recibida (sube stock y fija costos)' },
            ]}
          />
          <div className={TABLE_CARD}>
            <div className={TABLE_SCROLL_X}>
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
                  {(data?.items ?? []).map((po) => {
                    // El nombre es un link de verdad (Tab, Enter, abrir en otra
                    // pestaña); el resto de la fila responde al mouse.
                    const row = clickableRowProps(() => onOpen(po.id), { focusable: false });
                    const link = recordLink(po.id);
                    return (
                      <tr
                        key={po.id}
                        {...row}
                        className={cn(
                          'border-b border-border last:border-b-0 hover:bg-bg-subtle',
                          row.className,
                        )}
                      >
                        <td className="px-4 py-2.5 font-medium text-fg">
                          <Link to={{ search: link.search }} state={link.state} className="hover:underline">
                            {po.supplierName}
                          </Link>
                        </td>
                        <td className="px-4 py-2.5 text-fg-muted">{po.reference ?? '—'}</td>
                        <td className="px-4 py-2.5">
                          <Badge variant={PO_STATUS[po.status]?.variant ?? 'neutral'}>
                            {PO_STATUS[po.status]?.label ?? po.status}
                          </Badge>
                        </td>
                        <td className="px-4 py-2.5 text-right tabular-nums text-fg">
                          {formatAmount(po.totalFob, po.currency)}
                        </td>
                        <td className="px-4 py-2.5 text-right tabular-nums text-fg-muted">{po.units}</td>
                        <td className="px-4 py-2.5 text-fg-muted">{formatDate(po.createdAtUtc)}</td>
                      </tr>
                    );
                  })}
                  {(data?.items ?? []).length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-4 py-10 text-center text-sm text-fg-muted">
                        <Ship className="mx-auto mb-2 h-6 w-6 opacity-50" />
                        {list.filtered ? (
                          <>
                            Ninguna compra coincide con la búsqueda o el filtro.{' '}
                            <button
                              type="button"
                              onClick={() => list.set({ q: '', estado: '', grupo: '' })}
                              className="font-medium text-primary hover:underline"
                            >
                              Limpiar
                            </button>
                          </>
                        ) : (
                          'Todavía no hay compras. Creá la primera con «Nueva compra».'
                        )}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
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
            aria-label="Lead time en días"
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
        <div className={TABLE_SCROLL_X}>
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
    </div>
  );
}

// ------------------------------------------------------- Detalle / creación

const EMPTY_FORM: PoForm = {
  supplierId: '',
  supplierName: '',
  reference: '',
  notes: '',
  currency: 'USD',
  exchangeRate: '',
  leadTimeDays: '90',
  items: [],
  expenses: [],
};

function toForm(po: PoDetail): PoForm {
  return {
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
  };
}

/** Lo que cuenta para "hay cambios": los datos, no el orden de las claves ni las etiquetas. */
function formKey(f: PoForm): string {
  return JSON.stringify([
    f.supplierId,
    f.supplierName,
    f.reference,
    f.notes,
    f.currency,
    f.exchangeRate,
    f.leadTimeDays,
    f.items.map((i) => [i.variantId, i.quantity, i.unitCost]),
    f.expenses.map((e) => [e.label, e.amount, e.isLocal]),
  ]);
}

function toBody(form: PoForm) {
  return {
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
  };
}

function PoEditor({
  poId,
  initialItems,
  onBack,
}: {
  poId: string | null;
  initialItems?: FormItem[];
  onBack: () => void;
}) {
  const fid = useId();
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

  // Form state (se hidrata del detalle una vez que llega). `saved` es lo que
  // tiene el servidor (o el form vacío, si es nueva): contra eso se mide si
  // hay cambios sin guardar.
  const [form, setForm] = useState<PoForm | null>(
    poId === null ? { ...EMPTY_FORM, items: initialItems ?? [] } : null,
  );
  const [saved, setSaved] = useState<PoForm | null>(poId === null ? EMPTY_FORM : null);

  if (poId !== null && po && form === null) {
    const fresh = toForm(po);
    setForm(fresh);
    setSaved(fresh);
  }

  const dirty = editable && !!form && !!saved && formKey(form) !== formKey(saved);
  // Cerrar la compra (volver, «Atrás», otra pantalla) con cambios pregunta.
  const leave = useUnsavedChanges(dirty, { param: 'orden' });

  /**
   * Después de guardar o cambiar de estado, el form muestra lo que quedó en
   * el servidor: si no, una orden ya confirmada (y de solo lectura) seguía
   * mostrando lo que se había tipeado como si fuera suyo.
   */
  const showServerTruth = async () => {
    queryClient.invalidateQueries({ queryKey: ['purchase-orders', store?.id] });
    await queryClient.invalidateQueries({ queryKey: ['purchase-order', store?.id, poId] });
    const fresh = queryClient.getQueryData<PoDetail>(['purchase-order', store?.id, poId]);
    if (fresh?.items) {
      setForm(toForm(fresh));
      setSaved(toForm(fresh));
    }
  };

  const save = useMutation({
    mutationFn: (current: PoForm) =>
      poId === null
        ? api.post<PoDetail>('/api/v1/purchasing/purchase-orders', toBody(current))
        : api.put<PoDetail>(`/api/v1/purchasing/purchase-orders/${poId}`, toBody(current)),
    onSuccess: async () => {
      toast('Compra guardada', { variant: 'success' });
      if (poId === null) {
        queryClient.invalidateQueries({ queryKey: ['purchase-orders', store?.id] });
        leave(onBack);
        return;
      }
      await showServerTruth();
    },
    onError: (e) => toast(errMsg(e, 'No se pudo guardar la compra'), { variant: 'error' }),
  });

  const setStatus = useMutation({
    mutationFn: async (next: string) => {
      // Confirmar un borrador con cambios sin guardar los guarda primero: la
      // orden pasa a solo lectura y esos cambios se perdían sin aviso. Si el
      // guardado falla, el estado no cambia. Cancelar, en cambio, descarta.
      if (dirty && form && next !== 'CANCELLED') {
        await api.put<PoDetail>(`/api/v1/purchasing/purchase-orders/${poId}`, toBody(form));
        setSaved(form);
      }
      return api.post<PoDetail>(`/api/v1/purchasing/purchase-orders/${poId}/status`, { status: next });
    },
    onSuccess: async () => {
      toast('Estado actualizado', { variant: 'success' });
      await showServerTruth();
    },
    onError: (e) => toast(errMsg(e, 'No se pudo cambiar el estado'), { variant: 'error' }),
  });

  const doSave = () => {
    if (form) save.mutate(form);
  };

  const busy = save.isPending || setStatus.isPending;
  const status = poId === null ? 'DRAFT' : (po?.status ?? 'DRAFT');
  const canReceive = po && !['DRAFT', 'RECEIVED', 'CANCELLED'].includes(po.status);

  return (
    <>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={onBack}>
            <ArrowLeft className="h-4 w-4" /> Compras
          </Button>
          <h1 className="text-2xl font-bold text-fg">
            {poId === null ? 'Nueva compra' : (po?.supplierName ?? '…')}
          </h1>
          <Badge variant={PO_STATUS[status]?.variant ?? 'neutral'}>
            {PO_STATUS[status]?.label ?? status}
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          {editable && form && (
            <Button onClick={doSave} loading={save.isPending} disabled={setStatus.isPending}>
              Guardar
            </Button>
          )}
          {poId !== null &&
            (NEXT_STEPS[status] ?? []).map((next) => (
              <Button
                key={next}
                variant="secondary"
                disabled={busy}
                loading={setStatus.isPending && setStatus.variables === next}
                title={dirty ? 'Guarda los cambios y después cambia el estado' : undefined}
                onClick={() => setStatus.mutate(next)}
              >
                {PO_STATUS[next]?.label ?? next}
              </Button>
            ))}
          {canReceive && <ReceiveButton po={po!} onDone={onBack} />}
          {poId !== null && !['RECEIVED', 'CANCELLED'].includes(status) && (
            <Button
              variant="ghost"
              disabled={busy}
              onClick={async () => {
                if (
                  await confirm({
                    title: '¿Cancelar esta compra?',
                    message: dirty
                      ? 'No impacta stock ni costos. Los cambios sin guardar se descartan.'
                      : 'No impacta stock ni costos.',
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
                <label htmlFor={`${fid}-1`} className="mb-1.5 block text-sm font-medium text-fg">
                  Referencia (proforma / contenedor)
                </label>
                <Input
                  id={`${fid}-1`}
                  aria-label="Referencia (proforma / contenedor)"
                  value={form.reference}
                  disabled={!editable}
                  onChange={(e) => setForm({ ...form, reference: e.target.value })}
                />
              </div>
              <div>
                <label htmlFor={`${fid}-2`} className="mb-1.5 block text-sm font-medium text-fg">
                  Lead time (días)
                </label>
                <Input
                  id={`${fid}-2`}
                  aria-label="Lead time (días)"
                  type="number"
                  min={0}
                  value={form.leadTimeDays}
                  disabled={!editable}
                  onChange={(e) => setForm({ ...form, leadTimeDays: e.target.value })}
                />
              </div>
              <div>
                <label htmlFor={`${fid}-3`} className="mb-1.5 block text-sm font-medium text-fg">
                  Moneda de la OC
                </label>
                <Select
                  id={`${fid}-3`}
                  aria-label="Moneda de la OC"
                  value={form.currency}
                  disabled={!editable}
                  onChange={(e) => setForm({ ...form, currency: e.target.value })}
                  options={['USD', 'ARS', 'EUR', 'CNY'].map((c) => ({ value: c, label: c }))}
                />
              </div>
              <div>
                <label
                  htmlFor={`${fid}-4`}
                  className="mb-1.5 block text-sm font-medium text-fg"
                >{`Tipo de cambio (ARS por ${form.currency})`}</label>
                <Input
                  id={`${fid}-4`}
                  aria-label={`Tipo de cambio (ARS por ${form.currency})`}
                  type="number"
                  min={0}
                  step="0.01"
                  value={form.exchangeRate}
                  disabled={!editable}
                  onChange={(e) => setForm({ ...form, exchangeRate: e.target.value })}
                />
              </div>
              <div>
                <label htmlFor={`${fid}-5`} className="mb-1.5 block text-sm font-medium text-fg">
                  Notas
                </label>
                <Input
                  id={`${fid}-5`}
                  aria-label="Notas"
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
              FOB {formatAmount(po.totalFob, po.currency)} · Gastos{' '}
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
