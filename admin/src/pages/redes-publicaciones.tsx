import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { qk } from '../lib/queryKeys';
import { AlignLeft, CalendarClock, ExternalLink, Pencil, RotateCcw, Trash2 } from 'lucide-react';
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
import { BRAND } from '../lib/runtime';
import { useStore } from '../context/StoreContext';
import { useListParams } from '../lib/useListParams';
import { Pagination, pageRangeLabel } from '../components/Pagination';
import { LoadError } from '../components/LoadError';

const PAGE_SIZE = 20;
const LIST_DEFAULTS = { estado: '', 'pagina-posts': 1 };

const STATUS_FILTER = [
  { value: '', label: 'Todos los estados' },
  { value: 'Draft', label: 'Borradores' },
  { value: 'Scheduled', label: 'Programados' },
  { value: 'Published', label: 'Publicados' },
  { value: 'Failed', label: 'Con errores' },
];

/**
 * Bandeja de publicaciones: los posts con su resultado red por red, de a una
 * página y con el filtro por estado en el servidor (antes llegaban todos los
 * posts de la historia y se filtraban acá).
 */
export function PublicacionesTab({
  onChanged,
  onEdit,
}: {
  onChanged: () => void;
  onEdit: (post: SocialPostDto) => void;
}) {
  const { toast } = useToast();
  const confirm = useConfirm();
  const { store } = useStore();
  const queryClient = useQueryClient();
  const list = useListParams(LIST_DEFAULTS, { pageKey: 'pagina-posts' });
  const status = list.values.estado;
  const page = list.values['pagina-posts'];

  const { data, error, isError, refetch, isFetching } = useQuery({
    queryKey: qk.socialPosts(store?.id, status, page),
    queryFn: () => {
      const params = new URLSearchParams({
        limit: String(PAGE_SIZE),
        offset: String((page - 1) * PAGE_SIZE),
      });
      if (status) params.set('status', status);
      return api.get<{ posts: SocialPostDto[]; total?: number }>(`/api/v1/admin/social/posts?${params}`);
    },
    enabled: !!store,
    placeholderData: keepPreviousData,
  });
  const posts = data?.posts ?? null;
  const total = data?.total ?? posts?.length ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const changed = () => {
    void queryClient.invalidateQueries({ queryKey: qk.socialPosts(store?.id) });
    onChanged();
  };

  const filtered = posts ?? [];
  // Timeline: lo que VIENE primero (ascendente), el historial después.
  const upcoming = filtered
    .filter((p) => p.status === 'Scheduled' || p.status === 'Draft')
    .sort((x, y) => postDate(x).getTime() - postDate(y).getTime());
  const history = filtered.filter((p) => p.status === 'Published' || p.status === 'Failed');

  const unschedule = async (post: SocialPostDto) => {
    try {
      await api.post(`/api/v1/admin/social/posts/${post.id}/unschedule`, {});
      toast('El post volvió a borradores', { variant: 'success' });
      changed();
    } catch (err) {
      toast(errMsg(err, 'No se pudo desprogramar.'), { variant: 'error' });
    }
  };

  // Vuelve a mandar solo las redes que fallaron: las que salieron no se repiten.
  const retry = async (post: SocialPostDto) => {
    try {
      await api.post(`/api/v1/admin/social/posts/${post.id}/retry`, {});
      toast('Lo reintentamos en el próximo minuto', { variant: 'success' });
      changed();
    } catch (err) {
      toast(errMsg(err, 'No se pudo reintentar.'), { variant: 'error' });
    }
  };

  const remove = async (post: SocialPostDto) => {
    const ok = await confirm({
      title: 'Eliminar post',
      message:
        post.status === 'Published'
          ? `Se borra del historial de ${BRAND} (lo ya publicado en las redes queda).`
          : 'El post se elimina y no se publica.',
      confirmLabel: 'Eliminar',
      variant: 'danger',
    });
    if (!ok) return;
    try {
      await api.delete(`/api/v1/admin/social/posts/${post.id}`);
      toast('Post eliminado', { variant: 'success' });
      changed();
    } catch (err) {
      toast(errMsg(err, 'No se pudo eliminar.'), { variant: 'error' });
    }
  };

  if (isError && !data)
    return (
      <LoadError
        title="No se pudieron cargar las publicaciones."
        error={error}
        onRetry={() => void refetch()}
        retrying={isFetching}
      />
    );
  if (posts === null) return <Spinner />;

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-end gap-3">
        {total > 0 && (
          <span className="text-xs text-fg-subtle">
            {pageRangeLabel(page, PAGE_SIZE, total, total === 1 ? 'post' : 'posts')}
          </span>
        )}
        <div className="w-52">
          <Select
            aria-label="Filtrar por estado"
            value={status}
            onChange={(e) => list.set({ estado: e.target.value })}
            options={STATUS_FILTER}
          />
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
                    onRetry={retry}
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
                    onRetry={retry}
                    onRemove={remove}
                  />
                ))}
              </div>
            </section>
          )}
        </div>
      )}
      <Pagination
        page={Math.min(page, totalPages)}
        totalPages={totalPages}
        onPage={(p) => list.set({ 'pagina-posts': p })}
      />
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
  onRetry,
  onRemove,
}: {
  post: SocialPostDto;
  onEdit: (post: SocialPostDto) => void;
  onUnschedule: (post: SocialPostDto) => void;
  onRetry: (post: SocialPostDto) => void;
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
          {post.status === 'Failed' && post.scheduleStatus === 'Processed' && (
            <Button
              variant="secondary"
              onClick={() => onRetry(post)}
              title="Reintentar las redes que fallaron"
            >
              <RotateCcw className="h-4 w-4" /> Reintentar
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
