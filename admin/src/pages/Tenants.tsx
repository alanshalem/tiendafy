import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Badge,
  Button,
  Card,
  Dropdown,
  FormField,
  Input,
  Modal,
  Table,
  useToast,
  type BadgeVariant,
  type TableColumn,
} from '@tiendafy/ui';
import { MoreVertical, Pencil, Archive, ArchiveRestore, Trash2 } from 'lucide-react';
import type { Tenant } from '@tiendafy/types';
import { api, errMsg } from '../lib/api';

interface TenantsResponse {
  items: Tenant[];
  nextCursor: string | null;
  hasMore: boolean;
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
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<Tenant | null>(null);
  const [deleting, setDeleting] = useState<Tenant | null>(null);
  const [confirmText, setConfirmText] = useState('');
  const confirmMatches = !!deleting && confirmText.trim() === deleting.name;
  const closeDelete = () => { setDeleting(null); setConfirmText(''); };

  const { data, isLoading, isError } = useQuery({
    queryKey: ['tenants'],
    queryFn: () => api.get<TenantsResponse>('/api/v1/tenants?limit=50'),
  });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['tenants'] });
    queryClient.invalidateQueries({ queryKey: ['stores'] });
  };

  const archiveMut = useMutation({
    mutationFn: (t: Tenant) => api.post<Tenant>(`/api/v1/tenants/${t.id}/archive`, {}),
    onSuccess: (t) => { refresh(); toast(`"${t.name}" archivada`, { variant: 'success' }); },
    onError: (e) => toast(errMsg(e), { variant: 'error' }),
  });
  const activateMut = useMutation({
    mutationFn: (t: Tenant) => api.post<Tenant>(`/api/v1/tenants/${t.id}/activate`, {}),
    onSuccess: (t) => { refresh(); toast(`"${t.name}" activada`, { variant: 'success' }); },
    onError: (e) => toast(errMsg(e), { variant: 'error' }),
  });
  const deleteMut = useMutation({
    mutationFn: (t: Tenant) => api.delete<Tenant>(`/api/v1/tenants/${t.id}`),
    onSuccess: (t) => { refresh(); closeDelete(); toast(`"${t.name}" eliminada`, { variant: 'success' }); },
    onError: (e) => toast(errMsg(e), { variant: 'error' }),
  });
  // Solo en desarrollo: borra la tienda y toda su data para siempre.
  const purgeMut = useMutation({
    mutationFn: (t: Tenant) => api.delete<void>(`/api/v1/tenants/${t.id}/purge`),
    onSuccess: (_d, t) => { refresh(); toast(`"${t.name}" borrada definitivamente`, { variant: 'success' }); },
    onError: (e) => toast(errMsg(e), { variant: 'error' }),
  });

  const columns: TableColumn<Tenant>[] = [
    { key: 'name', header: 'Nombre' },
    {
      key: 'subdomain',
      header: 'Tienda',
      cell: (t) => (
        <a href={`http://${t.subdomain}.localhost:3000`} target="_blank" rel="noreferrer" className="text-primary hover:underline">
          {t.subdomain}.localhost:3000
        </a>
      ),
    },
    { key: 'customDomain', header: 'Dominio propio', cell: (t) => t.customDomain ?? <span className="text-fg-subtle">—</span> },
    { key: 'plan', header: 'Plan', cell: (t) => <Badge variant="primary">{t.plan}</Badge> },
    { key: 'status', header: 'Estado', cell: (t) => <Badge variant={statusVariant[t.status]}>{statusLabel[t.status]}</Badge> },
    { key: 'createdAtUtc', header: 'Creada', cell: (t) => new Date(t.createdAtUtc).toLocaleDateString('es-AR') },
    {
      key: 'actions',
      header: '',
      cell: (t) => (
        <div className="flex justify-end">
          <Dropdown>
            <Dropdown.Trigger>
              <MoreVertical className="h-4 w-4" />
            </Dropdown.Trigger>
            <Dropdown.Menu align="end">
              <Dropdown.Item onSelect={() => setEditing(t)}>
                <Pencil className="mr-2 inline h-4 w-4" /> Editar
              </Dropdown.Item>
              {t.status === 'ACTIVE' ? (
                <Dropdown.Item onSelect={() => archiveMut.mutate(t)}>
                  <Archive className="mr-2 inline h-4 w-4" /> Archivar
                </Dropdown.Item>
              ) : (
                <Dropdown.Item onSelect={() => activateMut.mutate(t)}>
                  <ArchiveRestore className="mr-2 inline h-4 w-4" /> Activar
                </Dropdown.Item>
              )}
              <Dropdown.Item destructive onSelect={() => setDeleting(t)}>
                <Trash2 className="mr-2 inline h-4 w-4" /> Eliminar
              </Dropdown.Item>
              {import.meta.env.DEV && (
                <Dropdown.Item
                  destructive
                  onSelect={() => {
                    if (window.confirm(`DEV: borrar "${t.name}" y TODA su data para siempre. ¿Seguro?`)) purgeMut.mutate(t);
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
    <div className="mx-auto max-w-5xl space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Tiendas</h1>
        <Button onClick={() => setCreateOpen(true)}>Crear tienda</Button>
      </div>

      <Card flush>
        {isLoading && <p className="px-4 py-12 text-center text-sm text-fg-muted">Cargando...</p>}
        {isError && (
          <p className="px-4 py-12 text-center text-sm text-danger">
            No se pudo conectar con la API. ¿Está corriendo en :5080?
          </p>
        )}
        {data && (
          <Table columns={columns} rows={data.items} rowKey={(t) => t.id} emptyState="Todavía no hay tiendas. Creá la primera." />
        )}
      </Card>

      <TenantFormModal mode="create" open={createOpen} onClose={() => setCreateOpen(false)} onSaved={refresh} />
      <TenantFormModal mode="edit" tenant={editing ?? undefined} open={!!editing} onClose={() => setEditing(null)} onSaved={refresh} />

      <Modal
        open={!!deleting}
        onClose={closeDelete}
        title="Eliminar tienda"
        footer={
          <>
            <Button variant="secondary" onClick={closeDelete}>Cancelar</Button>
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
            Vas a eliminar <span className="font-semibold text-fg">{deleting?.name}</span>. La tienda deja de estar
            disponible y desaparece de la lista. Sus productos, clientes y configuración quedan guardados pero
            inaccesibles (no se borran de forma definitiva).
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
    if (!name && !subdomain) {
      setResult(null);
      return;
    }
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

  return result;
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
  const [name, setName] = useState('');
  const [subdomain, setSubdomain] = useState('');
  const [customDomain, setCustomDomain] = useState('');
  const [error, setError] = useState<string>();

  // Cargar valores al abrir en modo edición.
  useEffect(() => {
    if (open) {
      setName(tenant?.name ?? '');
      setSubdomain(tenant?.subdomain ?? '');
      setCustomDomain(tenant?.customDomain ?? '');
      setError(undefined);
    }
  }, [open, tenant]);

  const check = useAvailability(name.trim(), subdomain.trim(), tenant?.id);
  const nameTaken = !!name.trim() && check?.nameAvailable === false;
  const subInvalid = !!subdomain.trim() && check?.subdomainValid === false;
  const subTaken = !!subdomain.trim() && check?.subdomainValid !== false && check?.subdomainAvailable === false;

  const save = useMutation({
    mutationFn: () => {
      const body = { name: name.trim(), subdomain: subdomain.trim(), customDomain: customDomain.trim() || null };
      return mode === 'create'
        ? api.post<Tenant>('/api/v1/tenants', body)
        : api.patch<Tenant>(`/api/v1/tenants/${tenant!.id}`, body);
    },
    onSuccess: (t) => {
      onSaved();
      toast(mode === 'create' ? `Tienda "${t.name}" creada` : `Tienda "${t.name}" actualizada`, { variant: 'success' });
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
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button loading={save.isPending} disabled={blocked} onClick={() => save.mutate()}>
            {mode === 'create' ? 'Crear' : 'Guardar'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <FormField label="Nombre" required error={error && !nameTaken ? error : nameTaken ? 'Ya existe una tienda con ese nombre.' : undefined}>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Mi Tienda" />
        </FormField>

        <FormField
          label="URL de la tienda"
          required
          error={subInvalid ? 'URL inválida (3-63, minúsculas, números y guiones).' : subTaken ? 'Esa URL ya está en uso.' : undefined}
          hint={subdomain ? `${subdomain}.localhost:3000` : 'minúsculas, números y guiones'}
        >
          <Input value={subdomain} onChange={(e) => setSubdomain(e.target.value.toLowerCase())} placeholder="mitienda" />
        </FormField>

        {mode === 'edit' && (
          <>
            <FormField label="Dominio propio" hint="Opcional. Ej: www.mitienda.com (la verificación de DNS llega después).">
              <Input value={customDomain} onChange={(e) => setCustomDomain(e.target.value.toLowerCase())} placeholder="www.mitienda.com" />
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
