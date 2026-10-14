import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Download,
  MoreVertical,
  Pencil,
  Trash2,
  Plus,
  UserPlus,
  UserRound,
} from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  Dropdown,
  FormField,
  Input,
  Modal,
  Select,
  useToast,
  useConfirm,
  type TableColumn,
  Spinner,
  PageHeader,
  SearchInput,
} from '@tiendafy/ui';
import { formatDate, formatMoney, formatNumber } from '../lib/format';
import { useStore } from '../context/StoreContext';
import { usePermissions } from '../context/PermissionsContext';
import { api, errMsg } from '../lib/api';
import { EmptyState } from '../components/EmptyState';
import { NoStoreSelected } from '../components/NoStoreSelected';
import { HelpLink } from '../components/HelpLink';
import { Pagination, pageRangeLabel } from '../components/Pagination';
import { TableSkeleton } from '../components/Skeleton';
import { CARD_MENU_TRIGGER, ResponsiveList } from '../components/ListCards';
import { downloadBlob } from '../lib/download';
import { useListParams, useListSearch } from '../lib/useListParams';

export interface Customer {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  notes: string | null;
  priceListId: string | null;
  createdAtUtc: string;
  tags: string[];
  /** Resumen de compras que guarda la agenda (ver CustomerDirectory en el backend). */
  ordersCount: number;
  totalSpentMinor: number;
  lastOrderAtUtc: string | null;
}

/**
 * Lo que falta en una ficha, con su valor de "todavía nada". Una API anterior
 * al resumen de compras (un deploy a medias, un entorno viejo) no los manda, y
 * la agenda no puede romperse por eso.
 */
export function withCustomerDefaults(c: Customer): Customer {
  return {
    ...c,
    tags: c.tags ?? [],
    ordersCount: c.ordersCount ?? 0,
    totalSpentMinor: c.totalSpentMinor ?? 0,
    lastOrderAtUtc: c.lastOrderAtUtc ?? null,
  };
}

/** Clientes por página. */
const PAGE_SIZE = 25;

/**
 * Búsqueda, segmento, etiqueta, orden y página, en la URL (ver useListParams):
 * "los que no compran hace 90 días" se puede linkear y sobrevive a recargar.
 */
const LIST_DEFAULTS = { q: '', pagina: 1, segmento: '', etiqueta: '', orden: '', asc: false };

type SortKey = '' | 'name' | 'orders' | 'spent' | 'last';

/**
 * Segmentos simples, los que un comercio pregunta sin tener que armar un
 * filtro: a quién volver a escribirle, quiénes son los fieles, quiénes nunca
 * compraron. Cada uno es un parámetro de la API.
 */
const SEGMENTS: { value: string; label: string; params: Record<string, string> }[] = [
  { value: '', label: 'Todos los clientes', params: {} },
  { value: 'inactivos-90', label: 'Compraron hace más de 90 días', params: { inactiveDays: '90' } },
  { value: 'inactivos-180', label: 'Compraron hace más de 180 días', params: { inactiveDays: '180' } },
  { value: 'frecuentes', label: 'Compraron 3 veces o más', params: { minOrders: '3' } },
  { value: 'recurrentes', label: 'Compraron 2 veces o más', params: { minOrders: '2' } },
  { value: 'nunca', label: 'Todavía no compraron', params: { neverBought: 'true' } },
];

/** Los parámetros de la API para lo que está puesto en la pantalla (lista y export). */
function listQuery(v: typeof LIST_DEFAULTS): URLSearchParams {
  const params = new URLSearchParams();
  if (v.q.trim()) params.set('q', v.q.trim());
  for (const [k, val] of Object.entries(SEGMENTS.find((s) => s.value === v.segmento)?.params ?? {}))
    params.set(k, val);
  if (v.etiqueta) params.set('tag', v.etiqueta);
  if (v.orden) {
    params.set('sort', v.orden);
    params.set('desc', String(!v.asc));
  }
  return params;
}

export function CustomersPage() {
  const { store } = useStore();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const confirm = useConfirm();
  const canEdit = usePermissions().can('customers.write');
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<Customer | null>(null);
  const list = useListParams(LIST_DEFAULTS);
  const q = list.values.q.trim();
  const page = list.values.pagina;
  const sort = list.values.orden as SortKey;
  const [term, setTerm] = useListSearch(list);
  const filtered = !!(q || list.values.segmento || list.values.etiqueta);

  // La agenda crece con cada venta: la página, la búsqueda, los segmentos y
  // el orden los resuelve la base, no el navegador.
  const query = listQuery(list.values);
  const { data, isLoading } = useQuery({
    queryKey: ['customers', store?.id, query.toString(), page],
    queryFn: () => {
      const params = new URLSearchParams(query);
      params.set('limit', String(PAGE_SIZE));
      params.set('offset', String((page - 1) * PAGE_SIZE));
      return api
        .get<{ items: Customer[]; total: number }>(`/api/v1/customers?${params}`)
        .then((r) => ({ ...r, items: r.items.map(withCustomerDefaults) }));
    },
    enabled: !!store,
    placeholderData: keepPreviousData,
  });
  const customers = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  // Las etiquetas que ya usa la tienda: sin ninguna, el filtro no aparece.
  const { data: tagData } = useQuery({
    queryKey: ['customer-tags', store?.id],
    queryFn: () => api.get<{ items: { tag: string; count: number }[] }>('/api/v1/customers/tags'),
    enabled: !!store,
  });
  const tags = tagData?.items ?? [];

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['customers', store?.id] });
  const open = (c: Customer) => navigate(`/clientes/${c.id}`);

  // La agenda entera (con la búsqueda y el segmento puestos) como planilla: la
  // arma el servidor, así no tiene el tope de una página.
  const [exporting, setExporting] = useState(false);
  const exportCsv = async () => {
    setExporting(true);
    try {
      const qs = query.toString();
      const blob = await api.download(`/api/v1/customers/export${qs ? `?${qs}` : ''}`);
      downloadBlob(blob, `clientes-${store?.subdomain ?? 'tienda'}.csv`);
    } catch (e) {
      toast(errMsg(e, 'No se pudo exportar.'), { variant: 'error' });
    } finally {
      setExporting(false);
    }
  };

  const remove = useMutation({
    mutationFn: (c: Customer) => api.delete(`/api/v1/customers/${c.id}`),
    onSuccess: () => {
      refresh();
      toast('Cliente eliminado', { variant: 'success' });
    },
    onError: (e) => toast(errMsg(e), { variant: 'error' }),
  });

  // Los compradores de las ventas anteriores no estaban en la agenda: de acá en
  // más cada venta pagada deja su ficha sola, esto trae el histórico.
  const importFromOrders = useMutation({
    mutationFn: () =>
      api.post<{ imported: number; scanned: number }>('/api/v1/customers/sync-from-orders', {}),
    onSuccess: (r) => {
      refresh();
      toast(
        r.imported > 0
          ? `Se sumaron ${r.imported} clientes de tus ventas.`
          : 'Tus ventas ya estaban todas en la agenda.',
        { variant: 'success' },
      );
    },
    onError: (e) => toast(errMsg(e, 'No se pudieron traer los compradores.'), { variant: 'error' }),
  });

  const askRemove = async (c: Customer) => {
    if (
      await confirm({
        title: 'Eliminar cliente',
        message: `¿Eliminar a ${c.name}?`,
        confirmLabel: 'Eliminar',
        variant: 'danger',
      })
    )
      remove.mutate(c);
  };

  const actions = (c: Customer, compact = false) =>
    canEdit && (
      <Dropdown>
        <Dropdown.Trigger
          label={`Acciones de ${c.name}`}
          bare={compact}
          className={compact ? CARD_MENU_TRIGGER : undefined}
        >
          <MoreVertical className="h-4 w-4" />
        </Dropdown.Trigger>
        <Dropdown.Menu align="end">
          <Dropdown.Item onSelect={() => open(c)}>
            <UserRound className="mr-2 inline h-4 w-4" /> Ver ficha
          </Dropdown.Item>
          <Dropdown.Item onSelect={() => setEditing(c)}>
            <Pencil className="mr-2 inline h-4 w-4" /> Editar
          </Dropdown.Item>
          <Dropdown.Item destructive onSelect={() => askRemove(c)}>
            <Trash2 className="mr-2 inline h-4 w-4" /> Eliminar
          </Dropdown.Item>
        </Dropdown.Menu>
      </Dropdown>
    );

  /** Encabezado que ordena: un click ordena por esa columna, otro invierte. */
  const sortHeader = (key: Exclude<SortKey, ''>, label: string, align: 'left' | 'right' = 'left') => {
    const active = sort === key;
    const Icon = !active ? ArrowUpDown : list.values.asc ? ArrowUp : ArrowDown;
    return (
      <button
        type="button"
        onClick={() =>
          // Plata, compras y fechas arrancan de mayor a menor (lo que se busca
          // primero); el nombre, de la A a la Z.
          active ? list.set({ asc: !list.values.asc }) : list.set({ orden: key, asc: key === 'name' })
        }
        aria-label={`Ordenar por ${label.toLowerCase()}${active ? (list.values.asc ? ' (de menor a mayor)' : ' (de mayor a menor)') : ''}`}
        className={`inline-flex items-center gap-1 font-medium hover:text-fg ${align === 'right' ? 'flex-row-reverse' : ''} ${active ? 'text-fg' : ''}`}
      >
        {label}
        <Icon className={`h-3.5 w-3.5 ${active ? '' : 'opacity-40'}`} aria-hidden="true" />
      </button>
    );
  };

  const columns: TableColumn<Customer>[] = [
    {
      key: 'name',
      header: sortHeader('name', 'Nombre'),
      cell: (c) => (
        <div className="min-w-0">
          <button
            type="button"
            onClick={() => open(c)}
            className="font-semibold text-fg hover:text-primary hover:underline"
          >
            {c.name}
          </button>
          {c.tags.length > 0 && (
            <div className="mt-1 flex flex-wrap gap-1">
              {c.tags.map((t) => (
                <Badge key={t} variant="neutral">
                  {t}
                </Badge>
              ))}
            </div>
          )}
        </div>
      ),
    },
    {
      key: 'contact',
      header: 'Contacto',
      cell: (c) =>
        c.email || c.phone ? (
          <div className="text-sm">
            {c.email && <div className="text-fg">{c.email}</div>}
            {c.phone && <div className="text-fg-muted">{c.phone}</div>}
          </div>
        ) : (
          <span className="text-fg-subtle">—</span>
        ),
    },
    {
      key: 'orders',
      header: sortHeader('orders', 'Compras', 'right'),
      align: 'right',
      cell: (c) => <span className="tabular-nums">{formatNumber(c.ordersCount)}</span>,
    },
    {
      key: 'spent',
      header: sortHeader('spent', 'Total gastado', 'right'),
      align: 'right',
      cell: (c) =>
        c.totalSpentMinor > 0 ? (
          <span className="font-medium tabular-nums">{formatMoney(c.totalSpentMinor)}</span>
        ) : (
          <span className="text-fg-subtle">—</span>
        ),
    },
    {
      key: 'last',
      header: sortHeader('last', 'Última compra'),
      cell: (c) =>
        c.lastOrderAtUtc ? (
          <span className="text-sm text-fg-muted">{formatDate(c.lastOrderAtUtc)}</span>
        ) : (
          <span className="text-sm text-fg-subtle">Nunca</span>
        ),
    },
    { key: 'id', header: '', cell: (c) => <div className="flex justify-end">{actions(c)}</div> },
  ];

  if (!store) return <NoStoreSelected />;

  const segmentLabel = SEGMENTS.find((s) => s.value === list.values.segmento)?.label;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Clientes"
        subtitle="Quiénes te compran: cuánto, cada cuánto y cómo escribirles."
        count={total > 0 && pageRangeLabel(page, PAGE_SIZE, total, total === 1 ? 'cliente' : 'clientes')}
        actions={
          <>
            <Button
              variant="secondary"
              onClick={exportCsv}
              disabled={exporting || total === 0}
              title="Descarga la agenda (con la búsqueda y el segmento puestos) en un CSV para Excel."
            >
              <span className="inline-flex items-center gap-1.5">
                {exporting ? <Spinner inline /> : <Download className="h-4 w-4" />}
                Exportar
              </span>
            </Button>
            {canEdit && (
              <>
                <Button
                  variant="secondary"
                  onClick={() => importFromOrders.mutate()}
                  disabled={importFromOrders.isPending}
                  title="Suma a la agenda los compradores de tus ventas anteriores y recalcula lo que compró cada uno"
                >
                  <span className="inline-flex items-center gap-1.5">
                    {importFromOrders.isPending ? <Spinner inline /> : <UserPlus className="h-4 w-4" />}
                    Traer de mis ventas
                  </span>
                </Button>
                <Button onClick={() => setCreateOpen(true)}>
                  <span className="inline-flex items-center gap-1.5">
                    <Plus className="h-4 w-4" /> Agregar cliente
                  </span>
                </Button>
              </>
            )}
          </>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <form
          onSubmit={(e) => {
            // Enter busca ya, sin esperar la pausa de tipeo.
            e.preventDefault();
            list.set({ q: term }, { replace: true });
          }}
          className="min-w-[14rem] flex-1 sm:max-w-xs"
        >
          <SearchInput
            aria-label="Buscar clientes"
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            placeholder="Nombre, email o teléfono"
          />
        </form>
        <Select
          aria-label="Segmento"
          value={list.values.segmento}
          onChange={(e) => list.set({ segmento: e.target.value })}
          options={SEGMENTS.map((s) => ({ value: s.value, label: s.label }))}
          className="w-auto"
        />
        {tags.length > 0 && (
          <Select
            aria-label="Etiqueta"
            value={list.values.etiqueta}
            onChange={(e) => list.set({ etiqueta: e.target.value })}
            options={[
              { value: '', label: 'Todas las etiquetas' },
              ...tags.map((t) => ({ value: t.tag, label: `${t.tag} (${t.count})` })),
            ]}
            className="w-auto"
          />
        )}
      </div>

      {isLoading ? (
        <Card>
          <TableSkeleton label="Cargando clientes…" />
        </Card>
      ) : customers.length === 0 ? (
        filtered ? (
          <Card>
            <p className="px-4 py-12 text-center text-sm text-fg-muted">
              {q ? `No se encontraron clientes para “${q}”` : 'Ningún cliente cumple ese filtro'}
              {segmentLabel && list.values.segmento ? ` (${segmentLabel.toLowerCase()})` : ''}.
            </p>
          </Card>
        ) : (
          <EmptyState
            kicker="Clientes"
            title="Agregá tu primer cliente"
            body="Cada venta pagada deja acá la ficha de su comprador. Si ya vendiste antes, traé esos compradores con un click."
            action={
              canEdit ? { label: 'Traer de mis ventas', onClick: () => importFromOrders.mutate() } : undefined
            }
          />
        )
      ) : (
        <Card flush>
          <ResponsiveList
            label="Clientes"
            columns={columns}
            rows={customers}
            rowKey={(c) => c.id}
            emptyState="No hay clientes."
            card={(c) => ({
              title: c.name,
              subtitle: c.email ?? c.phone ?? undefined,
              value: c.totalSpentMinor > 0 ? formatMoney(c.totalSpentMinor) : undefined,
              meta: (
                <span>
                  {c.ordersCount === 0
                    ? 'Todavía no compró'
                    : `${formatNumber(c.ordersCount)} ${c.ordersCount === 1 ? 'compra' : 'compras'}${c.lastOrderAtUtc ? ` · última ${formatDate(c.lastOrderAtUtc)}` : ''}`}
                </span>
              ),
              badges:
                c.tags.length > 0
                  ? c.tags.map((t) => (
                      <Badge key={t} variant="neutral">
                        {t}
                      </Badge>
                    ))
                  : undefined,
              onOpen: () => open(c),
              actions: actions(c, true) || undefined,
            })}
          />
          <Pagination
            page={Math.min(page, totalPages)}
            totalPages={totalPages}
            onPage={(p) => list.set({ pagina: p })}
          />
        </Card>
      )}

      {/* La key vuelve a montar el formulario en cada apertura: arranca con los
          datos de ese momento, sin un efecto que los copie después. */}
      <CustomerModal
        key={createOpen ? 'alta' : 'alta-cerrada'}
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onSaved={refresh}
      />
      <CustomerModal
        key={editing?.id ?? 'edicion-cerrada'}
        open={!!editing}
        customer={editing ?? undefined}
        onClose={() => setEditing(null)}
        onSaved={refresh}
      />
      <HelpLink id="clientes" />
    </div>
  );
}

export function CustomerModal({
  open,
  customer,
  onClose,
  onSaved,
}: {
  open: boolean;
  customer?: Customer;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  // Crear = vacío, editar = datos del cliente (ver la key en quien lo abre).
  const [name, setName] = useState(customer?.name ?? '');
  const [email, setEmail] = useState(customer?.email ?? '');
  const [phone, setPhone] = useState(customer?.phone ?? '');
  const [address, setAddress] = useState(customer?.address ?? '');
  const [notes, setNotes] = useState(customer?.notes ?? '');
  const [priceListId, setPriceListId] = useState(customer?.priceListId ?? '');
  const [error, setError] = useState<string>();
  const isEdit = !!customer;

  // Las listas se piden solo con el modal abierto: la mayoría de las tiendas no
  // tiene ninguna y el campo entero desaparece.
  const { data: priceLists } = useQuery({
    queryKey: ['price-lists-picker'],
    queryFn: () => api.get<{ items: { id: string; name: string; active: boolean }[] }>('/api/v1/price-lists'),
    enabled: open,
  });
  const activeLists = (priceLists?.items ?? []).filter((l) => l.active);

  const save = useMutation({
    mutationFn: () => {
      const body = {
        name: name.trim(),
        email: email.trim() || null,
        phone: phone.trim() || null,
        address: address.trim() || null,
        notes: notes.trim() || null,
        priceListId: priceListId || null,
      };
      return isEdit
        ? api.put(`/api/v1/customers/${customer!.id}`, body)
        : api.post('/api/v1/customers', body);
    },
    onSuccess: () => {
      onSaved();
      toast(isEdit ? 'Cliente actualizado' : 'Cliente creado', { variant: 'success' });
      onClose();
    },
    onError: (e) => setError(errMsg(e, 'Error inesperado')),
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? 'Editar cliente' : 'Agregar cliente'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button loading={save.isPending} disabled={!name.trim()} onClick={() => save.mutate()}>
            {isEdit ? 'Guardar' : 'Agregar'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <FormField label="Nombre" required error={error}>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej.: Juan Pérez" />
        </FormField>

        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Email" hint="Opcional">
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Ej.: juan@email.com"
            />
          </FormField>
          <FormField label="Teléfono" hint="Opcional. Con característica, para escribirle por WhatsApp.">
            <Input
              inputMode="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="Ej.: 11 1234 5678"
            />
          </FormField>
        </div>

        <FormField label="Dirección" hint="Opcional">
          <Input
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="Ej.: Av. Corrientes 1234, CABA"
          />
        </FormField>

        {activeLists.length > 0 && (
          <FormField
            label="Lista de precios"
            hint="Las ventas manuales a este cliente van a usar los precios de esta lista."
          >
            <Select
              value={priceListId}
              onChange={(e) => setPriceListId(e.target.value)}
              options={[
                { value: '', label: 'Precio de lista (el del producto)' },
                ...activeLists.map((l) => ({ value: l.id, label: l.name })),
              ]}
            />
          </FormField>
        )}

        <FormField label="Notas" hint="Opcional">
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            placeholder="Notas internas sobre el cliente..."
            className="w-full rounded-md border border-border bg-bg px-3 py-2 text-sm text-fg placeholder:text-fg-subtle focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </FormField>
      </div>
    </Modal>
  );
}
