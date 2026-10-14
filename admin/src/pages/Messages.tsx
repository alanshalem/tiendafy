import { useState } from 'react';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { ExternalLink, Mail, MailOpen, Scale } from 'lucide-react';
import { Badge, cn, Input, useToast } from '@tiendafy/ui';
import { useStore } from '../context/StoreContext';
import { api, errMsg } from '../lib/api';
import { NoStoreSelected } from '../components/NoStoreSelected';
import { HelpLink } from '../components/HelpLink';
import { Pagination, pageRangeLabel } from '../components/Pagination';
import { formatDateTime } from '@tiendafy/types';
import { TableSkeleton } from '../components/Skeleton';
import { useListParams } from '../lib/useListParams';

interface ContactMessage {
  id: string;
  name: string;
  email: string;
  body: string;
  kind: 'contact' | 'repentance';
  reference: string | null;
  orderRef: string | null;
  /** Venta resuelta por el backend (solo si orderRef es un pedido real de la tienda). */
  orderId: string | null;
  read: boolean;
  createdAtUtc: string;
}
/** Mensajes por página. */
const PAGE_SIZE = 25;

interface MessagesResponse {
  items: ContactMessage[];
  total: number;
  unread: number;
}

const FILTERS = [
  { id: 'todos', label: 'Todos' },
  { id: 'repentance', label: 'Arrepentimientos' },
] as const;

/**
 * Pestaña y página, en la URL (ver useListParams). La búsqueda no: filtra
 * los mensajes de la página que se está viendo, al instante.
 */
const LIST_DEFAULTS = { filtro: 'todos', pagina: 1 };

export function MessagesPage() {
  const { store } = useStore();
  const qc = useQueryClient();
  const { toast } = useToast();
  const list = useListParams(LIST_DEFAULTS);
  const filter = list.values.filtro === 'repentance' ? 'repentance' : 'todos';
  const page = list.values.pagina;
  const [search, setSearch] = useState('');
  const { data, isLoading } = useQuery({
    queryKey: ['contact-messages', store?.id, page],
    queryFn: () =>
      api.get<MessagesResponse>(
        `/api/v1/contact/messages?limit=${PAGE_SIZE}&offset=${(page - 1) * PAGE_SIZE}`,
      ),
    enabled: !!store,
    placeholderData: keepPreviousData,
  });
  const totalPages = Math.max(1, Math.ceil((data?.total ?? 0) / PAGE_SIZE));

  const markRead = async (id: string) => {
    try {
      await api.post(`/api/v1/contact/messages/${id}/read`, {});
      qc.invalidateQueries({ queryKey: ['contact-messages', store?.id] });
    } catch (e) {
      // Antes la promesa rechazada quedaba sin atajar y el botón no decía nada.
      toast(errMsg(e, 'No se pudo marcar como leído.'), { variant: 'error' });
    }
  };

  if (!store) return <NoStoreSelected />;

  const all = data?.items ?? [];
  const repentanceCount = all.filter((m) => m.kind === 'repentance').length;
  const base = filter === 'repentance' ? all.filter((m) => m.kind === 'repentance') : all;
  const q = search.trim().toLowerCase();
  const items =
    q === ''
      ? base
      : base.filter(
          (m) =>
            m.email.toLowerCase().includes(q) ||
            m.name.toLowerCase().includes(q) ||
            m.body.toLowerCase().includes(q),
        );

  return (
    <div>
      <div className="mb-5 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-fg">Mensajes de contacto</h1>
          <p className="mt-1 text-sm text-fg-muted">
            Lo que te escriben desde tu tienda — incluye las solicitudes del Botón de Arrepentimiento.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {(data?.total ?? 0) > 0 && (
            <span className="text-xs text-fg-subtle">
              {pageRangeLabel(page, PAGE_SIZE, data!.total, data!.total === 1 ? 'mensaje' : 'mensajes')}
            </span>
          )}
          {(data?.unread ?? 0) > 0 && <Badge variant="info">{data!.unread} sin leer</Badge>}
          {/* La bandeja junta esto con el chat posventa y Mercado Libre, y deja contestar por email. */}
          <Link to="/bandeja?canal=contacto" className="text-sm font-medium text-primary hover:underline">
            Responder desde la Bandeja
          </Link>
        </div>
      </div>

      <div className="mb-4 flex gap-1 border-b border-border text-sm">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            // La pestaña filtra la página que se ve: no la cambia.
            onClick={() => list.set({ filtro: f.id, pagina: page })}
            className={cn(
              '-mb-px border-b-2 px-4 pb-2.5 font-medium',
              filter === f.id
                ? 'border-primary text-primary'
                : 'border-transparent text-fg-muted hover:text-fg',
            )}
          >
            {f.label}
            {f.id === 'repentance' && repentanceCount > 0 && (
              <span className="ml-1.5 rounded-full bg-danger-bg px-1.5 py-0.5 text-[11px] font-semibold text-danger">
                {repentanceCount}
              </span>
            )}
          </button>
        ))}
      </div>

      <Input
        type="search"
        aria-label="Buscar mensajes"
        placeholder="Buscar por nombre, email o texto del mensaje…"
        className="mb-3"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      {isLoading ? (
        <div className="rounded-lg border border-border bg-surface">
          <TableSkeleton label="Cargando mensajes…" />
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-border py-16 text-center text-fg-muted">
          <Mail className="h-8 w-8 opacity-50" />
          <p>
            {filter === 'repentance'
              ? 'Sin solicitudes de arrepentimiento. 🎉'
              : 'Todavía no recibiste mensajes.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((m) => {
            const repentance = m.kind === 'repentance';
            return (
              <div
                key={m.id}
                className={cn(
                  'rounded-2xl border bg-surface p-5 shadow-card transition',
                  m.read ? 'border-border' : repentance ? 'border-danger/50' : 'border-primary/40',
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      {!m.read && (
                        <span
                          className={cn(
                            'h-2 w-2 shrink-0 rounded-full',
                            repentance ? 'bg-danger' : 'bg-primary',
                          )}
                        />
                      )}
                      <span className="truncate font-semibold text-fg">{m.name}</span>
                      {repentance && (
                        <Badge variant="danger">
                          <Scale className="mr-1 h-3 w-3" /> Arrepentimiento
                        </Badge>
                      )}
                      {m.reference && <Badge variant="neutral">{m.reference}</Badge>}
                    </div>
                    <a href={`mailto:${m.email}`} className="text-sm text-primary hover:underline">
                      {m.email}
                    </a>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <span className="text-xs text-fg-subtle">{formatDateTime(m.createdAtUtc)}</span>
                    {!m.read && (
                      <button
                        onClick={() => markRead(m.id)}
                        title="Marcar leído"
                        className="inline-flex items-center gap-1 text-xs font-medium text-fg-muted hover:text-fg"
                      >
                        <MailOpen className="h-4 w-4" /> Leído
                      </button>
                    )}
                  </div>
                </div>
                <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-fg-muted">{m.body}</p>
                {repentance && (
                  <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-border pt-3 text-sm">
                    {m.orderId ? (
                      <Link
                        to={`/ventas?order=${m.orderId}`}
                        className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
                      >
                        <ExternalLink className="h-4 w-4" /> Ver venta (reembolsar desde ahí)
                      </Link>
                    ) : m.orderRef ? (
                      <span className="text-fg-subtle">
                        Pedido informado: “{m.orderRef}” — no coincide con ninguna venta de la tienda.
                      </span>
                    ) : (
                      <span className="text-fg-subtle">
                        Sin número de pedido:{' '}
                        <Link
                          to={`/ventas?q=${encodeURIComponent(m.email)}`}
                          className="font-medium text-primary hover:underline"
                        >
                          ver las compras de {m.email}
                        </Link>
                        .
                      </span>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
      <Pagination
        page={Math.min(page, totalPages)}
        totalPages={totalPages}
        onPage={(p) => list.set({ filtro: filter, pagina: p })}
      />

      {/* Acá caen también las solicitudes del Botón de Arrepentimiento → guía legal. */}
      <HelpLink id="legal" />
    </div>
  );
}
