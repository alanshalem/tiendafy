import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button, Checkbox, cn, Modal, useToast } from '@tiendafy/ui';
import { api, errMsg } from '../../lib/api';
import { togglePermission, type Perm } from '../../lib/access';
import { usePermissions } from '../../context/PermissionsContext';
import { useModalFormGuard } from '../../lib/useUnsavedChanges';
import { SensitiveBadge } from './Roles';
import { canChange, OWNER, type AccessMatrix } from './team-access';

export interface MemberForPermissions {
  userId: string;
  role: string;
  name: string | null;
  email: string | null;
  permissions: Perm[];
  customized: boolean;
}

/**
 * Las excepciones de una persona: algo que su rol no trae y a ella sí le hace
 * falta (o al revés), sin inventar un rol nuevo ni cambiarle el que tiene.
 * Lo que difiere de su rol queda marcado; "Volver a lo del rol" las borra.
 */
export function MemberPermissionsModal({
  member,
  matrix,
  onClose,
}: {
  member: MemberForPermissions;
  matrix: AccessMatrix;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { role: myRole, can } = usePermissions();
  const isOwner = myRole === OWNER;

  const role = matrix.roles.find((r) => r.role === member.role);
  const fromRole = new Set<string>(role?.permissions ?? []);
  const [selected, setSelected] = useState<Set<string>>(() => new Set(member.permissions));
  const who = member.name ?? member.email ?? 'esta persona';
  // Ordenado: tildar y destildar en otro orden deja el mismo conjunto.
  const { dirty, close } = useModalFormGuard([...selected].sort(), onClose);

  const done = (message: string) => {
    toast(message, { variant: 'success' });
    qc.invalidateQueries({ queryKey: ['members'] });
    qc.invalidateQueries({ queryKey: ['team-activity'] });
    onClose();
  };
  const onError = (e: unknown) =>
    toast(errMsg(e, 'No se pudieron guardar los permisos.'), { variant: 'error' });

  const save = useMutation({
    mutationFn: () => api.put(`/api/v1/members/${member.userId}/permissions`, { permissions: [...selected] }),
    onSuccess: () => done(`Permisos de ${who} guardados.`),
    onError,
  });
  const reset = useMutation({
    mutationFn: () => api.delete(`/api/v1/members/${member.userId}/permissions`),
    onSuccess: () => done(`${who} vuelve a poder lo de su rol.`),
    onError,
  });

  const added = [...selected].filter((p) => !fromRole.has(p)).length;
  const removed = [...fromRole].filter((p) => !selected.has(p)).length;
  const busy = save.isPending || reset.isPending;

  return (
    <Modal
      open
      size="lg"
      onClose={onClose}
      dirty={dirty}
      title={`Permisos de ${who}`}
      footer={
        <div className="flex w-full flex-wrap items-center justify-between gap-2">
          {member.customized ? (
            <Button variant="ghost" onClick={() => reset.mutate()} disabled={busy}>
              Volver a lo del rol
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button variant="secondary" onClick={close}>
              Cancelar
            </Button>
            <Button onClick={() => save.mutate()} loading={save.isPending} disabled={busy}>
              Guardar
            </Button>
          </div>
        </div>
      }
    >
      <p className="mb-3 text-sm text-fg-muted">
        Rol: <strong className="text-fg">{role?.label ?? member.role}</strong>. Lo que cambies acá vale solo
        para {who}; si cambiás su rol, estas excepciones se borran.
        {(added > 0 || removed > 0) && (
          <span className="mt-1 block text-xs font-medium text-primary">
            Distinto de su rol: {added > 0 && `${added} de más`}
            {added > 0 && removed > 0 && ' · '}
            {removed > 0 && `${removed} de menos`}
          </span>
        )}
      </p>

      <div className="space-y-4">
        {matrix.groups.map((group) => (
          <fieldset key={group}>
            <legend className="mb-1 text-xs font-semibold uppercase tracking-wide text-fg-subtle">
              {group}
            </legend>
            <div className="divide-y divide-border/60 rounded-md border border-border">
              {matrix.permissions
                .filter((p) => p.group === group)
                .map((p) => {
                  const on = selected.has(p.key);
                  const diff = on !== fromRole.has(p.key);
                  return (
                    <div
                      key={p.key}
                      className={cn('flex items-start gap-3 px-3 py-2', diff && 'bg-primary/5')}
                    >
                      <Checkbox
                        aria-label={p.label}
                        checked={on}
                        disabled={busy || !canChange(p, { isOwner, can })}
                        onChange={(e) =>
                          setSelected((s) => togglePermission(s, p.key, e.target.checked, matrix.permissions))
                        }
                      />
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium text-fg">
                          {p.label}
                          {p.sensitive && <SensitiveBadge className="ml-1.5" />}
                          {diff && (
                            <span className="ml-1.5 text-[11px] font-semibold text-primary">
                              {on ? 'agregado' : 'quitado'}
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-fg-muted">{p.description}</div>
                      </div>
                    </div>
                  );
                })}
            </div>
          </fieldset>
        ))}
      </div>
    </Modal>
  );
}
