/**
 * La bandeja unificada: contacto, chat posventa y Mercado Libre en una sola
 * lista (GET /api/v1/inbox). Acá viven los tipos que manda el backend y lo
 * que sabe el panel de cada canal: su nombre, el permiso que pide y cómo se
 * responde.
 */
import type { Perm } from './access';

export type InboxChannel = 'contacto' | 'posventa' | 'ml-pregunta' | 'ml-mensaje';

export interface InboxAssignee {
  userId: string;
  name: string;
}

interface ThreadBase {
  key: string;
  externalId: string;
  title: string;
  subtitle: string | null;
  preview: string;
  lastActivityAtUtc: string;
  unread: boolean;
  unreadCount: number;
  archived: boolean;
  /** El último mensaje es del cliente: falta contestar. */
  awaitingReply: boolean;
  assignedTo: InboxAssignee | null;
}

export interface MeliListing {
  id: string;
  title: string | null;
  thumbnail: string | null;
  price: number | null;
  availableQuantity: number | null;
  permalink: string | null;
}

export type InboxThread =
  | (ThreadBase & {
      channel: 'contacto';
      context: {
        email: string;
        body: string;
        kind: 'contact' | 'repentance';
        repentance: boolean;
        reference: string | null;
        orderRef: string | null;
        replies: number;
      };
    })
  | (ThreadBase & {
      channel: 'posventa';
      context: { conversationId: string; orderId: string; orderNumber: string; status: 'OPEN' | 'CLOSED' };
    })
  | (ThreadBase & {
      channel: 'ml-pregunta';
      context: {
        questionId: number;
        text: string;
        status: string;
        dateCreated: string;
        answer: { text: string; dateCreated: string | null } | null;
        listing: MeliListing | null;
        demo: boolean;
      };
    })
  | (ThreadBase & {
      channel: 'ml-mensaje';
      context: {
        packId: number;
        meliOrderId: number | null;
        buyerNickname: string | null;
        total: number | null;
        currency: string | null;
        demo: boolean;
      };
    });

export interface InboxCounts {
  unread: number;
  mine: number;
  mineUnread: number;
  byChannel: Partial<Record<InboxChannel, number>>;
}

export interface InboxPage {
  items: InboxThread[];
  total: number;
  counts: InboxCounts;
  channels: InboxChannel[];
  warnings: string[];
}

export interface Assignable {
  userId: string;
  name: string;
  email: string | null;
  channels: InboxChannel[];
}

export const CHANNELS: Record<
  InboxChannel,
  { label: string; short: string; perm: Perm; /** La pantalla de siempre del canal. */ screen: string }
> = {
  contacto: { label: 'Mensajes de contacto', short: 'Contacto', perm: 'messages.read', screen: '/mensajes' },
  posventa: { label: 'Chat posventa', short: 'Posventa', perm: 'support.chat', screen: '/posventa' },
  'ml-pregunta': {
    label: 'Preguntas de Mercado Libre',
    short: 'Pregunta ML',
    perm: 'meli.operate',
    screen: '/mercadolibre?tab=preguntas',
  },
  'ml-mensaje': {
    label: 'Mensajes de Mercado Libre',
    short: 'Mensaje ML',
    perm: 'meli.operate',
    screen: '/mercadolibre?tab=ventas',
  },
};

export const CHANNEL_ORDER: InboxChannel[] = ['contacto', 'posventa', 'ml-pregunta', 'ml-mensaje'];

/** Quien atiende algún canal ve la bandeja. */
export const INBOX_PERMS: readonly Perm[] = ['messages.read', 'support.chat', 'meli.operate'];

/** Mercado Libre corta los mensajes de posventa en 350 caracteres. */
export const MELI_MESSAGE_MAX = 350;

/** Cada cuánto se refresca la bandeja abierta (pausado con la pestaña oculta). */
export const INBOX_POLL_MS = 30_000;

/** Cada cuánto se refrescan los contadores del menú. */
export const COUNTERS_POLL_MS = 60_000;

/** El tramo de la URL de una conversación: `?conversacion=posventa:<id>`. */
export const threadPath = (t: Pick<InboxThread, 'channel' | 'externalId'>) =>
  `/api/v1/inbox/threads/${t.channel}/${encodeURIComponent(t.externalId)}`;

/** Iniciales para el chip de "asignada a". */
export function initials(name: string): string {
  const parts = name
    .replace(/@.*/, '')
    .split(/[\s._-]+/)
    .filter(Boolean);
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || '?';
}

/**
 * Las respuestas que no se pueden deshacer (la pregunta de ML es pública y
 * no se edita; el email ya salió) no se mandan con Enter solo: Enter es un
 * salto de línea, y se publica con el botón o con Ctrl+Enter (⌘+Enter en
 * Mac). Solo el chat posventa, que es privado y conversacional, manda con Enter.
 */
export function sendsWithEnter(channel: InboxChannel): boolean {
  return channel === 'posventa';
}

export function isSubmitShortcut(
  e: { key: string; ctrlKey: boolean; metaKey: boolean; shiftKey: boolean },
  channel: InboxChannel,
): boolean {
  if (e.key !== 'Enter') return false;
  if (e.ctrlKey || e.metaKey) return true;
  return sendsWithEnter(channel) && !e.shiftKey;
}
