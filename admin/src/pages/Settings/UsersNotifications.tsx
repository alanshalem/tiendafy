import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, Plus, ShieldAlert, ShieldCheck, Trash2, User } from 'lucide-react';
import { cn, useToast, useConfirm } from '@tiendafy/ui';
import { api, errMsg } from '../../lib/api';
import { HelpLink } from '../../components/HelpLink';
import { usePermissions } from '../../context/PermissionsContext';
import { useAuth } from '../../context/AuthContext';
import { SettingsHeader } from './SettingsLayout';
import { formatDate } from '../../lib/format';
import { TABLE_CARD, TABLE_HEAD_STICKY_SUBTLE } from '../../lib/styles';
import { Pagination, pageRangeLabel } from '../../components/Pagination';
import { ListStats } from '../../components/stats/ListStats';
import { RolePermissionsMatrix, SENSITIVE_KEYS, usePermissionMatrix } from './RolePermissionsMatrix';

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
  {
    value: 'admin',
    label: 'Administrador',
    desc: 'todo lo operativo',
    badge: 'bg-purple-100 text-purple-700',
  },
  { value: 'vendedor', label: 'Vendedor', desc: 'ventas, clientes y chat', badge: 'bg-sky-100 text-sky-700' },
  {
    value: 'catalogo',
    label: 'Catálogo',
    desc: 'productos e inventario',
    badge: 'bg-green-100 text-green-700',
  },
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

const ROLE_LABELS: Record<string, string> = Object.fromEntries(ROLES.map((r) => [r.value, r.label]));

/** Usuarios por página. */
const PAGE_SIZE = 25;

export function UsersNotificationsPage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const confirm = useConfirm();
  const { role: myRoleRaw, can } = usePermissions();
  const { user: me } = useAuth();
  const myRole = normalizeRole(myRoleRaw ?? '');
  const isOwner = myRole === 'owner';
  const canManage = can('members.manage');

  const [page, setPage] = useState(1);
  const membersQ = useQuery({
    queryKey: ['members', page],
    queryFn: () =>
      api.get<{ items: Member[]; total: number }>(
        `/api/v1/members?limit=${PAGE_SIZE}&offset=${(page - 1) * PAGE_SIZE}`,
      ),
    retry: false,
  });
  const totalPages = Math.max(1, Math.ceil((membersQ.data?.total ?? 0) / PAGE_SIZE));

  // Roles asignables: nunca por encima del propio. Solo el dueño puede asignar "owner".
  const assignable = isOwner ? ROLES : ROLES.filter((r) => r.value !== 'owner');

  const [adding, setAdding] = useState(false);
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState('vendedor');

  const invalidate = () => qc.invalidateQueries({ queryKey: ['members'] });
  // El backend valida jerarquía y devuelve mensajes en español: se muestran tal cual.
  const onError = (e: unknown) => toast(errMsg(e, 'No se pudo completar la acción.'), { variant: 'error' });

  const addM = useMutation({
    mutationFn: () => api.post('/api/v1/members', { email, role, name: name.trim() || null }),
    onSuccess: () => {
      setEmail('');
      setName('');
      setRole('vendedor');
      setAdding(false);
      toast('Usuario agregado. Le llegó un email para definir su contraseña.', { variant: 'success' });
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
  const [matrixOpen, setMatrixOpen] = useState(false);

  // La matriz real del backend: la misma que decide los permisos en cada
  // request. Sirve para marcar quién tiene accesos sensibles sin repetir acá
  // una copia de la política que puede quedar desactualizada.
  const { data: matrix } = usePermissionMatrix();
  const permissionsOf = (role: string): string[] =>
    matrix?.items.find((r) => r.role === normalizeRole(role))?.permissions ?? [];
  const sensitiveOf = (role: string) => permissionsOf(role).filter((p) => SENSITIVE_KEYS.includes(p));

  const total = membersQ.data?.total ?? 0;
  const owners = members.filter((m) => normalizeRole(m.role) === 'owner');
  const canRefund = members.filter((m) => permissionsOf(m.role).includes('orders.refund'));
  const canInvite = members.filter((m) => permissionsOf(m.role).includes('members.manage'));

  /**
   * Los cambios que no se pueden deshacer solos piden confirmación: ascender a
   * alguien a dueño le da control total de la tienda, y bajarse el rol propio
   * puede dejarte sin poder volver a entrar acá.
   */
  const confirmRoleChange = async (m: Member, next: string): Promise<boolean> => {
    const who = m.name ?? m.email ?? 'esta persona';

    if (next === 'owner') {
      return confirm({
        title: 'Hacer dueño',
        message: `${who} va a tener control total de la tienda, incluido borrarla y sacarte a vos. ¿Seguís?`,
        confirmLabel: 'Sí, hacer dueño',
        variant: 'danger',
      });
    }

    if (m.userId === me?.id) {
      return confirm({
        title: 'Cambiar tu propio rol',
        message:
          'Vas a cambiar tus permisos. Según el rol que elijas, puede que ya no puedas volver a esta pantalla.',
        confirmLabel: 'Cambiar igual',
        variant: 'danger',
      });
    }

    return true;
  };

  return (
    <div className="mx-auto max-w-4xl">
      <SettingsHeader
        title="Usuarios y permisos"
        description={`Invitá a tu equipo y elegí qué puede hacer cada uno en el panel.${
          (membersQ.data?.total ?? 0) > 0
            ? ` · ${pageRangeLabel(page, PAGE_SIZE, membersQ.data!.total, membersQ.data!.total === 1 ? 'usuario' : 'usuarios')}`
            : ''
        }`}
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
          {total > 0 && (
            <ListStats
              className="mb-4"
              items={[
                {
                  label: 'Personas con acceso',
                  value: total.toLocaleString('es-AR'),
                  hint: 'Cuánta gente puede entrar al panel de esta tienda.',
                },
                {
                  label: 'Dueños',
                  value: owners.length.toLocaleString('es-AR'),
                  hint: 'Control total: pueden cambiar cualquier cosa, incluido borrar la tienda.',
                  tone: owners.length === 1 ? 'warning' : 'default',
                },
                {
                  label: 'Pueden devolver plata',
                  value: canRefund.length.toLocaleString('es-AR'),
                  hint: 'Un reembolso mueve dinero real y no se puede deshacer.',
                  tone: canRefund.length > 0 ? 'warning' : 'default',
                },
                {
                  label: 'Pueden invitar gente',
                  value: canInvite.length.toLocaleString('es-AR'),
                  hint: 'Quien puede sumar gente al equipo puede darle accesos a alguien más.',
                },
              ]}
            />
          )}

          {/* Un solo dueño es un punto único de falla: si pierde el acceso,
              nadie puede administrar la tienda. */}
          {owners.length === 1 && canManage && (
            <div className="mb-4 flex items-start gap-2 rounded-lg border border-warning/40 bg-warning-bg px-3 py-2.5 text-sm text-warning">
              <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                Hay un solo dueño. Si {owners[0]?.userId === me?.id ? 'perdés' : 'pierde'} el acceso a esa
                cuenta, nadie va a poder administrar la tienda. Conviene que haya un segundo dueño de
                confianza.
              </span>
            </div>
          )}

          {adding && canManage && (
            <div className="mb-4 rounded-lg border border-border bg-surface p-4 shadow-card">
              <p className="mb-2 text-sm text-fg-muted">
                Ingresá el email de la persona y elegí su rol. Si todavía no tiene cuenta, se la creamos y le
                llega un email para que defina su contraseña.
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="email@ejemplo.com"
                  className="h-10 min-w-[14rem] flex-1 rounded-md border border-border bg-bg px-3 text-sm text-fg outline-none focus:border-primary"
                />
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Nombre (opcional)"
                  className="h-10 min-w-[10rem] flex-1 rounded-md border border-border bg-bg px-3 text-sm text-fg outline-none focus:border-primary"
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

          <div className={TABLE_CARD}>
            <table className="w-full text-sm">
              <thead className={TABLE_HEAD_STICKY_SUBTLE}>
                <tr className="border-b border-border bg-bg-subtle text-left text-xs font-medium uppercase tracking-wide text-fg-muted">
                  <th className="px-4 py-2.5">Nombre</th>
                  <th className="px-4 py-2.5">Email</th>
                  <th className="px-4 py-2.5">Rol</th>
                  <th className="px-4 py-2.5" title="Permisos que mueven plata o dan más accesos.">
                    Accesos sensibles
                  </th>
                  <th className="px-4 py-2.5">Desde</th>
                  <th className="px-4 py-2.5 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {membersQ.isLoading && (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-fg-muted">
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
                            onChange={async (e) => {
                              const next = e.target.value;
                              const current = normalizeRole(m.role);
                              if (next === current) return;
                              if (!(await confirmRoleChange(m, next))) {
                                // Volver a dejar el select como estaba: el
                                // cambio se cancela, no queda a medias.
                                e.target.value = current;
                                return;
                              }
                              changeRole.mutate({ userId: m.userId, role: next });
                            }}
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
                      <td className="px-4 py-3">
                        {sensitiveOf(m.role).length > 0 ? (
                          <span
                            className="inline-flex items-center gap-1 text-xs font-medium text-warning"
                            title={`Accesos sensibles: ${sensitiveOf(m.role).length}. Mirá el detalle en "Qué puede hacer cada rol".`}
                          >
                            <ShieldAlert className="h-3.5 w-3.5" />
                            {sensitiveOf(m.role).length}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-xs text-fg-subtle">
                            <ShieldCheck className="h-3.5 w-3.5" /> —
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs text-fg-muted">{formatDate(m.createdAtUtc)}</td>
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
                    <td colSpan={6} className="px-4 py-8 text-center text-fg-muted">
                      No hay usuarios.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <Pagination page={page} totalPages={totalPages} onPage={setPage} />

          <div className="mt-4 rounded-lg border border-border bg-surface p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-fg">Los roles, en resumen</p>
                <div className="mt-2 grid gap-1 text-xs text-fg-muted sm:grid-cols-2">
                  {ROLES.map((r) => (
                    <div key={r.value}>
                      <strong className="text-fg">{r.label}</strong> — {r.desc}
                    </div>
                  ))}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setMatrixOpen(true)}
                className="shrink-0 rounded-md border border-border-strong px-3 py-1.5 text-sm font-medium text-fg hover:bg-bg-muted"
              >
                Ver qué puede hacer cada rol
              </button>
            </div>
          </div>

          {matrixOpen && (
            <RolePermissionsMatrix roleLabels={ROLE_LABELS} onClose={() => setMatrixOpen(false)} />
          )}
        </>
      )}

      <HelpLink id="users" />
    </div>
  );
}
