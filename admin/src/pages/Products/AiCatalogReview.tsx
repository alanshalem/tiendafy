import { useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Check, Pause, Play, Square } from 'lucide-react';
import { Badge, Button, EmptyList, PageHeader, Spinner, Tabs, useConfirm, useToast } from '@tiendafy/ui';
import { useStore } from '../../context/StoreContext';
import { usePermissions } from '../../context/PermissionsContext';
import { NoStoreSelected } from '../../components/NoStoreSelected';
import { Pagination } from '../../components/Pagination';
import { api, ApiRequestError, errMsg } from '../../lib/api';
import { formatUsd } from '../../lib/ai';
import {
  ITEM_TABS,
  ITEMS_PAGE_SIZE,
  JOB_STATUS_LABEL,
  JOB_STATUS_TONE,
  jobCancellable,
  jobInFlight,
  jobPaused,
  productsLabel,
  type AiCatalogItemsPage,
  type AiCatalogItemStatus,
  type AiCatalogJob,
  type AiCatalogPushResult,
} from '../../lib/aiCatalog';
import { qk } from '../../lib/queryKeys';
import { AiCatalogItemCard } from './AiCatalogItemCard';

const PUSH_BATCH = 20;

interface BulkApproveResult {
  approved: number;
  failed: { productId: string; message: string }[];
}

/**
 * La revisión de un trabajo de fichas con IA: el estado y el costo del trabajo, y las fichas por estado para aprobarlas,
 * editarlas o descartarlas. Mientras el trabajo se procesa, la pantalla se actualiza sola.
 */
export function AiCatalogReviewPage() {
  const { jobId } = useParams<{ jobId: string }>();
  const { store } = useStore();
  const { can } = usePermissions();
  const canPublish = can('meli.publish');
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const confirm = useConfirm();

  const [picked, setPicked] = useState<AiCatalogItemStatus | null>(null);
  const [page, setPage] = useState(1);

  const job = useQuery({
    queryKey: qk.aiCatalogJob(store?.id, jobId),
    queryFn: () => api.get<AiCatalogJob>(`/api/v1/ai/catalog/jobs/${jobId}`),
    enabled: !!store && !!jobId,
    refetchInterval: (query) => (jobInFlight(query.state.data?.status) ? 5_000 : false),
  });
  const data = job.data;

  // La pestaña que se ve: la que eligió la persona o, al entrar, la primera que tiene fichas.
  const tab: AiCatalogItemStatus =
    picked ?? ITEM_TABS.find((t) => (data?.byStatus[t.id] ?? 0) > 0)?.id ?? 'Review';

  const items = useQuery({
    queryKey: qk.aiCatalogItems(store?.id, jobId, `${tab}:${page}`),
    queryFn: () =>
      api.get<AiCatalogItemsPage>(
        `/api/v1/ai/catalog/jobs/${jobId}/items?status=${tab}&offset=${(page - 1) * ITEMS_PAGE_SIZE}&limit=${ITEMS_PAGE_SIZE}`,
      ),
    enabled: !!store && !!jobId && !!data,
    placeholderData: keepPreviousData,
    refetchInterval: jobInFlight(data?.status) ? 5_000 : false,
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: qk.aiCatalog(store?.id) });

  const resume = useMutation({
    mutationFn: () => api.post(`/api/v1/ai/catalog/jobs/${jobId}/resume`, {}),
    onSuccess: () => {
      toast('Se reanudó el trabajo.', { variant: 'success' });
      return refresh();
    },
    onError: (err) => toast(errMsg(err, 'No se pudo reanudar.'), { variant: 'error' }),
  });

  const cancel = useMutation({
    mutationFn: () => api.post(`/api/v1/ai/catalog/jobs/${jobId}/cancel`, {}),
    onSuccess: () => {
      toast('Se canceló el trabajo. Lo que ya estaba armado queda para revisar.', { variant: 'success' });
      return refresh();
    },
    onError: (err) => toast(errMsg(err, 'No se pudo cancelar.'), { variant: 'error' }),
  });

  const approvePassed = useMutation({
    mutationFn: () => api.post<BulkApproveResult>(`/api/v1/ai/catalog/jobs/${jobId}/approve-passed`, {}),
    onSuccess: async (result) => {
      const failed = result.failed.length;
      toast(
        `${result.approved} ${result.approved === 1 ? 'ficha aprobada' : 'fichas aprobadas'}${failed > 0 ? ` · ${failed} no se pudieron aprobar` : ''}.`,
        { variant: failed > 0 ? 'error' : 'success' },
      );
      await Promise.all([refresh(), queryClient.invalidateQueries({ queryKey: qk.products(store?.id) })]);
    },
    onError: (err) => toast(errMsg(err, 'No se pudieron aprobar.'), { variant: 'error' }),
  });

  const askApprovePassed = async () => {
    const passed = items.data?.passed ?? 0;
    const ok = await confirm({
      title: 'Aprobar las que pasaron',
      message: `Se guardan ${passed} ${passed === 1 ? 'ficha' : 'fichas'} en tu tienda. Mercado Libre no cambia hasta que lo actualices.`,
      confirmLabel: 'Aprobar',
    });
    if (ok) approvePassed.mutate();
  };

  const askCancel = async () => {
    const ok = await confirm({
      title: 'Cancelar el trabajo',
      message:
        'Se deja de armar fichas. Lo que ya está listo queda para revisar y lo gastado hasta ahora no se devuelve.',
      confirmLabel: 'Cancelar el trabajo',
      cancelLabel: 'Seguir',
      variant: 'danger',
    });
    if (ok) cancel.mutate();
  };

  // "Actualizar en ML los aprobados": de a tramos, hasta que el servidor diga que no queda más.
  const [pushing, setPushing] = useState<{ updated: number; failed: AiCatalogPushResult['failed'] } | null>(
    null,
  );
  const [pushRunning, setPushRunning] = useState(false);
  const pushAll = async () => {
    // Es la única escritura hacia Mercado Libre y llega a muchas publicaciones: se confirma con la cantidad.
    const count = data?.byStatus.Approved ?? 0;
    const ok = await confirm({
      title: 'Actualizar en Mercado Libre',
      message: `Se actualizan hasta ${count} ${count === 1 ? 'publicación' : 'publicaciones'} en Mercado Libre con los datos de las fichas aprobadas. Lo que ya cargaste directo en esas publicaciones se conserva.`,
      confirmLabel: 'Actualizar',
    });
    if (!ok) return;
    setPushRunning(true);
    let after: string | undefined;
    let updated = 0;
    const failed: AiCatalogPushResult['failed'] = [];
    setPushing({ updated, failed });
    try {
      do {
        const result = await api.post<AiCatalogPushResult>(`/api/v1/ai/catalog/jobs/${jobId}/push-to-meli`, {
          after,
          limit: PUSH_BATCH,
        });
        updated += result.updated;
        failed.push(...result.failed);
        setPushing({ updated, failed: [...failed] });
        after = result.next ?? undefined;
      } while (after);
      toast(
        failed.length > 0
          ? `Se actualizaron ${updated} en Mercado Libre y ${failed.length} no se pudieron.`
          : `Se actualizaron ${updated} en Mercado Libre.`,
        { variant: failed.length > 0 ? 'error' : 'success' },
      );
    } catch (err) {
      toast(errMsg(err, 'No se pudo actualizar en Mercado Libre.'), { variant: 'error' });
    } finally {
      setPushRunning(false);
    }
  };

  if (!store) return <NoStoreSelected message="Elegí una tienda arriba para revisar sus fichas con IA." />;

  const back = (
    <Link
      to="/productos/fichas-ia"
      className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
    >
      <ArrowLeft className="h-3.5 w-3.5" aria-hidden /> Fichas con IA
    </Link>
  );

  // Un trabajo es de una tienda: al cambiar de tienda la pantalla se arma de nuevo con el mismo id y ese trabajo no existe en la
  // otra (404). En vez del error, vuelve a la lista de trabajos de la tienda que se eligió.
  if (job.error instanceof ApiRequestError && job.error.status === 404) {
    return <Navigate to="/productos/fichas-ia" replace />;
  }

  if (job.isError) {
    return (
      <div className="space-y-4">
        <PageHeader title="Revisar fichas con IA" back={back} />
        <p role="alert" className="text-sm text-danger">
          {errMsg(job.error, 'No se pudo cargar el trabajo.')}
        </p>
      </div>
    );
  }
  if (!data) {
    return (
      <div className="space-y-4">
        <PageHeader title="Revisar fichas con IA" back={back} />
        <p className="flex items-center gap-2 text-sm text-fg-muted">
          <Spinner inline size={14} /> Cargando…
        </p>
      </div>
    );
  }

  const pending = data.byStatus.Pending;
  const tabs = ITEM_TABS.map((t) => ({ ...t, count: data.byStatus[t.id] }));
  const list = items.data?.items ?? [];
  const totalPages = Math.max(1, Math.ceil((items.data?.total ?? 0) / ITEMS_PAGE_SIZE));

  return (
    <div className="space-y-4">
      <PageHeader
        title={
          <>
            Revisar fichas con IA{' '}
            <Badge variant={JOB_STATUS_TONE[data.status]}>{JOB_STATUS_LABEL[data.status]}</Badge>
          </>
        }
        subtitle={`${productsLabel(data.total)} · pedido por ${data.createdByName}`}
        back={back}
        actions={
          <>
            {jobPaused(data.status) && (
              <Button onClick={() => resume.mutate()} loading={resume.isPending}>
                <Play className="h-4 w-4" aria-hidden /> Reanudar
              </Button>
            )}
            {jobCancellable(data.status) && (
              <Button variant="secondary" onClick={askCancel} loading={cancel.isPending}>
                <Square className="h-4 w-4" aria-hidden /> Cancelar
              </Button>
            )}
          </>
        }
      />

      <section
        aria-label="Avance del trabajo"
        className="space-y-1 rounded-lg border border-border bg-surface px-4 py-3 text-sm"
      >
        <p className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <span>
            <strong className="tabular-nums text-fg">
              {data.processed} de {data.total}
            </strong>{' '}
            <span className="text-fg-muted">procesados{pending > 0 ? ` · faltan ${pending}` : ''}</span>
          </span>
          <span className="text-fg-muted">
            Costo real: <span className="font-medium text-fg">{formatUsd(data.actualCostMicroUsd)}</span> ·
            Estimado: {formatUsd(data.estimatedCostMicroUsd)}
          </span>
        </p>
        {data.pauseReason && (
          <p role="status" className="flex items-start gap-1.5 text-warning">
            <Pause className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> {data.pauseReason}
          </p>
        )}
      </section>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <Tabs
          label="Estado de las fichas"
          items={tabs}
          value={tab}
          onChange={(t) => {
            setPicked(t);
            setPage(1);
          }}
        />
        <div className="flex flex-wrap items-center gap-2">
          {tab === 'Review' && (items.data?.total ?? 0) > 0 && (
            <Button variant="secondary" onClick={askApprovePassed} loading={approvePassed.isPending}>
              <Check className="h-4 w-4" aria-hidden /> Aprobar todos los que pasaron
            </Button>
          )}
          {tab === 'Approved' && canPublish && (items.data?.total ?? 0) > 0 && (
            <Button variant="secondary" onClick={pushAll} loading={pushRunning}>
              Actualizar en ML los aprobados
            </Button>
          )}
        </div>
      </div>

      {pushing && (
        <section
          aria-label="Actualización en Mercado Libre"
          className="rounded-md border border-border bg-bg-subtle px-3 py-2 text-sm"
          aria-live="polite"
        >
          <p className="text-fg">
            {pushRunning ? 'Actualizando…' : 'Listo.'} {pushing.updated}{' '}
            {pushing.updated === 1 ? 'producto actualizado' : 'productos actualizados'} en Mercado Libre.
          </p>
          {pushing.failed.length > 0 && (
            <ul className="mt-1 list-disc space-y-0.5 pl-5 text-danger">
              {pushing.failed.map((f) => (
                <li key={f.productId}>
                  Producto {f.productId.slice(0, 8)}: {f.message}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {items.isLoading ? (
        <p className="flex items-center gap-2 text-sm text-fg-muted">
          <Spinner inline size={14} /> Cargando fichas…
        </p>
      ) : items.isError ? (
        <p role="alert" className="text-sm text-danger">
          {errMsg(items.error, 'No se pudieron cargar las fichas.')}
        </p>
      ) : list.length === 0 ? (
        <EmptyList>{emptyText(tab, data)}</EmptyList>
      ) : (
        <div className="space-y-4">
          {list.map((item) => (
            <AiCatalogItemCard key={item.id} item={item} canPublish={canPublish} />
          ))}
        </div>
      )}

      <Pagination page={Math.min(page, totalPages)} totalPages={totalPages} onPage={setPage} />
    </div>
  );
}

function emptyText(tab: AiCatalogItemStatus, job: AiCatalogJob): string {
  if (tab === 'Review' && jobInFlight(job.status))
    return 'Todavía no hay fichas para revisar: se están armando.';
  switch (tab) {
    case 'Review':
      return 'No quedan fichas para revisar.';
    case 'NeedsCategory':
      return 'Ningún producto espera que elijas su categoría.';
    case 'Approved':
      return 'Todavía no aprobaste ninguna ficha de este trabajo.';
    case 'Discarded':
      return 'No descartaste ninguna ficha.';
    default:
      return 'Ninguna ficha falló.';
  }
}
