import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, PackagePlus, Plus, Truck } from 'lucide-react';
import {
  Badge,
  Button,
  clickableRowProps,
  cn,
  FormField,
  Input,
  Modal,
  Textarea,
  useToast,
  Spinner,
  EmptyList,
  PageHeader,
} from '@tiendafy/ui';
import { useStore } from '../context/StoreContext';
import { api, errMsg } from '../lib/api';
import { formatDate, formatMoney } from '../lib/format';
import { NoStoreSelected } from '../components/NoStoreSelected';
import { HelpLink } from '../components/HelpLink';
import { TABLE_CARD, TABLE_HEAD_STICKY, TABLE_SCROLL_X } from '../lib/styles';
import { ListStats } from '../components/stats/ListStats';
import { useListParams, useListSearch, useRecordParam } from '../lib/useListParams';
import { ScreenSkeleton } from '../components/Skeleton';
import { useGuardedClose, useUnsavedChanges } from '../lib/useUnsavedChanges';

// ---------------------------------------------------------------- Tipos wire

interface SupplierRow {
  id: string;
  name: string;
  taxId: string | null;
  email: string | null;
  phone: string | null;
  country: string | null;
  active: boolean;
  purchaseCount: number;
  lastPurchaseAtUtc: string | null;
  balanceMinor: number;
}

interface SupplierDetail {
  id: string;
  name: string;
  taxId: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  country: string | null;
  notes: string | null;
  active: boolean;
  createdAtUtc: string;
  balanceMinor: number;
  purchases: {
    id: string;
    reference: string | null;
    status: string;
    currency: string;
    createdAtUtc: string;
    invoiceNumber: string | null;
  }[];
}

const PO_STATUS: Record<string, string> = {
  draft: 'Borrador',
  confirmed: 'Confirmada',
  inproduction: 'En producción',
  intransit: 'En tránsito',
  incustoms: 'En aduana',
  received: 'Recibida',
  cancelled: 'Cancelada',
};

export function ProveedoresPage() {
  const { store } = useStore();
  // La ficha abierta va en la URL (?proveedor=<id>): Atrás vuelve a la lista
  // en vez de salir de Proveedores, y la ficha se puede linkear.
  const record = useRecordParam('proveedor');

  if (!store) return <NoStoreSelected />;

  return (
    <div className="space-y-4">
      {record.id ? (
        <SupplierDetailView key={record.id} id={record.id} onBack={record.close} />
      ) : (
        <SupplierList
          onOpen={record.open}
          recordLink={(id) => ({ search: record.searchFor(id), state: record.linkState })}
        />
      )}
    </div>
  );
}

// ------------------------------------------------------------------- Listado

/** Búsqueda y "mostrar inactivos", en la URL (ver useListParams). */
const LIST_DEFAULTS = { q: '', inactivos: false };

function SupplierList({
  onOpen,
  recordLink,
}: {
  onOpen: (id: string) => void;
  /** Adónde lleva el link de cada proveedor (la misma lista con ?proveedor=<id>). */
  recordLink: (id: string) => { search: string; state: unknown };
}) {
  const { store } = useStore();
  const list = useListParams(LIST_DEFAULTS);
  const [search, setSearch] = useListSearch(list, 'q', 300);
  const includeInactive = list.values.inactivos;
  const [creating, setCreating] = useState(false);
  const debounced = list.values.q.trim();

  const { data } = useQuery({
    queryKey: ['suppliers', store?.id, debounced, includeInactive],
    queryFn: () => {
      const params = new URLSearchParams();
      if (debounced) params.set('q', debounced);
      if (includeInactive) params.set('includeInactive', 'true');
      return api.get<{ items: SupplierRow[] }>(`/api/v1/suppliers?${params}`);
    },
    enabled: !!store,
    placeholderData: (previous) => previous,
  });

  const rows = data?.items ?? [];
  const debt = rows.filter((r) => r.balanceMinor < 0).reduce((s, r) => s + r.balanceMinor, 0);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // Las compras cargadas con el proveedor escrito a mano (antes de que
  // existieran las fichas) quedaban sueltas: Proveedores vacío al lado de un
  // listado de compras lleno de nombres. Esto las ata a su ficha (o le crea
  // una); de acá en más cada compra nueva ya queda atada sola.
  const importFromPurchases = useMutation({
    mutationFn: () =>
      api.post<{ created: number; linked: number }>('/api/v1/suppliers/sync-from-purchases', {}),
    onSuccess: (r) => {
      queryClient.invalidateQueries({ queryKey: ['suppliers', store?.id] });
      toast(
        r.linked > 0
          ? `Se ataron ${r.linked} ${r.linked === 1 ? 'compra' : 'compras'} a sus proveedores${r.created > 0 ? ` (${r.created} ${r.created === 1 ? 'ficha nueva' : 'fichas nuevas'})` : ''}.`
          : 'Tus compras ya estaban todas atadas a un proveedor.',
        { variant: 'success' },
      );
    },
    onError: (e) => toast(errMsg(e, 'No se pudieron traer los proveedores.'), { variant: 'error' }),
  });

  return (
    <>
      <PageHeader
        title="Proveedores"
        subtitle="Con quiénes comprás: sus datos, todas sus órdenes de compra y cuánto les debés. Al cargar una compra podés elegir el proveedor de esta lista en vez de volver a escribir el nombre."
        actions={
          <>
            <Button
              variant="secondary"
              onClick={() => importFromPurchases.mutate()}
              disabled={importFromPurchases.isPending}
              title="Crea las fichas de los proveedores que escribiste a mano en tus compras y las ata"
            >
              <span className="inline-flex items-center gap-1.5">
                {importFromPurchases.isPending ? <Spinner inline /> : <PackagePlus className="h-4 w-4" />}
                Traer de mis compras
              </span>
            </Button>
            <Button onClick={() => setCreating(true)}>
              <Plus className="h-4 w-4" /> Nuevo proveedor
            </Button>
          </>
        }
      />

      {rows.length > 0 && (
        <ListStats
          items={[
            { label: 'Proveedores', value: String(rows.length) },
            {
              label: 'Total que les debemos',
              value: formatMoney(Math.abs(debt), 'ARS'),
              tone: debt < 0 ? 'danger' : 'default',
              hint: 'Suma de los saldos en contra de la cuenta corriente de proveedores.',
            },
            {
              label: 'Con compras',
              value: String(rows.filter((r) => r.purchaseCount > 0).length),
              hint: 'Proveedores que ya tienen al menos una orden de compra asociada.',
            },
          ]}
        />
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Input
          type="search"
          aria-label="Buscar proveedores"
          className="w-64"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por nombre o CUIT..."
        />
        <label className="flex items-center gap-2 text-sm text-fg-muted">
          <input
            type="checkbox"
            checked={includeInactive}
            onChange={(e) => list.set({ inactivos: e.target.checked })}
          />
          Mostrar inactivos
        </label>
      </div>

      {rows.length === 0 ? (
        <EmptyList
          icon={<Truck />}
          title={debounced ? 'Ningún proveedor coincide con la búsqueda' : 'Todavía no cargaste proveedores'}
        >
          {!debounced &&
            'Cargá uno y después vas a poder elegirlo al armar una orden de compra, y ver ahí mismo su cuenta corriente.'}
        </EmptyList>
      ) : (
        <div className={TABLE_CARD}>
          <div className={TABLE_SCROLL_X}>
            <table className="w-full text-sm">
              <thead className={TABLE_HEAD_STICKY}>
                <tr className="text-left text-xs uppercase tracking-wide text-fg-muted">
                  <th className="px-4 py-2 font-medium">Proveedor</th>
                  <th className="px-4 py-2 font-medium">CUIT</th>
                  <th className="px-4 py-2 text-right font-medium">Compras</th>
                  <th className="px-4 py-2 text-right font-medium">Saldo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((s) => {
                  // El nombre es un link de verdad (Tab, Enter, abrir en otra
                  // pestaña); el resto de la fila responde al mouse.
                  const row = clickableRowProps(() => onOpen(s.id), { focusable: false });
                  const link = recordLink(s.id);
                  return (
                    <tr key={s.id} {...row} className={cn('hover:bg-bg-muted', row.className)}>
                      <td className="px-4 py-2">
                        <div className="flex items-center gap-2">
                          <Link
                            to={{ search: link.search }}
                            state={link.state}
                            className="font-medium hover:underline"
                          >
                            {s.name}
                          </Link>
                          {!s.active && <Badge variant="neutral">Inactivo</Badge>}
                        </div>
                        {s.email && <div className="text-xs text-fg-subtle">{s.email}</div>}
                      </td>
                      <td className="whitespace-nowrap px-4 py-2 text-fg-muted">{s.taxId ?? '—'}</td>
                      <td className="whitespace-nowrap px-4 py-2 text-right tabular-nums">
                        {s.purchaseCount > 0 ? s.purchaseCount : '—'}
                        {s.lastPurchaseAtUtc && (
                          <div className="text-xs text-fg-subtle">
                            última {formatDate(s.lastPurchaseAtUtc)}
                          </div>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-4 py-2 text-right">
                        {s.balanceMinor === 0 ? (
                          <span className="text-fg-subtle">Al día</span>
                        ) : (
                          <>
                            <div
                              className={`font-medium tabular-nums ${s.balanceMinor < 0 ? 'text-danger' : 'text-success'}`}
                            >
                              {formatMoney(Math.abs(s.balanceMinor), 'ARS')}
                            </div>
                            <div className="text-xs text-fg-subtle">
                              {s.balanceMinor < 0 ? 'le debemos' : 'a favor'}
                            </div>
                          </>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <HelpLink id="proveedores" />

      {creating && <SupplierModal onClose={() => setCreating(false)} />}
    </>
  );
}

// --------------------------------------------------------------------- Ficha

function SupplierDetailView({ id, onBack }: { id: string; onBack: () => void }) {
  const { store } = useStore();
  const navigate = useNavigate();
  const [editing, setEditing] = useState(false);

  const { data } = useQuery({
    queryKey: ['supplier', store?.id, id],
    queryFn: () => api.get<SupplierDetail>(`/api/v1/suppliers/${id}`),
    enabled: !!store,
  });

  if (!data) return <ScreenSkeleton label="Cargando proveedor…" />;

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-[18rem] flex-1">
          <button
            type="button"
            onClick={onBack}
            className="flex items-center gap-1 text-sm text-fg-muted hover:text-fg"
          >
            <ArrowLeft className="h-4 w-4" /> Proveedores
          </button>
          <h1 className="mt-1 flex items-center gap-2 text-2xl font-bold text-fg">
            {data.name}
            {!data.active && <Badge variant="neutral">Inactivo</Badge>}
          </h1>
          <p className="mt-0.5 text-sm text-fg-muted">
            Alta el {formatDate(data.createdAtUtc)} · {data.purchases.length}{' '}
            {data.purchases.length === 1 ? 'orden' : 'órdenes'} de compra
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button
            variant="secondary"
            onClick={() => navigate(`/cuentas-corrientes?tipo=supplier&contacto=${data.id}`)}
          >
            Ver cuenta corriente
          </Button>
          <Button variant="secondary" onClick={() => setEditing(true)}>
            Editar
          </Button>
        </div>
      </div>

      <ListStats
        items={[
          {
            label: 'Saldo',
            value: formatMoney(Math.abs(data.balanceMinor), 'ARS'),
            tone: data.balanceMinor < 0 ? 'danger' : data.balanceMinor > 0 ? 'success' : 'default',
            hint:
              data.balanceMinor < 0
                ? 'Lo que le debemos: sus facturas cargadas menos lo que ya le pagamos.'
                : 'Sin deuda pendiente con este proveedor.',
          },
          { label: 'Órdenes de compra', value: String(data.purchases.length) },
          {
            label: 'Con factura cargada',
            value: String(data.purchases.filter((p) => p.invoiceNumber).length),
            hint: 'Las órdenes cuya factura ya se cargó son las que impactaron en la cuenta corriente.',
          },
        ]}
      />

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="CUIT" value={data.taxId} />
        <Field label="Email" value={data.email} />
        <Field label="Teléfono" value={data.phone} />
        <Field label="País" value={data.country} />
        <Field label="Dirección" value={data.address} className="sm:col-span-2" />
        <Field label="Notas" value={data.notes} className="sm:col-span-2" />
      </div>

      <div className="space-y-2">
        <h2 className="font-medium">Órdenes de compra</h2>
        {data.purchases.length === 0 ? (
          <EmptyList className="p-8">
            Todavía no hay compras asociadas a este proveedor. Al crear una orden de compra, elegilo en el
            selector de proveedor.
          </EmptyList>
        ) : (
          <div className={TABLE_CARD}>
            <div className={TABLE_SCROLL_X}>
              <table className="w-full text-sm">
                <thead className={TABLE_HEAD_STICKY}>
                  <tr className="text-left text-xs uppercase tracking-wide text-fg-muted">
                    <th className="px-4 py-2 font-medium">Referencia</th>
                    <th className="px-4 py-2 font-medium">Estado</th>
                    <th className="px-4 py-2 font-medium">Factura</th>
                    <th className="px-4 py-2 font-medium">Fecha</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {data.purchases.map((p) => (
                    <tr key={p.id}>
                      <td className="px-4 py-2">
                        {/* Cada compra abre su ficha en Compras (?orden=<id>). */}
                        <Link to={`/compras?orden=${p.id}`} className="text-primary hover:underline">
                          {p.reference ?? 'Sin referencia'}
                        </Link>
                      </td>
                      <td className="px-4 py-2">
                        <Badge variant="neutral">{PO_STATUS[p.status] ?? p.status}</Badge>
                      </td>
                      <td className="px-4 py-2 text-fg-muted">{p.invoiceNumber ?? 'Sin cargar'}</td>
                      <td className="whitespace-nowrap px-4 py-2 text-fg-muted">
                        {formatDate(p.createdAtUtc)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {editing && <SupplierModal supplier={data} onClose={() => setEditing(false)} />}
    </>
  );
}

function Field({ label, value, className }: { label: string; value: string | null; className?: string }) {
  return (
    <div className={`rounded-lg border border-border bg-surface p-3 ${className ?? ''}`}>
      <div className="text-xs font-medium uppercase tracking-wide text-fg-subtle">{label}</div>
      <div className="mt-0.5 text-sm">{value || <span className="text-fg-subtle">—</span>}</div>
    </div>
  );
}

function SupplierModal({ supplier, onClose }: { supplier?: SupplierDetail; onClose: () => void }) {
  const { store } = useStore();
  const qc = useQueryClient();
  const { toast } = useToast();
  const editing = !!supplier;

  const [initial] = useState(() => ({
    name: supplier?.name ?? '',
    taxId: supplier?.taxId ?? '',
    email: supplier?.email ?? '',
    phone: supplier?.phone ?? '',
    address: supplier?.address ?? '',
    country: supplier?.country ?? '',
    notes: supplier?.notes ?? '',
    active: supplier?.active ?? true,
  }));
  const [form, setForm] = useState(initial);

  // Con cambios, cerrar pregunta: la X, Escape y el fondo (prop `dirty` del
  // Modal), "Cancelar", y también salir de la ficha con «Atrás» o ir a otra
  // pantalla con el modal abierto (useUnsavedChanges sobre `?proveedor=`).
  const dirty = (Object.keys(initial) as (keyof typeof initial)[]).some((k) => form[k] !== initial[k]);
  const cancel = useGuardedClose(dirty, onClose);
  useUnsavedChanges(dirty, { param: 'proveedor' });

  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) =>
    setForm((cur) => ({ ...cur, [key]: value }));

  const save = useMutation({
    mutationFn: () => {
      const body = {
        name: form.name.trim(),
        taxId: form.taxId.trim() || null,
        email: form.email.trim() || null,
        phone: form.phone.trim() || null,
        address: form.address.trim() || null,
        country: form.country.trim() || null,
        notes: form.notes.trim() || null,
        active: form.active,
      };
      return editing
        ? api.patch(`/api/v1/suppliers/${supplier!.id}`, body)
        : api.post('/api/v1/suppliers', body);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['suppliers', store?.id] });
      if (editing) qc.invalidateQueries({ queryKey: ['supplier', store?.id, supplier!.id] });
      toast(editing ? 'Proveedor actualizado' : 'Proveedor creado', { variant: 'success' });
      onClose();
    },
    onError: (e) => toast(errMsg(e, 'No se pudo guardar'), { variant: 'error' }),
  });

  return (
    <Modal
      open
      onClose={onClose}
      dirty={dirty}
      title={editing ? 'Editar proveedor' : 'Nuevo proveedor'}
      size="lg"
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <FormField label="Nombre" className="sm:col-span-2" required>
          <Input value={form.name} onChange={(e) => set('name', e.target.value)} autoFocus />
        </FormField>
        <FormField label="CUIT / Tax ID">
          <Input value={form.taxId} onChange={(e) => set('taxId', e.target.value)} />
        </FormField>
        <FormField label="País">
          <Input
            value={form.country}
            onChange={(e) => set('country', e.target.value)}
            placeholder="Argentina"
          />
        </FormField>
        <FormField label="Email">
          <Input value={form.email} onChange={(e) => set('email', e.target.value)} type="email" />
        </FormField>
        <FormField label="Teléfono">
          <Input value={form.phone} onChange={(e) => set('phone', e.target.value)} />
        </FormField>
        <FormField label="Dirección" className="sm:col-span-2">
          <Input value={form.address} onChange={(e) => set('address', e.target.value)} />
        </FormField>
        <FormField
          label="Notas"
          className="sm:col-span-2"
          hint="Condiciones de pago, contacto, lo que haga falta recordar."
        >
          <Textarea value={form.notes} onChange={(e) => set('notes', e.target.value)} rows={3} />
        </FormField>
      </div>

      {editing && (
        <label className="mt-3 flex items-center gap-2 text-sm">
          <input type="checkbox" checked={form.active} onChange={(e) => set('active', e.target.checked)} />
          Proveedor activo
        </label>
      )}

      <div className="mt-5 flex justify-end gap-2">
        <Button variant="secondary" onClick={cancel}>
          Cancelar
        </Button>
        <Button
          onClick={() => save.mutate()}
          disabled={!form.name.trim() || save.isPending}
          loading={save.isPending}
        >
          Guardar
        </Button>
      </div>
    </Modal>
  );
}
