import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Archive, Loader2, MessageCircle, Paperclip, RefreshCw, Send, Sparkles } from 'lucide-react';
import { cn, useToast } from '@tiendafy/ui';
import { api, errMsg } from '../lib/api';
import { useAiEnabled } from '../lib/useAi';
import { useStore } from '../context/StoreContext';
import { HelpLink } from '../components/HelpLink';
import { ListStats } from '../components/stats/ListStats';
import { formatDateTime } from '@tiendafy/types';
import { formatNumber } from '../lib/format';
import { UPLOADS, describe } from '../lib/uploads';
import { UploadBar, UploadNotes, useFilePicker, useUploadQueue } from '../components/upload/primitives';

interface Conversation {
  id: string;
  orderId: string;
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

/** Bandeja de chat posventa: conversaciones por orden con los compradores. */
export function SupportChatPage() {
  const { store } = useStore();
  const { toast } = useToast();
  const [convs, setConvs] = useState<Conversation[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  // La conversación abierta, para descartar respuestas que llegan tarde.
  const selectedRef = useRef(selected);
  useLayoutEffect(() => {
    selectedRef.current = selected;
  });
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const aiEnabled = useAiEnabled();
  const [suggesting, setSuggesting] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const fetchConvs = useCallback(
    () =>
      api
        .get<{ items: Conversation[] }>('/api/v1/support/conversations')
        .then((d) => d.items ?? [])
        .catch(() => [] as Conversation[]),
    [],
  );
  const showConvs = useCallback((items: Conversation[]) => {
    setConvs(items);
    setLoading(false);
  }, []);
  const loadConvs = useCallback(async () => showConvs(await fetchConvs()), [fetchConvs, showConvs]);

  const loadMessages = useCallback(async (id: string) => {
    // La respuesta tardía de otra conversación no puede pisar la abierta
    // (el polling de 8 s dispara requests que resuelven fuera de orden).
    try {
      const d = await api.get<{ items: Message[] }>(`/api/v1/support/conversations/${id}/messages`);
      if (selectedRef.current !== id) return;
      setMessages(d.items ?? []);
      // Leído al abrir: refrescar contadores de la bandeja.
      setConvs((cs) => cs.map((c) => (c.id === id ? { ...c, unreadForStaff: 0 } : c)));
    } catch {
      /* la próxima pasada de polling reintenta */
    }
  }, []);

  useEffect(() => {
    if (!store) return;
    let current = true;
    fetchConvs().then((items) => current && showConvs(items));
    return () => {
      current = false;
    };
  }, [store, fetchConvs, showConvs]);

  // Polling: bandeja siempre; hilo abierto también.
  useEffect(() => {
    if (!store) return;
    const t = setInterval(() => {
      loadConvs();
      if (selected) loadMessages(selected);
    }, POLL_MS);
    return () => clearInterval(t);
  }, [store, selected, loadConvs, loadMessages]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  const open = (id: string) => {
    setSelected(id);
    setMessages([]);
    loadMessages(id);
  };

  // La IA redacta con el contexto del pedido; el operador edita y manda.
  const suggestReply = async () => {
    const lastFromCustomer = [...messages].reverse().find((m) => !m.isFromStaff);
    if (!lastFromCustomer) return;
    setSuggesting(true);
    try {
      const r = await api.post<{ text: string }>('/api/v1/ai/support-reply', {
        message: lastFromCustomer.body,
        orderSummary: selected ? `Pedido #${selected.slice(0, 8)}` : null,
      });
      setText(r.text);
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

  // La bandeja llega entera, así que las métricas salen de lo que ya está en
  // memoria: sin pedirle nada más al servidor.
  const waiting = convs.filter((c) => c.unreadForStaff > 0).length;
  const openCount = convs.filter((c) => c.status === 'OPEN').length;

  // La bandeja llega entera, así que el recorte también se hace acá.
  const [inbox, setInbox] = useState<'all' | 'waiting' | 'open'>('all');
  const toggleInbox = (next: 'waiting' | 'open') => setInbox((current) => (current === next ? 'all' : next));

  const visible = convs.filter((c) => {
    if (inbox === 'waiting') return c.unreadForStaff > 0;
    if (inbox === 'open') return c.status === 'OPEN';
    return true;
  });

  return (
    <div>
      <div className="mb-5 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-fg">Chat posventa</h1>
        <button
          onClick={loadConvs}
          className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm font-medium text-fg hover:bg-bg-muted"
        >
          <RefreshCw className="h-4 w-4" /> Actualizar
        </button>
      </div>

      {convs.length > 0 && (
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
                value: formatNumber(convs.length),
                onClick: inbox === 'all' ? undefined : () => setInbox('all'),
              },
            ]}
          />
        </div>
      )}

      <div className="grid h-[calc(100vh-180px)] min-h-[420px] grid-cols-1 overflow-hidden rounded-lg border border-border bg-surface shadow-card md:grid-cols-[320px_1fr]">
        {/* Bandeja */}
        <div className={cn('overflow-y-auto border-border md:border-r', selected && 'hidden md:block')}>
          {loading ? (
            <div className="flex items-center gap-2 p-4 text-sm text-fg-muted">
              <Loader2 className="h-4 w-4 animate-spin" /> Cargando…
            </div>
          ) : visible.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-16 text-center text-fg-muted">
              <MessageCircle className="h-8 w-8 opacity-50" />
              <p className="text-sm">Sin consultas todavía.</p>
              <p className="px-6 text-xs">Cuando un cliente escriba sobre su pedido, aparece acá.</p>
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
                      <span className="rounded-full bg-bg-muted px-1.5 py-px text-[10px] text-fg-muted">
                        Cerrada
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-fg-muted">
                    Pedido #{c.orderId.slice(0, 8)} · {formatDateTime(c.lastMessageAtUtc)}
                  </p>
                </div>
                {c.unreadForStaff > 0 && (
                  <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[11px] font-bold text-primary-fg">
                    {c.unreadForStaff}
                  </span>
                )}
              </button>
            ))
          )}
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
                  <span className="ml-2 text-xs text-fg-muted">Pedido #{current.orderId.slice(0, 8)}</span>
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
                      <p className="mt-1 text-[10px] opacity-60">
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
              <div className="flex items-center gap-2 border-t border-border px-3 py-2.5">
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
                {aiEnabled && (
                  <button
                    type="button"
                    onClick={suggestReply}
                    disabled={suggesting}
                    title="Sugerir una respuesta con IA (después la editás)"
                    className="rounded-full border border-border-strong p-2.5 text-fg-muted hover:text-primary disabled:opacity-40"
                    aria-label="Sugerir con IA"
                  >
                    {suggesting ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Sparkles className="h-4 w-4" />
                    )}
                  </button>
                )}
                <button
                  onClick={send}
                  disabled={!text.trim() || sending}
                  className="rounded-full bg-primary p-2.5 text-primary-fg hover:opacity-90 disabled:opacity-40"
                  aria-label="Enviar"
                >
                  {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
      <HelpLink id="posventa" />
    </div>
  );
}
