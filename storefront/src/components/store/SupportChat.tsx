'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, MessageCircle, Paperclip, Send, X } from 'lucide-react';

import { API_URL, clientJson, tenantHeaders } from '@/lib/api-client';
import { formatDateTime } from '@tiendafy/types';

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
interface Conversation {
  id: string;
  status: string;
  unreadForCustomer: number;
}

const POLL_MS = 6000;
const MAX_FILE = 10 * 1024 * 1024;
const ALLOWED = ['application/pdf', 'image/jpeg', 'image/png'];

/**
 * Chat posventa de una orden. Abre (o retoma) la conversación al montar y
 * refresca por polling corto mientras está visible.
 */
export function SupportChat({
  orderId,
  tenantId,
  onClose,
}: {
  orderId: string;
  tenantId: string;
  onClose: () => void;
}) {
  const [conv, setConv] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const headers = useMemo(() => tenantHeaders(tenantId), [tenantId]);

  const loadMessages = useCallback(
    async (convId: string) => {
      const d = await clientJson<{ conversation: Conversation; items: Message[] }>(
        `/api/v1/shop/support/conversations/${convId}/messages`,
        { headers, credentials: 'include' },
      );
      if (d) {
        setConv(d.conversation);
        setMessages(d.items);
      }
    },
    [headers],
  );

  // Abrir conversación + polling.
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | null = null;

    (async () => {
      const c = await clientJson<Conversation>(`/api/v1/shop/support/conversations`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ orderId }),
      });
      if (cancelled) return;
      if (!c) {
        setError('No pudimos abrir el chat. Probá de nuevo.');
        return;
      }
      setConv(c);
      await loadMessages(c.id);
      timer = setInterval(() => loadMessages(c.id), POLL_MS);
    })();

    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
    };
  }, [orderId, loadMessages]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  const send = async () => {
    if (!conv || !text.trim() || sending) return;
    setSending(true);
    const r = await clientJson<{ id: string }>(`/api/v1/shop/support/conversations/${conv.id}/messages`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ body: text }),
    });
    if (r) {
      setText('');
      await loadMessages(conv.id);
    } else setError('No se pudo enviar el mensaje.');
    setSending(false);
  };

  const sendFile = async (file: File) => {
    if (!conv || sending) return;
    if (!ALLOWED.includes(file.type)) {
      setError('Solo PDF, JPG o PNG.');
      return;
    }
    if (file.size > MAX_FILE) {
      setError('El archivo supera los 10 MB.');
      return;
    }
    setSending(true);
    setError(null);
    const form = new FormData();
    form.append('file', file);
    if (text.trim()) form.append('body', text.trim());
    try {
      const res = await fetch(`${API_URL}/api/v1/shop/support/conversations/${conv.id}/attachments`, {
        method: 'POST',
        headers,
        credentials: 'include',
        body: form,
      });
      if (res.ok) {
        setText('');
        await loadMessages(conv.id);
      } else setError('No se pudo adjuntar el archivo.');
    } catch {
      setError('No se pudo adjuntar el archivo.');
    } finally {
      setSending(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        className="flex h-[85vh] w-full flex-col overflow-hidden rounded-t-2xl bg-bg text-fg shadow-xl sm:h-[600px] sm:max-w-lg sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-fg/10 px-4 py-3">
          <div className="flex items-center gap-2">
            <MessageCircle className="h-5 w-5" />
            <span className="font-semibold">Consulta sobre tu pedido</span>
          </div>
          <button onClick={onClose} aria-label="Cerrar chat" className="rounded-md p-1 hover:bg-fg/5">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
          {!conv && !error && <p className="py-8 text-center text-sm text-fg-muted">Abriendo chat…</p>}
          {messages.length === 0 && conv && (
            <p className="py-8 text-center text-sm text-fg-muted">
              Contanos en qué te podemos ayudar con este pedido. Podés adjuntar fotos (JPG/PNG) o PDF.
            </p>
          )}
          {messages.map((m) => (
            <div key={m.id} className={`flex ${m.isFromStaff ? 'justify-start' : 'justify-end'}`}>
              <div
                className={`max-w-[80%] rounded-2xl px-3.5 py-2 text-sm ${m.isFromStaff ? 'bg-fg/[0.06]' : 'bg-fg text-bg'}`}
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
                      {}
                      <img src={m.attachment.url} alt={m.attachment.name} className="max-h-48 rounded-lg" />
                    </a>
                  ) : (
                    <a
                      href={m.attachment.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={`mt-1 flex items-center gap-1.5 text-xs underline ${m.isFromStaff ? '' : 'text-bg'}`}
                    >
                      <Paperclip className="h-3.5 w-3.5" /> {m.attachment.name}
                    </a>
                  ))}
                <p className={`mt-1 text-[10px] ${m.isFromStaff ? 'opacity-50' : 'opacity-60'}`}>
                  {formatDateTime(m.createdAtUtc)}
                </p>
              </div>
            </div>
          ))}
          <div ref={bottomRef} />
        </div>

        {error && <p className="px-4 pb-1 text-xs text-danger">{error}</p>}

        <div className="flex items-center gap-2 border-t border-fg/10 px-3 py-2.5">
          <input
            ref={fileRef}
            type="file"
            accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) sendFile(f);
            }}
          />
          <button
            onClick={() => fileRef.current?.click()}
            disabled={!conv || sending}
            aria-label="Adjuntar archivo"
            className="rounded-md p-2 hover:bg-fg/5 disabled:opacity-40"
          >
            <Paperclip className="h-5 w-5" />
          </button>
          <input
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              setError(null);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            placeholder="Escribí tu mensaje…"
            className="h-10 flex-1 rounded-full border border-fg/20 bg-fg/[0.03] px-4 text-sm text-fg placeholder:text-fg-muted focus:outline-none focus:ring-2 focus:ring-fg/30"
          />
          <button
            onClick={send}
            disabled={!conv || !text.trim() || sending}
            aria-label="Enviar"
            className="rounded-full bg-fg p-2.5 text-bg hover:opacity-90 disabled:opacity-40"
          >
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </button>
        </div>
      </div>
    </div>
  );
}
