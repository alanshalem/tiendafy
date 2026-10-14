import { useId, useMemo, useState, type Dispatch, type SetStateAction } from 'react';
import {
  AlertTriangle,
  Bookmark,
  ChevronDown,
  ChevronRight,
  Heart,
  ImagePlus,
  Loader2,
  MessageCircle,
  Send,
  Sparkles,
  X as XIcon,
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { Button, Input, Modal, Select, Spinner, Textarea, cn, useToast } from '@tiendafy/ui';
import { api, errMsg } from '../lib/api';
import { useStore } from '../context/StoreContext';
import { useAiEnabled } from '../lib/useAi';
import { storefrontUrl } from '../lib/storefront';
import { useProductSearch } from '../lib/useProductSearch';
import { useBeforeUnload, useGuardedClose } from '../lib/useUnsavedChanges';
import {
  localInputToUtcIso,
  providerMeta,
  ProviderIcon,
  toLocalInput,
  type SocialAccountDto,
  type SocialChannelsDto,
  type SocialPostDto,
} from './redes-shared';

/** Shape del catálogo que usa el picker de imágenes (el DTO trae images[], no una sola). */
interface PickerProduct {
  id: string;
  name: string;
  slug: string;
  images: { url: string }[];
}

const coverUrl = (p: PickerProduct): string | null => p.images[0]?.url ?? null;

/**
 * Composer multi-red (diseño Mixpost): un texto base que sale a N cuentas, con
 * override opcional por cuenta y validación contra los límites reales de cada
 * red (contador por el peor límite, aviso si Instagram va sin imagen).
 */
export function ComposerModal({
  post,
  channels,
  accounts,
  initialDate,
  onClose,
  onSaved,
}: {
  post: SocialPostDto | null;
  channels: SocialChannelsDto;
  accounts: SocialAccountDto[];
  initialDate: Date | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const { store } = useStore();
  const textId = useId();
  const [content, setContent] = useState(post?.content ?? '');
  const [couponCode, setCouponCode] = useState(post?.couponCode ?? '');
  const [mediaUrls, setMediaUrls] = useState<string[]>(post?.mediaUrls ?? []);
  const [newUrl, setNewUrl] = useState('');
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(post?.targets.map((t) => t.accountId) ?? []),
  );
  const [overrides, setOverrides] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      (post?.targets ?? []).filter((t) => t.contentOverride).map((t) => [t.accountId, t.contentOverride!]),
    ),
  );
  const [scheduleAt, setScheduleAt] = useState(() => {
    if (post?.scheduledAtUtc) return toLocalInput(new Date(post.scheduledAtUtc));
    if (initialDate) return toLocalInput(initialDate);
    return '';
  });
  const [pickerOpen, setPickerOpen] = useState(false);
  // Lo que había al abrir: un post escrito (y sus textos por red) no se pierde
  // por un click afuera o un Escape de más.
  const draft = { content, couponCode, mediaUrls, selected: [...selected].sort(), overrides, scheduleAt };
  const [opened] = useState(() => JSON.stringify(draft));
  const dirty = JSON.stringify(draft) !== opened;
  const cancel = useGuardedClose(dirty, onClose);
  useBeforeUnload(dirty);
  const aiEnabled = useAiEnabled();
  const [improving, setImproving] = useState(false);

  // Cupones activos para medir ventas del post (misma atribución que campañas).
  const { data: couponsData } = useQuery({
    queryKey: ['coupons', store?.id],
    queryFn: () => api.get<{ items: { code: string; active: boolean }[] }>('/api/v1/coupons'),
    enabled: !!store,
  });
  const activeCoupons = (couponsData?.items ?? []).filter((c) => c.active);
  const [saving, setSaving] = useState<'draft' | 'schedule' | 'now' | null>(null);

  const limitsByKey = useMemo(
    () => Object.fromEntries(channels.channels.map((c) => [c.key, c.limits])),
    [channels],
  );

  // Validación declarativa: el peor límite entre las redes elegidas manda.
  const selectedAccounts = accounts.filter((a) => selected.has(a.id));
  const maxChars = Math.min(
    ...selectedAccounts.map((a) => limitsByKey[a.provider]?.maxChars ?? Infinity),
    10_000,
  );
  const needsMedia = selectedAccounts.filter(
    (a) => (limitsByKey[a.provider]?.requiresMedia ?? false) && mediaUrls.length === 0,
  );
  const overLimit = selectedAccounts.filter((a) => {
    const effective = overrides[a.id]?.trim() || content;
    return effective.length > (limitsByKey[a.provider]?.maxChars ?? Infinity);
  });

  const toggleAccount = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const addUrl = () => {
    const url = newUrl.trim();
    if (!url) return;
    setMediaUrls((prev) => [...prev, url]);
    setNewUrl('');
  };

  const save = async (mode: 'draft' | 'schedule' | 'now') => {
    if (mode === 'schedule' && !scheduleAt) {
      toast('Elegí fecha y hora para programar.', { variant: 'error' });
      return;
    }
    setSaving(mode);
    try {
      const body = {
        content,
        mediaUrls,
        couponCode: couponCode || null,
        targets: [...selected].map((accountId) => ({
          accountId,
          contentOverride: overrides[accountId]?.trim() || null,
        })),
      };
      const saved = post
        ? await api.put<SocialPostDto>(`/api/v1/admin/social/posts/${post.id}`, body)
        : await api.post<SocialPostDto>('/api/v1/admin/social/posts', body);

      if (mode !== 'draft') {
        await api.post(`/api/v1/admin/social/posts/${saved.id}/schedule`, {
          scheduledAtUtc: mode === 'schedule' ? localInputToUtcIso(scheduleAt) : null,
        });
      }
      toast(
        mode === 'draft'
          ? 'Borrador guardado'
          : mode === 'schedule'
            ? 'Post programado'
            : 'El post sale en el próximo minuto',
        { variant: 'success' },
      );
      onSaved();
      onClose();
    } catch (err) {
      toast(errMsg(err, 'No se pudo guardar el post.'), { variant: 'error' });
    } finally {
      setSaving(null);
    }
  };

  // La IA reescribe el borrador con tono vendedor conservando link y cupón.
  const improveWithAi = async () => {
    setImproving(true);
    try {
      const r = await api.post<{ text: string }>('/api/v1/ai/social-post', { draft: content });
      setContent(r.text);
    } catch (err) {
      toast(errMsg(err, 'La IA no pudo mejorar el texto.'), { variant: 'error' });
    } finally {
      setImproving(false);
    }
  };

  // Publicados/fallidos no se editan: el modal abre en modo lectura (el
  // fieldset disabled apaga todos los controles de una).
  const readOnly = post !== null && !post.isEditable;

  const busy = saving !== null;
  const canPublish = selected.size > 0 && needsMedia.length === 0 && overLimit.length === 0;

  return (
    <Modal
      open
      onClose={onClose}
      dirty={dirty}
      title={readOnly ? 'Ver post' : post ? 'Editar post' : 'Nuevo post'}
      size="xl"
      footer={
        readOnly ? (
          <Button variant="secondary" onClick={onClose}>
            Cerrar
          </Button>
        ) : (
          <>
            <Button variant="secondary" onClick={cancel}>
              Cancelar
            </Button>
            <Button variant="secondary" onClick={() => save('draft')} disabled={busy}>
              {saving === 'draft' && <Loader2 className="h-4 w-4 animate-spin" />} Guardar borrador
            </Button>
            <Button
              variant="secondary"
              onClick={() => save('schedule')}
              disabled={busy || !canPublish || !scheduleAt}
            >
              {saving === 'schedule' && <Loader2 className="h-4 w-4 animate-spin" />} Programar
            </Button>
            <Button onClick={() => save('now')} disabled={busy || !canPublish}>
              {saving === 'now' && <Loader2 className="h-4 w-4 animate-spin" />} Publicar ahora
            </Button>
          </>
        )
      }
    >
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <fieldset disabled={readOnly} className="contents">
          <div className="space-y-4">
            {/* Cuentas destino */}
            <div>
              <p className="mb-1.5 text-sm font-medium text-fg">Publicar en</p>
              {accounts.length === 0 ? (
                <p className="text-sm text-fg-muted">
                  No hay cuentas conectadas todavía: conectá una desde la pestaña Cuentas.
                </p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {accounts.map((a) => (
                    <button
                      key={a.id}
                      type="button"
                      disabled={!a.authorized}
                      // Elegida o no, también para un lector de pantalla (antes
                      // solo lo decía el color).
                      aria-pressed={selected.has(a.id)}
                      onClick={() => toggleAccount(a.id)}
                      title={a.authorized ? a.name : `${a.name} — reconectá la cuenta`}
                      className={cn(
                        'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors',
                        selected.has(a.id)
                          ? 'border-primary bg-primary/10 text-primary'
                          : 'border-border bg-surface text-fg-muted hover:border-fg-subtle',
                        !a.authorized && 'cursor-not-allowed opacity-40',
                      )}
                    >
                      <ProviderIcon provider={a.provider} size="sm" />
                      <span className="max-w-40 truncate">{a.name}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Texto base */}
            <div>
              <div className="mb-1.5 flex items-baseline justify-between">
                <span className="flex items-center gap-2">
                  <label htmlFor={textId} className="text-sm font-medium text-fg">
                    Texto
                  </label>
                  {aiEnabled && content.trim().length > 0 && (
                    <button
                      type="button"
                      onClick={improveWithAi}
                      disabled={improving}
                      className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline disabled:opacity-50"
                      title="Reescribe el borrador con tono vendedor (conserva link y cupón)"
                    >
                      {improving ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <Sparkles className="h-3 w-3" />
                      )}
                      Mejorar con IA
                    </button>
                  )}
                </span>
                {selected.size > 0 && Number.isFinite(maxChars) && (
                  <span
                    className={cn(
                      'text-xs',
                      content.length > maxChars ? 'font-semibold text-danger' : 'text-fg-subtle',
                    )}
                  >
                    {content.length} / {maxChars}
                  </span>
                )}
              </div>
              <Textarea
                id={textId}
                rows={5}
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="¿Qué querés contar? El mismo texto sale a todas las redes elegidas (podés ajustarlo por red abajo)."
              />
            </div>

            {/* Avisos de límites por red */}
            {needsMedia.length > 0 && (
              <p className="flex items-center gap-1.5 text-sm text-warning">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                {needsMedia.map((a) => providerMeta(a.provider).label).join(', ')} exige al menos una imagen.
              </p>
            )}
            {overLimit.length > 0 && (
              <p className="flex items-center gap-1.5 text-sm text-danger">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                El texto supera el límite de {overLimit
                  .map((a) => providerMeta(a.provider).label)
                  .join(', ')}{' '}
                — acortalo o escribí una versión por red.
              </p>
            )}

            {/* Imágenes */}
            <div>
              <p className="mb-1.5 text-sm font-medium text-fg">Imágenes</p>
              {mediaUrls.length > 0 && (
                <div className="mb-2 flex flex-wrap gap-2">
                  {mediaUrls.map((url, i) => (
                    <span key={`${url}-${i}`} className="group relative">
                      <img
                        src={url}
                        alt=""
                        className="h-16 w-16 rounded-lg border border-border object-cover"
                      />
                      <button
                        type="button"
                        onClick={() => setMediaUrls((prev) => prev.filter((_, j) => j !== i))}
                        className="absolute -right-1.5 -top-1.5 rounded-full bg-danger p-0.5 text-status-fg opacity-0 transition-opacity group-hover:opacity-100"
                        title="Quitar imagen"
                      >
                        <XIcon className="h-3 w-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
              <div className="flex gap-2">
                <div className="min-w-0 flex-1">
                  <Input
                    type="url"
                    aria-label="URL de una imagen para agregar"
                    value={newUrl}
                    onChange={(e) => setNewUrl(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addUrl())}
                    placeholder="https://… (URL pública de la imagen)"
                  />
                </div>
                <Button variant="secondary" onClick={addUrl} disabled={!newUrl.trim()}>
                  Agregar
                </Button>
                <Button variant="secondary" onClick={() => setPickerOpen(true)}>
                  <ImagePlus className="h-4 w-4" /> Del catálogo
                </Button>
              </div>
            </div>

            <PerNetworkOverrides
              accounts={selectedAccounts}
              overrides={overrides}
              setOverrides={setOverrides}
              baseContent={content}
              limitsByKey={limitsByKey}
            />

            {/* Cupón: el post se mide como una campaña de email */}
            {activeCoupons.length > 0 && (
              <div>
                <p className="mb-1.5 text-sm font-medium text-fg">Cupón para medir ventas (opcional)</p>
                <div className="flex gap-2">
                  <div className="w-64">
                    <Select
                      aria-label="Cupón para medir ventas"
                      value={couponCode}
                      onChange={(e) => setCouponCode(e.target.value)}
                      options={[
                        { value: '', label: 'Sin cupón' },
                        ...activeCoupons.map((c) => ({ value: c.code, label: c.code })),
                      ]}
                    />
                  </div>
                  {couponCode && !content.includes(couponCode) && (
                    <Button
                      variant="secondary"
                      onClick={() => setContent((c) => `${c.trimEnd()}\n🎁 Usá el cupón ${couponCode}`)}
                    >
                      Insertar en el texto
                    </Button>
                  )}
                </div>
                <p className="mt-1 text-xs text-fg-subtle">
                  Las ventas pagadas con este cupón después de publicar se atribuyen al post.
                </p>
              </div>
            )}

            {/* Fecha */}
            <div>
              <p className="mb-1.5 text-sm font-medium text-fg">Programar para</p>
              <div className="w-64">
                <Input
                  aria-label="Programar para"
                  type="datetime-local"
                  value={scheduleAt}
                  onChange={(e) => setScheduleAt(e.target.value)}
                />
              </div>
              <p className="mt-1 text-xs text-fg-subtle">
                En tu hora local. Dejalo vacío si vas a usar “Publicar ahora”.
              </p>
            </div>
          </div>
        </fieldset>

        <PostPreview
          accounts={selectedAccounts}
          content={content}
          overrides={overrides}
          mediaUrls={mediaUrls}
        />
      </div>

      {pickerOpen && (
        <CatalogImagePicker
          onClose={() => setPickerOpen(false)}
          onPick={(product) => {
            const cover = coverUrl(product);
            if (cover) setMediaUrls((prev) => [...prev, cover]);
            // El post además VENDE: link al producto con UTM para atribuir el tráfico.
            const link = store
              ? storefrontUrl(store.subdomain, `/productos/${product.slug}?utm_source=redes`)
              : null;
            if (link && !content.includes(link)) {
              setContent((c) => (c.trim().length > 0 ? `${c.trimEnd()}\n${link}` : link));
              toast('Imagen y link del producto agregados al post', { variant: 'success' });
            }
            setPickerOpen(false);
          }}
        />
      )}
    </Modal>
  );
}

// ---- Selector de imágenes del catálogo ---------------------------------------

function CatalogImagePicker({
  onClose,
  onPick,
}: {
  onClose: () => void;
  onPick: (product: PickerProduct) => void;
}) {
  const [search, setSearch] = useState('');

  // La búsqueda la resuelve la base: antes se recorría el catálogo entero cada
  // vez que se abría el modal para después filtrar por nombre en el navegador.
  const { data, isLoading } = useProductSearch<PickerProduct>(search);

  // Solo sirven los que tienen foto: es una imagen para el post.
  const filtered = (data?.items ?? []).filter((p) => coverUrl(p) !== null);
  const products = isLoading && !data ? null : filtered;

  return (
    <Modal open onClose={onClose} title="Imagen del catálogo" size="lg">
      <Input
        type="search"
        aria-label="Buscar producto del catálogo"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Buscar producto…"
        autoFocus
      />
      {products === null ? (
        <div className="py-8">
          <Spinner />
        </div>
      ) : filtered.length === 0 ? (
        <p className="py-8 text-center text-sm text-fg-muted">No hay productos con foto que coincidan.</p>
      ) : (
        <div className="mt-3 grid max-h-96 grid-cols-3 gap-3 overflow-y-auto sm:grid-cols-4">
          {filtered.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => onPick(p)}
              className="group text-left"
              title={p.name}
            >
              <img
                src={coverUrl(p)!}
                alt={p.name}
                className="aspect-square w-full rounded-lg border border-border object-cover transition-transform group-hover:scale-[1.02]"
              />
              <p className="mt-1 truncate text-xs text-fg-muted">{p.name}</p>
            </button>
          ))}
        </div>
      )}
    </Modal>
  );
}

// ---- Preview en vivo ---------------------------------------------------------

/**
 * Así se va a ver el post: tarjeta que imita la publicación de la red elegida
 * (avatar y nombre de la cuenta, texto con la versión por red, imagen) con
 * tabs para saltar entre las cuentas seleccionadas.
 */
function PostPreview({
  accounts,
  content,
  overrides,
  mediaUrls,
}: {
  accounts: SocialAccountDto[];
  content: string;
  overrides: Record<string, string>;
  mediaUrls: string[];
}) {
  const [previewId, setPreviewId] = useState<string | null>(null);
  const active = accounts.find((a) => a.id === previewId) ?? accounts[0];

  return (
    <div className="lg:sticky lg:top-0">
      <p className="mb-1.5 text-sm font-medium text-fg">Así se va a ver</p>
      {!active ? (
        <div className="flex h-56 items-center justify-center rounded-xl border border-dashed border-border text-center text-sm text-fg-muted">
          Elegí al menos una cuenta
          <br />
          para ver el preview.
        </div>
      ) : (
        <>
          {accounts.length > 1 && (
            <div className="mb-2 flex flex-wrap gap-1.5">
              {accounts.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => setPreviewId(a.id)}
                  className={cn(
                    'inline-flex items-center gap-1 rounded-full border px-2 py-1 text-xs transition-colors',
                    a.id === active.id
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border text-fg-muted hover:border-fg-subtle',
                  )}
                >
                  <ProviderIcon provider={a.provider} size="sm" />
                  {providerMeta(a.provider).label}
                </button>
              ))}
            </div>
          )}

          <div className="overflow-hidden rounded-xl border border-border bg-surface shadow-card">
            <div className="flex items-center gap-2.5 px-3.5 pt-3">
              {active.avatarUrl ? (
                <img src={active.avatarUrl} alt="" className="h-9 w-9 rounded-full object-cover" />
              ) : (
                <ProviderIcon provider={active.provider} />
              )}
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-fg">{active.name}</p>
                <p className="text-xs text-fg-subtle">
                  {active.username ? `@${active.username}` : providerMeta(active.provider).label} · ahora
                </p>
              </div>
            </div>
            <p className="whitespace-pre-wrap break-words px-3.5 py-2.5 text-sm leading-relaxed text-fg">
              {overrides[active.id]?.trim() || content || (
                <span className="text-fg-subtle">El texto de tu post va a aparecer acá…</span>
              )}
            </p>
            {mediaUrls[0] && <img src={mediaUrls[0]} alt="" className="max-h-64 w-full object-cover" />}
            {mediaUrls.length > 1 && (
              <p className="px-3.5 pt-1.5 text-xs text-fg-subtle">+{mediaUrls.length - 1} imágenes más</p>
            )}
            <div className="flex items-center gap-5 px-3.5 py-2.5 text-fg-subtle">
              <Heart className="h-4 w-4" />
              <MessageCircle className="h-4 w-4" />
              <Send className="h-4 w-4" />
              <Bookmark className="ml-auto h-4 w-4" />
            </div>
          </div>
          <p className="mt-1.5 text-xs text-fg-subtle">
            Aproximado: cada red aplica su propio recorte y tipografía.
          </p>
        </>
      )}
    </div>
  );
}

/**
 * "Versión por red": un acordeón por cuenta seleccionada para pisar el texto
 * base. Estaba inline en el composer (60 líneas de JSX y un Set de abiertos en
 * el estado del formulario, que no tiene nada que ver con lo que se publica).
 */
function PerNetworkOverrides({
  accounts,
  overrides,
  setOverrides,
  baseContent,
  limitsByKey,
}: {
  accounts: SocialAccountDto[];
  overrides: Record<string, string>;
  setOverrides: Dispatch<SetStateAction<Record<string, string>>>;
  baseContent: string;
  limitsByKey: Record<string, { maxChars?: number } | undefined>;
}) {
  const [open, setOpen] = useState<Set<string>>(new Set());
  if (accounts.length === 0) return null;

  const toggle = (id: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <div>
      <p className="mb-1.5 text-sm font-medium text-fg">Versión por red (opcional)</p>
      <div className="space-y-1.5">
        {accounts.map((a) => {
          const isOpen = open.has(a.id);
          const limit = limitsByKey[a.provider]?.maxChars;
          const value = overrides[a.id] ?? '';
          // Lo que se va a publicar en ESA red: el override si lo hay, si no el texto base.
          const effective = value.trim() || baseContent;
          return (
            <div key={a.id} className="rounded-lg border border-border">
              <button
                type="button"
                aria-expanded={isOpen}
                onClick={() => toggle(a.id)}
                className="flex w-full items-center gap-2 px-3 py-2 text-sm text-fg-muted hover:text-fg"
              >
                {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                <ProviderIcon provider={a.provider} size="sm" />
                <span className="truncate">{a.name}</span>
                {value.trim() && <span className="ml-auto text-xs text-primary">personalizado</span>}
              </button>
              {isOpen && (
                <div className="border-t border-border p-3">
                  <Textarea
                    aria-label={`Texto solo para ${a.name} (${providerMeta(a.provider).label})`}
                    rows={3}
                    value={value}
                    onChange={(e) => setOverrides((prev) => ({ ...prev, [a.id]: e.target.value }))}
                    placeholder={`Texto solo para ${providerMeta(a.provider).label} (vacío = usa el texto base)`}
                  />
                  {limit !== undefined && (
                    <p
                      className={cn(
                        'mt-1 text-right text-xs',
                        effective.length > limit ? 'font-semibold text-danger' : 'text-fg-subtle',
                      )}
                    >
                      {effective.length} / {limit}
                    </p>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
