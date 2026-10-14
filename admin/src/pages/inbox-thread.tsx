import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Archive,
  ArchiveRestore,
  ArrowLeft,
  ExternalLink,
  Loader2,
  Mail,
  MailOpen,
  Package,
  Paperclip,
  Scale,
  Send,
  Sparkles,
} from 'lucide-react';
import { Badge, Button, cn, Select, Textarea, useToast } from '@tiendafy/ui';
import { formatDateTime } from '@tiendafy/types';
import { api, errMsg } from '../lib/api';
import { formatMoney } from '../lib/format';
import { useAiEnabled } from '../lib/useAi';
import { useAuth } from '../context/AuthContext';
import { ERROR_SHOWN } from '../components/LoadError';
import {
  CHANNELS,
  isSubmitShortcut,
  MELI_MESSAGE_MAX,
  sendsWithEnter,
  threadPath,
  type Assignable,
  type InboxChannel,
  type InboxThread,
} from '../lib/inbox';

/** Cada cuánto se refresca el hilo abierto (pausado con la pestaña oculta). */
const THREAD_POLL_MS = 15_000;

interface ChatMessage {
  id: string;
  fromCustomer: boolean;
  author: string | null;
  body: string;
  at: string | null;
  attachment?: { name: string; contentType: string; url: string } | null;
}

/**
 * El panel derecho de la bandeja: la conversación entera de un canal, con
 * asignar, leído/no leído, archivar y responder ahí mismo. Cada canal
 * responde por su endpoint de siempre (el mismo que usa su pantalla).
 */
export function ThreadPane({
  thread,
  assignables,
  onBack,
  onChanged,
}: {
  thread: InboxThread;
  assignables: Assignable[];
  onBack: () => void;
  /** Algo cambió (respuesta, asignación, archivo): refrescar la lista y los contadores. */
  onChanged: () => void;
}) {
  const meta = CHANNELS[thread.channel];
  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex flex-wrap items-start gap-x-3 gap-y-2 border-b border-border px-4 py-3">
        <button
          type="button"
          onClick={onBack}
          className="-ml-1 inline-flex items-center gap-1 rounded-md px-1 py-1 text-sm text-fg-muted hover:text-fg md:hidden"
        >
          <ArrowLeft className="h-4 w-4" /> Volver
        </button>
        <div className="min-w-0 flex-1 basis-48">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="truncate text-base font-semibold text-fg">{thread.title}</h2>
            <ChannelChip channel={thread.channel} />
            {thread.channel === 'contacto' && thread.context.repentance && (
              <Badge variant="danger">
                <Scale className="mr-1 h-3 w-3" /> Arrepentimiento
              </Badge>
            )}
          </div>
          {thread.subtitle && <p className="truncate text-xs text-fg-muted">{thread.subtitle}</p>}
        </div>
        <ThreadActions thread={thread} assignables={assignables} onChanged={onChanged} />
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
        {thread.channel === 'contacto' && <ContactBody thread={thread} />}
        {thread.channel === 'posventa' && <SupportBody thread={thread} />}
        {thread.channel === 'ml-pregunta' && <QuestionBody thread={thread} />}
        {thread.channel === 'ml-mensaje' && <MeliMessagesBody thread={thread} />}
      </div>

      <ReplyBox thread={thread} onSent={onChanged} />
      <footer className="border-t border-border px-4 py-2 text-xs text-fg-subtle">
        También en{' '}
        <Link to={meta.screen} className="font-medium text-primary hover:underline">
          {meta.label}
        </Link>
      </footer>
    </div>
  );
}

export function ChannelChip({ channel }: { channel: InboxChannel }) {
  const tone: Record<InboxChannel, string> = {
    contacto: 'bg-info-bg text-info',
    posventa: 'bg-success-bg text-success',
    'ml-pregunta': 'bg-warning-bg text-warning',
    'ml-mensaje': 'bg-warning-bg text-warning',
  };
  return (
    <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-semibold', tone[channel])}>
      {CHANNELS[channel].short}
    </span>
  );
}

// ------------------------------------------------------------ acciones

function ThreadActions({
  thread,
  assignables,
  onChanged,
}: {
  thread: InboxThread;
  assignables: Assignable[];
  onChanged: () => void;
}) {
  const { toast } = useToast();
  const { user } = useAuth();
  const [busy, setBusy] = useState(false);

  // Solo quien puede atender ESTE canal (el backend igual lo valida).
  const candidates = assignables.filter((a) => a.channels.includes(thread.channel));
  const run = async (action: () => Promise<unknown>, done: string) => {
    setBusy(true);
    try {
      await action();
      toast(done, { variant: 'success' });
      onChanged();
    } catch (err) {
      toast(errMsg(err, 'No se pudo guardar el cambio.'), { variant: 'error' });
    } finally {
      setBusy(false);
    }
  };
  const assign = (userId: string | null) =>
    run(
      () => api.put(`${threadPath(thread)}/assignee`, { userId }),
      userId ? 'Conversación asignada' : 'Conversación liberada',
    );
  const canTakeIt = !!user && candidates.some((c) => c.userId === user.id);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="w-44">
        <Select
          aria-label="Asignada a"
          disabled={busy}
          value={thread.assignedTo?.userId ?? ''}
          onChange={(e) => void assign(e.target.value || null)}
          options={[
            { value: '', label: 'Sin asignar' },
            ...candidates.map((c) => ({ value: c.userId, label: c.name })),
            // Si quien la tiene ya no puede atender el canal, igual se ve a quién está.
            ...(thread.assignedTo && !candidates.some((c) => c.userId === thread.assignedTo!.userId)
              ? [{ value: thread.assignedTo.userId, label: thread.assignedTo.name }]
              : []),
          ]}
        />
      </div>
      {!thread.assignedTo && canTakeIt && (
        <Button size="sm" variant="secondary" disabled={busy} onClick={() => void assign(user!.id)}>
          Tomarla
        </Button>
      )}
      <Button
        size="sm"
        variant="ghost"
        disabled={busy}
        onClick={() =>
          run(
            () => api.post(`${threadPath(thread)}/${thread.unread ? 'read' : 'unread'}`, {}),
            thread.unread ? 'Marcada como leída' : 'Marcada como no leída',
          )
        }
        title={thread.unread ? 'Marcar como leída' : 'Marcar como no leída'}
      >
        {thread.unread ? <MailOpen className="h-4 w-4" /> : <Mail className="h-4 w-4" />}
        <span className="hidden lg:inline">{thread.unread ? 'Leída' : 'No leída'}</span>
      </Button>
      <Button
        size="sm"
        variant="ghost"
        disabled={busy}
        onClick={() =>
          run(
            () => api.post(`${threadPath(thread)}/${thread.archived ? 'unarchive' : 'archive'}`, {}),
            thread.archived ? 'Volvió a la bandeja' : 'Archivada: vuelve sola si el cliente escribe',
          )
        }
        title={thread.archived ? 'Volver a la bandeja' : 'Archivar'}
      >
        {thread.archived ? <ArchiveRestore className="h-4 w-4" /> : <Archive className="h-4 w-4" />}
        <span className="hidden lg:inline">{thread.archived ? 'Desarchivar' : 'Archivar'}</span>
      </Button>
    </div>
  );
}

// ------------------------------------------------------------ cuerpos

function Bubble({ message }: { message: ChatMessage }) {
  const mine = !message.fromCustomer;
  return (
    <div className={cn('flex', mine ? 'justify-end' : 'justify-start')}>
      <div
        className={cn(
          'max-w-[85%] rounded-2xl px-3.5 py-2 text-sm md:max-w-[75%]',
          mine ? 'bg-primary text-primary-fg' : 'bg-bg-muted text-fg',
        )}
      >
        {message.body && <p className="whitespace-pre-wrap break-words">{message.body}</p>}
        {message.attachment && (
          <a
            href={message.attachment.url}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-1 flex items-center gap-1.5 text-xs underline"
          >
            <Paperclip className="h-3.5 w-3.5" /> {message.attachment.name}
          </a>
        )}
        <p className="mt-1 text-[10px] opacity-60">
          {[message.author, message.at ? formatDateTime(message.at) : null].filter(Boolean).join(' · ')}
        </p>
      </div>
    </div>
  );
}

function MessageList({
  messages,
  loading,
  empty,
}: {
  messages: ChatMessage[];
  loading: boolean;
  empty: ReactNode;
}) {
  const bottom = useRef<HTMLDivElement>(null);
  useEffect(() => {
    bottom.current?.scrollIntoView?.({ block: 'end' });
  }, [messages.length]);
  if (loading)
    return (
      <p className="flex items-center gap-2 text-sm text-fg-muted">
        <Loader2 className="h-4 w-4 animate-spin" /> Cargando la conversación…
      </p>
    );
  if (messages.length === 0) return <p className="text-sm text-fg-muted">{empty}</p>;
  return (
    <div className="space-y-3">
      {messages.map((m) => (
        <Bubble key={m.id} message={m} />
      ))}
      <div ref={bottom} />
    </div>
  );
}

function ContactBody({ thread }: { thread: Extract<InboxThread, { channel: 'contacto' }> }) {
  const { data } = useQuery({
    queryKey: ['contact-replies', thread.externalId],
    queryFn: () =>
      api.get<{ items: { id: string; authorName: string; body: string; createdAtUtc: string }[] }>(
        `/api/v1/contact/messages/${thread.externalId}/replies`,
      ),
    meta: ERROR_SHOWN,
  });
  const c = thread.context;
  const messages: ChatMessage[] = [
    { id: 'original', fromCustomer: true, author: `${thread.title} <${c.email}>`, body: c.body, at: null },
    ...(data?.items ?? []).map((r) => ({
      id: r.id,
      fromCustomer: false,
      author: r.authorName,
      body: r.body,
      at: r.createdAtUtc,
    })),
  ];
  return (
    <div className="space-y-3">
      {c.repentance && (
        <div className="rounded-lg border border-danger/40 bg-danger-bg px-3 py-2 text-sm text-danger">
          Solicitud del Botón de Arrepentimiento{c.reference ? ` (constancia ${c.reference})` : ''}.
          {c.orderRef ? ` Pedido informado: “${c.orderRef}”.` : ' Sin número de pedido: buscala por email.'}{' '}
          <Link to="/mensajes?filtro=repentance" className="font-medium underline">
            Ver en Mensajes
          </Link>
        </div>
      )}
      <MessageList messages={messages} loading={false} empty="" />
    </div>
  );
}

function SupportBody({ thread }: { thread: Extract<InboxThread, { channel: 'posventa' }> }) {
  const { data, isLoading } = useQuery({
    queryKey: ['inbox-support-messages', thread.externalId],
    queryFn: () =>
      api.get<{
        items: {
          id: string;
          isFromStaff: boolean;
          authorName: string;
          body: string;
          attachment: ChatMessage['attachment'];
          createdAtUtc: string;
        }[];
      }>(`/api/v1/support/conversations/${thread.externalId}/messages`),
    refetchInterval: THREAD_POLL_MS,
    meta: ERROR_SHOWN,
  });
  const messages = (data?.items ?? []).map((m) => ({
    id: m.id,
    fromCustomer: !m.isFromStaff,
    author: m.authorName,
    body: m.body,
    at: m.createdAtUtc,
    attachment: m.attachment,
  }));
  return (
    <div className="space-y-3">
      <p className="text-xs text-fg-muted">
        Sobre el pedido{' '}
        <Link
          to={`/ventas?order=${thread.context.orderId}`}
          className="font-medium text-primary hover:underline"
        >
          {thread.context.orderNumber}
        </Link>
        {thread.context.status === 'CLOSED' && ' · conversación cerrada (se reabre si el cliente escribe)'}
      </p>
      <MessageList messages={messages} loading={isLoading} empty="Todavía no hay mensajes." />
    </div>
  );
}

function ListingCard({
  listing,
}: {
  listing: NonNullable<Extract<InboxThread, { channel: 'ml-pregunta' }>['context']['listing']>;
}) {
  return (
    <div className="flex gap-3 rounded-lg border border-border bg-bg-subtle p-3">
      {listing.thumbnail ? (
        <img
          src={listing.thumbnail}
          alt=""
          className="h-16 w-16 shrink-0 rounded-md border border-border object-cover"
        />
      ) : (
        <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-md border border-border text-fg-subtle">
          <Package className="h-6 w-6" />
        </span>
      )}
      <div className="min-w-0 flex-1 text-sm">
        <p className="line-clamp-2 font-medium text-fg">{listing.title ?? listing.id}</p>
        <p className="mt-0.5 text-fg-muted">
          {listing.price != null && (
            <span className="font-semibold text-fg">{formatMoney(listing.price * 100)}</span>
          )}
          {listing.availableQuantity != null && (
            <span className={cn('ml-2', listing.availableQuantity === 0 && 'font-medium text-danger')}>
              {listing.availableQuantity === 0 ? 'Sin stock' : `${listing.availableQuantity} disponibles`}
            </span>
          )}
        </p>
        {listing.permalink && (
          <a
            href={listing.permalink}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
          >
            Ver publicación <ExternalLink className="h-3 w-3" />
          </a>
        )}
      </div>
    </div>
  );
}

function QuestionBody({ thread }: { thread: Extract<InboxThread, { channel: 'ml-pregunta' }> }) {
  const c = thread.context;
  const messages: ChatMessage[] = [
    { id: 'q', fromCustomer: true, author: 'Pregunta', body: c.text, at: c.dateCreated },
    ...(c.answer
      ? [
          {
            id: 'a',
            fromCustomer: false,
            author: 'Tu respuesta',
            body: c.answer.text,
            at: c.answer.dateCreated,
          },
        ]
      : []),
  ];
  return (
    <div className="space-y-3">
      {c.listing ? (
        <ListingCard listing={c.listing} />
      ) : (
        <p className="text-xs text-fg-muted">No se pudo leer la publicación de esta pregunta.</p>
      )}
      <MessageList messages={messages} loading={false} empty="" />
    </div>
  );
}

function MeliMessagesBody({ thread }: { thread: Extract<InboxThread, { channel: 'ml-mensaje' }> }) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['inbox-meli-messages', thread.externalId],
    queryFn: () =>
      api.get<{ messages: { text: string | null; dateCreated: string | null; fromSeller: boolean }[] }>(
        `/api/v1/admin/meli/packs/${thread.externalId}/messages`,
      ),
    refetchInterval: THREAD_POLL_MS,
    meta: ERROR_SHOWN,
  });
  const messages = (data?.messages ?? []).map((m, i) => ({
    id: String(i),
    fromCustomer: !m.fromSeller,
    author: m.fromSeller ? 'Vos' : (thread.context.buyerNickname ?? 'Comprador'),
    body: m.text ?? '',
    at: m.dateCreated,
  }));
  return (
    <div className="space-y-3">
      {thread.context.total != null && (
        <p className="text-xs text-fg-muted">
          Venta {thread.context.meliOrderId} ·{' '}
          {formatMoney(thread.context.total * 100, thread.context.currency ?? 'ARS')}
        </p>
      )}
      {isError ? (
        <p className="text-sm text-danger">No se pudo leer el chat en Mercado Libre. Se reintenta solo.</p>
      ) : (
        <MessageList messages={messages} loading={isLoading} empty="Todavía no hay mensajes en esta venta." />
      )}
    </div>
  );
}

// ------------------------------------------------------------ responder

/** El texto que se manda, por canal, y lo que dice el botón. */
function replySpec(thread: InboxThread): {
  label: string;
  placeholder: string;
  hint: string;
  max?: number;
  send: (text: string) => Promise<unknown>;
} {
  switch (thread.channel) {
    case 'posventa':
      return {
        label: 'Enviar',
        placeholder: 'Respondé al cliente…',
        hint: 'Enter envía · Shift+Enter, salto de línea',
        send: (text) =>
          api.post(`/api/v1/support/conversations/${thread.externalId}/messages`, { body: text }),
      };
    case 'contacto':
      return {
        label: 'Responder por email',
        placeholder: `Tu respuesta a ${thread.context.email}…`,
        hint: 'Le llega por email · Ctrl+Enter para enviar',
        max: 4000,
        send: (text) => api.post(`/api/v1/contact/messages/${thread.externalId}/reply`, { body: text }),
      };
    case 'ml-pregunta':
      return {
        label: 'Publicar respuesta',
        placeholder: 'Escribí tu respuesta…',
        hint: 'La respuesta es pública y no se puede editar · Ctrl+Enter para publicar',
        max: 2000,
        send: (text) =>
          api.post(`/api/v1/admin/meli/questions/${thread.context.questionId}/answer`, { text }),
      };
    case 'ml-mensaje':
      return {
        label: 'Enviar',
        placeholder: 'Escribile al comprador…',
        hint: 'Ctrl+Enter para enviar',
        max: MELI_MESSAGE_MAX,
        send: (text) => api.post(`/api/v1/admin/meli/packs/${thread.externalId}/messages`, { text }),
      };
  }
}

function ReplyBox({ thread, onSent }: { thread: InboxThread; onSent: () => void }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const aiEnabled = useAiEnabled();
  // Un borrador por conversación: cambiar de hilo no arrastra lo escrito.
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [sending, setSending] = useState(false);
  const [suggesting, setSuggesting] = useState(false);
  const text = drafts[thread.key] ?? '';
  const setText = (value: string) => setDrafts((d) => ({ ...d, [thread.key]: value }));

  // Una pregunta ya contestada no se vuelve a contestar (ML no lo permite).
  if (thread.channel === 'ml-pregunta' && thread.context.answer) return null;

  const spec = replySpec(thread);
  const tooLong = spec.max !== undefined && text.length > spec.max;
  const canSend = text.trim().length > 0 && !tooLong && !sending;

  const send = async () => {
    if (!canSend) return;
    setSending(true);
    try {
      await spec.send(text.trim());
      setText('');
      // Respondido es leído; para ML además le avisa al servidor que pregunte de nuevo.
      await api.post(`${threadPath(thread)}/read`, {}).catch(() => undefined);
      toast(thread.channel === 'ml-pregunta' ? 'Respuesta publicada en Mercado Libre' : 'Enviado', {
        variant: 'success',
      });
      await queryClient.invalidateQueries({
        predicate: (q) =>
          ['inbox-support-messages', 'inbox-meli-messages', 'contact-replies'].includes(
            String(q.queryKey[0]),
          ),
      });
      onSent();
    } catch (err) {
      toast(errMsg(err, 'No se pudo enviar.'), { variant: 'error' });
    } finally {
      setSending(false);
    }
  };

  const suggest = async () => {
    setSuggesting(true);
    try {
      const r =
        thread.channel === 'ml-pregunta'
          ? await api.post<{ text: string }>('/api/v1/ai/ml-answer', {
              question: thread.context.text,
              itemTitle: thread.context.listing?.title ?? thread.title,
            })
          : await api.post<{ text: string }>('/api/v1/ai/support-reply', {
              message: thread.preview,
              orderSummary: thread.channel === 'posventa' ? `Pedido ${thread.context.orderNumber}` : null,
            });
      setText(r.text);
    } catch (err) {
      toast(errMsg(err, 'La IA no pudo sugerir una respuesta.'), { variant: 'error' });
    } finally {
      setSuggesting(false);
    }
  };

  return (
    <div className="border-t border-border px-3 py-2.5">
      <Textarea
        aria-label="Respuesta"
        rows={sendsWithEnter(thread.channel) ? 2 : 3}
        value={text}
        placeholder={spec.placeholder}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (isSubmitShortcut(e, thread.channel)) {
            e.preventDefault();
            void send();
          }
        }}
        error={tooLong}
      />
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <span className={cn('min-w-0 flex-1 text-xs', tooLong ? 'text-danger' : 'text-fg-subtle')}>
          {spec.hint}
          {spec.max !== undefined && ` · ${text.length}/${spec.max}`}
        </span>
        {aiEnabled && (thread.channel === 'ml-pregunta' || thread.channel === 'posventa') && (
          <Button
            size="sm"
            variant="secondary"
            onClick={suggest}
            disabled={suggesting}
            title="Sugerir una respuesta con IA (después la editás)"
            aria-label="Sugerir con IA"
          >
            {suggesting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          </Button>
        )}
        <Button size="sm" onClick={() => void send()} disabled={!canSend}>
          {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          {spec.label}
        </Button>
      </div>
    </div>
  );
}
