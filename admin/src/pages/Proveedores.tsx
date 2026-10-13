import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Plus, Truck } from 'lucide-react';
import { Badge, Button, FormField, Input, Modal, Textarea, useToast } from '@tiendafy/ui';
import { useStore } from '../context/StoreContext';
import { api, errMsg } from '../lib/api';
import { formatDate, formatMoney } from '../lib/format';
import { NoStoreSelected } from '../components/NoStoreSelected';
import { HelpLink } from '../components/HelpLink';
import { TABLE_CARD, TABLE_HEAD_STICKY, TABLE_SCROLL_X } from '../lib/styles';
import { ListStats } from '../components/stats/ListStats';
import { useDebouncedValue } from '../lib/useDebouncedValue';
import { ScreenSkeleton } from '../components/Skeleton';

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
  const [selected, setSelected] = useState<string | null>(null);

  if (!store) return <NoStoreSelected />;

  return (
    <div className="space-y-4">
      {selected ? (
        <SupplierDetailView id={selected} onBack={() => setSelected(null)} />
      ) : (
        <SupplierList onOpen={setSelected} />
      )}
    </div>
  );
}

// ------------------------------------------------------------------- Listado

function SupplierList({ onOpen }: { onOpen: (id: string) => void }) {
  const { store } = useStore();
  const [search, setSearch] = useState('');
  const [includeInactive, setIncludeInactive] = useState(false);
  const [creating, setCreating] = useState(false);
  const debounced = useDebouncedValue(search, 300).trim();

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

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-[18rem] flex-1">
          <h1 className="text-xl font-semibold">Proveedores</h1>
          <p className="mt-0.5 text-sm text-fg-muted">
            Con quiénes comprás: sus datos, todas sus órdenes de compra y cuánto les debés. Al cargar una
            compra podés elegir el proveedor de esta lista en vez de volver a escribir el nombre.
          </p>
        </div>
        <Button onClick={() => setCreating(true)}>
          <Plus className="h-4 w-4" /> Nuevo proveedor
        </Button>
      </div>

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
          className="w-64"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por nombre o CUIT..."
        />
        <label className="flex items-center gap-2 text-sm text-fg-muted">
          <input
            type="checkbox"
            checked={includeInactive}
            onChange={(e) => setIncludeInactive(e.target.checked)}
          />
          Mostrar inactivos
        </label>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-surface/50 p-10 text-center">
          <Truck className="mx-auto h-8 w-8 text-fg-subtle" />
          <p className="mt-2 text-sm font-medium">
            {debounced ? 'Ningún proveedor coincide con la búsqueda' : 'Todavía no cargaste proveedores'}
          </p>
          {!debounced && (
            <p className="mt-1 text-sm text-fg-muted">
              Cargá uno y después vas a poder elegirlo al armar una orden de compra, y ver ahí mismo su cuenta
              corriente.
            </p>
          )}
        </div>
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
                {rows.map((s) => (
                  <tr key={s.id} onClick={() => onOpen(s.id)} className="cursor-pointer hover:bg-bg-muted">
                    <td className="px-4 py-2">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{s.name}</span>
                        {!s.active && <Badge variant="neutral">Inactivo</Badge>}
                      </div>
                      {s.email && <div className="text-xs text-fg-subtle">{s.email}</div>}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2 text-fg-muted">{s.taxId ?? '—'}</td>
                    <td className="whitespace-nowrap px-4 py-2 text-right tabular-nums">
                      {s.purchaseCount > 0 ? s.purchaseCount : '—'}
                      {s.lastPurchaseAtUtc && (
                        <div className="text-xs text-fg-subtle">última {formatDate(s.lastPurchaseAtUtc)}</div>
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
                ))}
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
          <h1 className="mt-1 flex items-center gap-2 text-xl font-semibold">
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
          <div className="rounded-lg border border-dashed border-border bg-surface/50 p-8 text-center text-sm text-fg-muted">
            Todavía no hay compras asociadas a este proveedor. Al crear una orden de compra, elegilo en el
            selector de proveedor.
          </div>
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
                      <td className="px-4 py-2">{p.reference ?? '—'}</td>
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

  const [form, setForm] = useState({
    name: supplier?.name ?? '',
    taxId: supplier?.taxId ?? '',
    email: supplier?.email ?? '',
    phone: supplier?.phone ?? '',
    address: supplier?.address ?? '',
    country: supplier?.country ?? '',
    notes: supplier?.notes ?? '',
    active: supplier?.active ?? true,
  });

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
    <Modal open onClose={onClose} title={editing ? 'Editar proveedor' : 'Nuevo proveedor'} size="lg">
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
        <Button variant="secondary" onClick={onClose}>
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
