import { useState } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, Loader2, MoreVertical, Pencil, Trash2, Plus, Search, UserPlus } from 'lucide-react';
import {
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
  Table,
} from '@tiendafy/ui';
import { formatDate } from '../lib/format';
import { useStore } from '../context/StoreContext';
import { usePermissions } from '../context/PermissionsContext';
import { api, errMsg } from '../lib/api';
import { EmptyState } from '../components/EmptyState';
import { NoStoreSelected } from '../components/NoStoreSelected';
import { HelpLink } from '../components/HelpLink';
import { Pagination, pageRangeLabel } from '../components/Pagination';
import { TableSkeleton } from '../components/Skeleton';
import { downloadBlob } from '../lib/download';
import { useListParams, useListSearch } from '../lib/useListParams';

interface Customer {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  notes: string | null;
  priceListId: string | null;
  createdAtUtc: string;
}

/** Clientes por página. */
const PAGE_SIZE = 25;

/** Búsqueda y página, en la URL (ver useListParams). */
const LIST_DEFAULTS = { q: '', pagina: 1 };

export function CustomersPage() {
  const { store } = useStore();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const confirm = useConfirm();
  const canEdit = usePermissions().can('customers.write');
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<Customer | null>(null);
  const list = useListParams(LIST_DEFAULTS);
  const q = list.values.q.trim();
  const page = list.values.pagina;
  const [term, setTerm] = useListSearch(list);

  // La agenda crece con cada venta: la página y la búsqueda las resuelve la
  // base, no el navegador.
  const { data, isLoading } = useQuery({
    queryKey: ['customers', store?.id, q, page],
    queryFn: () => {
      const params = new URLSearchParams({
        limit: String(PAGE_SIZE),
        offset: String((page - 1) * PAGE_SIZE),
      });
      if (q) params.set('q', q);
      return api.get<{ items: Customer[]; total: number }>(`/api/v1/customers?${params}`);
    },
    enabled: !!store,
    placeholderData: keepPreviousData,
  });
  const customers = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['customers', store?.id] });

  // La agenda entera (con la búsqueda puesta) como planilla: la arma el
  // servidor, así no tiene el tope de una página.
  const [exporting, setExporting] = useState(false);
  const exportCsv = async () => {
    setExporting(true);
    try {
      const blob = await api.download(`/api/v1/customers/export${q ? `?q=${encodeURIComponent(q)}` : ''}`);
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

  const columns: TableColumn<Customer>[] = [
    { key: 'name', header: 'Nombre', cell: (c) => <span className="font-semibold text-fg">{c.name}</span> },
    { key: 'email', header: 'Email', cell: (c) => c.email ?? <span className="text-fg-subtle">—</span> },
    { key: 'phone', header: 'Teléfono', cell: (c) => c.phone ?? <span className="text-fg-subtle">—</span> },
    {
      key: 'address',
      header: 'Dirección',
      cell: (c) =>
        c.address ? (
          <span className="block max-w-[16rem] truncate text-sm text-fg-muted" title={c.address}>
            {c.address}
          </span>
        ) : (
          <span className="text-fg-subtle">—</span>
        ),
    },
    {
      key: 'createdAtUtc',
      header: 'Creado',
      cell: (c) => <span className="text-sm text-fg-muted">{formatDate(c.createdAtUtc)}</span>,
    },
    {
      key: 'id',
      header: '',
      cell: (c) =>
        canEdit && (
          <div className="flex justify-end">
            <Dropdown>
              <Dropdown.Trigger label={`Acciones de ${c.name}`}>
                <MoreVertical className="h-4 w-4" />
              </Dropdown.Trigger>
              <Dropdown.Menu align="end">
                <Dropdown.Item onSelect={() => setEditing(c)}>
                  <Pencil className="mr-2 inline h-4 w-4" /> Editar
                </Dropdown.Item>
                <Dropdown.Item
                  destructive
                  onSelect={async () => {
                    if (
                      await confirm({
                        title: 'Eliminar cliente',
                        message: `¿Eliminar a ${c.name}?`,
                        confirmLabel: 'Eliminar',
                        variant: 'danger',
                      })
                    )
                      remove.mutate(c);
                  }}
                >
                  <Trash2 className="mr-2 inline h-4 w-4" /> Eliminar
                </Dropdown.Item>
              </Dropdown.Menu>
            </Dropdown>
          </div>
        ),
    },
  ];

  if (!store) return <NoStoreSelected />;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-fg">Clientes</h1>
          <p className="mt-0.5 text-sm text-fg-muted">
            Tu base de contactos: nombre, datos y notas internas.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <form
            onSubmit={(e) => {
              // Enter busca ya, sin esperar la pausa de tipeo.
              e.preventDefault();
              list.set({ q: term }, { replace: true });
            }}
            className="relative"
          >
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-subtle" />
            <Input
              type="search"
              aria-label="Buscar clientes"
              className="pl-8"
              value={term}
              onChange={(e) => setTerm(e.target.value)}
              placeholder="Buscar cliente..."
            />
          </form>
          {total > 0 && (
            <span className="text-xs text-fg-subtle">
              {pageRangeLabel(page, PAGE_SIZE, total, total === 1 ? 'cliente' : 'clientes')}
            </span>
          )}
          <Button
            variant="secondary"
            onClick={exportCsv}
            disabled={exporting || total === 0}
            title="Descarga la agenda (con la búsqueda puesta) en un CSV para Excel."
          >
            <span className="inline-flex items-center gap-1.5">
              {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              Exportar
            </span>
          </Button>
          {canEdit && (
            <>
              <Button
                variant="secondary"
                onClick={() => importFromOrders.mutate()}
                disabled={importFromOrders.isPending}
                title="Suma a la agenda los compradores de tus ventas anteriores"
              >
                <span className="inline-flex items-center gap-1.5">
                  {importFromOrders.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <UserPlus className="h-4 w-4" />
                  )}
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
        </div>
      </div>

      {isLoading ? (
        <Card>
          <TableSkeleton label="Cargando clientes…" />
        </Card>
      ) : customers.length === 0 ? (
        q ? (
          <Card>
            <p className="px-4 py-12 text-center text-sm text-fg-muted">
              No se encontraron clientes para “{q}”.
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
          <Table columns={columns} rows={customers} rowKey={(c) => c.id} emptyState="No hay clientes." />
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

function CustomerModal({
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
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Juan Pérez" />
        </FormField>

        <div className="grid grid-cols-2 gap-4">
          <FormField label="Email" hint="Opcional">
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="juan@email.com"
            />
          </FormField>
          <FormField label="Teléfono" hint="Opcional">
            <Input
              inputMode="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="11 1234 5678"
            />
          </FormField>
        </div>

        <FormField label="Dirección" hint="Opcional">
          <Input
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="Av. Siempre Viva 742"
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
