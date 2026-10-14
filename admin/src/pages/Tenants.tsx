import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { formatDate, formatMoney, formatNumber } from '../lib/format';
import {
  Badge,
  Button,
  Card,
  Dropdown,
  FormField,
  Input,
  Modal,
  Table,
  useConfirm,
  useToast,
  type BadgeVariant,
  type TableColumn,
  PageHeader,
} from '@tiendafy/ui';
import { MoreVertical, Pencil, Archive, ArchiveRestore, Plus, Trash2 } from 'lucide-react';
import type { Tenant } from '@tiendafy/types';
import { api, errMsg } from '../lib/api';
import { storefrontHost, storePublicHost, storePublicUrl } from '../lib/storefront';
import { ListStats } from '../components/stats/ListStats';
import { Delta } from '../components/charts/viz';
import { TableSkeleton } from '../components/Skeleton';

interface TenantsResponse {
  items: Tenant[];
  nextCursor: string | null;
  hasMore: boolean;
  /** Abrir tiendas nuevas es de dueños (o la primera de quien no está en ninguna). */
  canCreate?: boolean;
  /** Las tiendas donde es dueño: las únicas que puede editar, archivar o borrar. */
  manageable?: string[];
}

/** Pulso de una tienda del grupo (ventana de 30 días). */
interface TenantMetrics {
  tenantId: string;
  orders: number;
  revenueMinor: number;
  previousRevenueMinor: number;
  currency: string;
  publishedProducts: number;
  lastOrderAtUtc: string | null;
}

interface OverviewResponse {
  days: number;
  items: TenantMetrics[];
}

/** Ventana del tablero, en días. */
const WINDOW_DAYS = 30;

/** "hace 3 días" — para ver de un vistazo qué tienda dejó de vender. */
function sinceLabel(iso: string | null): string {
  if (!iso) return 'Nunca vendió';
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) return 'Hoy';
  if (days === 1) return 'Ayer';
  if (days < 30) return `Hace ${days} días`;
  const months = Math.round(days / 30);
  return months === 1 ? 'Hace un mes' : `Hace ${months} meses`;
}

const statusVariant: Record<Tenant['status'], BadgeVariant> = {
  ACTIVE: 'success',
  SUSPENDED: 'warning',
  CANCELED: 'neutral',
};

const statusLabel: Record<Tenant['status'], string> = {
  ACTIVE: 'Activa',
  SUSPENDED: 'Archivada',
  CANCELED: 'Eliminada',
};

export function TenantsPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const confirm = useConfirm();
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<Tenant | null>(null);
  const [deleting, setDeleting] = useState<Tenant | null>(null);
  const [confirmText, setConfirmText] = useState('');
  const confirmMatches = !!deleting && confirmText.trim() === deleting.name;
  const closeDelete = () => {
    setDeleting(null);
    setConfirmText('');
  };

  const { data, isLoading, isError } = useQuery({
    queryKey: ['tenants'],
    queryFn: () => api.get<TenantsResponse>('/api/v1/tenants?limit=50'),
  });
  const canCreate = data?.canCreate ?? false;
  const manageable = new Set(data?.manageable ?? []);

  // El pulso de cada tienda va aparte: si el tablero falla o tarda, la lista
  // (que es lo que permite operar) igual se muestra.
  const { data: overview } = useQuery({
    queryKey: ['tenants-overview', WINDOW_DAYS],
    queryFn: () => api.get<OverviewResponse>(`/api/v1/tenants/overview?days=${WINDOW_DAYS}`),
  });

  const metrics = new Map((overview?.items ?? []).map((m) => [m.tenantId, m]));
  const all = overview?.items ?? [];
  const revenue = all.reduce((sum, m) => sum + m.revenueMinor, 0);
  const previousRevenue = all.reduce((sum, m) => sum + m.previousRevenueMinor, 0);
  const currency = all.find((m) => m.revenueMinor > 0)?.currency ?? 'ARS';
  const activeStores = (data?.items ?? []).filter((t) => t.status === 'ACTIVE').length;
  const selling = all.filter((m) => m.orders > 0).length;

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['tenants'] });
    queryClient.invalidateQueries({ queryKey: ['stores'] });
  };

  const archiveMut = useMutation({
    mutationFn: (t: Tenant) => api.post<Tenant>(`/api/v1/tenants/${t.id}/archive`, {}),
    onSuccess: (t) => {
      refresh();
      toast(`"${t.name}" archivada`, { variant: 'success' });
    },
    onError: (e) => toast(errMsg(e), { variant: 'error' }),
  });
  const activateMut = useMutation({
    mutationFn: (t: Tenant) => api.post<Tenant>(`/api/v1/tenants/${t.id}/activate`, {}),
    onSuccess: (t) => {
      refresh();
      toast(`"${t.name}" activada`, { variant: 'success' });
    },
    onError: (e) => toast(errMsg(e), { variant: 'error' }),
  });
  // Archivar/activar en curso: el menú no deja mandarlo dos veces.
  const statusBusy = archiveMut.isPending || activateMut.isPending;
  const deleteMut = useMutation({
    mutationFn: (t: Tenant) => api.delete<Tenant>(`/api/v1/tenants/${t.id}`),
    onSuccess: (t) => {
      refresh();
      closeDelete();
      toast(`"${t.name}" eliminada`, { variant: 'success' });
    },
    onError: (e) => toast(errMsg(e), { variant: 'error' }),
  });
  // Solo en desarrollo: borra la tienda y toda su data para siempre.
  const purgeMut = useMutation({
    mutationFn: (t: Tenant) => api.delete<void>(`/api/v1/tenants/${t.id}/purge`),
    onSuccess: (_d, t) => {
      refresh();
      toast(`"${t.name}" borrada definitivamente`, { variant: 'success' });
    },
    onError: (e) => toast(errMsg(e), { variant: 'error' }),
  });

  const columns: TableColumn<Tenant>[] = [
    { key: 'name', header: 'Nombre' },
    {
      key: 'subdomain',
      header: 'Tienda',
      cell: (t) => (
        <a
          href={storePublicUrl({ subdomain: t.subdomain })}
          target="_blank"
          rel="noreferrer"
          className="text-primary hover:underline"
        >
          {storePublicHost({ subdomain: t.subdomain })}
        </a>
      ),
    },
    {
      key: 'customDomain',
      header: 'Dominio propio',
      cell: (t) => t.customDomain ?? <span className="text-fg-subtle">—</span>,
    },
    {
      key: 'status',
      header: 'Estado',
      cell: (t) => <Badge variant={statusVariant[t.status]}>{statusLabel[t.status]}</Badge>,
    },
    {
      key: 'sales',
      header: `Ventas (${WINDOW_DAYS} d)`,
      cell: (t) => {
        const m = metrics.get(t.id);
        if (!m) return <span className="text-fg-subtle">—</span>;
        return (
          <div>
            <div className="font-semibold tabular-nums text-fg">
              {formatMoney(m.revenueMinor, m.currency)}
            </div>
            <div className="text-xs text-fg-subtle">
              {m.orders} {m.orders === 1 ? 'venta' : 'ventas'} · {sinceLabel(m.lastOrderAtUtc)}
            </div>
          </div>
        );
      },
    },
    {
      key: 'trend',
      header: 'Tendencia',
      cell: (t) => {
        const m = metrics.get(t.id);
        if (!m) return <span className="text-fg-subtle">—</span>;
        return <Delta current={m.revenueMinor} previous={m.previousRevenueMinor} />;
      },
    },
    {
      key: 'catalog',
      header: 'Publicados',
      cell: (t) => {
        const m = metrics.get(t.id);
        if (!m) return <span className="text-fg-subtle">—</span>;
        return (
          <span className={m.publishedProducts === 0 ? 'text-warning' : 'tabular-nums text-fg'}>
            {m.publishedProducts === 0 ? 'Sin catálogo' : formatNumber(m.publishedProducts)}
          </span>
        );
      },
    },
    {
      key: 'createdAtUtc',
      header: 'Creada',
      cell: (t) => formatDate(t.createdAtUtc),
    },
    {
      key: 'actions',
      header: '',
      cell: (t) =>
        manageable.has(t.id) && (
          <div className="flex justify-end">
            <Dropdown>
              <Dropdown.Trigger label={`Acciones de ${t.name}`}>
                <MoreVertical className="h-4 w-4" />
              </Dropdown.Trigger>
              <Dropdown.Menu align="end">
                <Dropdown.Item onSelect={() => setEditing(t)}>
                  <Pencil className="mr-2 inline h-4 w-4" /> Editar
                </Dropdown.Item>
                {t.status === 'ACTIVE' ? (
                  <Dropdown.Item disabled={statusBusy} onSelect={() => archiveMut.mutate(t)}>
                    <Archive className="mr-2 inline h-4 w-4" /> Archivar
                  </Dropdown.Item>
                ) : (
                  <Dropdown.Item disabled={statusBusy} onSelect={() => activateMut.mutate(t)}>
                    <ArchiveRestore className="mr-2 inline h-4 w-4" /> Activar
                  </Dropdown.Item>
                )}
                <Dropdown.Item destructive onSelect={() => setDeleting(t)}>
                  <Trash2 className="mr-2 inline h-4 w-4" /> Eliminar
                </Dropdown.Item>
                {import.meta.env.DEV && (
                  <Dropdown.Item
                    destructive
                    onSelect={async () => {
                      const ok = await confirm({
                        title: 'Borrar definitivo (dev)',
                        message: `Se borra "${t.name}" y TODA su data para siempre. No se puede deshacer.`,
                        confirmLabel: 'Borrar para siempre',
                        variant: 'danger',
                      });
                      if (ok) purgeMut.mutate(t);
                    }}
                  >
                    <Trash2 className="mr-2 inline h-4 w-4" /> Borrar definitivo (dev)
                  </Dropdown.Item>
                )}
              </Dropdown.Menu>
            </Dropdown>
          </div>
        ),
    },
  ];

  return (
    <div className="space-y-4">
      {/* Mismo nombre que en el menú: entrar a "Mis tiendas" y leer
          "Tiendas" hacía dudar de si era la misma pantalla. */}
      <PageHeader
        title="Mis tiendas"
        subtitle={`Todas las tiendas del grupo y cómo viene cada una en los últimos ${WINDOW_DAYS} días.`}
        actions={
          canCreate && (
            <Button onClick={() => setCreateOpen(true)}>
              <span className="inline-flex items-center gap-1.5">
                <Plus className="h-4 w-4" /> Crear tienda
              </span>
            </Button>
          )
        }
      />

      <ListStats
        items={[
          {
            label: 'Tiendas activas',
            value: formatNumber(activeStores),
            hint: 'Tiendas publicadas y visibles. Las archivadas no cuentan.',
          },
          {
            label: `Facturado (${WINDOW_DAYS} d)`,
            value: formatMoney(revenue, currency),
            hint: 'Suma de las ventas cobradas de todas las tiendas del grupo.',
          },
          {
            label: 'Ventas del grupo',
            value: formatNumber(all.reduce((sum, m) => sum + m.orders, 0)),
          },
          {
            label: 'Tiendas que vendieron',
            value: `${selling} de ${all.length}`,
            hint: 'Cuántas tiendas registraron al menos una venta cobrada en el período.',
            tone: all.length > 0 && selling < all.length ? 'warning' : 'default',
          },
        ]}
      />

      {previousRevenue > 0 && (
        <p className="text-sm text-fg-muted">
          Facturación del grupo <Delta current={revenue} previous={previousRevenue} />
        </p>
      )}

      <Card flush>
        {isLoading && <TableSkeleton label="Cargando tiendas…" />}
        {isError && (
          <p className="px-4 py-12 text-center text-sm text-danger">
            No se pudo conectar con la API. ¿Está corriendo en :5080?
          </p>
        )}
        {data && (
          <Table
            columns={columns}
            rows={data.items}
            rowKey={(t) => t.id}
            emptyState="Todavía no hay tiendas. Creá la primera."
          />
        )}
      </Card>

      {/* La key vuelve a montar el formulario en cada apertura: arranca con los
          datos de ese momento, sin un efecto que los copie después. */}
      <TenantFormModal
        key={createOpen ? 'alta' : 'alta-cerrada'}
        mode="create"
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onSaved={refresh}
      />
      <TenantFormModal
        key={editing?.id ?? 'edicion-cerrada'}
        mode="edit"
        tenant={editing ?? undefined}
        open={!!editing}
        onClose={() => setEditing(null)}
        onSaved={refresh}
      />

      <Modal
        open={!!deleting}
        onClose={closeDelete}
        title="Eliminar tienda"
        footer={
          <>
            <Button variant="secondary" onClick={closeDelete}>
              Cancelar
            </Button>
            <Button
              variant="danger"
              loading={deleteMut.isPending}
              disabled={!confirmMatches}
              onClick={() => confirmMatches && deleting && deleteMut.mutate(deleting)}
            >
              Eliminar tienda
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <p className="text-sm text-fg-muted">
            Vas a eliminar <span className="font-semibold text-fg">{deleting?.name}</span>. La tienda deja de
            estar disponible y desaparece de la lista. Sus productos, clientes y configuración quedan
            guardados pero inaccesibles (no se borran de forma definitiva).
          </p>
          <div className="rounded-md border border-danger/30 bg-danger-bg px-3 py-2 text-sm text-danger">
            Esta acción corta el storefront público de inmediato. Es reversible solo desde soporte.
          </div>
          <FormField label={`Escribí "${deleting?.name ?? ''}" para confirmar`}>
            <Input
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder={deleting?.name}
              autoFocus
            />
          </FormField>
        </div>
      </Modal>
    </div>
  );
}

interface CheckResult {
  subdomainValid: boolean;
  subdomainAvailable: boolean;
  nameAvailable: boolean;
}

/** Chequeo de disponibilidad con debounce contra /tenants/check. */
function useAvailability(name: string, subdomain: string, excludeId?: string) {
  const [result, setResult] = useState<CheckResult | null>(null);

  useEffect(() => {
    if (!name && !subdomain) return;
    const handle = setTimeout(async () => {
      const qs = new URLSearchParams();
      if (name) qs.set('name', name);
      if (subdomain) qs.set('subdomain', subdomain);
      if (excludeId) qs.set('excludeId', excludeId);
      try {
        setResult(await api.get<CheckResult>(`/api/v1/tenants/check?${qs.toString()}`));
      } catch {
        setResult(null);
      }
    }, 400);
    return () => clearTimeout(handle);
  }, [name, subdomain, excludeId]);

  // Sin nada escrito no hay chequeo que mostrar (aunque quede uno viejo guardado).
  return name || subdomain ? result : null;
}

function TenantFormModal({
  mode,
  tenant,
  open,
  onClose,
  onSaved,
}: {
  mode: 'create' | 'edit';
  tenant?: Tenant;
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  // Crear = vacío, editar = datos de la tienda (ver la key en quien lo abre).
  const [name, setName] = useState(tenant?.name ?? '');
  const [subdomain, setSubdomain] = useState(tenant?.subdomain ?? '');
  const [customDomain, setCustomDomain] = useState(tenant?.customDomain ?? '');
  const [error, setError] = useState<string>();

  const check = useAvailability(name.trim(), subdomain.trim(), tenant?.id);
  const nameTaken = !!name.trim() && check?.nameAvailable === false;
  const subInvalid = !!subdomain.trim() && check?.subdomainValid === false;
  const subTaken =
    !!subdomain.trim() && check?.subdomainValid !== false && check?.subdomainAvailable === false;

  const save = useMutation({
    mutationFn: () => {
      const body = {
        name: name.trim(),
        subdomain: subdomain.trim(),
        customDomain: customDomain.trim() || null,
      };
      return mode === 'create'
        ? api.post<Tenant>('/api/v1/tenants', body)
        : api.patch<Tenant>(`/api/v1/tenants/${tenant!.id}`, body);
    },
    onSuccess: (t) => {
      onSaved();
      toast(mode === 'create' ? `Tienda "${t.name}" creada` : `Tienda "${t.name}" actualizada`, {
        variant: 'success',
      });
      onClose();
    },
    onError: (err) => setError(errMsg(err, 'Error inesperado')),
  });

  const blocked = !name.trim() || !subdomain.trim() || nameTaken || subInvalid || subTaken;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={mode === 'create' ? 'Crear tienda' : 'Editar tienda'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button loading={save.isPending} disabled={blocked} onClick={() => save.mutate()}>
            {mode === 'create' ? 'Crear' : 'Guardar'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <FormField
          label="Nombre"
          required
          error={error && !nameTaken ? error : nameTaken ? 'Ya existe una tienda con ese nombre.' : undefined}
        >
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Mi Tienda" />
        </FormField>

        <FormField
          label="URL de la tienda"
          required
          error={
            subInvalid
              ? 'URL inválida (3-63, minúsculas, números y guiones).'
              : subTaken
                ? 'Esa URL ya está en uso.'
                : undefined
          }
          hint={subdomain ? storefrontHost(subdomain) : 'minúsculas, números y guiones'}
        >
          <Input
            value={subdomain}
            onChange={(e) => setSubdomain(e.target.value.toLowerCase())}
            placeholder="mitienda"
          />
        </FormField>

        {mode === 'edit' && (
          <>
            <FormField
              label="Dominio propio"
              hint="Opcional. Ej: www.mitienda.com (la verificación de DNS llega después)."
            >
              <Input
                value={customDomain}
                onChange={(e) => setCustomDomain(e.target.value.toLowerCase())}
                placeholder="www.mitienda.com"
              />
            </FormField>
            <p className="rounded-md bg-bg-subtle px-3 py-2 text-xs text-fg-muted">
              Cambiar la URL hace que el link viejo deje de funcionar. El panel sigue andando igual.
            </p>
          </>
        )}
      </div>
    </Modal>
  );
}
