import { useQuery } from '@tanstack/react-query';
import { useStore } from '../context/StoreContext';
import { usePermissions } from '../context/PermissionsContext';
import { ERROR_SHOWN } from '../components/LoadError';
import { api } from './api';
import { COUNTERS_POLL_MS, INBOX_PERMS, type InboxCounts } from './inbox';

/** Qué contador muestra una entrada del menú. */
export type NavBadge = 'inbox' | 'stock';

/**
 * Los números del menú lateral: conversaciones sin leer de la bandeja y
 * productos con stock bajo. Se refrescan solos cada minuto, y React Query
 * pausa el intervalo mientras la pestaña está oculta (no se pregunta nada si
 * nadie mira). Si falla, el menú queda sin número: no es para avisar con un
 * cartel de error.
 */
export function useNavCounts(): Record<NavBadge, number> {
  const { store } = useStore();
  const { can } = usePermissions();
  const canInbox = INBOX_PERMS.some(can);
  const canStock = can('inventory.read');

  const inbox = useQuery({
    queryKey: ['inbox-counts', store?.id],
    queryFn: () => api.get<InboxCounts>('/api/v1/inbox/counts'),
    enabled: !!store && canInbox,
    refetchInterval: COUNTERS_POLL_MS,
    refetchOnWindowFocus: true,
    meta: ERROR_SHOWN,
  });
  const stock = useQuery({
    queryKey: ['stock-alerts-count', store?.id],
    queryFn: () => api.get<{ count: number }>('/api/v1/stock-alerts/count'),
    enabled: !!store && canStock,
    refetchInterval: COUNTERS_POLL_MS,
    meta: ERROR_SHOWN,
  });

  return {
    inbox: canInbox ? (inbox.data?.unread ?? 0) : 0,
    stock: canStock ? (stock.data?.count ?? 0) : 0,
  };
}
