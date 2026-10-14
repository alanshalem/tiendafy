import { useQuery } from '@tanstack/react-query';
import { AlertTriangle } from 'lucide-react';
import { Badge, EmptyList, Spinner } from '@tiendafy/ui';
import { api } from '../lib/api';
import { fecha } from './mercadolibre-shared';
import { ERROR_SHOWN, LoadError } from '../components/LoadError';

interface MeliClaim {
  id: string;
  status: string | null;
  stage: string | null;
  reasonId: string | null;
  resourceId: string;
  dateCreated: string | null;
}

// ---- Reclamos ----------------------------------------------------------------

export function ReclamosTab() {
  // Un error no es "sin reclamos": eso hacía creer que no había nada que atender.
  const { data, error, isError, refetch, isFetching } = useQuery({
    queryKey: ['meli-claims'],
    queryFn: () => api.get<{ claims: MeliClaim[] }>('/api/v1/admin/meli/claims'),
    meta: ERROR_SHOWN,
  });
  const claims = data?.claims ?? null;

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
    </div>
  );
}
