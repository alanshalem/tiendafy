import { Fragment } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Lock, RotateCcw } from 'lucide-react';
import { Checkbox, cn, Tooltip, useConfirm, useToast } from '@tiendafy/ui';
import { api, errMsg } from '../../lib/api';
import { togglePermission, type Perm, type PermissionInfo } from '../../lib/access';
import { usePermissions } from '../../context/PermissionsContext';
import { useStore } from '../../context/StoreContext';
import { HelpLink } from '../../components/HelpLink';
import { SettingsHeader } from './SettingsLayout';
import { canChange, matrixKey, OWNER, useAccessMatrix, type AccessMatrix, type RoleRow } from './team-access';
import { TableSkeleton } from '../../components/Skeleton';
import { TABLE_HEAD_TEXT } from '../../lib/styles';

/**
 * La columna de la izquierda queda fija al scrollear de costado: sin esto se
 * ve una columna de tildes sin saber a qué funcionalidad corresponde cada fila.
 */
const STICKY_LABEL = 'sticky left-0 z-[1] bg-surface text-left';
/** Los bordes van por celda (la tabla usa border-separate). */
const ROW_LINE = 'border-b border-border/60';

/**
 * Qué puede hacer cada rol en esta tienda, editable funcionalidad por
 * funcionalidad. Lo que se tilda acá es lo que el backend deja hacer desde el
 * próximo clic de esa gente (no hace falta que vuelvan a entrar).
 *
 * El dueño puede todo, siempre: así ninguna tienda queda sin alguien que
 * pueda arreglar esta matriz. Cada uno edita los roles por debajo del suyo, y
 * solo da o quita lo que él mismo puede hacer.
 */
export function RolesPage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const confirm = useConfirm();
  const { role: myRole, can } = usePermissions();
  const { data: matrix, isLoading, isError, error } = useAccessMatrix();
  const { store } = useStore();
  const accessKey = matrixKey(store?.id);

  const isOwner = myRole === OWNER;
  const myRank = matrix?.roles.find((r) => r.role === myRole)?.rank ?? 0;
  const canEditMatrix = can('roles.manage');
  const editableRole = (r: RoleRow) => canEditMatrix && r.role !== OWNER && (isOwner || r.rank < myRank);

  /** Se guarda el conjunto entero del rol; la matriz se actualiza al toque. */
  const save = useMutation({
    mutationFn: ({ role, permissions }: { role: string; permissions: string[] }) =>
      api.put(`/api/v1/members/roles/${role}`, { permissions }),
    onMutate: async ({ role, permissions }) => {
      await qc.cancelQueries({ queryKey: accessKey });
      const previous = qc.getQueryData<AccessMatrix>(accessKey);
      qc.setQueryData<AccessMatrix>(
        accessKey,
        (m) =>
          m && {
            ...m,
            roles: m.roles.map((r) => (r.role === role ? { ...r, permissions: permissions as Perm[] } : r)),
          },
      );
      return { previous };
    },
    onError: (e, _vars, ctx) => {
      if (ctx?.previous) qc.setQueryData(accessKey, ctx.previous);
      toast(errMsg(e, 'No se pudo guardar el cambio.'), { variant: 'error' });
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: accessKey });
      qc.invalidateQueries({ queryKey: ['members'] });
      qc.invalidateQueries({ queryKey: ['team-activity'] });
    },
  });

  const restore = useMutation({
    mutationFn: (role: string) => api.delete(`/api/v1/members/roles/${role}`),
    onSuccess: () => toast('Listo: el rol volvió a lo de fábrica.', { variant: 'success' }),
    onError: (e) => toast(errMsg(e, 'No se pudo restaurar el rol.'), { variant: 'error' }),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: accessKey });
      qc.invalidateQueries({ queryKey: ['members'] });
      qc.invalidateQueries({ queryKey: ['team-activity'] });
    },
  });

  const toggle = (r: RoleRow, p: PermissionInfo, on: boolean) => {
    if (!matrix) return;
    const next = togglePermission(new Set(r.permissions), p.key, on, matrix.permissions);
    save.mutate({ role: r.role, permissions: [...next] });
  };

  const askRestore = async (r: RoleRow) => {
    if (
      await confirm({
        title: `Restaurar ${r.label}`,
        message: `${r.label} vuelve a poder exactamente lo que trae de fábrica. Las excepciones de cada persona se mantienen.`,
        confirmLabel: 'Restaurar',
      })
    )
      restore.mutate(r.role);
  };

  return (
    <div>
      <SettingsHeader
        title="Roles y permisos"
        description="Activá o desactivá cada funcionalidad para cada rol de esta tienda. Vale desde el próximo clic de esa gente."
      />

      {isLoading ? (
        <div className="rounded-lg border border-border bg-surface">
          <TableSkeleton rows={8} label="Cargando permisos…" />
        </div>
      ) : isError || !matrix ? (
        <div className="rounded-lg border border-dashed border-border py-12 text-center text-sm text-fg-muted">
          {errMsg(error, 'No se pudo cargar la matriz de permisos.')}
        </div>
      ) : (
        <>
          <div className="mb-3 flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-fg-muted">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-primary" /> Cambiado respecto de lo de fábrica
            </span>
            <span className="inline-flex items-center gap-1.5">
              <SensitiveBadge /> Mueve plata, obligaciones fiscales o da más accesos
            </span>
            {!canEditMatrix && (
              <span className="inline-flex items-center gap-1.5 font-medium text-fg">
                <Lock className="h-3.5 w-3.5" /> Solo lectura: tu rol no puede cambiar esta matriz.
              </span>
            )}
          </div>

          <div className="overflow-x-auto rounded-lg border border-border bg-surface shadow-card">
            <table className="w-full min-w-[52rem] border-separate border-spacing-0 text-sm">
              <thead className={TABLE_HEAD_TEXT}>
                <tr>
                  <th
                    className={cn(
                      STICKY_LABEL,
                      'z-[2] border-b border-border px-4 py-3 font-medium text-fg-muted',
                    )}
                  >
                    Funcionalidad
                  </th>
                  {matrix.roles.map((r) => (
                    <RoleHeader
                      key={r.role}
                      role={r}
                      editable={editableRole(r)}
                      onRestore={() => askRestore(r)}
                      busy={restore.isPending && restore.variables === r.role}
                    />
                  ))}
                </tr>
              </thead>
              <tbody>
                {matrix.groups.map((group) => (
                  <Fragment key={group}>
                    <tr>
                      {/* El nombre va en su propia celda (no colSpan): una celda
                          del ancho de la tabla no se puede fijar a la izquierda. */}
                      <td
                        className={cn(
                          STICKY_LABEL,
                          'px-4 pb-1 pt-4 text-xs font-semibold uppercase tracking-wide text-fg-subtle',
                        )}
                      >
                        {group}
                      </td>
                      <td colSpan={matrix.roles.length} className="pb-1 pt-4" />
                    </tr>
                    {matrix.permissions
                      .filter((p) => p.group === group)
                      .map((p) => (
                        <tr key={p.key}>
                          <td className={cn(STICKY_LABEL, 'px-4 py-2', ROW_LINE)}>
                            <div className="font-medium text-fg">
                              {p.label}
                              {p.sensitive && <SensitiveBadge className="ml-1.5" />}
                            </div>
                            <div className="max-w-sm text-xs text-fg-muted">{p.description}</div>
                          </td>
                          {matrix.roles.map((r) => (
                            <Cell
                              key={r.role}
                              role={r}
                              perm={p}
                              disabled={save.isPending || !editableRole(r) || !canChange(p, { isOwner, can })}
                              onChange={(on) => toggle(r, p, on)}
                            />
                          ))}
                        </tr>
                      ))}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>

          <p className="mt-3 text-xs text-fg-muted">
            El dueño puede todo, siempre. Cada uno cambia los roles por debajo del suyo y solo da o quita lo
            que él mismo puede hacer. Si a una persona puntual le hace falta algo distinto, se lo das desde{' '}
            <strong className="text-fg">Usuarios → Permisos</strong>, sin cambiarle el rol.
          </p>
        </>
      )}

      <HelpLink id="users" />
    </div>
  );
}

function RoleHeader({
  role,
  editable,
  busy,
  onRestore,
}: {
  role: RoleRow;
  editable: boolean;
  busy: boolean;
  onRestore: () => void;
}) {
  const customized =
    role.permissions.length !== role.defaults.length ||
    role.permissions.some((p) => !role.defaults.includes(p));
  return (
    <th className="sticky top-0 border-b border-border bg-surface px-2 py-3 text-center align-bottom">
      <div className="inline-flex items-center gap-1 font-semibold text-fg">
        {role.label}
        {role.role === OWNER && (
          <Tooltip label="El dueño puede todo, siempre: su columna no se edita." side="top">
            <Lock className="h-3.5 w-3.5 text-fg-subtle" aria-label="No se edita" />
          </Tooltip>
        )}
      </div>
      <div className="text-2xs font-normal text-fg-muted">{role.summary}</div>
      {customized && editable && (
        <button
          type="button"
          onClick={onRestore}
          disabled={busy}
          className="mt-1 inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-2xs font-medium text-primary hover:bg-primary/10 disabled:opacity-60"
        >
          <RotateCcw className="h-3 w-3" /> Restaurar
        </button>
      )}
    </th>
  );
}

function Cell({
  role,
  perm,
  disabled,
  onChange,
}: {
  role: RoleRow;
  perm: PermissionInfo;
  disabled: boolean;
  onChange: (on: boolean) => void;
}) {
  const has = role.permissions.includes(perm.key);
  const changed = has !== role.defaults.includes(perm.key);
  return (
    <td className={cn('px-2 py-2 text-center', ROW_LINE)}>
      <span
        className="relative inline-flex"
        title={
          changed ? `Cambiado: de fábrica, ${role.label} ${has ? 'no lo tiene' : 'lo tiene'}.` : undefined
        }
      >
        <Checkbox
          aria-label={`${perm.label}: ${role.label}`}
          checked={has}
          disabled={disabled}
          onChange={(e) => onChange(e.target.checked)}
        />
        {changed && (
          <span
            className="absolute -right-1.5 -top-1 h-1.5 w-1.5 rounded-full bg-primary"
            aria-hidden="true"
          />
        )}
      </span>
    </td>
  );
}

export function SensitiveBadge({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        'rounded-full bg-warning-bg px-1.5 py-0.5 text-3xs font-semibold text-warning',
        className,
      )}
      title="Permiso sensible: puede mover plata o dar más accesos."
    >
      sensible
    </span>
  );
}
