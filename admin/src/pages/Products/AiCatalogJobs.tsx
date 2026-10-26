import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Sparkles } from 'lucide-react';
import { Badge, EmptyList, PageHeader } from '@tiendafy/ui';
import { useStore } from '../../context/StoreContext';
import { NoStoreSelected } from '../../components/NoStoreSelected';
import { api } from '../../lib/api';
import { formatUsd } from '../../lib/ai';
import { formatDateTime } from '../../lib/format';
import {
  jobInFlight,
  JOB_STATUS_LABEL,
  JOB_STATUS_TONE,
  productsLabel,
  type AiCatalogJob,
} from '../../lib/aiCatalog';
import { qk } from '../../lib/queryKeys';

/** Los trabajos de fichas con IA de la tienda (los últimos 20), con su estado, su avance y su costo. */
export function AiCatalogJobsPage() {
  const { store } = useStore();
  const { data, isLoading } = useQuery({
    queryKey: qk.aiCatalogJobs(store?.id),
    queryFn: () => api.get<{ items: AiCatalogJob[] }>('/api/v1/ai/catalog/jobs'),
    enabled: !!store,
    // Mientras algún trabajo se está procesando, la lista se actualiza sola.
    refetchInterval: (query) => (query.state.data?.items.some((j) => jobInFlight(j.status)) ? 5_000 : false),
  });

  if (!store) return <NoStoreSelected message="Elegí una tienda arriba para ver sus fichas con IA." />;

  const jobs = data?.items ?? [];

  return (
    <div className="space-y-4">
      <PageHeader
        title="Fichas con IA"
        subtitle="Los trabajos de mejora de fichas del catálogo. Entrá a uno para revisar cada ficha antes de guardarla."
        back={
          <Link
            to="/productos"
            className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
          >
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden /> Productos
          </Link>
        }
      />

      {isLoading ? (
        <p className="text-sm text-fg-muted">Cargando…</p>
      ) : jobs.length === 0 ? (
        <EmptyList icon={<Sparkles />} title="Todavía no mejoraste fichas con IA">
          Elegí productos en el catálogo y tocá “Mejorar con IA”: acá vas a ver el avance y a revisar cada
          ficha.
        </EmptyList>
      ) : (
        <ul className="space-y-2" aria-label="Trabajos de fichas con IA">
          {jobs.map((job) => (
            <li key={job.id}>
              <Link
                to={`/productos/fichas-ia/${job.id}`}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-surface px-4 py-3 shadow-card hover:bg-bg-subtle"
              >
                <div className="min-w-0">
                  <p className="font-medium text-fg">{productsLabel(job.total)}</p>
                  <p className="text-xs text-fg-muted">
                    {formatDateTime(job.createdAt)} · {job.createdByName}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-3 text-sm text-fg-muted">
                  <span className="tabular-nums">
                    {job.processed} de {job.total}
                  </span>
                  <span>
                    {formatUsd(job.actualCostMicroUsd)}{' '}
                    <span className="text-xs">de {formatUsd(job.estimatedCostMicroUsd)} estimado</span>
                  </span>
                  <Badge variant={JOB_STATUS_TONE[job.status]}>{JOB_STATUS_LABEL[job.status]}</Badge>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
