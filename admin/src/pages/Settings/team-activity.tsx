import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { History } from 'lucide-react';
import { api, errMsg } from '../../lib/api';
import { useStore } from '../../context/StoreContext';
import { formatDateTime } from '../../lib/format';
import { Pagination } from '../../components/Pagination';
import { Spinner } from '@tiendafy/ui';

interface ActivityItem {
  id: string;
  action: string;
  actorName: string;
  summary: string;
  createdAtUtc: string;
}

const PAGE_SIZE = 10;

/**
 * Quién cambió qué en el equipo: altas, bajas, roles, excepciones y la matriz.
 * Con varios administradores, es la forma de saber por qué alguien de golpe
 * puede (o ya no puede) hacer algo.
 */
export function TeamActivity() {
  const { store } = useStore();
  const [page, setPage] = useState(1);
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['team-activity', store?.id, page],
    queryFn: () =>
      api.get<{ items: ActivityItem[]; total: number }>(
        `/api/v1/members/activity?limit=${PAGE_SIZE}&offset=${(page - 1) * PAGE_SIZE}`,
      ),
    retry: false,
  });
  const items = data?.items ?? [];

  return (
    <section className="mt-6" aria-labelledby="team-activity-title">
      <h2 id="team-activity-title" className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-fg">
        <History className="h-4 w-4 text-fg-muted" /> Actividad del equipo
      </h2>
      <div className="rounded-lg border border-border bg-surface">
        {isLoading ? (
          <Spinner className="py-6" />
        ) : isError ? (
          <p className="px-4 py-6 text-center text-sm text-fg-muted">
            {errMsg(error, 'No se pudo cargar la actividad.')}
          </p>
        ) : items.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-fg-muted">
            Todavía no hay cambios. Acá vas a ver cada alta, baja, cambio de rol o de permisos.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {items.map((e) => (
              <li key={e.id} className="px-4 py-2.5 text-sm">
                <p className="text-fg">{e.summary}</p>
                <p className="mt-0.5 text-xs text-fg-muted">
                  {e.actorName} · {formatDateTime(e.createdAtUtc)}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>
      <Pagination
        page={page}
        totalPages={Math.max(1, Math.ceil((data?.total ?? 0) / PAGE_SIZE))}
        onPage={setPage}
      />
    </section>
  );
}
