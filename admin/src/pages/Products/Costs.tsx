import { useState, useId } from 'react';
import { TrendingUp } from 'lucide-react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { qk } from '../../lib/queryKeys';
import {
  Button,
  Card,
  Input,
  Modal,
  Select,
  useConfirm,
  useToast,
  Spinner,
  PageHeader,
  SearchInput,
} from '@tiendafy/ui';
import { useStore } from '../../context/StoreContext';
import { api, errMsg } from '../../lib/api';
import { useCategories } from '../../lib/useCategories';
import type { CatalogProduct } from '../../lib/products';
import { formatMoney, formatNumber, formatPercent } from '../../lib/format';
import { Pagination } from '../../components/Pagination';
import { InfoDot } from '../../components/charts';
import { ListStats } from '../../components/stats/ListStats';
import { useCatalogHealth } from './queries';
import { useListParams, useListSearch } from '../../lib/useListParams';
import { useModalFormGuard } from '../../lib/useUnsavedChanges';
import { HelpLink } from '../../components/HelpLink';
import { EmptyState } from '../../components/EmptyState';
import { NoStoreSelected } from '../../components/NoStoreSelected';
import { TABLE_HEAD_STICKY, TABLE_SCROLL_X } from '../../lib/styles';
import { usePermissions } from '../../context/PermissionsContext';

interface VariantCost {
  variantId: string;
  priceAmount: number;
  costAmount: number | null;
  currency: string;
}

/**
 * Costo por variante (base de Rentabilidad). El costo se guarda en PESOS acá
 * (el input es en pesos, la API trabaja en centavos). Carga masiva: columna
 * «Costo» del CSV de importación.
 */
/** Productos por página. */
const PAGE_SIZE = 20;

/** Búsqueda, "sin costo" y página, en la URL (ver useListParams). */
const LIST_DEFAULTS = { q: '', sinCosto: false, pagina: 1 };

export function CostsPage() {
  const { can } = usePermissions();
  // El costo se guarda en el producto; repreciar es cambiar precios en masa.
  const canEditCosts = can('catalog.write');
  const canReprice = can('prices.manage');
  const { store } = useStore();
  const { data: health } = useCatalogHealth();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [repriceOpen, setRepriceOpen] = useState(false);

  // Se entra acá desde la métrica "sin costo cargado" de Productos, que manda
  // ?sinCosto=1. El filtro se resuelve en la base: sobre miles de productos,
  // buscar a ojo cuáles faltan es exactamente el trabajo que evita el atajo.
  const list = useListParams(LIST_DEFAULTS);
  const [search, setSearch] = useListSearch(list);
  const onlyMissing = list.values.sinCosto;
  const page = list.values.pagina;
  const setPage = (p: number) => list.set({ pagina: p });
  const q = list.values.q.trim();

  // Una página del catálogo por request, con la búsqueda hecha en la base:
  // antes se traía el catálogo COMPLETO (de a 100 por request) para filtrar y
  // paginar en el navegador.
  const { data, isLoading } = useQuery({
    queryKey: qk.productsPage(store?.id, q, page, onlyMissing),
    queryFn: () => {
      const params = new URLSearchParams({
        limit: String(PAGE_SIZE),
        offset: String((page - 1) * PAGE_SIZE),
      });
      if (q) params.set('q', q);
      if (onlyMissing) params.set('missingCost', 'true');
      return api.get<{ items: CatalogProduct[]; total: number }>(`/api/v1/products?${params}`);
    },
    enabled: !!store,
    placeholderData: keepPreviousData,
  });

  const items = data?.items ?? [];
  const totalPages = Math.max(1, Math.ceil((data?.total ?? 0) / PAGE_SIZE));
  const pageIds = items.map((p) => p.id).join(',');

  // Costos de los productos visibles en UN request (endpoint admin bulk con
  // permiso — el DTO público del catálogo no trae costo a propósito).
  const { data: costRows } = useQuery({
    queryKey: qk.variantCosts(store?.id, pageIds),
    queryFn: async () => {
      const r = await api.get<{ items: VariantCost[] }>(`/api/v1/products/costs?ids=${pageIds}`);
      return new Map(r.items.map((c) => [c.variantId, c]));
    },
    enabled: !!store && items.length > 0,
  });

  const save = useMutation({
    mutationFn: ({
      productId,
      variantId,
      costAmount,
    }: {
      productId: string;
      variantId: string;
      costAmount: number | null;
    }) => api.put(`/api/v1/products/${productId}/costs`, { costs: [{ variantId, costAmount }] }),
    onSuccess: (_, { variantId }) => {
      queryClient.invalidateQueries({ queryKey: qk.variantCosts(store?.id) });
      setDrafts((d) => {
        const next = { ...d };
        delete next[variantId];
        return next;
      });
      toast('Costo actualizado', { variant: 'success' });
    },
    onError: (err) => {
      toast(errMsg(err, 'Error guardando el costo'), { variant: 'error' });
    },
  });

  if (!store) {
    return <NoStoreSelected />;
  }

  if (!isLoading && items.length === 0 && !q) {
    return (
      <EmptyState
        as="h1"
        kicker="Costos"
        title="Primero, productos"
        body="Cuando cargues productos vas a poder cargar el costo de cada variante y ver tu ganancia real."
      />
    );
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Costos"
        subtitle="Cuánto te cuesta cada variante (en pesos). Con el costo cargado, Estadísticas → Rentabilidad muestra tu ganancia real por venta. Para cargar en masa usá la columna «Costo» del CSV."
      />

      {onlyMissing && (
        <div className="flex items-center gap-2 text-sm text-fg-muted">
          <span>
            Mostrando solo los productos con alguna variante{' '}
            <span className="font-medium text-fg">sin costo cargado</span>
            {data && ` · ${formatNumber(data.total)}`}
          </span>
          <button
            type="button"
            onClick={() => list.set({ sinCosto: false })}
            className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-xs font-medium text-fg hover:bg-bg-muted"
          >
            Ver todos
          </button>
        </div>
      )}

      {health && health.variants > 0 && (
        <ListStats
          items={[
            {
              label: 'Costos cargados',
              value: formatPercent((health.variantsWithCost / health.variants) * 100, 0),
              hint: `${health.variantsWithCost} de ${health.variants} variantes. La rentabilidad solo mira las que tienen costo.`,
              tone: health.variantsWithoutCost > 0 ? 'warning' : 'success',
            },
            {
              label: 'Margen promedio',
              value: formatPercent(health.averageMarginPct),
              hint: 'Cuánto queda del precio de venta después del costo, promediando las variantes con costo cargado. No descuenta comisiones ni envío.',
            },
            {
              label: 'Margen bajo (< 15 %)',
              value: formatNumber(health.lowMarginVariants),
              hint: 'Variantes donde el costo se come casi todo el precio. Candidatas a repreciar.',
              tone: health.lowMarginVariants > 0 ? 'danger' : 'success',
            },
            {
              label: 'Falta cargar',
              value: formatNumber(health.variantsWithoutCost),
              hint: 'Variantes sin costo. Cargalas acá o con la columna «Costo» del CSV.',
              onClick: () => list.set({ sinCosto: !onlyMissing }),
              active: onlyMissing,
            },
          ]}
        />
      )}

      <div className="flex gap-2">
        <div className="min-w-0 flex-1">
          <SearchInput
            aria-label="Buscar en costos"
            placeholder="Buscar por producto o SKU…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        {canReprice && (
          <Button variant="secondary" className="shrink-0" onClick={() => setRepriceOpen(true)}>
            <TrendingUp className="h-4 w-4" /> Repreciar en masa
          </Button>
        )}
      </div>

      <Card flush>
        <div className={TABLE_SCROLL_X}>
          <table className="w-full min-w-[640px] text-sm">
            <thead className={TABLE_HEAD_STICKY}>
              <tr className="border-b border-border bg-bg-subtle text-left text-fg-muted">
                <th className="px-4 py-2.5 font-medium">Producto</th>
                <th className="px-4 py-2.5 font-medium">Variante</th>
                <th className="px-4 py-2.5 text-right font-medium">Precio</th>
                <th className="px-4 py-2.5 text-right font-medium">
                  <span className="inline-flex items-center gap-1">
                    Margen{' '}
                    <InfoDot info="(precio − costo) ÷ precio. En rojo si es menor al 15%: estás vendiendo casi al costo." />
                  </span>
                </th>
                <th className="px-4 py-2.5 text-center font-medium">Costo ($)</th>
                <th className="px-4 py-2.5">
                  <span className="sr-only">Acciones</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {items.flatMap((product) =>
                product.variants.map((variant, vi) => {
                  const row = costRows?.get(variant.id);
                  const saved = row?.costAmount != null ? String(row.costAmount / 100) : '';
                  const draft = drafts[variant.id];
                  const value = draft ?? saved;
                  const changed = draft !== undefined && draft !== saved;
                  const costPesos = Number(value);
                  const margin =
                    row && value !== '' && Number.isFinite(costPesos) && row.priceAmount > 0
                      ? Math.round(((row.priceAmount - costPesos * 100) / row.priceAmount) * 100)
                      : null;

                  return (
                    <tr key={variant.id} className="border-b border-border last:border-b-0">
                      <td className="px-4 py-2.5 font-medium text-fg">{vi === 0 ? product.name : ''}</td>
                      <td className="px-4 py-2.5 text-fg-muted">
                        {variant.optionValues.length > 0 ? variant.optionValues.join(' / ') : 'Única'}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-fg-muted">
                        {row ? formatMoney(row.priceAmount, row.currency) : '—'}
                      </td>
                      <td
                        className={`px-4 py-2.5 text-right tabular-nums ${
                          margin != null && margin < 15 ? 'text-danger' : 'text-fg-muted'
                        }`}
                      >
                        {margin != null ? formatPercent(margin) : '—'}
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="mx-auto w-28 shrink-0">
                          <Input
                            aria-label={`Costo de ${product.name}${
                              variant.optionValues.length > 0 ? ` (${variant.optionValues.join(' / ')})` : ''
                            }`}
                            compact
                            type="number"
                            min={0}
                            step="0.01"
                            className="text-right"
                            value={value}
                            placeholder="Sin costo"
                            readOnly={!canEditCosts}
                            onChange={(e) => setDrafts((d) => ({ ...d, [variant.id]: e.target.value }))}
                          />
                        </div>
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <Button
                          size="sm"
                          variant="secondary"
                          disabled={!changed || save.isPending || !canEditCosts}
                          onClick={() =>
                            save.mutate({
                              productId: product.id,
                              variantId: variant.id,
                              costAmount: value.trim() === '' ? null : Math.round(Number(value) * 100),
                            })
                          }
                        >
                          Guardar
                        </Button>
                      </td>
                    </tr>
                  );
                }),
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <Pagination page={page} totalPages={totalPages} onPage={setPage} />
      {repriceOpen && <RepriceModal onClose={() => setRepriceOpen(false)} />}
      <HelpLink id="rentabilidad" />
    </div>
  );
}

// ---- Repreciación masiva -----------------------------------------------------

/**
 * Llegó el contenedor con dólar nuevo: +X% a todo el catálogo (o a una
 * categoría) con redondeo comercial, en dos clicks.
 */
function RepriceModal({ onClose }: { onClose: () => void }) {
  const fid = useId();
  const { store } = useStore();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const confirm = useConfirm();
  const [percent, setPercent] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [rounding, setRounding] = useState('990');
  const [busy, setBusy] = useState(false);
  const { dirty, close } = useModalFormGuard({ percent, categoryId, rounding }, onClose);

  const { data: cats } = useCategories();

  const apply = async () => {
    const pct = Number(percent);
    if (!Number.isFinite(pct) || pct === 0) {
      toast('Ingresá un porcentaje distinto de cero.', { variant: 'error' });
      return;
    }
    const ok = await confirm({
      title: 'Repreciar en masa',
      message: `Se ${pct > 0 ? 'aumentan' : 'bajan'} los precios ${formatPercent(Math.abs(pct))}${categoryId ? ' de la categoría elegida' : ' de TODO el catálogo'}. Impacta en la tienda al instante y no se puede deshacer en bloque.`,
      confirmLabel: 'Repreciar',
      variant: 'danger',
    });
    if (!ok) return;
    setBusy(true);
    try {
      const r = await api.post<{ products: number; variants: number }>('/api/v1/products/reprice', {
        percent: pct,
        categoryId: categoryId || null,
        rounding,
      });
      toast(`Listo: ${r.variants} precios actualizados en ${r.products} productos.`, { variant: 'success' });
      queryClient.invalidateQueries({ queryKey: qk.products(store?.id) });
      queryClient.invalidateQueries({ queryKey: qk.variantCosts(store?.id) });
      onClose();
    } catch (err) {
      toast(errMsg(err, 'No se pudo repreciar.'), { variant: 'error' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      dirty={dirty}
      title="Repreciar en masa"
      size="md"
      footer={
        <>
          <Button variant="secondary" onClick={close}>
            Cancelar
          </Button>
          <Button onClick={apply} disabled={busy || !percent}>
            {busy && <Spinner inline />} Repreciar
          </Button>
        </>
      }
    >
      <p className="text-sm text-fg-muted">
        Sube (o baja) todos los precios en un porcentaje, con redondeo comercial. Los precios tachados de
        oferta se ajustan igual, así la promo mantiene su descuento relativo.
      </p>
      <div className="mt-4 space-y-3">
        <div>
          <label htmlFor={`${fid}-1`} className="mb-1 block text-sm font-medium text-fg">
            Porcentaje (+ sube / - baja)
          </label>
          <div className="w-40">
            <Input
              id={`${fid}-1`}
              aria-label="Porcentaje (+ sube / - baja)"
              type="number"
              step="0.5"
              placeholder="Ej: 12"
              value={percent}
              onChange={(e) => setPercent(e.target.value)}
              autoFocus
            />
          </div>
        </div>
        <div>
          <label htmlFor={`${fid}-2`} className="mb-1 block text-sm font-medium text-fg">
            Alcance
          </label>
          <Select
            id={`${fid}-2`}
            aria-label="Alcance"
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            options={[
              { value: '', label: 'Todo el catálogo' },
              ...(cats?.items ?? []).map((c) => ({ value: c.id, label: c.name })),
            ]}
          />
        </div>
        <div>
          <label htmlFor={`${fid}-3`} className="mb-1 block text-sm font-medium text-fg">
            Redondeo
          </label>
          <Select
            id={`${fid}-3`}
            aria-label="Redondeo"
            value={rounding}
            onChange={(e) => setRounding(e.target.value)}
            options={[
              { value: '990', label: 'Terminación $990 (ej: $45.990)' },
              { value: '1000', label: 'Al $1.000 más cercano' },
              { value: '100', label: 'Al $100 más cercano' },
              { value: 'none', label: 'Sin redondeo' },
            ]}
          />
        </div>
      </div>
    </Modal>
  );
}
