import { useMemo, useState } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, FileText, Plus, Printer, Trash2 } from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  clickableRowProps,
  cn,
  FormField,
  Input,
  Modal,
  Select,
  Textarea,
  useConfirm,
  useToast,
  type BadgeVariant,
  EmptyList,
} from '@tiendafy/ui';
import { useStore } from '../context/StoreContext';
import { api, errMsg } from '../lib/api';
import { formatDate, formatMoney, formatPercent } from '../lib/format';
import { NoStoreSelected } from '../components/NoStoreSelected';
import { VariantPicker } from '../components/VariantPicker';
import { HelpLink } from '../components/HelpLink';
import { Pagination, pageRangeLabel } from '../components/Pagination';
import { TABLE_CARD, TABLE_HEAD_STICKY, TABLE_SCROLL_X } from '../lib/styles';
import { ListStats } from '../components/stats/ListStats';
import { useDebouncedValue } from '../lib/useDebouncedValue';
import { useListParams, useListSearch, useRecordParam } from '../lib/useListParams';
import { replaceAt } from '../lib/arrays';
import { useUnsavedChanges } from '../lib/useUnsavedChanges';
import { parseMoneyInput } from '../lib/price';

// ---------------------------------------------------------------- Tipos wire

type QuoteStatus = 'draft' | 'sent' | 'accepted' | 'rejected';

interface QuoteRow {
  id: string;
  number: string;
  status: QuoteStatus;
  expired: boolean;
  customerId: string | null;
  customerName: string;
  validUntilUtc: string;
  totalMinor: number;
  currency: string;
  items: number;
  createdAtUtc: string;
  convertedOrderId: string | null;
}

interface QuoteItem {
  variantId: string;
  productName: string;
  variantDescription: string;
  sku: string;
  unitPriceMinor: number;
  quantity: number;
  lineTotalMinor: number;
}

interface QuoteDetail extends Omit<QuoteRow, 'items'> {
  customerEmail: string | null;
  editable: boolean;
  notes: string | null;
  rejectionReason: string | null;
  sentAtUtc: string | null;
  decidedAtUtc: string | null;
  subtotalMinor: number;
  discountMinor: number;
  items: QuoteItem[];
}

interface QuoteSummary {
  total: number;
  open: number;
  expired: number;
  accepted: number;
  rejected: number;
  conversionPercent: number;
  openAmountMinor: number;
  currency: string;
}

const STATUS: Record<QuoteStatus, { label: string; variant: BadgeVariant }> = {
  draft: { label: 'Borrador', variant: 'neutral' },
  sent: { label: 'Enviado', variant: 'info' },
  accepted: { label: 'Aceptado', variant: 'success' },
  rejected: { label: 'Rechazado', variant: 'danger' },
};

const PAGE_SIZE = 25;

/** Hoy + n días, en el formato que quiere un <input type="date">. */
function inDays(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Valor de `?presupuesto=` para uno que se está armando. */
const NEW_QUOTE = 'nuevo';

export function PresupuestosPage() {
  const { store } = useStore();
  // El presupuesto abierto va en la URL: Atrás vuelve a la lista, recargar no
  // lo cierra y se puede mandar el link a alguien del equipo.
  const record = useRecordParam('presupuesto');

  if (!store) return <NoStoreSelected />;

  return (
    <div className="space-y-4">
      {!record.id ? (
        <QuoteList
          onNew={() => record.open(NEW_QUOTE)}
          onOpen={record.open}
          recordLink={(id) => ({ search: record.searchFor(id), state: record.linkState })}
        />
      ) : (
        <QuoteEditor key={record.id} id={record.id === NEW_QUOTE ? null : record.id} onBack={record.close} />
      )}
    </div>
  );
}

// ------------------------------------------------------------------- Listado

/** Búsqueda, estado y página, en la URL (ver useListParams). */
const LIST_DEFAULTS = { q: '', estado: '', pagina: 1 };

function QuoteList({
  onNew,
  onOpen,
  recordLink,
}: {
  onNew: () => void;
  onOpen: (id: string) => void;
  /** Adónde lleva el link de cada presupuesto (la misma lista con ?presupuesto=<id>). */
  recordLink: (id: string) => { search: string; state: unknown };
}) {
  const { store } = useStore();
  const list = useListParams(LIST_DEFAULTS);
  const [search, setSearch] = useListSearch(list, 'q', 300);
  const status = list.values.estado;
  const page = list.values.pagina;
  const setPage = (p: number) => list.set({ pagina: p });
  const debounced = list.values.q.trim();

  const { data } = useQuery({
    queryKey: ['quotes', store?.id, debounced, status, page],
    queryFn: () => {
      const params = new URLSearchParams({
        limit: String(PAGE_SIZE),
        offset: String((page - 1) * PAGE_SIZE),
      });
      if (debounced) params.set('q', debounced);
      if (status) params.set('status', status);
      return api.get<{ items: QuoteRow[]; total: number }>(`/api/v1/quotes?${params}`);
    },
    enabled: !!store,
    placeholderData: keepPreviousData,
  });

  const { data: summary } = useQuery({
    queryKey: ['quotes-summary', store?.id],
    queryFn: () => api.get<QuoteSummary>('/api/v1/quotes/summary'),
    enabled: !!store,
  });

  const rows = data?.items ?? [];
  const totalPages = Math.max(1, Math.ceil((data?.total ?? 0) / PAGE_SIZE));

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-[18rem] flex-1">
          <h1 className="text-xl font-semibold">Presupuestos</h1>
          <p className="mt-0.5 text-sm text-fg-muted">
            Los precios que le pasás a un cliente antes de que compre. Si lo acepta, la venta se genera con
            los precios que cotizaste — no con los de hoy.
          </p>
          {(data?.total ?? 0) > 0 && (
            <p className="mt-1 text-xs text-fg-subtle">
              {pageRangeLabel(
                page,
                PAGE_SIZE,
                data!.total,
                data!.total === 1 ? 'presupuesto' : 'presupuestos',
              )}
            </p>
          )}
        </div>
        <Button onClick={onNew}>
          <Plus className="h-4 w-4" /> Nuevo presupuesto
        </Button>
      </div>

      {summary && summary.total > 0 && (
        <ListStats
          items={[
            {
              label: 'Abiertos',
              value: String(summary.open),
              hint: 'Presupuestos vigentes esperando respuesta.',
              onClick: () => list.set({ estado: status === 'sent' ? '' : 'sent' }),
              active: status === 'sent',
            },
            {
              label: 'En juego',
              value: formatMoney(summary.openAmountMinor, summary.currency),
              hint: 'Cuánta plata suman los presupuestos que siguen vigentes.',
            },
            {
              label: 'Vencidos',
              value: String(summary.expired),
              tone: summary.expired > 0 ? 'warning' : 'default',
              hint: 'Pasó la fecha de validez: para cerrarlos hay que revisar los precios y extenderla.',
            },
            {
              label: 'Conversión',
              value: formatPercent(summary.conversionPercent),
              tone: summary.conversionPercent >= 50 ? 'success' : 'default',
              hint: 'De los presupuestos ya decididos, cuántos terminaron en venta. Los que siguen abiertos no cuentan.',
            },
          ]}
        />
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Input
          type="search"
          aria-label="Buscar presupuestos"
          className="w-64"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por cliente o número..."
        />
        <Select
          aria-label="Filtrar por estado"
          className="w-44"
          value={status}
          onChange={(e) => list.set({ estado: e.target.value })}
          placeholder="Todos los estados"
          options={Object.entries(STATUS).map(([value, s]) => ({ value, label: s.label }))}
        />
      </div>

      {rows.length === 0 ? (
        <EmptyList
          icon={<FileText />}
          title={debounced || status ? 'Ningún presupuesto coincide' : 'Todavía no hiciste presupuestos'}
        >
          {!debounced &&
            !status &&
            'Sirve para cotizarle a un revendedor y que, cuando conteste que sí, la venta salga sola con esos precios. Si el cliente tiene lista de precios asignada, los precios se cargan de ahí.'}
        </EmptyList>
      ) : (
        <div className={TABLE_CARD}>
          <div className={TABLE_SCROLL_X}>
            <table className="w-full text-sm">
              <thead className={TABLE_HEAD_STICKY}>
                <tr className="text-left text-xs uppercase tracking-wide text-fg-muted">
                  <th className="px-4 py-2 font-medium">Número</th>
                  <th className="px-4 py-2 font-medium">Cliente</th>
                  <th className="px-4 py-2 font-medium">Estado</th>
                  <th className="px-4 py-2 font-medium">Vence</th>
                  <th className="px-4 py-2 text-right font-medium">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((q) => {
                  // El número es un link de verdad (Tab, Enter, abrir en otra
                  // pestaña); el resto de la fila responde al mouse.
                  const row = clickableRowProps(() => onOpen(q.id), { focusable: false });
                  const link = recordLink(q.id);
                  return (
                    <tr key={q.id} {...row} className={cn('hover:bg-bg-muted', row.className)}>
                      <td className="whitespace-nowrap px-4 py-2 font-medium">
                        <Link to={{ search: link.search }} state={link.state} className="hover:underline">
                          {q.number}
                        </Link>
                      </td>
                      <td className="px-4 py-2">
                        {q.customerName}
                        <div className="text-xs text-fg-subtle">
                          {q.items} producto{q.items === 1 ? '' : 's'}
                        </div>
                      </td>
                      <td className="px-4 py-2">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <Badge variant={STATUS[q.status].variant}>{STATUS[q.status].label}</Badge>
                          {q.expired && <Badge variant="warning">Vencido</Badge>}
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-4 py-2 text-fg-muted">
                        {formatDate(q.validUntilUtc)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-2 text-right font-medium tabular-nums">
                        {formatMoney(q.totalMinor, q.currency)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <Pagination page={Math.min(page, totalPages)} totalPages={totalPages} onPage={setPage} />

      <HelpLink id="presupuestos" />
    </>
  );
}

// -------------------------------------------------------------------- Editor

interface DraftLine {
  variantId: string;
  productName: string;
  variantDescription: string;
  sku: string;
  /** En pesos, como lo escribe una persona. */
  price: string;
  quantity: string;
}

type QuoteCustomer = { id: string | null; name: string; email: string | null };

interface QuoteForm {
  customer: QuoteCustomer | null;
  validUntil: string;
  lines: DraftLine[];
  discount: string;
  notes: string;
}

function formOf(quote: QuoteDetail): QuoteForm {
  return {
    customer: { id: quote.customerId, name: quote.customerName, email: quote.customerEmail },
    validUntil: quote.validUntilUtc.slice(0, 10),
    lines: quote.items.map((i) => ({
      variantId: i.variantId,
      productName: i.productName,
      variantDescription: i.variantDescription,
      sku: i.sku,
      price: String(i.unitPriceMinor / 100),
      quantity: String(i.quantity),
    })),
    discount: quote.discountMinor > 0 ? String(quote.discountMinor / 100) : '',
    notes: quote.notes ?? '',
  };
}

/** Lo que cuenta para "hay cambios sin guardar". */
function quoteKey(f: QuoteForm): string {
  return JSON.stringify([
    f.customer?.id ?? null,
    f.customer?.name ?? '',
    f.customer?.email ?? null,
    f.validUntil,
    f.lines.map((l) => [l.variantId, l.price, l.quantity]),
    f.discount,
    f.notes,
  ]);
}

function QuoteEditor({ id, onBack }: { id: string | null; onBack: () => void }) {
  const { store } = useStore();
  const qc = useQueryClient();
  const { toast } = useToast();
  const confirm = useConfirm();
  const navigate = useNavigate();

  const { data: quote } = useQuery({
    queryKey: ['quote', store?.id, id],
    queryFn: () => api.get<QuoteDetail>(`/api/v1/quotes/${id}`),
    enabled: !!store && !!id,
  });

  const [customer, setCustomer] = useState<QuoteCustomer | null>(null);
  const [customerSearch, setCustomerSearch] = useState('');
  const [validUntil, setValidUntil] = useState(() => inDays(15));
  const [lines, setLines] = useState<DraftLine[]>([]);
  const [discount, setDiscount] = useState('');
  const [notes, setNotes] = useState('');
  // Cómo está guardado (o el form vacío, si es nuevo): contra eso se mide si
  // hay cambios. null = todavía no llegó el detalle.
  const [savedKey, setSavedKey] = useState<string | null>(() =>
    id ? null : quoteKey({ customer: null, validUntil: inDays(15), lines: [], discount: '', notes: '' }),
  );
  const [accepting, setAccepting] = useState(false);

  const load = (f: QuoteForm) => {
    setCustomer(f.customer);
    setValidUntil(f.validUntil);
    setLines(f.lines);
    setDiscount(f.discount);
    setNotes(f.notes);
    setSavedKey(quoteKey(f));
  };

  // Hidratar el formulario cuando llega el detalle. Durante el render y no en un
  // efecto: es el mismo patrón del editor de compras y evita el parpadeo de un
  // formulario vacío que se llena después.
  if (quote && savedKey === null) load(formOf(quote));

  const editable = !quote || quote.editable;
  const currentKey = quoteKey({ customer, validUntil, lines, discount, notes });
  const dirty = editable && savedKey !== null && currentKey !== savedKey;
  // Cerrar el presupuesto (volver, «Atrás», otra pantalla) con cambios pregunta.
  const leave = useUnsavedChanges(dirty, { param: 'presupuesto' });

  /**
   * Después de guardar o de una acción (enviar, extender, rechazar…), el form
   * muestra lo que quedó en el servidor: antes seguía con lo hidratado al
   * abrir, y "Extender 15 días más" dejaba a la vista la fecha vieja.
   */
  const showServerTruth = async () => {
    qc.invalidateQueries({ queryKey: ['quotes', store?.id] });
    qc.invalidateQueries({ queryKey: ['quotes-summary', store?.id] });
    await qc.invalidateQueries({ queryKey: ['quote', store?.id, id] });
    const fresh = qc.getQueryData<QuoteDetail>(['quote', store?.id, id]);
    if (fresh?.items) load(formOf(fresh));
  };

  const subtotalMinor = lines.reduce((sum, l) => {
    const price = parseMoneyInput(l.price || '0');
    const qty = Number(l.quantity) || 0;
    return sum + (Number.isFinite(price) ? price * qty : 0);
  }, 0);
  const discountMinor = discount ? parseMoneyInput(discount) : 0;
  const totalMinor = Math.max(0, subtotalMinor - (Number.isFinite(discountMinor) ? discountMinor : 0));

  // Los precios que le tocan al cliente elegido: si tiene lista, salen de ahí.
  const { data: customerPrices } = useQuery({
    queryKey: ['quote-prices', store?.id, customer?.id, lines.map((l) => l.variantId).join(',')],
    queryFn: () =>
      api.get<{ priceListApplied: string | null; items: { variantId: string; priceMinor: number }[] }>(
        `/api/v1/quotes/prices?customerId=${customer?.id ?? ''}&variantIds=${lines.map((l) => l.variantId).join(',')}`,
      ),
    enabled: !!store && lines.length > 0,
  });

  const priceOf = (variantId: string) =>
    (customerPrices?.items ?? []).find((p) => p.variantId === variantId)?.priceMinor;

  const body = () => ({
    customerName: customer?.name ?? '',
    customerId: customer?.id ?? null,
    customerEmail: customer?.email ?? null,
    currency: 'ARS',
    validUntilUtc: new Date(`${validUntil}T00:00:00Z`).toISOString(),
    items: lines.map((l) => ({
      variantId: l.variantId,
      quantity: Number(l.quantity) || 1,
      unitPriceMinor: parseMoneyInput(l.price || '0'),
    })),
    discountMinor: discountMinor > 0 ? discountMinor : null,
    notes: notes.trim() || null,
  });

  const save = useMutation({
    mutationFn: () =>
      id
        ? api.put<QuoteDetail>(`/api/v1/quotes/${id}`, body())
        : api.post<QuoteDetail>('/api/v1/quotes', body()),
    onSuccess: async (saved) => {
      toast(`${saved.number ?? 'Presupuesto'} guardado`, { variant: 'success' });
      if (!id) {
        qc.invalidateQueries({ queryKey: ['quotes', store?.id] });
        qc.invalidateQueries({ queryKey: ['quotes-summary', store?.id] });
        leave(onBack);
        return;
      }
      await showServerTruth();
    },
    onError: (e) => toast(errMsg(e, 'No se pudo guardar'), { variant: 'error' }),
  });

  const action = useMutation({
    mutationFn: async ({ path, body: actionBody }: { path: string; body?: unknown }) => {
      // Enviar, aceptar o extender un presupuesto con cambios sin guardar los
      // guarda primero: aceptar crea la venta con lo que tiene el servidor, y
      // esos precios recién tipeados se perdían sin aviso. Rechazar descarta.
      if (dirty && path !== 'reject') {
        await api.put<QuoteDetail>(`/api/v1/quotes/${id}`, body());
        setSavedKey(currentKey);
      }
      return api.post<{ orderId?: string }>(`/api/v1/quotes/${id}/${path}`, actionBody ?? {});
    },
    onSuccess: async (res, vars) => {
      if (vars.path === 'accept' && res.orderId) {
        qc.invalidateQueries({ queryKey: ['quotes', store?.id] });
        qc.invalidateQueries({ queryKey: ['quotes-summary', store?.id] });
        toast('Presupuesto aceptado: la venta ya está creada.', { variant: 'success' });
        leave(() => navigate(`/ventas?order=${res.orderId}`));
        return;
      }
      toast('Listo', { variant: 'success' });
      await showServerTruth();
    },
    onError: (e) => toast(errMsg(e, 'No se pudo completar'), { variant: 'error' }),
  });

  const problem = useMemo(() => {
    if (!customer?.name?.trim()) return 'Poné a nombre de quién va el presupuesto.';
    if (lines.length === 0) return 'Agregá al menos un producto.';
    if (lines.some((l) => !Number.isFinite(parseMoneyInput(l.price || '0'))))
      return 'Algún precio no es un número.';
    if (lines.some((l) => (Number(l.quantity) || 0) <= 0)) return 'Las cantidades tienen que ser positivas.';
    if (discountMinor > subtotalMinor) return 'El descuento no puede superar el total.';
    if (new Date(`${validUntil}T00:00:00Z`) <= new Date(new Date().toISOString().slice(0, 10)))
      return 'La validez tiene que ser posterior a hoy.';
    return null;
  }, [customer, lines, discountMinor, subtotalMinor, validUntil]);

  /** Una acción sobre el presupuesto; con cambios inválidos no se guarda nada a medias. */
  const run = (vars: { path: string; body?: unknown }) => {
    if (dirty && vars.path !== 'reject' && problem) {
      toast(`Antes, corregí lo que cambiaste: ${problem}`, { variant: 'error' });
      return;
    }
    action.mutate(vars);
  };
  const busy = save.isPending || action.isPending;

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-3 print:hidden">
        <div className="min-w-[18rem] flex-1">
          <button
            type="button"
            onClick={onBack}
            className="flex items-center gap-1 text-sm text-fg-muted hover:text-fg"
          >
            <ArrowLeft className="h-4 w-4" /> Presupuestos
          </button>
          <h1 className="mt-1 flex flex-wrap items-center gap-2 text-xl font-semibold">
            {quote ? quote.number : 'Nuevo presupuesto'}
            {quote && <Badge variant={STATUS[quote.status].variant}>{STATUS[quote.status].label}</Badge>}
            {quote?.expired && <Badge variant="warning">Vencido</Badge>}
          </h1>
          {quote?.convertedOrderId && (
            <button
              type="button"
              onClick={() => navigate(`/ventas?order=${quote.convertedOrderId}`)}
              className="mt-0.5 text-sm text-primary hover:underline"
            >
              Se convirtió en una venta — verla en Ventas
            </button>
          )}
          {quote?.rejectionReason && (
            <p className="mt-0.5 text-sm text-fg-muted">Rechazado: {quote.rejectionReason}</p>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2">
          {quote && (
            <Button variant="secondary" onClick={() => window.print()}>
              <Printer className="h-4 w-4" /> Imprimir
            </Button>
          )}
          {editable && (
            <Button onClick={() => save.mutate()} disabled={!!problem || busy} loading={save.isPending}>
              Guardar
            </Button>
          )}
        </div>
      </div>

      {quote?.expired && quote.editable && (
        <div className="rounded-md border border-warning/30 bg-warning-bg p-3 text-sm text-warning print:hidden">
          Este presupuesto está vencido. Para poder aceptarlo, revisá los precios y extendé la validez — con
          inflación, cerrar al precio del mes pasado es vender a pérdida.
        </div>
      )}

      <Card>
        <div className="grid gap-3 sm:grid-cols-2">
          <QuoteCustomerField
            customer={customer}
            search={customerSearch}
            disabled={!editable}
            onSearch={setCustomerSearch}
            onPick={setCustomer}
          />
          <FormField
            label="Válido hasta"
            hint={
              customerPrices?.priceListApplied
                ? 'Los precios se cargan de la lista del cliente.'
                : 'Después de esta fecha hay que revisar los precios antes de cerrarlo.'
            }
          >
            <Input
              type="date"
              value={validUntil}
              disabled={!editable}
              onChange={(e) => setValidUntil(e.target.value)}
            />
          </FormField>
        </div>
      </Card>

      <Card>
        <h2 className="text-sm font-semibold">Productos</h2>
        {editable && (
          <div className="mt-2">
            <VariantPicker
              placeholder="Buscar producto o SKU para agregar…"
              exclude={new Set(lines.map((l) => l.variantId))}
              onPick={(v) =>
                setLines((list) => [
                  ...list,
                  {
                    variantId: v.variantId,
                    productName: v.label,
                    variantDescription: '',
                    sku: v.sku,
                    price: '',
                    quantity: '1',
                  },
                ])
              }
            />
          </div>
        )}

        {lines.length > 0 && (
          <ul className="mt-3 space-y-1.5">
            {lines.map((line, idx) => {
              const suggested = priceOf(line.variantId);
              return (
                <li key={line.variantId} className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="min-w-0 flex-1 truncate">
                    {line.productName}
                    {line.variantDescription && (
                      <span className="text-fg-muted"> · {line.variantDescription}</span>
                    )}{' '}
                    <span className="font-mono text-xs text-fg-subtle">{line.sku}</span>
                  </span>
                  <div className="w-16 shrink-0">
                    <Input
                      compact
                      type="number"
                      min={1}
                      aria-label={`Cantidad de ${line.productName}`}
                      className="text-right"
                      disabled={!editable}
                      value={line.quantity}
                      onChange={(e) => setLines((l) => replaceAt(l, idx, { quantity: e.target.value }))}
                    />
                  </div>
                  <div className="w-32 shrink-0">
                    <Input
                      compact
                      inputMode="decimal"
                      aria-label={`Precio de ${line.productName}`}
                      className="text-right"
                      disabled={!editable}
                      placeholder={suggested != null ? String(suggested / 100) : '0'}
                      value={line.price}
                      onChange={(e) => setLines((l) => replaceAt(l, idx, { price: e.target.value }))}
                      onBlur={() => {
                        // Vacío = el precio que le toca al cliente. Se completa al
                        // salir del campo para que el número quede a la vista y se
                        // pueda discutir antes de mandarlo.
                        if (!line.price && suggested != null) {
                          setLines((l) => replaceAt(l, idx, { price: String(suggested / 100) }));
                        }
                      }}
                    />
                  </div>
                  {editable && (
                    <button
                      type="button"
                      className="text-fg-subtle hover:text-danger print:hidden"
                      onClick={() => setLines((l) => l.filter((_, i) => i !== idx))}
                      aria-label="Quitar"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <FormField label="Descuento ($)" hint="Opcional, sobre el total.">
            <Input
              value={discount}
              inputMode="decimal"
              disabled={!editable}
              onChange={(e) => setDiscount(e.target.value)}
            />
          </FormField>
          <div className="flex flex-col justify-end gap-1 text-sm">
            <div className="flex justify-between text-fg-muted">
              <span>Subtotal</span>
              <span className="tabular-nums">{formatMoney(subtotalMinor)}</span>
            </div>
            {discountMinor > 0 && (
              <div className="flex justify-between text-fg-muted">
                <span>Descuento</span>
                <span className="tabular-nums">−{formatMoney(discountMinor)}</span>
              </div>
            )}
            <div className="flex justify-between text-base font-semibold">
              <span>Total</span>
              <span className="tabular-nums">{formatMoney(totalMinor)}</span>
            </div>
          </div>
        </div>

        <FormField
          label="Notas"
          className="mt-3"
          hint="Condiciones de entrega, formas de pago, lo que el cliente tenga que leer."
        >
          <Textarea value={notes} disabled={!editable} rows={3} onChange={(e) => setNotes(e.target.value)} />
        </FormField>

        {problem && editable && <p className="mt-2 text-sm text-danger print:hidden">{problem}</p>}
      </Card>

      {quote && (
        <Card className="print:hidden">
          <h2 className="text-sm font-semibold">Qué hacer con este presupuesto</h2>
          <div className="mt-3 flex flex-wrap gap-2">
            {quote.editable && (
              <>
                <Button
                  variant="secondary"
                  disabled={busy}
                  loading={action.isPending && action.variables?.path === 'send'}
                  onClick={() => run({ path: 'send' })}
                >
                  Marcar como enviado
                </Button>
                <Button
                  onClick={() => setAccepting(true)}
                  disabled={quote.expired || busy}
                  loading={action.isPending && action.variables?.path === 'accept'}
                >
                  El cliente aceptó
                </Button>
                <Button
                  variant="secondary"
                  disabled={busy}
                  loading={action.isPending && action.variables?.path === 'reject'}
                  onClick={async () => {
                    const ok = await confirm({
                      title: `Rechazar ${quote.number}`,
                      message: dirty
                        ? 'Queda registrado como rechazado, y los cambios sin guardar se descartan. Después lo podés reabrir para renegociarlo.'
                        : 'Queda registrado como rechazado. Después lo podés reabrir para renegociarlo.',
                      confirmLabel: 'Rechazar',
                    });
                    if (ok) run({ path: 'reject', body: { reason: null } });
                  }}
                >
                  El cliente lo rechazó
                </Button>
                {quote.expired && (
                  <Button
                    variant="secondary"
                    disabled={busy}
                    loading={action.isPending && action.variables?.path === 'extend'}
                    onClick={() =>
                      run({
                        path: 'extend',
                        body: { validUntilUtc: new Date(`${inDays(15)}T00:00:00Z`).toISOString() },
                      })
                    }
                  >
                    Extender 15 días más
                  </Button>
                )}
              </>
            )}
            {quote.status === 'rejected' && (
              <Button
                variant="secondary"
                disabled={busy}
                loading={action.isPending && action.variables?.path === 'reopen'}
                onClick={() => run({ path: 'reopen' })}
              >
                Reabrir para renegociar
              </Button>
            )}
            {quote.status === 'accepted' && (
              <p className="text-sm text-fg-muted">
                Ya se convirtió en venta. Un presupuesto aceptado queda congelado: si hay que cambiar algo, se
                hace sobre la venta.
              </p>
            )}
          </div>
        </Card>
      )}

      {accepting && quote && (
        <AcceptModal
          quote={quote}
          onClose={() => setAccepting(false)}
          onAccept={(paymentMethod) => {
            setAccepting(false);
            run({ path: 'accept', body: { paymentMethod } });
          }}
        />
      )}

      <HelpLink id="presupuestos" className="print:hidden" />
    </>
  );
}

/** A nombre de quién va. De la agenda si está, y si no, texto libre. */
function QuoteCustomerField({
  customer,
  search,
  disabled,
  onSearch,
  onPick,
}: {
  customer: { id: string | null; name: string; email: string | null } | null;
  search: string;
  disabled: boolean;
  onSearch: (value: string) => void;
  onPick: (customer: { id: string | null; name: string; email: string | null } | null) => void;
}) {
  const debounced = useDebouncedValue(search, 300).trim();

  const { data } = useQuery({
    queryKey: ['quote-customers', debounced],
    queryFn: () =>
      api.get<{ items: { id: string; name: string; email: string | null }[] }>(
        `/api/v1/customers?limit=8&q=${encodeURIComponent(debounced)}`,
      ),
    enabled: !customer?.id && debounced.length > 0,
  });

  if (customer?.id) {
    return (
      <FormField label="Cliente">
        <div className="flex items-center justify-between rounded-md border border-border bg-bg-subtle px-3 py-2 text-sm">
          <div>
            <div className="font-medium">{customer.name}</div>
            {customer.email && <div className="text-xs text-fg-subtle">{customer.email}</div>}
          </div>
          {!disabled && (
            <Button size="sm" variant="ghost" onClick={() => onPick(null)}>
              Cambiar
            </Button>
          )}
        </div>
      </FormField>
    );
  }

  return (
    <div>
      <FormField
        label="Cliente"
        hint="Elegilo de la agenda para usar su lista de precios y poder cerrarlo en cuenta corriente."
      >
        <Input
          value={customer?.name ?? search}
          disabled={disabled}
          placeholder="Buscar o escribir un nombre…"
          onChange={(e) => {
            onSearch(e.target.value);
            onPick({ id: null, name: e.target.value, email: null });
          }}
        />
      </FormField>

      {(data?.items ?? []).length > 0 && (
        <div className="mt-1 max-h-40 overflow-y-auto rounded-md border border-border bg-surface">
          {data!.items.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => onPick({ id: c.id, name: c.name, email: c.email })}
              className="flex w-full items-center justify-between border-b border-border px-3 py-2 text-left text-sm last:border-0 hover:bg-bg-muted"
            >
              <span>{c.name}</span>
              {c.email && <span className="text-xs text-fg-subtle">{c.email}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function AcceptModal({
  quote,
  onAccept,
  onClose,
}: {
  quote: QuoteDetail;
  onAccept: (paymentMethod: string) => void;
  onClose: () => void;
}) {
  const [method, setMethod] = useState('cash');
  const needsCustomer = method === 'cuenta_corriente' && !quote.customerId;

  return (
    <Modal open onClose={onClose} title={`Aceptar ${quote.number}`}>
      <p className="text-sm text-fg-muted">
        Se crea la venta con los precios de este presupuesto, se descuenta el stock y se emite la factura si
        tenés la facturación automática activa. El presupuesto queda congelado.
      </p>

      <FormField label="Cómo se cobra" className="mt-3">
        <Select
          value={method}
          onChange={(e) => setMethod(e.target.value)}
          options={[
            { value: 'cash', label: 'Efectivo' },
            { value: 'transfer', label: 'Transferencia' },
            { value: 'cuenta_corriente', label: 'Cuenta corriente (queda debiendo)' },
          ]}
        />
      </FormField>

      {needsCustomer && (
        <p className="mt-2 text-sm text-danger">
          Para cerrarlo en cuenta corriente el presupuesto tiene que estar a nombre de un cliente de la
          agenda: sin ficha no hay a quién anotarle la deuda.
        </p>
      )}

      <div className="mt-5 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>
          Cancelar
        </Button>
        <Button onClick={() => onAccept(method)} disabled={needsCustomer}>
          Crear la venta
        </Button>
      </div>
    </Modal>
  );
}
