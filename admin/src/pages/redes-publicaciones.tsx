import { useState } from 'react';
import { CalendarClock, ExternalLink, Pencil, Trash2 } from 'lucide-react';
import { Badge, Button, EmptyList, Select, Spinner, useConfirm, useToast } from '@tiendafy/ui';
import { api, errMsg } from '../lib/api';
import { formatDateTime } from '../lib/format';
import { postStatus, ProviderIcon, providerMeta, type SocialPostDto } from './redes-shared';

const STATUS_FILTER = [
  { value: '', label: 'Todos los estados' },
  { value: 'Draft', label: 'Borradores' },
  { value: 'Scheduled', label: 'Programados' },
  { value: 'Published', label: 'Publicados' },
  { value: 'Failed', label: 'Con errores' },
];

/** Bandeja de publicaciones: todos los posts con su resultado red por red. */
export function PublicacionesTab({
  posts,
  onChanged,
  onEdit,
}: {
  posts: SocialPostDto[] | null; // null = cargando
  onChanged: () => void;
  onEdit: (post: SocialPostDto) => void;
}) {
  const { toast } = useToast();
  const confirm = useConfirm();
  const [status, setStatus] = useState('');

  const filtered = status ? (posts ?? []).filter((p) => p.status === status) : (posts ?? []);

  const unschedule = async (post: SocialPostDto) => {
    try {
      await api.post(`/api/v1/admin/social/posts/${post.id}/unschedule`, {});
      toast('El post volvió a borradores', { variant: 'success' });
      onChanged();
    } catch (err) {
      toast(errMsg(err, 'No se pudo desprogramar.'), { variant: 'error' });
    }
  };

  const remove = async (post: SocialPostDto) => {
    const ok = await confirm({
      title: 'Eliminar post',
      message:
        post.status === 'Published'
          ? 'Se borra del historial de Tiendafy (lo ya publicado en las redes queda).'
          : 'El post se elimina y no se publica.',
      confirmLabel: 'Eliminar',
      variant: 'danger',
    });
    if (!ok) return;
    try {
      await api.delete(`/api/v1/admin/social/posts/${post.id}`);
      toast('Post eliminado', { variant: 'success' });
      onChanged();
    } catch (err) {
      toast(errMsg(err, 'No se pudo eliminar.'), { variant: 'error' });
    }
  };

  if (posts === null) return <Spinner />;

  return (
    <div>
      <div className="mb-4 flex justify-end">
        <div className="w-52">
          <Select value={status} onChange={(e) => setStatus(e.target.value)} options={STATUS_FILTER} />
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyList>
          Todavía no hay posts{status ? ' en ese estado' : ''}. Creá el primero con “Nuevo post” y programalo
          para todas tus redes a la vez.
        </EmptyList>
      ) : (
        <div className="space-y-3">
          {filtered.map((post) => {
            const st = postStatus(post);
            return (
              <div key={post.id} className="rounded-lg border border-border bg-surface p-4 shadow-card">
                <div className="flex items-start gap-3.5">
                  {post.mediaUrls[0] && (
                    <img
                      src={post.mediaUrls[0]}
                      alt=""
                      className="h-14 w-14 shrink-0 rounded-lg border border-border object-cover"
                    />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant={st.variant}>{st.label}</Badge>
                      <span className="text-sm text-fg-subtle">
                        {post.status === 'Published'
                          ? `Publicado el ${formatDateTime(post.publishedAtUtc ?? post.createdAtUtc)}`
                          : post.scheduledAtUtc
                            ? `Programado para el ${formatDateTime(post.scheduledAtUtc)}`
                            : `Creado el ${formatDateTime(post.createdAtUtc)}`}
                      </span>
                    </div>
                    <p className="mt-1.5 line-clamp-2 whitespace-pre-line text-sm text-fg">
                      {post.content || '(solo imagen)'}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
                      {post.targets.map((t) => (
                        <span key={t.accountId} className="inline-flex items-center gap-1.5 text-sm">
                          <ProviderIcon provider={t.provider} size="sm" />
                          <span className="text-fg-muted">{t.accountName}</span>
                          {t.externalUrl && (
                            <a
                              href={t.externalUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="text-fg-subtle hover:text-primary"
                              title={`Ver en ${providerMeta(t.provider).label}`}
                            >
                              <ExternalLink className="h-3.5 w-3.5" />
                            </a>
                          )}
                          {t.error && (
                            <span className="text-xs text-danger" title={t.error}>
                              {t.error}
                            </span>
                          )}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    {post.isEditable && (
                      <Button variant="secondary" onClick={() => onEdit(post)} title="Editar">
                        <Pencil className="h-4 w-4" />
                      </Button>
                    )}
                    {post.status === 'Scheduled' && post.scheduleStatus === 'Pending' && (
                      <Button variant="secondary" onClick={() => unschedule(post)} title="Volver a borrador">
                        <CalendarClock className="h-4 w-4" />
                      </Button>
                    )}
                    {post.scheduleStatus !== 'Processing' && (
                      <Button variant="secondary" onClick={() => remove(post)} title="Eliminar">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
