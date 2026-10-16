import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Bell } from 'lucide-react';
import { Badge, Table, type TableColumn, EmptyList, PageHeader } from '@tiendafy/ui';
import { formatDateTime } from '@tiendafy/types';
import { useStore } from '../../context/StoreContext';
import { usePermissions } from '../../context/PermissionsContext';
import { api } from '../../lib/api';
import { NoStoreSelected } from '../../components/NoStoreSelected';
import { HelpLink } from '../../components/HelpLink';
import { Pagination, pageRangeLabel } from '../../components/Pagination';
import { TableSkeleton } from '../../components/Skeleton';
import { usePageParam } from '../../lib/useListParams';

interface StockAlertRow {
  productId: string;
  variantId: string;
  productName: string;
  variantLabel: string | null;
  sku: string | null;
  waiting: number;
  sinceUtc: string;
  available: number;
}

interface StockAlertsResponse {
  items: StockAlertRow[];
  total: number;
  totalWaiting: number;
}

const PAGE_SIZE = 25;

/**
 * "Avisame cuando ingrese": cuánta gente espera cada variante agotada. Es la
 * demanda que la tienda no veía (el botón de "Sin stock" la perdía) y la
 * lista de qué conviene reponer primero. Cuando entra stock, el aviso sale
 * solo: acá no hay nada que mandar a mano.
 */
export function StockAlertsPage() {
  const { store } = useStore();
  const [page, setPage] = usePageParam();
  const { data, isLoading } = useQuery({
    queryKey: ['back-in-stock', store?.id, page],
    queryFn: () =>
      api.get<StockAlertsResponse>(
        `/api/v1/admin/back-in-stock?offset=${(page - 1) * PAGE_SIZE}&limit=${PAGE_SIZE}`,
      ),
    enabled: !!store,
    placeholderData: keepPreviousData,
  });

  if (!store) return <NoStoreSelected />;
  const totalPages = Math.max(1, Math.ceil((data?.total ?? 0) / PAGE_SIZE));

  const columns: TableColumn<StockAlertRow>[] = [
    {
      key: 'product',
      header: 'Producto',
      cell: (r) => (
        <div className="min-w-0">
          <Link to={`/productos/${r.productId}/editar`} className="font-medium text-primary hover:underline">
            {r.productName}
          </Link>
          {(r.variantLabel || r.sku) && (
            <div className="text-xs text-fg-subtle">
              {[r.variantLabel, r.sku].filter(Boolean).join(' · ')}
            </div>
          )}
        </div>
      ),
    },
    {
      key: 'waiting',
      header: 'Esperando',
      align: 'right',
      cell: (r) => <span className="font-semibold tabular-nums">{r.waiting}</span>,
    },
    { key: 'since', header: 'Desde', cell: (r) => formatDateTime(r.sinceUtc) },
    {
      key: 'available',
      header: 'Stock hoy',
      align: 'right',
      cell: (r) =>
        r.available > 0 ? (
          <Badge variant="success">{r.available} · se avisa en minutos</Badge>
        ) : (
          <Badge variant="neutral">Agotado</Badge>
        ),
    },
  ];

  return (
    <div>
      <PageHeader
        className="mb-5"
        title="Avisame cuando ingrese"
        subtitle="Quién espera cada producto agotado. Cuando entra stock, les avisamos por email una sola vez."
        count={
          (data?.totalWaiting ?? 0) > 0 && (
            <>
              <strong className="text-fg">{data!.totalWaiting}</strong>{' '}
              {data!.totalWaiting === 1 ? 'persona esperando' : 'personas esperando'} ·{' '}
              {pageRangeLabel(page, PAGE_SIZE, data!.total, data!.total === 1 ? 'variante' : 'variantes')}
            </>
          )
        }
      />

      {isLoading ? (
        <div className="rounded-lg border border-border bg-surface">
          <TableSkeleton label="Cargando la demanda…" />
        </div>
      ) : (data?.items.length ?? 0) === 0 ? (
        <EmptyList icon={<Bell />}>Nadie está esperando un producto agotado.</EmptyList>
      ) : (
        <Table columns={columns} rows={data!.items} rowKey={(r) => r.variantId} />
      )}

      <Pagination page={Math.min(page, totalPages)} totalPages={totalPages} onPage={setPage} />
      <HelpLink id="avisoStock" />
    </div>
  );
}

/**
 * En la edición del producto: cuánta gente lo espera. Solo si la persona ve
 * el stock (el mismo permiso que la pantalla de la demanda).
 */
export function ProductWaitingNotice({ productId }: { productId: string }) {
  const { store } = useStore();
  const { can } = usePermissions();
  const allowed = can('inventory.read');
  const { data } = useQuery({
    queryKey: ['back-in-stock', store?.id, 'product', productId],
    queryFn: () => api.get<{ waiting: number }>(`/api/v1/admin/back-in-stock/products/${productId}`),
    enabled: !!store && allowed,
  });
  if (!allowed || !data || data.waiting === 0) return null;
  return (
    <Link
      to="/productos/esperando"
      className="inline-flex items-center gap-1.5 rounded-full bg-info-bg px-3 py-1 text-xs font-medium text-info hover:underline"
    >
      <Bell className="h-3.5 w-3.5" />
      {data.waiting === 1 ? '1 persona espera que vuelva' : `${data.waiting} personas esperan que vuelva`}
    </Link>
  );
}
