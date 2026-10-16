import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { qk } from '../../lib/queryKeys';
import { Plus, ShieldAlert, ShieldCheck, SlidersHorizontal, Trash2, User } from 'lucide-react';
import { cn, useToast, useConfirm, Spinner } from '@tiendafy/ui';
import { api, errMsg } from '../../lib/api';
import type { Perm } from '../../lib/access';
import { HelpLink } from '../../components/HelpLink';
import { usePermissions } from '../../context/PermissionsContext';
import { useAuth } from '../../context/AuthContext';
import { useStore } from '../../context/StoreContext';
import { SettingsHeader } from './SettingsLayout';
import { formatDate, formatNumber } from '../../lib/format';
import { TABLE_CARD, TABLE_HEAD_STICKY, TABLE_SCROLL_X } from '../../lib/styles';
import { Pagination, pageRangeLabel } from '../../components/Pagination';
import { ListStats } from '../../components/stats/ListStats';
import { ListCard, ListCardList } from '../../components/ListCards';
import { useIsMobile } from '../../lib/useMediaQuery';
import { useUnsavedInScope } from '../../lib/unsavedScope';
import {
  OWNER,
  ROLE_BADGE,
  ROLE_BADGE_FALLBACK,
  sensitiveKeys,
  useAccessMatrix,
  type RoleRow,
} from './team-access';
import { MemberPermissionsModal, type MemberForPermissions } from './member-permissions';
import { TeamActivity } from './team-activity';

interface Member extends MemberForPermissions {
  createdAtUtc: string;
}

/** Usuarios por página. */
const PAGE_SIZE = 25;

const roleOptionLabel = (r: RoleRow) => `${r.label} — ${r.summary}`;

export function UsersNotificationsPage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const confirm = useConfirm();
  const { role: myRole, can, reload } = usePermissions();
  const { user: me } = useAuth();
  const isOwner = myRole === OWNER;
  const canManage = can('members.manage');
  const mobile = useIsMobile();
  const { store } = useStore();

  // La matriz real del backend: nombres de los roles, qué puede cada uno y qué
  // es sensible. Sin copia acá que pueda quedar desactualizada.
  const { data: matrix } = useAccessMatrix();
  const roles = matrix?.roles ?? [];
  const roleOf = (key: string) => roles.find((r) => r.role === key);
  const sensitive = sensitiveKeys(matrix);
  const myRank = roleOf(myRole ?? '')?.rank ?? 0;

  // Los roles que esta persona puede asignar: las mismas reglas que el backend
  // (nunca por encima del propio, ni uno que pueda algo que ella no puede).
  const assignable = roles.filter(
    (r) => isOwner || (r.role !== OWNER && r.rank <= myRank && r.permissions.every((p) => can(p))),
  );

  const [page, setPage] = useState(1);
  const membersQ = useQuery({
    queryKey: qk.members(store?.id, page),
    queryFn: () =>
      api.get<{ items: Member[]; total: number }>(
        `/api/v1/members?limit=${PAGE_SIZE}&offset=${(page - 1) * PAGE_SIZE}`,
      ),
    retry: false,
  });
  const totalPages = Math.max(1, Math.ceil((membersQ.data?.total ?? 0) / PAGE_SIZE));

  const [adding, setAdding] = useState(false);
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState('vendedor');
  const [editingPermissions, setEditingPermissions] = useState<Member | null>(null);
  // El alta a medio escribir (el form arranca vacío y con el rol vendedor).
  useUnsavedInScope(adding && (email.trim() !== '' || name.trim() !== '' || role !== 'vendedor'));

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: qk.members() });
    qc.invalidateQueries({ queryKey: qk.teamActivity() });
  };
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
    onSuccess: (_d, { userId }) => {
      toast('Rol actualizado', { variant: 'success' });
      invalidate();
      // Si me cambié a mí, el menú tiene que reflejar lo que puedo ahora.
      if (userId === me?.id) reload();
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
  const total = membersQ.data?.total ?? 0;
  const owners = members.filter((m) => m.role === OWNER);
  const canRefund = members.filter((m) => m.permissions.includes('orders.refund'));
  const canInvite = members.filter((m) => m.permissions.includes('members.manage'));
  const sensitiveOf = (m: Member) => m.permissions.filter((p: Perm) => sensitive.has(p));

  /**
   * Los cambios que no se pueden deshacer solos piden confirmación: ascender a
   * alguien a dueño le da control total de la tienda, y bajarse el rol propio
   * puede dejarte sin poder volver a entrar acá.
   */
  const confirmRoleChange = async (m: Member, next: string): Promise<boolean> => {
    const who = m.name ?? m.email ?? 'esta persona';

    if (next === OWNER) {
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

    if (m.customized) {
      return confirm({
        title: 'Cambiar el rol',
        message: `${who} tiene permisos personalizados. Al cambiarle el rol, esas excepciones se borran.`,
        confirmLabel: 'Cambiar el rol',
      });
    }

    return true;
  };

  /**
   * Lo que se muestra de cada persona, armado una vez para la tabla y para las
   * tarjetas del teléfono (donde la tabla se salía de la pantalla).
   */
  const memberView = (m: Member) => {
    const isMe = m.userId === me?.id;
    const meta = roleOf(m.role);
    const target = meta?.rank ?? 0;
    // Las mismas reglas que el backend: a un dueño solo lo toca
    // otro dueño, y nadie toca a alguien de su rango o más.
    const touchable = isOwner || (m.role !== OWNER && (isMe || target < myRank));
    const editable = canManage && touchable;
    const canEditPermissions = canManage && !isMe && m.role !== OWNER && (isOwner || target < myRank);
    const options = assignable.some((r) => r.role === m.role) || !meta ? assignable : [meta, ...assignable];
    const sens = sensitiveOf(m);
    const roleControl = (
      <>
        {editable ? (
          <select
            aria-label={`Rol de ${m.email ?? 'este usuario'}`}
            value={m.role}
            disabled={changeRole.isPending}
            onChange={async (e) => {
              const next = e.target.value;
              if (next === m.role) return;
              if (!(await confirmRoleChange(m, next))) {
                // Volver a dejar el select como estaba: el
                // cambio se cancela, no queda a medias.
                e.target.value = m.role;
                return;
              }
              changeRole.mutate({ userId: m.userId, role: next });
            }}
            className="rounded-md border border-border bg-bg px-2 py-1 text-xs text-fg outline-none focus:border-primary disabled:opacity-60"
            title={meta?.summary}
          >
            {options.map((r) => (
              <option key={r.role} value={r.role}>
                {roleOptionLabel(r)}
              </option>
            ))}
          </select>
        ) : (
          <span
            className={cn(
              'rounded-full px-2.5 py-0.5 text-xs font-semibold',
              ROLE_BADGE[m.role] ?? ROLE_BADGE_FALLBACK,
            )}
            title={meta?.summary}
          >
            {meta?.label ?? m.role}
          </span>
        )}
        {m.customized && (
          <span
            className="mt-1 block text-2xs font-medium text-primary"
            title="Tiene permisos distintos de los de su rol."
          >
            Personalizado
          </span>
        )}
      </>
    );
    const sensitiveNode =
      sens.length > 0 ? (
        <span
          className="inline-flex items-center gap-1 text-xs font-medium text-warning"
          title={`Accesos sensibles: ${sens.length}.`}
        >
          <ShieldAlert className="h-3.5 w-3.5" />
          {sens.length}
        </span>
      ) : (
        <span className="inline-flex items-center gap-1 text-xs text-fg-subtle">
          <ShieldCheck className="h-3.5 w-3.5" /> —
        </span>
      );
    const actions = (
      <div className="flex justify-end gap-1.5">
        {canEditPermissions && matrix && (
          <button
            onClick={() => setEditingPermissions(m)}
            className="rounded-full border border-border p-1.5 text-fg-muted hover:bg-bg-muted hover:text-fg"
            aria-label={`Permisos de ${m.email ?? m.name ?? 'este usuario'}`}
            title="Permisos de esta persona"
          >
            <SlidersHorizontal className="h-4 w-4" />
          </button>
        )}
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
      </div>
    );
    return { isMe, roleControl, sensitiveNode, actions };
  };

  return (
    <div>
      <SettingsHeader
        title="Usuarios y permisos"
        description="Invitá a tu equipo y elegí qué puede hacer cada uno en el panel."
        count={total > 0 && pageRangeLabel(page, PAGE_SIZE, total, total === 1 ? 'usuario' : 'usuarios')}
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
                  value: formatNumber(total),
                  hint: 'Cuánta gente puede entrar al panel de esta tienda.',
                },
                {
                  label: 'Dueños',
                  value: formatNumber(owners.length),
                  hint: 'Control total: pueden cambiar cualquier cosa, incluido borrar la tienda.',
                  tone: owners.length === 1 ? 'warning' : 'default',
                },
                {
                  label: 'Pueden devolver plata',
                  value: formatNumber(canRefund.length),
                  hint: 'Un reembolso mueve dinero real y no se puede deshacer.',
                  tone: canRefund.length > 0 ? 'warning' : 'default',
                },
                {
                  label: 'Pueden invitar gente',
                  value: formatNumber(canInvite.length),
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
                  aria-label="Email"
                  className="h-10 min-w-[14rem] flex-1 rounded-md border border-border bg-bg px-3 text-sm text-fg outline-none focus:border-primary"
                />
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Nombre (opcional)"
                  aria-label="Nombre"
                  className="h-10 min-w-[10rem] flex-1 rounded-md border border-border bg-bg px-3 text-sm text-fg outline-none focus:border-primary"
                />
                <select
                  aria-label="Rol"
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  className="h-10 rounded-md border border-border bg-bg px-3 text-sm text-fg outline-none focus:border-primary"
                >
                  {assignable.map((r) => (
                    <option key={r.role} value={r.role}>
                      {roleOptionLabel(r)}
                    </option>
                  ))}
                </select>
                <button
                  onClick={() => addM.mutate()}
                  disabled={!email || addM.isPending}
                  className="inline-flex h-10 items-center gap-1.5 rounded-md bg-primary px-4 text-sm font-semibold text-primary-fg hover:bg-primary-hover disabled:opacity-60"
                >
                  {addM.isPending ? <Spinner inline /> : 'Agregar'}
                </button>
              </div>
            </div>
          )}

          {mobile ? (
            <div className={TABLE_CARD}>
              {membersQ.isLoading ? (
                <Spinner className="py-8" />
              ) : members.length === 0 ? (
                <p className="px-4 py-8 text-center text-sm text-fg-muted">No hay usuarios.</p>
              ) : (
                <ListCardList label="Usuarios">
                  {members.map((m) => {
                    const v = memberView(m);
                    return (
                      <ListCard
                        key={m.userId}
                        title={
                          <span className="inline-flex items-center gap-2">
                            {m.name ?? m.email ?? '—'} {v.isMe && <YouBadge />}
                          </span>
                        }
                        subtitle={m.name ? (m.email ?? undefined) : undefined}
                        // El selector de rol y los botones, del tamaño del dedo.
                        meta={
                          <div className="flex w-full flex-wrap items-center gap-x-3 gap-y-1.5 [&_select]:h-10 [&_select]:w-full [&_select]:text-sm">
                            <div className="w-full">{v.roleControl}</div>
                            {v.sensitiveNode}
                            <span>Desde {formatDate(m.createdAtUtc)}</span>
                          </div>
                        }
                        actions={<div className="[&_button]:p-2.5">{v.actions}</div>}
                      />
                    );
                  })}
                </ListCardList>
              )}
            </div>
          ) : (
            <div className={TABLE_CARD}>
              <div className={TABLE_SCROLL_X}>
                <table className="w-full text-sm">
                  <thead className={TABLE_HEAD_STICKY}>
                    <tr className="border-b border-border bg-bg-subtle text-left text-xs font-medium text-fg-muted">
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
                          <Spinner inline size={20} />
                        </td>
                      </tr>
                    )}
                    {!mobile &&
                      members.map((m) => {
                        const v = memberView(m);
                        return (
                          <tr key={m.userId} className="border-b border-border last:border-b-0">
                            <td className="px-4 py-3">
                              <div className="font-medium text-fg">{m.name ?? '—'}</div>
                              {v.isMe && <YouBadge />}
                            </td>
                            <td className="px-4 py-3 text-fg-muted">{m.email ?? '—'}</td>
                            <td className="px-4 py-3">{v.roleControl}</td>
                            <td className="px-4 py-3">{v.sensitiveNode}</td>
                            <td className="px-4 py-3 text-xs text-fg-muted">{formatDate(m.createdAtUtc)}</td>
                            <td className="px-4 py-3">{v.actions}</td>
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
            </div>
          )}
          <Pagination page={page} totalPages={totalPages} onPage={setPage} />

          <div className="mt-4 rounded-lg border border-border bg-surface p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-fg">Los roles, en resumen</p>
                <div className="mt-2 grid gap-1 text-xs text-fg-muted sm:grid-cols-2">
                  {roles.map((r) => (
                    <div key={r.role}>
                      <strong className="text-fg">{r.label}</strong> — {r.summary}
                    </div>
                  ))}
                </div>
              </div>
              <Link
                to="/configuracion/roles"
                className="shrink-0 rounded-md border border-border-strong px-3 py-1.5 text-sm font-medium text-fg hover:bg-bg-muted"
              >
                {can('roles.manage') ? 'Ver y editar qué puede cada rol' : 'Ver qué puede hacer cada rol'}
              </Link>
            </div>
          </div>

          <TeamActivity />
        </>
      )}

      {editingPermissions && matrix && (
        <MemberPermissionsModal
          member={editingPermissions}
          matrix={matrix}
          onClose={() => setEditingPermissions(null)}
        />
      )}

      <HelpLink id="users" />
    </div>
  );
}

/** La marca de "esta sos vos" en la lista del equipo. */
function YouBadge() {
  return (
    <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
      <User className="h-3.5 w-3.5" /> Vos
    </span>
  );
}
