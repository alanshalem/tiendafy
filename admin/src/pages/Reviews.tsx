import { useState } from 'react';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Check, EyeOff, Flag, MessageSquareReply, Settings2, Star, ThumbsUp } from 'lucide-react';
import {
  Badge,
  Button,
  cn,
  Input,
  Modal,
  Select,
  Switch,
  Textarea,
  useToast,
  EmptyList,
  PageHeader,
  Tabs,
  SearchInput,
} from '@tiendafy/ui';
import { formatDateTime } from '@tiendafy/types';
import { useStore } from '../context/StoreContext';
import { api, errMsg } from '../lib/api';
import { NoStoreSelected } from '../components/NoStoreSelected';
import { HelpLink } from '../components/HelpLink';
import { Pagination, pageRangeLabel } from '../components/Pagination';
import { TableSkeleton } from '../components/Skeleton';
import { useListParams, useListSearch } from '../lib/useListParams';

export interface AdminReview {
  id: string;
  productId: string;
  productName: string;
  variantLabel: string | null;
  orderId: string;
  rating: number;
  title: string | null;
  body: string;
  authorName: string;
  buyerEmail: string;
  photos: string[];
  status: 'pending' | 'approved' | 'hidden';
  reply: string | null;
  repliedAtUtc: string | null;
  helpfulCount: number;
  reportCount: number;
  flagged: boolean;
  createdAtUtc: string;
  moderatedAtUtc: string | null;
}

interface ReviewsResponse {
  items: AdminReview[];
  total: number;
  counts: { pending: number; approved: number; hidden: number; flagged: number };
}

export interface ReviewSettings {
  autoApproveMinRating: number | null;
  requestDelayDays: number;
  showOnStore: boolean;
  requestEmailEnabled: boolean;
}

const PAGE_SIZE = 25;

const TABS = [
  { id: 'pending', label: 'Pendientes' },
  { id: 'approved', label: 'Aprobadas' },
  { id: 'hidden', label: 'Ocultas' },
  { id: 'all', label: 'Todas' },
] as const;
type TabId = (typeof TABS)[number]['id'];

const STATUS_BADGE: Record<
  AdminReview['status'],
  { label: string; variant: 'warning' | 'success' | 'neutral' }
> = {
  pending: { label: 'Pendiente', variant: 'warning' },
  approved: { label: 'Publicada', variant: 'success' },
  hidden: { label: 'Oculta', variant: 'neutral' },
};

/** Filtro, estrellas, búsqueda y página, en la URL (ver useListParams). */
const LIST_DEFAULTS = { estado: 'pending', estrellas: 0, q: '', pagina: 1 };

/**
 * Reseñas: la moderación de las opiniones de los compradores. La tienda
 * aprueba, oculta y responde en público; no escribe ni edita reseñas (las
 * estrellas y el texto son del comprador, que es lo que las hace creíbles).
 * Las denunciadas por varias personas vuelven acá marcadas.
 */
export function ReviewsPage() {
  const { store } = useStore();
  const qc = useQueryClient();
  const { toast } = useToast();
  const list = useListParams(LIST_DEFAULTS);
  const tab = (TABS.some((t) => t.id === list.values.estado) ? list.values.estado : 'pending') as TabId;
  const stars = Number(list.values.estrellas) || 0;
  const page = list.values.pagina;
  // La búsqueda se escribe tecla a tecla: va a la URL con una pausa.
  const [search, setSearch] = useListSearch(list);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const qs = new URLSearchParams({
    status: tab,
    offset: String((page - 1) * PAGE_SIZE),
    limit: String(PAGE_SIZE),
  });
  if (stars) qs.set('rating', String(stars));
  if (list.values.q.trim()) qs.set('q', list.values.q.trim());

  const { data, isLoading } = useQuery({
    queryKey: ['reviews', store?.id, qs.toString()],
    queryFn: () => api.get<ReviewsResponse>(`/api/v1/admin/reviews?${qs}`),
    enabled: !!store,
    placeholderData: keepPreviousData,
  });

  if (!store) return <NoStoreSelected />;

  const refresh = () => qc.invalidateQueries({ queryKey: ['reviews', store.id] });
  const act = async (review: AdminReview, action: 'approve' | 'hide') => {
    try {
      await api.post(`/api/v1/admin/reviews/${review.id}/${action}`, {});
      toast(action === 'approve' ? 'Reseña publicada.' : 'Reseña oculta.', { variant: 'success' });
      await refresh();
    } catch (e) {
      toast(errMsg(e, 'No se pudo guardar.'), { variant: 'error' });
    }
  };

  const items = data?.items ?? [];
  const totalPages = Math.max(1, Math.ceil((data?.total ?? 0) / PAGE_SIZE));
  const countOf = (id: TabId) =>
    id === 'all' || !data ? null : data.counts[id as 'pending' | 'approved' | 'hidden'];

  return (
    <div>
      <PageHeader
        className="mb-5"
        title="Reseñas"
        subtitle="Las opiniones de quienes te compraron. Solo pueden opinar compradores con la compra despachada."
        count={
          (data?.total ?? 0) > 0 &&
          pageRangeLabel(page, PAGE_SIZE, data!.total, data!.total === 1 ? 'reseña' : 'reseñas')
        }
        actions={
          <Button variant="secondary" onClick={() => setSettingsOpen(true)}>
            <Settings2 className="h-4 w-4" /> Configuración
          </Button>
        }
      />

      <Tabs
        className="mb-4"
        label="Estado de las reseñas"
        items={TABS.map((t) => ({
          id: t.id,
          label: t.label,
          count: countOf(t.id),
          countTone: t.id === 'pending' ? 'warning' : 'default',
        }))}
        value={tab}
        onChange={(id) => list.set({ estado: id })}
      />

      {(data?.counts.flagged ?? 0) > 0 && (
        <p className="mb-3 flex items-center gap-2 rounded-lg bg-danger-bg px-3 py-2 text-sm text-danger">
          <Flag className="h-4 w-4 shrink-0" />
          {data!.counts.flagged === 1
            ? 'Una reseña fue denunciada por varias personas y salió de la tienda hasta que la revises.'
            : `${data!.counts.flagged} reseñas fueron denunciadas por varias personas y salieron de la tienda hasta que las revises.`}
        </p>
      )}

      <div className="mb-3 flex flex-wrap gap-2">
        <SearchInput
          aria-label="Buscar reseñas"
          placeholder="Buscar por producto, texto o email…"
          className="min-w-0 flex-1"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <Select
          aria-label="Estrellas"
          className="w-40"
          value={String(stars)}
          onChange={(e) => list.set({ estrellas: Number(e.target.value) })}
          options={[
            { value: '0', label: 'Todas las estrellas' },
            ...[5, 4, 3, 2, 1].map((n) => ({
              value: String(n),
              label: `${n} ${n === 1 ? 'estrella' : 'estrellas'}`,
            })),
          ]}
        />
      </div>

      {isLoading ? (
        <div className="rounded-lg border border-border bg-surface">
          <TableSkeleton label="Cargando reseñas…" />
        </div>
      ) : items.length === 0 ? (
        <EmptyList icon={<Star />}>
          {tab === 'pending'
            ? 'No hay reseñas esperando revisión. 🎉'
            : 'Todavía no hay reseñas acá. Llegan solas: le pedimos la opinión a cada comprador unos días después del despacho.'}
        </EmptyList>
      ) : (
        <div className="space-y-3">
          {items.map((r) => (
            <ReviewCard key={r.id} review={r} onAction={act} onReplied={refresh} />
          ))}
        </div>
      )}

      <Pagination
        page={Math.min(page, totalPages)}
        totalPages={totalPages}
        onPage={(p) => list.set({ pagina: p })}
      />

      {settingsOpen && <ReviewSettingsModal onClose={() => setSettingsOpen(false)} />}
      <HelpLink id="resenas" />
    </div>
  );
}

function RatingStars({ rating }: { rating: number }) {
  return (
    <span className="inline-flex items-center gap-0.5" role="img" aria-label={`${rating} de 5 estrellas`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          aria-hidden
          className={cn('h-4 w-4', n <= rating ? 'fill-amber-400 text-amber-400' : 'text-fg-subtle/40')}
        />
      ))}
    </span>
  );
}

function ReviewCard({
  review: r,
  onAction,
  onReplied,
}: {
  review: AdminReview;
  onAction: (r: AdminReview, action: 'approve' | 'hide') => void;
  onReplied: () => void;
}) {
  const { toast } = useToast();
  const [replying, setReplying] = useState(false);
  const [reply, setReply] = useState(r.reply ?? '');
  const [saving, setSaving] = useState(false);
  const badge = STATUS_BADGE[r.status];

  const saveReply = async () => {
    setSaving(true);
    try {
      await api.put(`/api/v1/admin/reviews/${r.id}/reply`, { reply });
      toast(reply.trim() ? 'Respuesta publicada.' : 'Respuesta borrada.', { variant: 'success' });
      setReplying(false);
      onReplied();
    } catch (e) {
      toast(errMsg(e, 'No se pudo guardar la respuesta.'), { variant: 'error' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <article
      className={cn(
        'rounded-2xl border bg-surface p-5 shadow-card',
        r.flagged ? 'border-danger/50' : 'border-border',
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <RatingStars rating={r.rating} />
            <Badge variant={badge.variant}>{badge.label}</Badge>
            {r.flagged && (
              <Badge variant="danger">
                <Flag className="mr-1 h-3 w-3" /> Denunciada ({r.reportCount})
              </Badge>
            )}
          </div>
          <Link
            to={`/productos/${r.productId}/editar`}
            className="mt-1 block truncate text-sm font-semibold text-primary hover:underline"
          >
            {r.productName}
            {r.variantLabel ? ` · ${r.variantLabel}` : ''}
          </Link>
        </div>
        <div className="text-right text-xs text-fg-subtle">
          <div>{formatDateTime(r.createdAtUtc)}</div>
          <div>
            {r.authorName} ·{' '}
            <a href={`mailto:${r.buyerEmail}`} className="hover:underline">
              {r.buyerEmail}
            </a>
          </div>
          <Link to={`/ventas?order=${r.orderId}`} className="hover:underline">
            Ver la venta
          </Link>
        </div>
      </div>

      {r.title && <p className="mt-3 font-semibold text-fg">{r.title}</p>}
      <p className="mt-1 whitespace-pre-line text-sm leading-relaxed text-fg-muted">{r.body}</p>

      {r.photos.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {r.photos.map((url, i) => (
            <a key={url} href={url} target="_blank" rel="noreferrer" aria-label={`Foto ${i + 1}`}>
              <img src={url} alt="" className="h-20 w-20 rounded-md border border-border object-cover" />
            </a>
          ))}
        </div>
      )}

      {r.reply && !replying && (
        <div className="mt-3 rounded-lg bg-bg-muted p-3 text-sm">
          <p className="text-xs font-semibold text-fg">Tu respuesta</p>
          <p className="mt-1 whitespace-pre-line text-fg-muted">{r.reply}</p>
        </div>
      )}

      {replying && (
        <div className="mt-3 space-y-2">
          <Textarea
            aria-label="Respuesta pública"
            rows={3}
            value={reply}
            maxLength={2000}
            onChange={(e) => setReply(e.target.value)}
            placeholder="Se publica debajo de la reseña, con el nombre de tu tienda."
          />
          <div className="flex gap-2">
            <Button size="sm" loading={saving} onClick={() => void saveReply()}>
              Publicar respuesta
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setReplying(false)}>
              Cancelar
            </Button>
          </div>
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-border pt-3">
        {r.status !== 'approved' && (
          <Button size="sm" onClick={() => onAction(r, 'approve')}>
            <Check className="mr-1.5 h-4 w-4" /> Aprobar
          </Button>
        )}
        {r.status !== 'hidden' && (
          <Button size="sm" variant="secondary" onClick={() => onAction(r, 'hide')}>
            <EyeOff className="mr-1.5 h-4 w-4" /> Ocultar
          </Button>
        )}
        {!replying && (
          <Button size="sm" variant="ghost" onClick={() => setReplying(true)}>
            <MessageSquareReply className="mr-1.5 h-4 w-4" /> {r.reply ? 'Editar respuesta' : 'Responder'}
          </Button>
        )}
        {r.helpfulCount > 0 && (
          <span className="ml-auto inline-flex items-center gap-1 text-xs text-fg-subtle">
            <ThumbsUp className="h-3.5 w-3.5" /> {r.helpfulCount}{' '}
            {r.helpfulCount === 1 ? 'persona' : 'personas'} la marcaron útil
          </span>
        )}
      </div>
    </article>
  );
}

/** Cómo se publican y se piden las reseñas. */
function ReviewSettingsModal({ onClose }: { onClose: () => void }) {
  const { store } = useStore();
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ['review-settings', store?.id],
    queryFn: () => api.get<ReviewSettings>('/api/v1/admin/reviews/settings'),
    enabled: !!store,
  });
  const [form, setForm] = useState<ReviewSettings | null>(null);
  const [saving, setSaving] = useState(false);
  const value = form ?? data ?? null;

  const save = async () => {
    if (!value) return;
    setSaving(true);
    try {
      const saved = await api.put<ReviewSettings>('/api/v1/admin/reviews/settings', value);
      qc.setQueryData(['review-settings', store?.id], saved);
      toast('Configuración guardada.', { variant: 'success' });
      onClose();
    } catch (e) {
      toast(errMsg(e, 'No se pudo guardar.'), { variant: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const set = (patch: Partial<ReviewSettings>) => value && setForm({ ...value, ...patch });

  return (
    <Modal
      open
      onClose={onClose}
      title="Configuración de reseñas"
      dirty={form !== null}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button loading={saving} disabled={!value} onClick={() => void save()}>
            Guardar
          </Button>
        </>
      }
    >
      {!value ? (
        <p className="text-sm text-fg-muted">Cargando…</p>
      ) : (
        <div className="space-y-5">
          <Switch
            checked={value.showOnStore}
            onChange={(showOnStore) => set({ showOnStore })}
            label="Mostrar las reseñas en la tienda (en la ficha y las estrellas en los listados)"
          />
          <label className="block text-sm">
            <span className="font-medium text-fg">Se publican solas</span>
            <Select
              className="mt-1"
              value={value.autoApproveMinRating === null ? 'none' : String(value.autoApproveMinRating)}
              onChange={(e) =>
                set({ autoApproveMinRating: e.target.value === 'none' ? null : Number(e.target.value) })
              }
              options={[
                { value: '5', label: 'Las de 5 estrellas' },
                { value: '4', label: 'Las de 4 y 5 estrellas (recomendado)' },
                { value: '3', label: 'Las de 3 estrellas o más' },
                { value: '1', label: 'Todas' },
                { value: 'none', label: 'Ninguna: reviso todas antes' },
              ]}
            />
            <span className="mt-1 block text-xs text-fg-subtle">
              Las que no se publican solas te esperan en Pendientes.
            </span>
          </label>
          <Switch
            checked={value.requestEmailEnabled}
            onChange={(requestEmailEnabled) => set({ requestEmailEnabled })}
            label="Pedir la reseña por email después del despacho"
          />
          <label className="block text-sm">
            <span className="font-medium text-fg">Días después del despacho</span>
            <Input
              className="mt-1 w-28"
              type="number"
              min={1}
              max={60}
              disabled={!value.requestEmailEnabled}
              value={value.requestDelayDays}
              onChange={(e) => set({ requestDelayDays: Number(e.target.value) })}
            />
            <span className="mt-1 block text-xs text-fg-subtle">
              Lo que tarda en llegar y en usarse. El texto del email se edita en Configuración → E-mails
              automáticos.
            </span>
          </label>
        </div>
      )}
    </Modal>
  );
}
