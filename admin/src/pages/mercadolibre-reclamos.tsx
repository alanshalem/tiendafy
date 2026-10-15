import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { AlertTriangle } from 'lucide-react';
import { Badge, EmptyList, Spinner } from '@tiendafy/ui';
import { api } from '../lib/api';
import { fecha } from './mercadolibre-shared';
import { ERROR_SHOWN, LoadError } from '../components/LoadError';
import { useListParams } from '../lib/useListParams';
import { Pagination, pageRangeLabel } from '../components/Pagination';

interface MeliClaim {
  id: string;
  status: string | null;
  stage: string | null;
  reasonId: string | null;
  resourceId: string;
  dateCreated: string | null;
}

// ---- Reclamos ----------------------------------------------------------------

const PAGE_SIZE = 25;
const LIST_DEFAULTS = { 'pagina-reclamos': 1 };

export function ReclamosTab() {
  const list = useListParams(LIST_DEFAULTS, { pageKey: 'pagina-reclamos' });
  const page = list.values['pagina-reclamos'];
  // Un error no es "sin reclamos": eso hacía creer que no había nada que atender.
  // De a una página: antes eran los 30 más nuevos y el resto no aparecía.
  const { data, error, isError, refetch, isFetching } = useQuery({
    queryKey: ['meli-claims', page],
    queryFn: () =>
      api.get<{ claims: MeliClaim[]; total?: number }>(
        `/api/v1/admin/meli/claims?limit=${PAGE_SIZE}&offset=${(page - 1) * PAGE_SIZE}`,
      ),
    placeholderData: keepPreviousData,
    meta: ERROR_SHOWN,
  });
  const claims = data?.claims ?? null;
  const total = data?.total ?? claims?.length ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  if (isError && !claims)
    return (
      <LoadError
        title="No se pudieron cargar los reclamos."
        error={error}
        onRetry={() => void refetch()}
        retrying={isFetching}
      />
    );

  return claims === null ? (
    <Spinner />
  ) : claims.length === 0 ? (
    <EmptyList>Sin reclamos abiertos en Mercado Libre. 🎉</EmptyList>
  ) : (
    <div className="space-y-3">
      <p className="text-right text-xs text-fg-subtle">
        {pageRangeLabel(page, PAGE_SIZE, total, total === 1 ? 'reclamo' : 'reclamos')}
      </p>
      {claims.map((c) => (
        <div
          key={c.id}
          className="flex items-center gap-3 rounded-lg border border-border bg-surface p-4 shadow-card"
        >
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-danger-bg text-danger">
            <AlertTriangle className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="font-medium text-fg">Reclamo #{c.id}</span>
              <Badge variant="warning">{c.status ?? '—'}</Badge>
              {c.stage && <Badge variant="neutral">{c.stage}</Badge>}
            </div>
            <p className="mt-0.5 text-sm text-fg-muted">
              {c.reasonId ? `Motivo: ${c.reasonId} · ` : ''}Venta {c.resourceId} · {fecha(c.dateCreated)}
            </p>
          </div>
        </div>
      ))}
      <Pagination
        page={Math.min(page, totalPages)}
        totalPages={totalPages}
        onPage={(p) => list.set({ 'pagina-reclamos': p })}
      />
    </div>
  );
}
