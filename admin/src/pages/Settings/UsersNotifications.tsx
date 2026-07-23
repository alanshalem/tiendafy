import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, Plus, Trash2, User } from 'lucide-react';
import { cn, useToast, useConfirm } from '@tiendafy/ui';
import { api, errMsg } from '../../lib/api';
import { HelpLink } from '../../components/HelpLink';
import { usePermissions } from '../../context/PermissionsContext';
import { SettingsHeader } from './SettingsLayout';

interface Me {
  id: string;
  email: string;
  name: string;
}
interface Member {
  userId: string;
  role: string;
  email: string | null;
  name: string | null;
  createdAtUtc: string;
}

interface RoleMeta {
  value: string;
  label: string;
  desc: string;
  badge: string;
}

const ROLES: RoleMeta[] = [
  { value: 'owner', label: 'Dueño', desc: 'control total', badge: 'bg-amber-100 text-amber-700' },
  { value: 'admin', label: 'Administrador', desc: 'todo lo operativo', badge: 'bg-purple-100 text-purple-700' },
  { value: 'vendedor', label: 'Vendedor', desc: 'ventas, clientes y chat', badge: 'bg-sky-100 text-sky-700' },
  { value: 'catalogo', label: 'Catálogo', desc: 'productos e inventario', badge: 'bg-green-100 text-green-700' },
  { value: 'finanzas', label: 'Finanzas', desc: 'reportes y reembolsos', badge: 'bg-blue-100 text-blue-700' },
  { value: 'soporte', label: 'Soporte', desc: 'posventa y mensajes', badge: 'bg-rose-100 text-rose-700' },
];

/** "staff" es el rol legacy: equivale a admin. */
const normalizeRole = (r: string): string => (r === 'staff' ? 'admin' : r);

const roleMeta = (r: string): RoleMeta =>
  ROLES.find((x) => x.value === normalizeRole(r)) ?? {
    value: r,
    label: r,
    desc: '',
    badge: 'bg-gray-100 text-gray-600',
  };

const roleOptionLabel = (r: RoleMeta) => (r.desc ? `${r.label} — ${r.desc}` : r.label);

export function UsersNotificationsPage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const confirm = useConfirm();
  const { role: myRoleRaw, can } = usePermissions();
  const myRole = normalizeRole(myRoleRaw ?? '');
  const isOwner = myRole === 'owner';
  const canManage = can('members.manage');

  const { data: me } = useQuery({
    queryKey: ['auth-me'],
    queryFn: () => api.get<Me>('/api/v1/auth/me').catch(() => null),
  });

  const membersQ = useQuery({
    queryKey: ['members'],
    queryFn: () => api.get<{ items: Member[] }>('/api/v1/members'),
    retry: false,
  });

  // Roles asignables: nunca por encima del propio. Solo el dueño puede asignar "owner".
  const assignable = isOwner ? ROLES : ROLES.filter((r) => r.value !== 'owner');

  const [adding, setAdding] = useState(false);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('vendedor');

  const invalidate = () => qc.invalidateQueries({ queryKey: ['members'] });
  // El backend valida jerarquía y devuelve mensajes en español: se muestran tal cual.
  const onError = (e: unknown) => toast(errMsg(e, 'No se pudo completar la acción.'), { variant: 'error' });

  const addM = useMutation({
    mutationFn: () => api.post('/api/v1/members', { email, role }),
    onSuccess: () => {
      setEmail('');
      setRole('vendedor');
      setAdding(false);
      toast('Usuario agregado', { variant: 'success' });
      invalidate();
    },
    onError,
  });
  const changeRole = useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: string }) =>
      api.patch(`/api/v1/members/${userId}`, { role }),
    onSuccess: () => {
      toast('Rol actualizado', { variant: 'success' });
      invalidate();
    },
    onError,
  });
  const removeM = useMutation({
    mutationFn: (userId: string) => api.delete(`/api/v1/members/${userId}`),
    onSuccess: () => {
      toast('Usuario quitado', { variant: 'success' });
      invalidate();
    },
    onError,
  });

  const members = membersQ.data?.items ?? [];

  return (
    <div className="mx-auto max-w-4xl">
      <SettingsHeader
        title="Usuarios y permisos"
        description="Invitá a tu equipo y elegí qué puede hacer cada uno en el panel."
        action={
          canManage && (
            <button
              onClick={() => setAdding((v) => !v)}
              className="inline-flex h-10 items-center gap-1.5 rounded-md bg-primary px-4 text-sm font-semibold text-primary-fg hover:bg-primary-hover"
            >
              <Plus className="h-4 w-4" /> Agregar usuario
            </button>
          )
        }
      />

      {membersQ.isError ? (
        <div className="rounded-lg border border-dashed border-border py-12 text-center text-sm text-fg-muted">
          {errMsg(membersQ.error, 'No se pudo cargar la lista de usuarios.')}
        </div>
      ) : (
        <>
          {adding && canManage && (
            <div className="mb-4 rounded-lg border border-border bg-surface p-4 shadow-card">
              <p className="mb-2 text-sm text-fg-muted">
                La persona tiene que tener una cuenta de Tiendafy. Ingresá su email y elegí un rol.
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="email@ejemplo.com"
                  className="h-10 min-w-[14rem] flex-1 rounded-md border border-border bg-bg px-3 text-sm text-fg outline-none focus:border-primary"
                />
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  className="h-10 rounded-md border border-border bg-bg px-3 text-sm text-fg outline-none focus:border-primary"
                >
                  {assignable.map((r) => (
                    <option key={r.value} value={r.value}>
                      {roleOptionLabel(r)}
                    </option>
                  ))}
                </select>
                <button
                  onClick={() => addM.mutate()}
                  disabled={!email || addM.isPending}
                  className="inline-flex h-10 items-center gap-1.5 rounded-md bg-primary px-4 text-sm font-semibold text-primary-fg hover:bg-primary-hover disabled:opacity-60"
                >
                  {addM.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Agregar'}
                </button>
              </div>
            </div>
          )}

          <div className="overflow-hidden rounded-lg border border-border bg-surface shadow-card">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-bg-subtle text-left text-xs font-medium uppercase tracking-wide text-fg-muted">
                  <th className="px-4 py-2.5">Nombre</th>
                  <th className="px-4 py-2.5">Email</th>
                  <th className="px-4 py-2.5">Rol</th>
                  <th className="px-4 py-2.5">Desde</th>
                  <th className="px-4 py-2.5 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {membersQ.isLoading && (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-fg-muted">
                      <Loader2 className="mx-auto h-5 w-5 animate-spin" />
                    </td>
                  </tr>
                )}
                {members.map((m) => {
                  const isMe = m.userId === me?.id;
                  const meta = roleMeta(m.role);
                  // Sin ser owner no se puede tocar a un owner (el backend igual lo bloquea).
                  const lockedOwner = normalizeRole(m.role) === 'owner' && !isOwner;
                  const editable = canManage && !lockedOwner;
                  const options = assignable.some((r) => r.value === normalizeRole(m.role))
                    ? assignable
                    : [meta, ...assignable];
                  return (
                    <tr key={m.userId} className="border-b border-border last:border-b-0">
                      <td className="px-4 py-3">
                        <div className="font-medium text-fg">{m.name ?? '—'}</div>
                        {isMe && (
                          <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                            <User className="h-3.5 w-3.5" /> Vos
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-fg-muted">{m.email ?? '—'}</td>
                      <td className="px-4 py-3">
                        {editable ? (
                          <select
                            value={normalizeRole(m.role)}
                            disabled={changeRole.isPending}
                            onChange={(e) => changeRole.mutate({ userId: m.userId, role: e.target.value })}
                            className="rounded-md border border-border bg-bg px-2 py-1 text-xs text-fg outline-none focus:border-primary disabled:opacity-60"
                            title={meta.desc || undefined}
                          >
                            {options.map((r) => (
                              <option key={r.value} value={r.value}>
                                {roleOptionLabel(r)}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <span
                            className={cn('rounded-full px-2.5 py-0.5 text-xs font-semibold', meta.badge)}
                            title={meta.desc || undefined}
                          >
                            {meta.label}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs text-fg-muted">
                        {new Date(m.createdAtUtc).toLocaleDateString('es-AR')}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {editable && (
                          <button
                            onClick={async () => {
                              if (
                                await confirm({
                                  title: 'Quitar de la tienda',
                                  message: `¿Quitar a ${m.email ?? m.name ?? 'este usuario'} de la tienda?`,
                                  confirmLabel: 'Quitar',
                                  variant: 'danger',
                                })
                              )
                                removeM.mutate(m.userId);
                            }}
                            disabled={removeM.isPending}
                            className="rounded-full border border-border p-1.5 text-fg-muted hover:bg-danger/10 hover:text-danger disabled:opacity-60"
                            aria-label="Quitar"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {!membersQ.isLoading && members.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-fg-muted">
                      No hay usuarios.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="mt-3 grid gap-1 text-xs text-fg-muted sm:grid-cols-2">
            {ROLES.map((r) => (
              <div key={r.value}>
                <strong className="text-fg">{r.label}</strong> — {r.desc}
              </div>
            ))}
          </div>
        </>
      )}

      <HelpLink id="users" />
    </div>
  );
}
