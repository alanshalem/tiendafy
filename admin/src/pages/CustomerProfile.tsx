import { useState, type KeyboardEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Mail, MessageCircle, Pencil, Phone, Plus, ShoppingBag, X } from 'lucide-react';
import { Badge, Button, Card, badgeVariantClass, cn, useToast } from '@tiendafy/ui';
import { whatsappLink } from '@tiendafy/types';
import { useStore } from '../context/StoreContext';
import { usePermissions } from '../context/PermissionsContext';
import { api, errMsg } from '../lib/api';
import { formatDate, formatDateTime, formatMoney, formatNumber } from '../lib/format';
import { orderLabel } from '../lib/orderNumber';
import { useUnsavedChanges } from '../lib/useUnsavedChanges';
import { ORDER_STATUS } from '../lib/orderStatus';
import { ListStats } from '../components/stats/ListStats';
import { NoStoreSelected } from '../components/NoStoreSelected';
import { LoadError } from '../components/LoadError';
import { HelpLink } from '../components/HelpLink';
import { CustomerModal, withCustomerDefaults, type Customer } from './Customers';

/* ============================================================
   Ficha del cliente: quién es, qué compró, cuánto debe y cómo
   escribirle. El menú prometía "historial, cuentas y datos de
   contacto" y la agenda era una lista de nombres sin nada atrás.
   ============================================================ */

interface ProfileOrder {
  id: string;
  /** El número de la tienda ("#1042"); una API anterior no lo manda. */
  number?: number | null;
  status: string;
  createdAtUtc: string;
  paidAtUtc: string | null;
  totalMinor: number;
  currency: string;
  itemsCount: number;
  firstItem: string | null;
}

export interface CustomerProfileResponse {
  customer: Customer;
  stats: {
    ordersCount: number;
    totalSpentMinor: number;
    averageTicketMinor: number;
    lastOrderAtUtc: string | null;
    firstOrderAtUtc: string | null;
    currency: string;
  };
  /** Null = la persona no puede ver las ventas (permiso "Ver las ventas"). */
  orders: ProfileOrder[] | null;
  hasMoreOrders: boolean;
}

interface LedgerResponse {
  balanceMinor: number;
  currency: string;
  items: { id: string; occurredAtUtc: string; docLabel: string; debitMinor: number; creditMinor: number }[];
}

/**
 * El link de WhatsApp para un teléfono cargado como se dicta en Argentina
 * ("11 4567-8901", "011 4567 8901"): wa.me necesita el número internacional
 * (54 9 + característica sin el 0). Uno que ya viene con +54 queda igual.
 */
export function customerWhatsappHref(phone: string | null, message = ''): string | null {
  if (!phone) return null;
  let digits = phone.replace(/\D/g, '');
  if (!phone.trim().startsWith('+') && !digits.startsWith('54')) {
    digits = digits.replace(/^0/, '');
    if (digits.length === 10) digits = `549${digits}`;
  }
  return whatsappLink(digits, message);
}

export function CustomerProfilePage() {
  const { id = '' } = useParams();
  const { store } = useStore();
  const { can } = usePermissions();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);

  const key = ['customer-profile', store?.id, id];
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: key,
    queryFn: () =>
      api
        .get<CustomerProfileResponse>(`/api/v1/customers/${id}`)
        .then((r) => ({ ...r, customer: withCustomerDefaults(r.customer) })),
    enabled: !!store && !!id,
  });

  // La cuenta corriente vive en Finanzas y pide su permiso: sin él, la
  // sección no aparece (no es "sin deuda").
  const canFinance = can('finance.manage');
  const ledger = useQuery({
    queryKey: ['finance-ledger', store?.id, 'customer', id],
    // Solo los últimos movimientos (vienen del más nuevo al más viejo): el
    // estado de cuenta entero vive en Cuentas corrientes.
    queryFn: () => api.get<LedgerResponse>(`/api/v1/finance/ledger?partyKind=customer&partyId=${id}&limit=5`),
    enabled: !!store && !!id && canFinance,
  });

  if (!store) return <NoStoreSelected />;

  const back = (
    <Link to="/clientes" className="inline-flex items-center gap-1 text-sm text-fg-muted hover:text-fg">
      <ArrowLeft className="h-4 w-4" /> Clientes
    </Link>
  );

  if (isLoading) {
    return (
      <div className="space-y-4">
        {back}
        <Card>
          <p className="py-10 text-center text-sm text-fg-muted">Cargando la ficha…</p>
        </Card>
      </div>
    );
  }
  if (error || !data) {
    return (
      <div className="space-y-4">
        {back}
        <LoadError title="No se pudo cargar la ficha del cliente." error={error} onRetry={() => refetch()} />
      </div>
    );
  }

  const { customer: c, stats } = data;
  const canEdit = can('customers.write');
  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: key });
    queryClient.invalidateQueries({ queryKey: ['customers', store.id] });
  };
  const firstName = c.name.split(' ')[0];
  const wa = customerWhatsappHref(c.phone, `Hola ${firstName}!`);

  return (
    <div className="space-y-5">
      {back}

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-fg">{c.name}</h1>
          <p className="mt-0.5 text-sm text-fg-muted">
            Cliente desde {formatDate(stats.firstOrderAtUtc ?? c.createdAtUtc)}
            {c.address ? ` · ${c.address}` : ''}
          </p>
        </div>
        {canEdit && (
          <Button variant="secondary" onClick={() => setEditing(true)}>
            <span className="inline-flex items-center gap-1.5">
              <Pencil className="h-4 w-4" /> Editar datos
            </span>
          </Button>
        )}
      </div>

      {/* Contacto de un toque: lo que se hace con un cliente casi siempre es
          escribirle. Botones grandes, pensados para el teléfono. */}
      <div className="flex flex-wrap gap-2">
        {wa && (
          <a
            href={wa}
            target="_blank"
            rel="noreferrer"
            className="inline-flex min-h-10 items-center gap-2 rounded-md bg-success px-4 text-sm font-semibold text-white hover:opacity-90"
          >
            <MessageCircle className="h-4 w-4" /> WhatsApp
          </a>
        )}
        {c.email && (
          <a
            href={`mailto:${c.email}`}
            className="inline-flex min-h-10 items-center gap-2 rounded-md border border-border-strong bg-surface px-4 text-sm font-medium text-fg hover:bg-bg-muted"
          >
            <Mail className="h-4 w-4" /> {c.email}
          </a>
        )}
        {c.phone && (
          <a
            href={`tel:${c.phone.replace(/[^\d+]/g, '')}`}
            className="inline-flex min-h-10 items-center gap-2 rounded-md border border-border-strong bg-surface px-4 text-sm font-medium text-fg hover:bg-bg-muted"
          >
            <Phone className="h-4 w-4" /> {c.phone}
          </a>
        )}
        {!wa && !c.email && !c.phone && (
          <p className="text-sm text-fg-muted">
            Sin datos de contacto.{canEdit ? ' Cargale un teléfono o un email con «Editar datos».' : ''}
          </p>
        )}
      </div>

      <ListStats
        items={[
          {
            label: 'Total gastado',
            value: formatMoney(stats.totalSpentMinor, stats.currency),
            hint: 'Lo que pagó en todas sus compras, descontando los reembolsos.',
          },
          { label: 'Compras', value: formatNumber(stats.ordersCount) },
          {
            label: 'Ticket promedio',
            value: stats.ordersCount > 0 ? formatMoney(stats.averageTicketMinor, stats.currency) : '—',
          },
          {
            label: 'Última compra',
            value: stats.lastOrderAtUtc ? formatDate(stats.lastOrderAtUtc) : 'Nunca',
            hint: stats.lastOrderAtUtc ? `Hace ${daysSince(stats.lastOrderAtUtc)}.` : undefined,
          },
        ]}
      />

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <OrdersTimeline orders={data.orders} hasMore={data.hasMoreOrders} customer={c} />

        <div className="space-y-5">
          <NotesAndTags customer={c} canEdit={canEdit} onSaved={refresh} />
          {canFinance && <CurrentAccount ledger={ledger.data} loading={ledger.isLoading} customerId={c.id} />}
        </div>
      </div>

      <CustomerModal
        key={editing ? 'edicion' : 'edicion-cerrada'}
        open={editing}
        customer={c}
        onClose={() => setEditing(false)}
        onSaved={refresh}
      />
      <HelpLink id="clientes" />
    </div>
  );
}

/** "3 días", "2 meses": cuánto hace, para el ⓘ de la última compra. */
function daysSince(iso: string): string {
  const days = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000));
  if (days < 1) return 'menos de un día';
  if (days < 60) return `${days} ${days === 1 ? 'día' : 'días'}`;
  const months = Math.floor(days / 30);
  return `${months} meses`;
}

/** Las ventas del cliente, de la más nueva a la más vieja, cada una con su link a Ventas. */
function OrdersTimeline({
  orders,
  hasMore,
  customer,
}: {
  orders: ProfileOrder[] | null;
  hasMore: boolean;
  customer: Customer;
}) {
  return (
    <Card>
      <h2 className="flex items-center gap-2 text-base font-semibold text-fg">
        <ShoppingBag className="h-4 w-4 text-fg-muted" /> Compras
      </h2>
      {orders === null ? (
        <p className="mt-3 text-sm text-fg-muted">
          Tu usuario no puede ver las ventas: pedile acceso a «Ver las ventas» a quien administra la tienda.
        </p>
      ) : orders.length === 0 ? (
        <p className="mt-3 text-sm text-fg-muted">
          {customer.email
            ? 'Todavía no compró con este email.'
            : 'Sin email no se pueden vincular sus ventas: cargale el email con el que compra.'}
        </p>
      ) : (
        <ol className="mt-3 space-y-0">
          {orders.map((o, i) => {
            const st = ORDER_STATUS[o.status] ?? { label: o.status, cls: badgeVariantClass.neutral };
            return (
              <li key={o.id} className="relative flex gap-3 pb-4 last:pb-0">
                {/* La línea del tiempo: un punto por venta, unidos. */}
                <span aria-hidden="true" className="relative flex w-3 shrink-0 justify-center">
                  <span className="mt-1.5 h-2.5 w-2.5 rounded-full bg-primary" />
                  {i < orders.length - 1 && (
                    <span className="absolute top-4 bottom-[-0.25rem] w-px bg-border" />
                  )}
                </span>
                <div className="flex min-w-0 flex-1 flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                  <div className="min-w-0">
                    <Link
                      to={`/ventas?order=${o.id}`}
                      className="font-mono text-sm font-semibold text-primary hover:underline"
                    >
                      {orderLabel(o)}
                    </Link>
                    <span className="ml-2 text-xs text-fg-muted">{formatDateTime(o.createdAtUtc)}</span>
                    <p className="truncate text-sm text-fg-muted">
                      {o.firstItem ?? 'Venta'}
                      {o.itemsCount > 1
                        ? ` y ${o.itemsCount - 1} ${o.itemsCount === 2 ? 'producto más' : 'productos más'}`
                        : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium', st.cls)}>
                      {st.label}
                    </span>
                    <span className="font-semibold tabular-nums text-fg">
                      {formatMoney(o.totalMinor, o.currency)}
                    </span>
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      )}
      {hasMore && customer.email && (
        <Link
          to={`/ventas?q=${encodeURIComponent(customer.email)}`}
          className="mt-3 inline-block text-sm font-medium text-primary hover:underline"
        >
          Ver todas sus ventas
        </Link>
      )}
    </Card>
  );
}

/** Notas internas y etiquetas, editables ahí mismo (sin abrir el formulario entero). */
function NotesAndTags({
  customer,
  canEdit,
  onSaved,
}: {
  customer: Customer;
  canEdit: boolean;
  onSaved: () => void;
}) {
  const { store } = useStore();
  const { toast } = useToast();
  const [notes, setNotes] = useState(customer.notes ?? '');
  const [tagDraft, setTagDraft] = useState('');

  const { data: tagData } = useQuery({
    queryKey: ['customer-tags', store?.id],
    queryFn: () => api.get<{ items: { tag: string; count: number }[] }>('/api/v1/customers/tags'),
    enabled: !!store && canEdit,
  });
  const queryClient = useQueryClient();

  const patch = useMutation({
    mutationFn: (body: { notes?: string; tags?: string[] }) =>
      api.patch<Customer>(`/api/v1/customers/${customer.id}`, body),
    onSuccess: (_, body) => {
      onSaved();
      queryClient.invalidateQueries({ queryKey: ['customer-tags', store?.id] });
      if (body.notes !== undefined) toast('Notas guardadas', { variant: 'success' });
    },
    onError: (e) => toast(errMsg(e, 'No se pudo guardar.'), { variant: 'error' }),
  });

  const addTag = (raw: string) => {
    const t = raw.trim();
    setTagDraft('');
    if (!t || customer.tags.some((x) => x.toLowerCase() === t.toLowerCase())) return;
    patch.mutate({ tags: [...customer.tags, t] });
  };
  const removeTag = (t: string) => patch.mutate({ tags: customer.tags.filter((x) => x !== t) });
  const onTagKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addTag(tagDraft);
    }
  };
  const suggestions = (tagData?.items ?? [])
    .map((t) => t.tag)
    .filter((t) => !customer.tags.some((x) => x.toLowerCase() === t.toLowerCase()));
  const notesChanged = notes.trim() !== (customer.notes ?? '').trim();
  // Las notas se guardan con su botón: escritas y sin guardar, salir de la
  // ficha pregunta. Al guardar se recarga el cliente y dejan de ser cambio.
  useUnsavedChanges(canEdit && notesChanged);

  return (
    <Card>
      <h2 className="text-base font-semibold text-fg">Etiquetas</h2>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {customer.tags.length === 0 && !canEdit && (
          <span className="text-sm text-fg-subtle">Sin etiquetas.</span>
        )}
        {customer.tags.map((t) => (
          <Badge key={t} variant="neutral" className="gap-1 py-1">
            {t}
            {canEdit && (
              <button
                type="button"
                onClick={() => removeTag(t)}
                aria-label={`Quitar la etiqueta ${t}`}
                className="-mr-1 rounded-full p-0.5 hover:bg-fg/10"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </Badge>
        ))}
      </div>
      {canEdit && (
        <div className="mt-2 flex gap-2">
          <input
            value={tagDraft}
            onChange={(e) => setTagDraft(e.target.value)}
            onKeyDown={onTagKey}
            list={`tags-${customer.id}`}
            maxLength={30}
            aria-label="Nueva etiqueta"
            placeholder="Ej.: mayorista, VIP"
            className="h-10 min-w-0 flex-1 rounded-md border border-border-strong bg-surface px-3 text-sm text-fg placeholder:text-fg-subtle focus:outline-none focus:ring-2 focus:ring-primary"
          />
          <datalist id={`tags-${customer.id}`}>
            {suggestions.map((t) => (
              <option key={t} value={t} />
            ))}
          </datalist>
          <Button
            variant="secondary"
            onClick={() => addTag(tagDraft)}
            disabled={!tagDraft.trim() || patch.isPending}
            aria-label="Agregar etiqueta"
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>
      )}

      <h2 className="mt-5 text-base font-semibold text-fg">Notas</h2>
      {canEdit ? (
        <>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={4}
            maxLength={2000}
            aria-label="Notas internas"
            placeholder="Lo que conviene recordar: cómo paga, qué le gusta, cuándo llamarlo."
            className="mt-2 w-full rounded-md border border-border-strong bg-surface px-3 py-2 text-sm text-fg placeholder:text-fg-subtle focus:outline-none focus:ring-2 focus:ring-primary"
          />
          <div className="mt-2 flex justify-end">
            <Button
              size="sm"
              disabled={!notesChanged}
              loading={patch.isPending && patch.variables?.notes !== undefined}
              onClick={() => patch.mutate({ notes: notes.trim() })}
            >
              Guardar notas
            </Button>
          </div>
        </>
      ) : (
        <p className="mt-2 whitespace-pre-line text-sm text-fg-muted">{customer.notes ?? 'Sin notas.'}</p>
      )}
    </Card>
  );
}

/** El saldo de su cuenta corriente y los últimos movimientos (Finanzas). */
function CurrentAccount({
  ledger,
  loading,
  customerId,
}: {
  ledger: LedgerResponse | undefined;
  loading: boolean;
  customerId: string;
}) {
  const balance = ledger?.balanceMinor ?? 0;
  const last = (ledger?.items ?? []).slice(0, 5);
  return (
    <Card>
      <h2 className="text-base font-semibold text-fg">Cuenta corriente</h2>
      {loading ? (
        <p className="mt-2 text-sm text-fg-muted">Cargando…</p>
      ) : (
        <>
          <p
            className={cn(
              'mt-1 text-2xl font-bold tabular-nums',
              balance > 0 ? 'text-danger' : balance < 0 ? 'text-success' : 'text-fg',
            )}
          >
            {formatMoney(Math.abs(balance), ledger?.currency)}
          </p>
          <p className="text-xs text-fg-muted">
            {balance > 0 ? 'Te debe' : balance < 0 ? 'Saldo a su favor' : 'Al día: no debe nada'}
          </p>
          {last.length > 0 ? (
            <ul className="mt-3 divide-y divide-border text-sm">
              {last.map((m) => (
                <li key={m.id} className="flex items-baseline justify-between gap-3 py-1.5">
                  <span className="min-w-0 truncate text-fg-muted">
                    {formatDate(m.occurredAtUtc)} · {m.docLabel}
                  </span>
                  <span
                    className={cn('shrink-0 tabular-nums', m.creditMinor > 0 ? 'text-success' : 'text-fg')}
                  >
                    {m.creditMinor > 0 ? '−' : '+'}
                    {formatMoney(m.creditMinor > 0 ? m.creditMinor : m.debitMinor, ledger?.currency)}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-sm text-fg-muted">Sin movimientos.</p>
          )}
          <Link
            to={`/cuentas-corrientes?contacto=${customerId}`}
            className="mt-3 inline-block text-sm font-medium text-primary hover:underline"
          >
            Ver la cuenta completa
          </Link>
        </>
      )}
    </Card>
  );
}
