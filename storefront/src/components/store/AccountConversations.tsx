'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, ChevronRight, MessageCircle, Paperclip } from 'lucide-react';
import { formatDateTime } from '@tiendafy/types';
import { useAuth } from './auth';
import { useCart } from './cart-context';
import { usePreviewHref } from './preview';
import { SupportChat } from './SupportChat';
import { AuthModal } from './AuthModal';
import { EmptyState } from './EmptyState';
import { useHydrated } from './use-media';
import { clientJsonTenant } from '@/lib/api-client';

/** Una fila de GET /shop/support/conversations. */
export interface CustomerConversation {
  id: string;
  orderId: string;
  orderNumber: number | null;
  /** "#1042" (o el id corto si el pedido no tiene número). */
  orderLabel: string;
  unreadForCustomer: number;
  lastMessageAtUtc: string;
  lastMessage: {
    /** En un renglón; vacío si el mensaje fue solo un adjunto. */
    body: string;
    attachmentName: string | null;
    isFromStaff: boolean;
  } | null;
}

const BTN_OUTLINE =
  'inline-flex items-center gap-1.5 rounded-full border border-[rgb(var(--color-fg)/0.15)] px-3.5 py-1.5 text-xs font-medium hover:bg-[rgb(var(--color-fg)/0.05)]';

/**
 * "Mis conversaciones" en la cuenta del comprador: las consultas del chat
 * posventa, una por pedido, con lo último que se dijo y lo que falta leer.
 * Tocar una abre el mismo chat que "Consultar sobre este pedido".
 */
export function AccountConversations() {
  const session = useAuth();
  // Como en Mi cuenta: la sesión vive en el navegador, el servidor dibuja "cargando".
  const hydrated = useHydrated();
  const user = hydrated ? session.user : null;
  const ready = hydrated && session.ready;
  const href = usePreviewHref();
  const { tenantId } = useCart();
  // null = cargando; 'error' = no se pudo traer (no es lo mismo que no tener ninguna).
  const [items, setItems] = useState<CustomerConversation[] | 'error' | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [chatOrder, setChatOrder] = useState<string | null>(null);
  const [auth, setAuth] = useState(false);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    clientJsonTenant<{ items: CustomerConversation[] }>('/api/v1/shop/support/conversations', tenantId, {
      credentials: 'include',
    }).then((d) => {
      if (!cancelled) setItems(d ? (d.items ?? []) : 'error');
    });
    return () => {
      cancelled = true;
    };
  }, [user, tenantId, attempt]);

  const reload = useCallback(() => setAttempt((n) => n + 1), []);

  if (ready && !user) {
    return (
      <div className="mx-auto max-w-md py-10 text-center">
        <h1 className="text-2xl font-bold" style={{ fontFamily: 'var(--font-heading)' }}>
          Mis conversaciones
        </h1>
        <p className="mt-4 text-sm text-fg-muted">Iniciá sesión para ver tus consultas sobre tus pedidos.</p>
        <button
          type="button"
          onClick={() => setAuth(true)}
          className="mt-6 rounded-md bg-primary px-6 py-2.5 text-sm font-semibold text-primary-fg"
        >
          Iniciar sesión
        </button>
        {auth && <AuthModal initialMode="login" onClose={() => setAuth(false)} />}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl">
      <Link
        href={href('/cuenta')}
        className="inline-flex items-center gap-1.5 text-sm text-fg-muted hover:underline"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden /> Mi cuenta
      </Link>
      <h1 className="mt-3 text-2xl font-bold" style={{ fontFamily: 'var(--font-heading)' }}>
        Mis conversaciones
      </h1>
      <p className="mt-1 text-sm text-fg-muted">Tus consultas sobre cada pedido. Tocá una para seguirla.</p>

      <div className="mt-6">
        {items === null ? (
          <p role="status" className="py-10 text-center text-sm text-fg-muted">
            Cargando…
          </p>
        ) : items === 'error' ? (
          <div
            role="alert"
            className="flex flex-col items-center gap-3 rounded-2xl border border-[rgb(var(--color-fg)/0.12)] py-12 text-center"
          >
            <p className="text-sm">No pudimos cargar tus conversaciones.</p>
            <button
              type="button"
              onClick={() => {
                setItems(null);
                reload();
              }}
              className={BTN_OUTLINE}
            >
              Reintentar
            </button>
          </div>
        ) : items.length === 0 ? (
          <EmptyState
            icon={<MessageCircle className="h-8 w-8" aria-hidden />}
            title="Todavía no tenés conversaciones"
            message="Si tenés una duda sobre una compra, buscala en tus pedidos y tocá “Consultar sobre este pedido”."
            cta={{ href: href('/cuenta'), label: 'Ver mis pedidos' }}
          />
        ) : (
          <ul className="space-y-3">
            {items.map((c) => (
              <li key={c.id}>
                <ConversationRow conversation={c} onOpen={() => setChatOrder(c.orderId)} />
              </li>
            ))}
          </ul>
        )}
      </div>

      {chatOrder && (
        <SupportChat
          orderId={chatOrder}
          tenantId={tenantId}
          onClose={() => {
            setChatOrder(null);
            // Abrirla la marcó leída (y quizá se escribió algo): la lista se pone al día.
            reload();
          }}
        />
      )}
    </div>
  );
}

function ConversationRow({
  conversation: c,
  onOpen,
}: {
  conversation: CustomerConversation;
  onOpen: () => void;
}) {
  const unread = c.unreadForCustomer > 0;
  const last = c.lastMessage;
  return (
    <button
      type="button"
      onClick={onOpen}
      className={`flex w-full items-center gap-3 rounded-2xl border p-4 text-left hover:bg-[rgb(var(--color-fg)/0.04)] ${
        unread ? 'border-[rgb(var(--color-primary)/0.5)]' : 'border-[rgb(var(--color-fg)/0.12)]'
      }`}
    >
      <MessageCircle className="h-5 w-5 shrink-0 text-fg-muted" aria-hidden />
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
          <span className={unread ? 'font-bold' : 'font-semibold'}>Pedido {c.orderLabel}</span>
          {unread && (
            <span className="rounded-full bg-primary px-2 py-0.5 text-xs font-semibold text-primary-fg">
              {c.unreadForCustomer === 1 ? '1 sin leer' : `${c.unreadForCustomer} sin leer`}
            </span>
          )}
          <span className="text-xs text-fg-muted">{formatDateTime(c.lastMessageAtUtc)}</span>
        </span>
        {last && (
          <span className={`mt-1 flex min-w-0 items-center gap-1 text-sm ${unread ? '' : 'text-fg-muted'}`}>
            {!last.isFromStaff && <span className="shrink-0">Vos:</span>}
            {last.body ? (
              <span className="truncate">{last.body}</span>
            ) : last.attachmentName ? (
              <>
                <Paperclip className="h-3.5 w-3.5 shrink-0" aria-hidden />
                <span className="truncate">{last.attachmentName}</span>
              </>
            ) : null}
          </span>
        )}
      </span>
      <ChevronRight className="h-4 w-4 shrink-0 text-fg-muted" aria-hidden />
    </button>
  );
}
