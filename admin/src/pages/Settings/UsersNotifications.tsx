import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, Plus, Trash2, User } from 'lucide-react';
import { api, ApiRequestError } from '../../lib/api';
import { HelpLink } from '../../components/HelpLink';
import { SettingsHeader } from './SettingsLayout';

interface Me { id: string; email: string; name: string }
interface Member { userId: string; role: 'owner' | 'staff'; email: string | null; name: string | null; createdAtUtc: string }

const ROLE_LABEL: Record<string, string> = { owner: 'Dueño', staff: 'Staff' };

export function UsersNotificationsPage() {
  const qc = useQueryClient();
  const { data: me } = useQuery({ queryKey: ['auth-me'], queryFn: () => api.get<Me>('/api/v1/auth/me').catch(() => null) });

  const membersQ = useQuery({
    queryKey: ['members'],
    queryFn: () => api.get<{ items: Member[] }>('/api/v1/members'),
    retry: false,
  });

  const [adding, setAdding] = useState(false);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'staff' | 'owner'>('staff');
  const [formError, setFormError] = useState<string | null>(null);

  const invalidate = () => qc.invalidateQueries({ queryKey: ['members'] });

  const addM = useMutation({
    mutationFn: () => api.post('/api/v1/members', { email, role }),
    onSuccess: () => { setEmail(''); setRole('staff'); setAdding(false); setFormError(null); invalidate(); },
    onError: (e) => setFormError(e instanceof ApiRequestError ? e.error.message : 'No se pudo agregar.'),
  });
  const changeRole = useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: string }) => api.patch(`/api/v1/members/${userId}`, { role }),
    onSuccess: invalidate,
    onError: (e) => alert(e instanceof ApiRequestError ? e.error.message : 'No se pudo cambiar el rol.'),
  });
  const removeM = useMutation({
    mutationFn: (userId: string) => api.delete(`/api/v1/members/${userId}`),
    onSuccess: invalidate,
    onError: (e) => alert(e instanceof ApiRequestError ? e.error.message : 'No se pudo quitar.'),
  });

  // Solo el dueño puede gestionar (la API devuelve 403 al staff).
  const forbidden = membersQ.error instanceof ApiRequestError && membersQ.error.status === 403;
  const members = membersQ.data?.items ?? [];

  return (
    <div className="mx-auto max-w-4xl">
      <SettingsHeader
        title="Usuarios y permisos"
        action={!forbidden && (
          <button onClick={() => { setAdding((v) => !v); setFormError(null); }} className="inline-flex h-10 items-center gap-1.5 rounded-md bg-primary px-4 text-sm font-semibold text-primary-fg hover:bg-primary-hover">
            <Plus className="h-4 w-4" /> Agregar staff
          </button>
        )}
      />

      {forbidden ? (
        <div className="rounded-lg border border-dashed border-border py-12 text-center text-sm text-fg-muted">
          Solo el dueño de la tienda puede gestionar usuarios.
        </div>
      ) : (
        <>
          {adding && (
            <div className="mb-4 rounded-lg border border-border bg-surface p-4 shadow-card">
              <p className="mb-2 text-sm text-fg-muted">La persona tiene que tener una cuenta de Tiendafy. Ingresá su email.</p>
              <div className="flex flex-wrap items-center gap-2">
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email@ejemplo.com"
                  className="h-10 flex-1 rounded-md border border-border bg-bg px-3 text-sm text-fg outline-none focus:border-primary" />
                <select value={role} onChange={(e) => setRole(e.target.value as 'staff' | 'owner')}
                  className="h-10 rounded-md border border-border bg-bg px-3 text-sm text-fg outline-none focus:border-primary">
                  <option value="staff">Staff</option>
                  <option value="owner">Dueño</option>
                </select>
                <button onClick={() => addM.mutate()} disabled={!email || addM.isPending}
                  className="inline-flex h-10 items-center gap-1.5 rounded-md bg-primary px-4 text-sm font-semibold text-primary-fg hover:bg-primary-hover disabled:opacity-60">
                  {addM.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Agregar'}
                </button>
              </div>
              {formError && <p className="mt-2 text-sm text-danger">{formError}</p>}
            </div>
          )}

          <div className="overflow-hidden rounded-lg border border-border bg-surface shadow-card">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-bg-subtle text-left text-xs font-medium uppercase tracking-wide text-fg-muted">
                  <th className="px-4 py-2.5">Nombre</th>
                  <th className="px-4 py-2.5">Email</th>
                  <th className="px-4 py-2.5">Rol</th>
                  <th className="px-4 py-2.5 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {membersQ.isLoading && (
                  <tr><td colSpan={4} className="px-4 py-8 text-center text-fg-muted"><Loader2 className="mx-auto h-5 w-5 animate-spin" /></td></tr>
                )}
                {members.map((m) => {
                  const isMe = m.userId === me?.id;
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
                        <select value={m.role} onChange={(e) => changeRole.mutate({ userId: m.userId, role: e.target.value })}
                          className="rounded-md border border-border bg-bg px-2 py-1 text-xs text-fg outline-none focus:border-primary">
                          <option value="owner">{ROLE_LABEL.owner}</option>
                          <option value="staff">{ROLE_LABEL.staff}</option>
                        </select>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button onClick={() => { if (confirm(`¿Quitar a ${m.email} de la tienda?`)) removeM.mutate(m.userId); }}
                          className="rounded-full border border-border p-1.5 text-fg-muted hover:bg-danger/10 hover:text-danger" aria-label="Quitar">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
                {!membersQ.isLoading && members.length === 0 && (
                  <tr><td colSpan={4} className="px-4 py-8 text-center text-fg-muted">No hay usuarios.</td></tr>
                )}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-xs text-fg-muted">El <strong>staff</strong> opera la tienda (productos, ventas, etc.) pero no gestiona usuarios. Solo el <strong>dueño</strong> puede.</p>
        </>
      )}

      <HelpLink id="users" />
    </div>
  );
}
