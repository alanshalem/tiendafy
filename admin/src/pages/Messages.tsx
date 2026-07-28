import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Mail, MailOpen } from 'lucide-react';
import { Badge } from '@tiendafy/ui';
import { useStore } from '../context/StoreContext';
import { api } from '../lib/api';
import { NoStoreSelected } from '../components/NoStoreSelected';

interface ContactMessage {
  id: string;
  name: string;
  email: string;
  body: string;
  read: boolean;
  createdAtUtc: string;
}
interface MessagesResponse {
  items: ContactMessage[];
  unread: number;
}

export function MessagesPage() {
  const { store } = useStore();
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['contact-messages', store?.id],
    queryFn: () => api.get<MessagesResponse>('/api/v1/contact/messages'),
    enabled: !!store,
  });

  const markRead = async (id: string) => {
    await api.post(`/api/v1/contact/messages/${id}/read`, {});
    qc.invalidateQueries({ queryKey: ['contact-messages', store?.id] });
  };

  if (!store) return <NoStoreSelected />;

  const items = data?.items ?? [];

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-5 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-fg">Mensajes de contacto</h1>
          <p className="mt-1 text-sm text-fg-muted">Lo que te escriben desde el formulario de tu tienda.</p>
        </div>
        {(data?.unread ?? 0) > 0 && <Badge variant="info">{data!.unread} sin leer</Badge>}
      </div>

      {isLoading ? (
        <p className="py-16 text-center text-sm text-fg-muted">Cargando…</p>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-border py-16 text-center text-fg-muted">
          <Mail className="h-8 w-8 opacity-50" />
          <p>Todavía no recibiste mensajes.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((m) => (
            <div
              key={m.id}
              className={`rounded-2xl border bg-surface p-5 shadow-card transition ${m.read ? 'border-border' : 'border-primary/40'}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    {!m.read && <span className="h-2 w-2 shrink-0 rounded-full bg-primary" />}
                    <span className={`truncate font-semibold ${m.read ? 'text-fg' : 'text-fg'}`}>
                      {m.name}
                    </span>
                  </div>
                  <a href={`mailto:${m.email}`} className="text-sm text-primary hover:underline">
                    {m.email}
                  </a>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <span className="text-xs text-fg-subtle">
                    {new Date(m.createdAtUtc).toLocaleString('es-AR', {
                      day: '2-digit',
                      month: 'short',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                  {!m.read && (
                    <button
                      onClick={() => markRead(m.id)}
                      title="Marcar leído"
                      className="inline-flex items-center gap-1 text-xs font-medium text-fg-muted hover:text-fg"
                    >
                      <MailOpen className="h-4 w-4" /> Leído
                    </button>
                  )}
                </div>
              </div>
              <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-fg-muted">{m.body}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
