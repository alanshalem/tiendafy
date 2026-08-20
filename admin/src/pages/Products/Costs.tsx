import { useState } from 'react';
import { Loader2, TrendingUp } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, Card, Input, Modal, Select, useConfirm, useToast } from '@tiendafy/ui';
import { useStore } from '../../context/StoreContext';
import { api, errMsg } from '../../lib/api';
import type { CatalogProduct } from '../../lib/products';
import { formatMoney } from '../../lib/format';
import { Pagination } from '../../components/Pagination';
import { InfoDot } from '../../components/charts';
import { ListStats } from '../../components/stats/ListStats';
import { useCatalogHealth } from './queries';
import { useDebouncedValue } from '../../lib/useDebouncedValue';
import { HelpLink } from '../../components/HelpLink';
import { EmptyState } from '../../components/EmptyState';
import { NoStoreSelected } from '../../components/NoStoreSelected';

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

export function CostsPage() {
  const { store } = useStore();
  const { data: health } = useCatalogHealth();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [search, setSearch] = useState('');
  const [repriceOpen, setRepriceOpen] = useState(false);

  const [page, setPage] = useState(1);
  const q = useDebouncedValue(search).trim();

  // Una página del catálogo por request, con la búsqueda hecha en la base:
  // antes se traía el catálogo COMPLETO (de a 100 por request) para filtrar y
  // paginar en el navegador.
  const { data, isLoading } = useQuery({
    queryKey: ['products-page', store?.id, q, page],
    queryFn: () => {
      const params = new URLSearchParams({
        limit: String(PAGE_SIZE),
        offset: String((page - 1) * PAGE_SIZE),
      });
      if (q) params.set('q', q);
      return api.get<{ items: CatalogProduct[]; total: number }>(`/api/v1/products?${params}`);
    },
    enabled: !!store,
  });

  const items = data?.items ?? [];
  const totalPages = Math.max(1, Math.ceil((data?.total ?? 0) / PAGE_SIZE));
  const pageIds = items.map((p) => p.id).join(',');

  // Costos de los productos visibles en UN request (endpoint admin bulk con
  // permiso — el DTO público del catálogo no trae costo a propósito).
  const { data: costRows } = useQuery({
    queryKey: ['variant-costs', store?.id, pageIds],
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
      queryClient.invalidateQueries({ queryKey: ['variant-costs', store?.id] });
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
        kicker="Costos"
        title="Primero, productos"
        body="Cuando cargues productos vas a poder cargar el costo de cada variante y ver tu ganancia real."
      />
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Costos</h1>
        <p className="mt-0.5 text-sm text-fg-muted">
          Cuánto te cuesta cada variante (en pesos). Con el costo cargado, Estadísticas → Rentabilidad muestra
          tu ganancia real por venta. Para cargar en masa usá la columna «Costo» del CSV.
        </p>
      </div>

      {health && health.variants > 0 && (
        <ListStats
          items={[
            {
              label: 'Costos cargados',
              value: `${Math.round((health.variantsWithCost / health.variants) * 100)}%`,
              hint: `${health.variantsWithCost} de ${health.variants} variantes. La rentabilidad solo mira las que tienen costo.`,
              tone: health.variantsWithoutCost > 0 ? 'warning' : 'success',
            },
            {
              label: 'Margen promedio',
              value: `${health.averageMarginPct}%`,
              hint: 'Cuánto queda del precio de venta después del costo, promediando las variantes con costo cargado. No descuenta comisiones ni envío.',
            },
            {
              label: 'Margen bajo (< 15 %)',
              value: health.lowMarginVariants.toLocaleString('es-AR'),
              hint: 'Variantes donde el costo se come casi todo el precio. Candidatas a repreciar.',
              tone: health.lowMarginVariants > 0 ? 'danger' : 'success',
            },
            {
              label: 'Falta cargar',
              value: health.variantsWithoutCost.toLocaleString('es-AR'),
              hint: 'Variantes sin costo. Cargalas acá o con la columna «Costo» del CSV.',
            },
          ]}
        />
      )}

      <div className="flex gap-2">
        <div className="min-w-0 flex-1">
          <Input
            placeholder="Buscar por producto o SKU…"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
        </div>
        <Button variant="secondary" className="shrink-0" onClick={() => setRepriceOpen(true)}>
          <TrendingUp className="h-4 w-4" /> Repreciar en masa
        </Button>
      </div>

      <Card flush>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
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
                <th className="px-4 py-2.5" />
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
                        {margin != null ? `${margin}%` : '—'}
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="mx-auto w-28 shrink-0">
                          <Input
                            compact
                            type="number"
                            min={0}
                            step="0.01"
                            className="text-right"
                            value={value}
                            placeholder="Sin costo"
                            onChange={(e) => setDrafts((d) => ({ ...d, [variant.id]: e.target.value }))}
                          />
                        </div>
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <Button
                          size="sm"
                          variant="secondary"
                          disabled={!changed || save.isPending}
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

// ---- Repreciacion masiva -----------------------------------------------------

/**
 * Llego el contenedor con dolar nuevo: +X% a todo el catalogo (o a una
 * categoria) con redondeo comercial, en dos clicks.
 */
function RepriceModal({ onClose }: { onClose: () => void }) {
  const { store } = useStore();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const confirm = useConfirm();
  const [percent, setPercent] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [rounding, setRounding] = useState('990');
  const [busy, setBusy] = useState(false);

  const { data: cats } = useQuery({
    queryKey: ['categories', store?.id],
    queryFn: () => api.get<{ items: { id: string; name: string }[] }>('/api/v1/categories'),
    enabled: !!store,
  });

  const apply = async () => {
    const pct = Number(percent);
    if (!Number.isFinite(pct) || pct === 0) {
      toast('Ingresa un porcentaje distinto de cero.', { variant: 'error' });
      return;
    }
    const ok = await confirm({
      title: 'Repreciar en masa',
      message: `Se ${pct > 0 ? 'aumentan' : 'bajan'} los precios ${Math.abs(pct)}%${categoryId ? ' de la categoria elegida' : ' de TODO el catalogo'}. Impacta en la tienda al instante y no se puede deshacer en bloque.`,
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
      queryClient.invalidateQueries({ queryKey: ['products', store?.id] });
      queryClient.invalidateQueries({ queryKey: ['variant-costs', store?.id] });
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
      title="Repreciar en masa"
      size="md"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={apply} disabled={busy || !percent}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" />} Repreciar
          </Button>
        </>
      }
    >
      <p className="text-sm text-fg-muted">
        Sube (o baja) todos los precios en un porcentaje, con redondeo comercial. Los precios tachados de
        oferta se ajustan igual, asi la promo mantiene su descuento relativo.
      </p>
      <div className="mt-4 space-y-3">
        <div>
          <label className="mb-1 block text-sm font-medium text-fg">Porcentaje (+ sube / - baja)</label>
          <div className="w-40">
            <Input
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
          <label className="mb-1 block text-sm font-medium text-fg">Alcance</label>
          <Select
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            options={[
              { value: '', label: 'Todo el catalogo' },
              ...(cats?.items ?? []).map((c) => ({ value: c.id, label: c.name })),
            ]}
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-fg">Redondeo</label>
          <Select
            value={rounding}
            onChange={(e) => setRounding(e.target.value)}
            options={[
              { value: '990', label: 'Terminacion $990 (ej: $45.990)' },
              { value: '1000', label: 'Al $1.000 mas cercano' },
              { value: '100', label: 'Al $100 mas cercano' },
              { value: 'none', label: 'Sin redondeo' },
            ]}
          />
        </div>
      </div>
    </Modal>
  );
}
