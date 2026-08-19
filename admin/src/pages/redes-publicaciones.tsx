import { useState } from 'react';
import { AlignLeft, CalendarClock, ExternalLink, Pencil, Trash2 } from 'lucide-react';
import { Badge, Button, EmptyList, Select, Spinner, cn, useConfirm, useToast } from '@tiendafy/ui';
import { api, errMsg } from '../lib/api';
import { formatDateTime, formatMoney } from '../lib/format';
import {
  POST_STATUS,
  postDate,
  postStatus,
  ProviderIcon,
  providerMeta,
  type SocialPostDto,
} from './redes-shared';

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
  // Timeline: lo que VIENE primero (ascendente), el historial después.
  const upcoming = filtered
    .filter((p) => p.status === 'Scheduled' || p.status === 'Draft')
    .sort((x, y) => postDate(x).getTime() - postDate(y).getTime());
  const history = filtered.filter((p) => p.status === 'Published' || p.status === 'Failed');

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
        <div className="space-y-6">
          {upcoming.length > 0 && (
            <section>
              <h2 className="mb-2 text-xs font-bold uppercase tracking-widest text-fg-subtle">Próximos</h2>
              <div className="space-y-3">
                {upcoming.map((post) => (
                  <PostCard
                    key={post.id}
                    post={post}
                    onEdit={onEdit}
                    onUnschedule={unschedule}
                    onRemove={remove}
                  />
                ))}
              </div>
            </section>
          )}
          {history.length > 0 && (
            <section>
              <h2 className="mb-2 text-xs font-bold uppercase tracking-widest text-fg-subtle">Historial</h2>
              <div className="space-y-3">
                {history.map((post) => (
                  <PostCard
                    key={post.id}
                    post={post}
                    onEdit={onEdit}
                    onUnschedule={unschedule}
                    onRemove={remove}
                  />
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Tarjeta de una publicación en la lista. Era una función anidada adentro del
 * tab — 100 líneas de JSX que se recreaban en cada render y que no se podían
 * leer (ni memoizar) por separado del resto de la pantalla.
 */
function PostCard({
  post,
  onEdit,
  onUnschedule,
  onRemove,
}: {
  post: SocialPostDto;
  onEdit: (post: SocialPostDto) => void;
  onUnschedule: (post: SocialPostDto) => void;
  onRemove: (post: SocialPostDto) => void;
}) {
  const st = postStatus(post);
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onEdit(post)}
      onKeyDown={(e) => e.key === 'Enter' && onEdit(post)}
      title={post.isEditable ? 'Abrir para editar' : 'Ver el post'}
      className={cn(
        'cursor-pointer rounded-lg border border-border border-l-4 bg-surface p-4 shadow-card transition-colors hover:border-fg-subtle/40 hover:bg-bg-subtle/40',
        POST_STATUS[post.status]?.edge ?? 'border-l-border',
      )}
    >
      <div className="flex items-start gap-3.5">
        {post.mediaUrls[0] ? (
          <img
            src={post.mediaUrls[0]}
            alt=""
            className="h-16 w-16 shrink-0 rounded-lg border border-border object-cover"
          />
        ) : (
          <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-lg bg-bg-muted text-fg-subtle">
            <AlignLeft className="h-6 w-6" />
          </span>
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
          {post.couponCode && (
            <p className="mt-1 text-xs text-fg-muted">
              Cupón <span className="font-mono font-medium text-fg">{post.couponCode}</span>
              {post.attributedOrders > 0 && (
                <span className="text-success">
                  {' '}
                  · trajo {post.attributedOrders} {post.attributedOrders === 1 ? 'venta' : 'ventas'} ·{' '}
                  {formatMoney(post.attributedRevenueMinor)}
                </span>
              )}
            </p>
          )}
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
                    onClick={(e) => e.stopPropagation()}
                    className="text-fg-subtle hover:text-primary"
                    title={`Ver en ${providerMeta(t.provider).label}`}
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                )}
              </span>
            ))}
          </div>
          {post.status === 'Failed' && (
            <div className="mt-2 rounded-md bg-danger-bg px-2.5 py-1.5 text-xs text-danger">
              {post.targets
                .filter((t) => t.error)
                .map((t) => (
                  <p key={t.accountId}>
                    <span className="font-semibold">{providerMeta(t.provider).label}:</span> {t.error}
                  </p>
                ))}
            </div>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
          {post.isEditable && (
            <Button variant="secondary" onClick={() => onEdit(post)} title="Editar">
              <Pencil className="h-4 w-4" />
            </Button>
          )}
          {post.status === 'Scheduled' && post.scheduleStatus === 'Pending' && (
            <Button variant="secondary" onClick={() => onUnschedule(post)} title="Volver a borrador">
              <CalendarClock className="h-4 w-4" />
            </Button>
          )}
          {post.scheduleStatus !== 'Processing' && (
            <Button variant="secondary" onClick={() => onRemove(post)} title="Eliminar">
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
