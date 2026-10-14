import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { Inbox as InboxIcon, MessagesSquare } from 'lucide-react';
import { cn, Input, Select, Spinner, PageHeader, Tabs } from '@tiendafy/ui';
import { formatDateTime } from '@tiendafy/types';
import { api } from '../lib/api';
import { useStore } from '../context/StoreContext';
import { NoStoreSelected } from '../components/NoStoreSelected';
import { ERROR_SHOWN, LoadError } from '../components/LoadError';
import { HelpLink } from '../components/HelpLink';
import { useDebouncedValue } from '../lib/useDebouncedValue';
import {
  CHANNEL_ORDER,
  CHANNELS,
  INBOX_POLL_MS,
  initials,
  threadPath,
  type Assignable,
  type InboxChannel,
  type InboxPage as InboxPageData,
  type InboxThread,
} from '../lib/inbox';
import { ChannelChip, ThreadPane } from './inbox-thread';

/** Las solapas de la bandeja (valor de `?filtro=`). */
const FILTERS = [
  { id: '', label: 'Abiertas' },
  { id: 'sin-leer', label: 'Sin leer' },
  { id: 'mias', label: 'Mías' },
  { id: 'sin-asignar', label: 'Sin asignar' },
  { id: 'archivadas', label: 'Archivadas' },
] as const;
type FilterId = (typeof FILTERS)[number]['id'];

/**
 * Bandeja: los mensajes de contacto, el chat posventa y las preguntas y
 * mensajes de Mercado Libre en una sola lista, con la conversación a la
 * derecha (en el celular, lista y conversación se alternan).
 *
 * Se refresca sola cada 30 s mientras la pestaña está a la vista (React Query
 * pausa el intervalo con la pestaña oculta), y el hilo abierto cada 15 s.
 * Filtro, canal y conversación abierta van en la URL: se puede mandar el link
 * de una conversación a un compañero, y "Atrás" en el celular vuelve a la lista.
 */
export function InboxPage() {
  const { store } = useStore();
  const queryClient = useQueryClient();
  const [params, setParams] = useSearchParams();
  const filter = (FILTERS.find((f) => f.id === params.get('filtro'))?.id ?? '') as FilterId;
  const channelParam = params.get('canal');
  const channel = CHANNEL_ORDER.includes(channelParam as InboxChannel) ? (channelParam as InboxChannel) : '';
  const selectedKey = params.get('conversacion');
  const [search, setSearch] = useState('');
  const q = useDebouncedValue(search.trim(), 300);

  const setParam = (changes: Record<string, string | null>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(changes)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    setParams(next);
  };

  const query = new URLSearchParams({ limit: '100' });
  if (filter) query.set('filter', filter);
  if (channel) query.set('channel', channel);
  if (q) query.set('q', q);

  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ['inbox', store?.id, filter, channel, q],
    queryFn: () => api.get<InboxPageData>(`/api/v1/inbox?${query}`),
    enabled: !!store,
    refetchInterval: INBOX_POLL_MS,
    placeholderData: keepPreviousData,
    meta: ERROR_SHOWN,
  });
  const { data: assignables } = useQuery({
    queryKey: ['inbox-assignees', store?.id],
    queryFn: () => api.get<{ items: Assignable[] }>('/api/v1/inbox/assignees'),
    enabled: !!store,
    staleTime: 5 * 60_000,
    meta: ERROR_SHOWN,
  });

  // La conversación abierta se recuerda aunque deje de estar en la lista
  // (abrirla desde "Sin leer" la marca leída y la saca del filtro).
  const listed = data?.items.find((t) => t.key === selectedKey) ?? null;
  const [pinned, setPinned] = useState<InboxThread | null>(null);
  if (listed && listed !== pinned) setPinned(listed);
  const current = listed ?? (pinned?.key === selectedKey ? pinned : null);

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['inbox', store?.id] });
    void queryClient.invalidateQueries({ queryKey: ['inbox-counts', store?.id] });
  };

  const open = async (thread: InboxThread) => {
    setParam({ conversacion: thread.key });
    if (!thread.unread) return;
    // Abrirla es leerla (en el canal mismo, si lo tiene).
    try {
      await api.post(`${threadPath(thread)}/read`, {});
      refresh();
    } catch {
      /* la próxima pasada del polling la vuelve a mostrar como estaba */
    }
  };

  if (!store) return <NoStoreSelected />;

  const counts = data?.counts;
  const channels = data?.channels ?? CHANNEL_ORDER;
  const items = data?.items ?? [];

  return (
    <div>
      <PageHeader
        className="mb-4"
        title="Bandeja"
        subtitle="Contacto, chat posventa y Mercado Libre en un solo lugar. Se actualiza sola."
        count={
          counts && (
            <span role="status">
              <span className="font-semibold text-fg">{counts.unread}</span> sin leer
              {counts.mine > 0 && (
                <>
                  {' · '}
                  <span className="font-semibold text-fg">{counts.mine}</span> asignadas a vos
                </>
              )}
            </span>
          )
        }
      />

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Tabs
          label="Conversaciones"
          items={FILTERS.map((f) => ({
            id: f.id,
            label: f.label,
            count: f.id === 'sin-leer' ? counts?.unread : f.id === 'mias' ? counts?.mine : null,
          }))}
          value={filter}
          onChange={(id) => setParam({ filtro: id || null })}
        />
        <div className="w-48">
          <Select
            aria-label="Canal"
            value={channel}
            onChange={(e) => setParam({ canal: e.target.value || null })}
            options={[
              { value: '', label: 'Todos los canales' },
              ...channels.map((c) => ({
                value: c,
                label: `${CHANNELS[c].label}${counts?.byChannel[c] ? ` (${counts.byChannel[c]})` : ''}`,
              })),
            ]}
          />
        </div>
        <div className="min-w-[12rem] flex-1">
          <Input
            type="search"
            aria-label="Buscar en la bandeja"
            placeholder="Buscar por nombre, email o texto…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {data?.warnings.map((w) => (
        <p key={w} role="status" className="mb-2 rounded-md bg-warning-bg px-3 py-2 text-xs text-warning">
          {w}
        </p>
      ))}

      <div className="grid h-[calc(100vh-240px)] min-h-[460px] grid-cols-1 overflow-hidden rounded-lg border border-border bg-surface shadow-card md:grid-cols-[340px_1fr]">
        <div
          className={cn('min-h-0 overflow-y-auto border-border md:border-r', current && 'hidden md:block')}
        >
          {error && data && (
            <p role="status" className="border-b border-border bg-warning-bg px-4 py-2 text-xs text-warning">
              No se pudo actualizar la bandeja: se muestra la última que llegó. Se reintenta sola.
            </p>
          )}
          {isLoading ? (
            <p className="flex items-center gap-2 p-4 text-sm text-fg-muted">
              <Spinner inline /> Cargando…
            </p>
          ) : error && !data ? (
            <LoadError
              className="m-3"
              title="No se pudo cargar la bandeja."
              error={error}
              onRetry={() => void refetch()}
              retrying={isFetching}
            />
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center gap-2 px-6 py-16 text-center text-fg-muted">
              <InboxIcon className="h-8 w-8 opacity-50" />
              <p className="text-sm">
                {filter === 'sin-leer'
                  ? '¡Al día! No hay nada sin leer.'
                  : filter === 'archivadas'
                    ? 'No hay conversaciones archivadas.'
                    : q
                      ? 'Nada coincide con la búsqueda.'
                      : 'No hay conversaciones acá.'}
              </p>
            </div>
          ) : (
            <ul>
              {items.map((t) => (
                <li key={t.key}>
                  <ThreadRow thread={t} selected={t.key === selectedKey} onOpen={() => void open(t)} />
                </li>
              ))}
            </ul>
          )}
          {data && data.total > items.length && (
            <p className="px-4 py-3 text-center text-xs text-fg-subtle">
              Se muestran las {items.length} más recientes de {data.total}. Filtrá o buscá para ver el resto.
            </p>
          )}
        </div>

        <div className={cn('min-h-0', !current && 'hidden md:block')}>
          {current ? (
            <ThreadPane
              key={current.key}
              thread={current}
              assignables={assignables?.items ?? []}
              onBack={() => setParam({ conversacion: null })}
              onChanged={refresh}
            />
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-2 text-fg-muted">
              <MessagesSquare className="h-8 w-8 opacity-40" />
              <p className="text-sm">Elegí una conversación.</p>
            </div>
          )}
        </div>
      </div>
      <HelpLink id="bandeja" />
    </div>
  );
}

function ThreadRow({
  thread,
  selected,
  onOpen,
}: {
  thread: InboxThread;
  selected: boolean;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-current={selected ? 'true' : undefined}
      className={cn(
        'flex w-full gap-3 border-b border-border px-4 py-3 text-left hover:bg-bg-muted',
        selected && 'bg-bg-muted',
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          'mt-1.5 h-2 w-2 shrink-0 rounded-full',
          thread.unread ? 'bg-primary' : 'bg-transparent',
        )}
      />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className={cn('truncate text-sm text-fg', thread.unread ? 'font-semibold' : 'font-medium')}>
            {thread.title}
          </span>
          <span className="ml-auto shrink-0 text-2xs text-fg-subtle">
            {formatDateTime(thread.lastActivityAtUtc)}
          </span>
        </span>
        <span className="mt-0.5 flex items-center gap-1.5">
          <ChannelChip channel={thread.channel} />
          {thread.subtitle && <span className="truncate text-xs text-fg-muted">{thread.subtitle}</span>}
        </span>
        <span className="mt-1 flex items-center gap-2">
          <span className="line-clamp-2 flex-1 text-xs text-fg-muted">{thread.preview}</span>
          {thread.assignedTo && (
            <span
              title={`Asignada a ${thread.assignedTo.name}`}
              aria-label={`Asignada a ${thread.assignedTo.name}`}
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-bg-muted text-3xs font-bold text-fg"
            >
              {initials(thread.assignedTo.name)}
            </span>
          )}
          {thread.unreadCount > 1 && (
            <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-primary px-1.5 text-2xs font-bold text-primary-fg">
              {thread.unreadCount}
            </span>
          )}
        </span>
      </span>
    </button>
  );
}
