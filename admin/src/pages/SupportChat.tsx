import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Archive, MessageCircle, Paperclip, RefreshCw, Send, Sparkles } from 'lucide-react';
import { cn, useToast, Spinner, PageHeader, Button } from '@tiendafy/ui';
import { api, errMsg } from '../lib/api';
import { draftPath, requestDraft, useAiDrafts, type AiDraft } from '../lib/aiDraft';
import { AiDraftNotice } from '../components/AiDraftNotice';
import { useStore } from '../context/StoreContext';
import { LoadError } from '../components/LoadError';
import { HelpLink } from '../components/HelpLink';
import { ListStats } from '../components/stats/ListStats';
import { formatDateTime } from '@tiendafy/types';
import { formatNumber } from '../lib/format';
import { orderLabel } from '../lib/orderNumber';
import { UPLOADS, describe } from '../lib/uploads';
import { UploadBar, UploadNotes, useFilePicker, useUploadQueue } from '../components/upload/primitives';
import { Pagination } from '../components/Pagination';

interface Conversation {
  id: string;
  orderId: string;
  /** Número de la venta (#1042); null si la API no lo encontró. */
  orderNumber?: number | null;
  customerEmail: string;
  status: 'OPEN' | 'CLOSED';
  unreadForStaff: number;
  lastMessageAtUtc: string;
}
interface Attachment {
  name: string;
  contentType: string;
  url: string;
}
interface Message {
  id: string;
  isFromStaff: boolean;
  authorName: string;
  body: string;
  attachment: Attachment | null;
  createdAtUtc: string;
}

const POLL_MS = 8000;

/** Conversaciones por página de la bandeja. */
const INBOX_PAGE = 25;

interface InboxResponse {
  items: Conversation[];
  total?: number;
  waitingCount?: number;
  openCount?: number;
  allCount?: number;
}

type InboxFilter = 'all' | 'waiting' | 'open';

/** El hilo abierto: lo que se ve y si queda algo más atrás ("Ver anteriores"). */
interface Thread {
  items: Message[];
  hasOlder: boolean;
}

const EMPTY_THREAD: Thread = { items: [], hasOlder: false };

/**
 * La última tanda que llegó del servidor, sumada a lo que ya se veía: lo más
 * viejo que se cargó con "Ver anteriores" no se pierde en cada pasada del
 * polling, y lo nuevo reemplaza lo que había.
 */
function mergeLatest(prev: Thread, latest: Message[], hasMore: boolean): Thread {
  if (latest.length === 0) return { items: prev.items, hasOlder: prev.hasOlder };
  const ids = new Set(latest.map((m) => m.id));
  const oldestNew = latest[0]!.createdAtUtc;
  const older = prev.items.filter((m) => !ids.has(m.id) && m.createdAtUtc < oldestNew);
  return { items: [...older, ...latest], hasOlder: older.length > 0 ? prev.hasOlder : hasMore };
}

/** Bandeja de chat posventa: conversaciones por orden con los compradores. */
export function SupportChatPage() {
  const { store } = useStore();
  const { toast } = useToast();
  const [convs, setConvs] = useState<Conversation[]>([]);
  const [inboxInfo, setInboxInfo] = useState<Omit<InboxResponse, 'items'>>({});
  const [inbox, setInbox] = useState<InboxFilter>('all');
  const [inboxPage, setInboxPage] = useState(1);
  const [selected, setSelected] = useState<string | null>(null);
  // La conversación abierta, para descartar respuestas que llegan tarde.
  const selectedRef = useRef(selected);
  useLayoutEffect(() => {
    selectedRef.current = selected;
  });
  const [thread, setThread] = useState<Thread>(EMPTY_THREAD);
  const messages = thread.items;
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const aiDraft = useAiDrafts();
  const [draftNotice, setDraftNotice] = useState<AiDraft | null>(null);
  const [suggesting, setSuggesting] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Un pedido fallido ya no devuelve una bandeja vacía: con el polling cada
  // 8 s, un corte vaciaba la bandeja y mostraba "Sin consultas todavía".
  // Ahora se queda lo último que llegó y se avisa.
  const [loadError, setLoadError] = useState<unknown>(null);
  // De a una página y con el recorte (esperando / abiertas) en el servidor:
  // antes llegaban las 200 primeras y se filtraba acá.
  const fetchConvs = useCallback(() => {
    const params = new URLSearchParams({
      limit: String(INBOX_PAGE),
      offset: String((inboxPage - 1) * INBOX_PAGE),
    });
    if (inbox !== 'all') params.set('filter', inbox);
    return api
      .get<InboxResponse>(`/api/v1/support/conversations?${params}`)
      .then((d) => ({ data: d, error: null as unknown }))
      .catch((error: unknown) => ({ data: null, error: error ?? true }));
  }, [inbox, inboxPage]);
  const showConvs = useCallback((r: { data: InboxResponse | null; error: unknown }) => {
    if (r.data) {
      const { items, ...info } = r.data;
      setConvs(items ?? []);
      setInboxInfo(info);
    }
    setLoadError(r.error);
    setLoading(false);
  }, []);
  const loadConvs = useCallback(async () => showConvs(await fetchConvs()), [fetchConvs, showConvs]);

  const loadMessages = useCallback(async (id: string) => {
    // La respuesta tardía de otra conversación no puede pisar la abierta
    // (el polling de 8 s dispara requests que resuelven fuera de orden).
    try {
      const d = await api.get<{ items: Message[]; hasMore?: boolean }>(
        `/api/v1/support/conversations/${id}/messages`,
      );
      if (selectedRef.current !== id) return;
      setThread((t) => mergeLatest(t, d.items ?? [], d.hasMore ?? false));
      // Leído al abrir: refrescar contadores de la bandeja.
      setConvs((cs) => cs.map((c) => (c.id === id ? { ...c, unreadForStaff: 0 } : c)));
    } catch {
      /* la próxima pasada de polling reintenta */
    }
  }, []);

  useEffect(() => {
    if (!store) return;
    let current = true;
    fetchConvs().then((r) => current && showConvs(r));
    return () => {
      current = false;
    };
  }, [store, fetchConvs, showConvs]);

  // Polling: bandeja siempre; hilo abierto también.
  useEffect(() => {
    if (!store) return;
    const t = setInterval(() => {
      // Con la pestaña oculta no se pregunta nada: nadie está mirando.
      if (document.hidden) return;
      loadConvs();
      if (selected) loadMessages(selected);
    }, POLL_MS);
    return () => clearInterval(t);
  }, [store, selected, loadConvs, loadMessages]);

  // Abajo de todo cuando llega algo NUEVO, no cuando se cargan los anteriores
  // (eso suma arriba y saltar al final haría perder lo que se fue a buscar).
  const newestId = messages.at(-1)?.id;
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [newestId]);

  const open = (id: string) => {
    setSelected(id);
    setDraftNotice(null);
    setThread(EMPTY_THREAD);
    loadMessages(id);
  };

  // "Ver anteriores": la tanda de antes del mensaje más viejo que se ve.
  const loadOlder = async () => {
    const id = selected;
    const oldest = messages[0];
    if (!id || !oldest || loadingOlder) return;
    setLoadingOlder(true);
    try {
      const d = await api.get<{ items: Message[]; hasMore?: boolean }>(
        `/api/v1/support/conversations/${id}/messages?before=${oldest.id}`,
      );
      if (selectedRef.current !== id) return;
      setThread((t) => {
        const seen = new Set(t.items.map((m) => m.id));
        return {
          items: [...(d.items ?? []).filter((m) => !seen.has(m.id)), ...t.items],
          hasOlder: d.hasMore ?? false,
        };
      });
    } catch (e) {
      toast(errMsg(e, 'No se pudieron cargar los mensajes anteriores.'), { variant: 'error' });
    } finally {
      setLoadingOlder(false);
    }
  };

  // La IA redacta con el contexto del pedido; el operador edita y manda. El
  // servidor lee la conversación y su pedido: el navegador no manda texto.
  const suggestReply = async () => {
    const conversation = selected;
    if (!conversation) return;
    setSuggesting(true);
    setDraftNotice(null);
    try {
      const r = await requestDraft(draftPath.support(conversation));
      if (selectedRef.current !== conversation) return;
      setDraftNotice(r);
      if (!r.manual && r.text) setText(r.text);
    } catch (err) {
      toast(errMsg(err, 'La IA no pudo sugerir una respuesta.'), { variant: 'error' });
    } finally {
      setSuggesting(false);
    }
  };

  const send = async () => {
    if (!selected || !text.trim() || sending) return;
    setSending(true);
    try {
      await api.post(`/api/v1/support/conversations/${selected}/messages`, { body: text });
      setText('');
      setDraftNotice(null);
      await loadMessages(selected);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'No se pudo enviar.', { variant: 'error' });
    } finally {
      setSending(false);
    }
  };

  // El adjunto viaja con el texto que ya estaba escrito, como un solo mensaje.
  const attachments = useUploadQueue('supportAttachment', (file, progress) => {
    const form = new FormData();
    form.append('file', file);
    if (text.trim()) form.append('body', text.trim());
    return api.postForm(`/api/v1/support/conversations/${selected}/attachments`, form, progress);
  });
  const sendFile = async (files: File[]) => {
    const conversation = selected;
    if (!conversation) return;
    if ((await attachments.run(files.slice(0, 1), () => {})) === 0) return;
    setText('');
    await loadMessages(conversation);
  };
  const attachPicker = useFilePicker({
    kind: 'supportAttachment',
    disabled: attachments.busy,
    onFiles: (files) => void sendFile(files),
  });
  const attachSpec = describe(UPLOADS.supportAttachment);
  const attaching = attachments.pending[0];

  const close = async () => {
    if (!selected) return;
    try {
      await api.post(`/api/v1/support/conversations/${selected}/close`, {});
      toast('Conversación cerrada', { variant: 'success' });
      await loadConvs();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'No se pudo cerrar.', { variant: 'error' });
    }
  };

  const current = convs.find((c) => c.id === selected) ?? null;

  // Las cifras son de toda la bandeja (las cuenta el servidor), no de la
  // página a la vista.
  const waiting = inboxInfo.waitingCount ?? convs.filter((c) => c.unreadForStaff > 0).length;
  const openCount = inboxInfo.openCount ?? convs.filter((c) => c.status === 'OPEN').length;
  const allCount = inboxInfo.allCount ?? convs.length;
  const inboxPages = Math.max(1, Math.ceil((inboxInfo.total ?? convs.length) / INBOX_PAGE));

  const showInbox = (next: InboxFilter) => {
    setInbox(next);
    setInboxPage(1);
  };
  const toggleInbox = (next: 'waiting' | 'open') => showInbox(inbox === next ? 'all' : next);

  const visible = convs;

  return (
    <div>
      <PageHeader
        className="mb-5"
        title="Chat posventa"
        actions={
          <>
            <Link to="/bandeja?canal=posventa" className="text-sm font-medium text-primary hover:underline">
              Ver en la Bandeja
            </Link>
            <Button variant="secondary" onClick={loadConvs}>
              <RefreshCw className="h-4 w-4" /> Actualizar
            </Button>
          </>
        }
      />

      {allCount > 0 && (
        <div className="mb-4">
          <ListStats
            items={[
              {
                label: 'Esperando respuesta',
                value: formatNumber(waiting),
                hint: 'Conversaciones con mensajes del cliente sin leer. Es la cola real de trabajo.',
                tone: waiting > 0 ? 'danger' : 'success',
                onClick: () => toggleInbox('waiting'),
                active: inbox === 'waiting',
              },
              {
                label: 'Abiertas',
                value: formatNumber(openCount),
                hint: 'Consultas todavía sin cerrar, hayas respondido o no.',
                onClick: () => toggleInbox('open'),
                active: inbox === 'open',
              },
              {
                label: 'Total de consultas',
                value: formatNumber(allCount),
                onClick: inbox === 'all' ? undefined : () => showInbox('all'),
              },
            ]}
          />
        </div>
      )}

      <div className="grid h-[calc(100vh-180px)] min-h-[420px] grid-cols-1 overflow-hidden rounded-lg border border-border bg-surface shadow-card md:grid-cols-[320px_1fr]">
        {/* Bandeja */}
        <div className={cn('overflow-y-auto border-border md:border-r', selected && 'hidden md:block')}>
          {loadError !== null && convs.length > 0 && (
            <p role="status" className="border-b border-border bg-warning-bg px-4 py-2 text-xs text-warning">
              No se pudo actualizar la bandeja: se muestra la última que llegó. Se reintenta solo.
            </p>
          )}
          {loading ? (
            <div className="flex items-center gap-2 p-4 text-sm text-fg-muted">
              <Spinner inline /> Cargando…
            </div>
          ) : loadError !== null && convs.length === 0 ? (
            <LoadError
              className="m-3"
              title="No se pudieron cargar las consultas."
              error={loadError}
              onRetry={() => void loadConvs()}
            />
          ) : visible.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-16 text-center text-fg-muted">
              <MessageCircle className="h-8 w-8 opacity-50" />
              {inbox === 'all' ? (
                <>
                  <p className="text-sm">Sin consultas todavía.</p>
                  <p className="px-6 text-xs">Cuando un cliente escriba sobre su pedido, aparece acá.</p>
                </>
              ) : (
                <p className="text-sm">
                  {inbox === 'waiting' ? 'Nada esperando respuesta.' : 'No hay consultas abiertas.'}
                </p>
              )}
            </div>
          ) : (
            visible.map((c) => (
              <button
                key={c.id}
                onClick={() => open(c.id)}
                className={cn(
                  'flex w-full items-center gap-3 border-b border-border px-4 py-3 text-left hover:bg-bg-muted',
                  selected === c.id && 'bg-bg-muted',
                )}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium text-fg">{c.customerEmail}</span>
                    {c.status === 'CLOSED' && (
                      <span className="rounded-full bg-bg-muted px-1.5 py-px text-3xs text-fg-muted">
                        Cerrada
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-fg-muted">
                    Pedido {orderLabel({ id: c.orderId, number: c.orderNumber })} ·{' '}
                    {formatDateTime(c.lastMessageAtUtc)}
                  </p>
                </div>
                {c.unreadForStaff > 0 && (
                  <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-2xs font-bold text-primary-fg">
                    {c.unreadForStaff}
                  </span>
                )}
              </button>
            ))
          )}
          <div className="px-2 pb-3">
            <Pagination
              page={Math.min(inboxPage, inboxPages)}
              totalPages={inboxPages}
              onPage={setInboxPage}
            />
          </div>
        </div>

        {/* Hilo */}
        <div className={cn('flex flex-col', !selected && 'hidden md:flex')}>
          {!current ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 text-fg-muted">
              <MessageCircle className="h-8 w-8 opacity-40" />
              <p className="text-sm">Elegí una conversación.</p>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
                <div className="min-w-0">
                  <button
                    onClick={() => setSelected(null)}
                    className="mr-2 text-xs text-fg-muted underline md:hidden"
                  >
                    ← Volver
                  </button>
                  <span className="text-sm font-semibold text-fg">{current.customerEmail}</span>
                  {/* El pedido abre la venta (en la lista de la izquierda va como
                      texto: es parte de un botón y no puede llevar otro link adentro). */}
                  <Link
                    to={`/ventas?order=${current.orderId}`}
                    className="ml-2 text-xs font-medium text-primary hover:underline"
                  >
                    Pedido {orderLabel({ id: current.orderId, number: current.orderNumber })}
                  </Link>
                </div>
                {current.status === 'OPEN' && (
                  <button
                    onClick={close}
                    className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium text-fg hover:bg-bg-muted"
                  >
                    <Archive className="h-3.5 w-3.5" /> Cerrar
                  </button>
                )}
              </div>

              <div className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
                {thread.hasOlder && (
                  <div className="flex justify-center">
                    <button
                      type="button"
                      onClick={() => void loadOlder()}
                      disabled={loadingOlder}
                      className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-fg hover:bg-bg-muted disabled:opacity-50"
                    >
                      {loadingOlder && <Spinner inline />} Ver anteriores
                    </button>
                  </div>
                )}
                {messages.map((m) => (
                  <div key={m.id} className={cn('flex', m.isFromStaff ? 'justify-end' : 'justify-start')}>
                    <div
                      className={cn(
                        'max-w-[75%] rounded-2xl px-3.5 py-2 text-sm',
                        m.isFromStaff ? 'bg-primary text-primary-fg' : 'bg-bg-muted text-fg',
                      )}
                    >
                      {m.body && <p className="whitespace-pre-wrap break-words">{m.body}</p>}
                      {m.attachment &&
                        (m.attachment.contentType.startsWith('image/') ? (
                          <a
                            href={m.attachment.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="mt-1 block"
                          >
                            <img
                              src={m.attachment.url}
                              alt={m.attachment.name}
                              className="max-h-48 rounded-lg"
                            />
                          </a>
                        ) : (
                          <a
                            href={m.attachment.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="mt-1 flex items-center gap-1.5 text-xs underline"
                          >
                            <Paperclip className="h-3.5 w-3.5" /> {m.attachment.name}
                          </a>
                        ))}
                      <p className="mt-1 text-3xs opacity-60">
                        {m.authorName} · {formatDateTime(m.createdAtUtc)}
                      </p>
                    </div>
                  </div>
                ))}
                <div ref={bottomRef} />
              </div>

              {(attaching || attachments.notes.length > 0) && (
                <div className="space-y-2 border-t border-border px-3 pt-2.5">
                  {attaching && (
                    <UploadBar
                      name={attaching.file.name}
                      fraction={attaching.progress}
                      onCancel={() => attachments.cancel(attaching.id)}
                      doneLabel="Enviando…"
                    />
                  )}
                  <UploadNotes
                    notes={attachments.notes}
                    onDismiss={attachments.dismissNotes}
                    showFile={false}
                  />
                </div>
              )}
              <div className="border-t border-border px-3 py-2.5">
                <div className="flex items-center gap-2">
                  {attachPicker.input}
                  <button
                    onClick={attachPicker.open}
                    disabled={attachments.busy}
                    className="rounded-md p-2 text-fg-muted hover:bg-bg-muted disabled:opacity-40"
                    aria-label="Adjuntar"
                    title={`Adjuntar ${attachSpec.formats} · ${attachSpec.weight}`}
                  >
                    <Paperclip className="h-5 w-5" />
                  </button>
                  <input
                    aria-label="Respuesta al cliente"
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        send();
                      }
                    }}
                    placeholder="Respondé al cliente…"
                    className="h-10 flex-1 rounded-full border border-border-strong bg-surface px-4 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                  {aiDraft.visible && (
                    <button
                      type="button"
                      onClick={suggestReply}
                      disabled={suggesting || !aiDraft.available}
                      title={aiDraft.reason ?? 'Sugerir una respuesta con IA (después la editás)'}
                      className="rounded-full border border-border-strong p-2.5 text-fg-muted hover:text-primary disabled:opacity-40"
                      aria-label="Sugerir con IA"
                    >
                      {suggesting ? <Spinner inline /> : <Sparkles className="h-4 w-4" />}
                    </button>
                  )}
                  <button
                    onClick={send}
                    disabled={!text.trim() || sending}
                    className="rounded-full bg-primary p-2.5 text-primary-fg hover:opacity-90 disabled:opacity-40"
                    aria-label="Enviar"
                  >
                    {sending ? <Spinner inline /> : <Send className="h-4 w-4" />}
                  </button>
                </div>
                <AiDraftNotice draft={draftNotice} />
              </div>
            </>
          )}
        </div>
      </div>
      <HelpLink id="posventa" />
    </div>
  );
}
