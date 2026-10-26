import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Sparkles } from 'lucide-react';
import { Button, Checkbox, FormField, Modal, Select, Spinner, useToast } from '@tiendafy/ui';
import { useStore } from '../../context/StoreContext';
import { api, errMsg } from '../../lib/api';
import { formatUsd } from '../../lib/ai';
import {
  AI_CATALOG_MAX_ITEMS,
  productsLabel,
  type AiCatalogFilter,
  type AiCatalogPreview,
  type AiCatalogSelectionRequest,
} from '../../lib/aiCatalog';
import { qk } from '../../lib/queryKeys';
import { useCategories } from '../../lib/useCategories';
import { formatNumber } from '../../lib/format';

const NO_FILTER: AiCatalogFilter = {
  categoryId: undefined,
  missingDescription: false,
  shortDescription: false,
  missingMeliData: false,
};

/**
 * "Mejorar con IA": con productos elegidos arranca en "los N elegidos"; sin elegidos, en "los que cumplan" con tres casillas
 * y una categoría. Cada cambio vuelve a pedir la cuenta (cuántos son, cuánto cuesta y cuánto queda del tope) y recién al
 * confirmar se crea el trabajo y se pasa a la pantalla de revisión. El costo siempre es un estimado, y se dice.
 */
export function AiCatalogDialog({
  open,
  onClose,
  productIds,
}: {
  open: boolean;
  onClose: () => void;
  productIds?: string[];
}) {
  const { store } = useStore();
  const { toast } = useToast();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: categories } = useCategories({ enabled: open });
  const [filter, setFilter] = useState<AiCatalogFilter>(NO_FILTER);

  const chosen = productIds && productIds.length > 0 ? productIds : null;
  const tooMany = chosen !== null && chosen.length > AI_CATALOG_MAX_ITEMS;
  const filterReady =
    filter.missingDescription || filter.shortDescription || filter.missingMeliData || !!filter.categoryId;
  const request = useMemo<AiCatalogSelectionRequest | null>(() => {
    if (chosen) return tooMany ? null : { productIds: chosen };
    return filterReady ? { filter: { ...filter, categoryId: filter.categoryId || undefined } } : null;
  }, [chosen, tooMany, filter, filterReady]);

  const preview = useQuery({
    queryKey: qk.aiCatalogPreview(store?.id, request ?? {}),
    queryFn: () => api.post<AiCatalogPreview>('/api/v1/ai/catalog/jobs/preview', request),
    enabled: open && !!store && request !== null,
    staleTime: 0,
    gcTime: 0,
    retry: false,
  });

  const create = useMutation({
    mutationFn: () => api.post<{ jobId: string; total: number }>('/api/v1/ai/catalog/jobs', request),
    onSuccess: ({ jobId }) => {
      void queryClient.invalidateQueries({ queryKey: qk.aiCatalog(store?.id) });
      onClose();
      navigate(`/productos/fichas-ia/${jobId}`);
    },
    onError: (err) => toast(errMsg(err, 'No se pudo crear el trabajo.'), { variant: 'error' }),
  });

  const data = preview.data;
  const canConfirm = request !== null && !!data && data.available && data.count > 0 && !create.isPending;

  const setFlag = (key: 'missingDescription' | 'shortDescription' | 'missingMeliData', value: boolean) =>
    setFilter((f) => ({ ...f, [key]: value }));

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Mejorar fichas con IA"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={() => create.mutate()} disabled={!canConfirm} loading={create.isPending}>
            <Sparkles className="h-4 w-4" aria-hidden /> Confirmar
          </Button>
        </>
      }
    >
      <p className="text-sm text-fg-muted">
        La IA redacta la descripción y el SEO de cada producto y completa los datos que pide la categoría de
        Mercado Libre. Después vos revisás cada ficha antes de guardarla: nada cambia en tu tienda ni en
        Mercado Libre hasta que la aprobás.
      </p>

      {chosen ? (
        <div className="mt-3 space-y-1.5 text-sm">
          <p className="text-fg">Se mejoran los productos que elegiste en la lista.</p>
          {tooMany && (
            <p role="alert" className="flex items-start gap-1.5 text-warning">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              Elegiste {productsLabel(chosen.length)} y el máximo por vez es {AI_CATALOG_MAX_ITEMS}. Sacá
              algunos para seguir.
            </p>
          )}
        </div>
      ) : (
        <fieldset className="mt-3 space-y-2">
          <legend className="mb-1 text-sm font-medium text-fg">Mejorar los productos que cumplan</legend>
          <Checkbox
            label="Sin descripción"
            checked={filter.missingDescription}
            onChange={(e) => setFlag('missingDescription', e.target.checked)}
          />
          <Checkbox
            label="Con descripción corta (menos de 300 caracteres)"
            checked={filter.shortDescription}
            onChange={(e) => setFlag('shortDescription', e.target.checked)}
          />
          <Checkbox
            label="Sin datos de Mercado Libre guardados"
            description="Todavía no tienen categoría ni atributos de Mercado Libre."
            checked={filter.missingMeliData}
            onChange={(e) => setFlag('missingMeliData', e.target.checked)}
          />
          <FormField label="Categoría" hint="Incluye sus subcategorías.">
            <Select
              value={filter.categoryId ?? ''}
              onChange={(e) => setFilter((f) => ({ ...f, categoryId: e.target.value || undefined }))}
              options={[
                { value: '', label: 'Todas' },
                ...(categories?.items ?? []).map((c) => ({
                  value: c.id,
                  label: `${'— '.repeat(Math.max(0, c.depth - 1))}${c.name}`,
                })),
              ]}
            />
          </FormField>
          {!filterReady && (
            <p className="text-sm text-fg-subtle">Marcá al menos una condición o elegí una categoría.</p>
          )}
        </fieldset>
      )}

      <div className="mt-4 rounded-md border border-border bg-bg-subtle p-3 text-sm" aria-live="polite">
        {request === null ? (
          <p className="text-fg-subtle">Elegí qué productos mejorar para ver cuántos son y cuánto cuesta.</p>
        ) : preview.isError ? (
          <p role="alert" className="text-danger">
            {errMsg(preview.error, 'No se pudo calcular el costo.')}
          </p>
        ) : !data ? (
          <p className="flex items-center gap-2 text-fg-muted">
            <Spinner inline size={14} /> Calculando…
          </p>
        ) : (
          <PreviewSummary data={data} />
        )}
      </div>
    </Modal>
  );
}

function PreviewSummary({ data }: { data: AiCatalogPreview }) {
  return (
    <div className="space-y-1.5">
      <p>
        <strong className="text-fg">{productsLabel(data.count)}</strong>
        {data.capped && (
          <span className="text-fg-muted">
            {' '}
            · Se toman los primeros {AI_CATALOG_MAX_ITEMS} de {formatNumber(data.matched)}.
          </span>
        )}
      </p>
      {data.writeModel && data.judgeModel && (
        <p className="text-fg-muted">
          Redacta {data.writeModel} y evalúa {data.judgeModel}.
        </p>
      )}
      <p>
        Costo estimado: <strong className="text-fg">{formatUsd(data.estimatedCostMicroUsd)}</strong>{' '}
        <span className="text-fg-muted">Estimado.</span>
      </p>
      <p className="text-fg-muted">Te quedan {formatUsd(data.remainingMicroUsd)} del tope de este mes.</p>
      {!data.fitsBudget && data.available && (
        <p role="alert" className="flex items-start gap-1.5 text-warning">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          El tope no alcanza para todos: el trabajo se va a pausar al llegar.
        </p>
      )}
      {!data.available && (
        <p role="alert" className="flex items-start gap-1.5 text-danger">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          {data.reason ?? 'La IA no está disponible ahora.'}
        </p>
      )}
    </div>
  );
}
