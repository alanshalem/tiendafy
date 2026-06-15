import { useQuery } from '@tanstack/react-query';
import { ExternalLink, EyeOff, Pencil, Plus, User } from 'lucide-react';
import { useStore } from '../../context/StoreContext';
import { api } from '../../lib/api';
import { SettingsHeader } from './SettingsLayout';

interface Me {
  id: string;
  email: string;
  name: string;
}

export function UsersNotificationsPage() {
  const { store } = useStore();

  const { data: me } = useQuery({
    queryKey: ['auth-me'],
    queryFn: () => api.get<Me>('/api/v1/auth/me').catch(() => null),
  });

  const users = me
    ? [
        {
          name: me.name || 'Vos',
          email: me.email,
          current: true,
          permission: 'Acceso total',
          notifications: ['Mensajes', 'Newsletter', 'Ventas'],
          twoFactor: false,
        },
      ]
    : [];

  return (
    <div className="mx-auto max-w-5xl">
      <SettingsHeader
        title="Usuarios y notificaciones"
        action={
          <button className="inline-flex h-10 items-center gap-1.5 rounded-md bg-primary px-4 text-sm font-semibold text-primary-fg hover:bg-primary-hover">
            <Plus className="h-4 w-4" /> Agregar
          </button>
        }
      />

      <div className="overflow-hidden rounded-lg border border-border bg-surface shadow-card">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-bg-subtle text-left text-xs font-medium uppercase tracking-wide text-fg-muted">
              <th className="px-4 py-2.5">Nombre</th>
              <th className="px-4 py-2.5">Email</th>
              <th className="px-4 py-2.5">Permisos</th>
              <th className="px-4 py-2.5">Notificaciones</th>
              <th className="px-4 py-2.5">Verificación en 2 pasos</th>
              <th className="px-4 py-2.5 text-right">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.email} className="border-b border-border last:border-b-0">
                <td className="px-4 py-3">
                  <div className="font-medium text-fg">{u.name}</div>
                  {u.current && (
                    <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                      <User className="h-3.5 w-3.5" /> Usuario actual
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-fg-muted">{u.email}</td>
                <td className="px-4 py-3">
                  <span className="rounded-full bg-bg-muted px-2.5 py-0.5 text-xs font-medium text-fg-muted">{u.permission}</span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-1">
                    {u.notifications.map((n) => (
                      <span key={n} className="rounded-full border border-border px-2 py-0.5 text-xs text-fg-muted">
                        {n}
                      </span>
                    ))}
                  </div>
                </td>
                <td className="px-4 py-3">
                  <span className="inline-flex items-center gap-1 rounded-full bg-bg-muted px-2.5 py-0.5 text-xs font-medium text-fg-muted">
                    <EyeOff className="h-3.5 w-3.5" /> Desactivado
                  </span>
                  <button className="ml-2 text-xs font-medium text-primary hover:underline">Activar</button>
                </td>
                <td className="px-4 py-3 text-right">
                  <button className="rounded-full border border-border p-1.5 text-fg-muted hover:bg-bg-muted" aria-label="Editar">
                    <Pencil className="h-4 w-4" />
                  </button>
                </td>
              </tr>
            ))}
            {users.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-fg-muted">
                  Iniciá sesión para ver los usuarios de {store?.name ?? 'la tienda'}.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {users.length > 0 && <p className="mt-2 text-sm text-fg-muted">Mostrando 1-{users.length} usuarios de {users.length}</p>}

      <p className="mt-5 inline-flex w-full items-center justify-center gap-1 text-center text-sm text-primary">Más sobre permisos para usuarios <ExternalLink className="h-3.5 w-3.5" /></p>
    </div>
  );
}
