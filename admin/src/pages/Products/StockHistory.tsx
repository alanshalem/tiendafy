import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { EmptyList, Modal, cn } from '@tiendafy/ui';
import { useStore } from '../../context/StoreContext';
import { api } from '../../lib/api';
import { formatDateTime, formatNumber } from '../../lib/format';
import { orderLabel } from '../../lib/orderNumber';
import { qk } from '../../lib/queryKeys';
import { ERROR_SHOWN, LoadError } from '../../components/LoadError';
import { TableSkeleton } from '../../components/Skeleton';

/** Un movimiento del libro de stock (`GET /inventory/{variante}/ledger`). */
export interface StockMovement {
  type: 'Initial' | 'Adjustment' | 'Reserved' | 'ReleaseExpired' | 'Released' | 'Sold';
  /** Cuánto cambió el disponible: negativo sale, positivo entra. */
  quantity: number;
  reason: string | null;
  occurredAtUtc: string;
  /** La venta que reservó o se llevó el stock (las reservas y ventas cobradas). */
  orderId: string | null;
  orderNumber: number | null;
}

interface Ledger {
  items: StockMovement[];
  /** Cuántos movimientos trae como mucho (los más nuevos). */
  limit: number;
}

/**
 * Qué pasó, en palabras del comercio. Las reservas y las ventas no traen
 * motivo: el detalle es la venta, que va como link.
 */
const MOVEMENT_LABEL: Record<StockMovement['type'], string> = {
  Initial: 'Alta de stock',
  Adjustment: 'Ajuste',
  Reserved: 'Apartado por una compra',
  Released: 'Volvió: compra cancelada',
  ReleaseExpired: 'Volvió: no se pagó a tiempo',
  Sold: 'Venta cobrada',
};

/**
 * Lo que se aclara cuando el movimiento no trae motivo. La venta cobrada no
 * mueve el disponible (salió al apartarse), y sin la aclaración ese "—" se
 * lee como un error.
 */
function hintFor(m: StockMovement): string | null {
  if (m.type === 'Sold') return 'Ya se había descontado al apartarse.';
  if (m.type === 'Reserved' && !m.orderId)
    return 'Una compra que todavía no es una venta (o que no llegó a serlo).';
  return null;
}

export interface StockHistoryTarget {
  variantId: string;
  productName: string;
  /** "Rojo / M" o "Única". */
  variantLabel: string;
  sku: string;
}

/**
 * Historial de stock de una variante: cada entrada, ajuste, reserva y venta,
 * del más nuevo al más viejo. Responde la pregunta de todos los días: "¿por
 * qué dice que me quedan 3, si ayer había 8?".
 */
export function StockHistoryModal({
  target,
  onClose,
}: {
  target: StockHistoryTarget | null;
  onClose: () => void;
}) {
  return (
    <Modal open={!!target} onClose={onClose} title="Historial de stock" placement="right">
      {target && <StockHistoryBody target={target} />}
    </Modal>
  );
}

function StockHistoryBody({ target }: { target: StockHistoryTarget }) {
  const { store } = useStore();
  const { data, error, isLoading, refetch, isFetching } = useQuery({
    queryKey: qk.inventoryLedger(store?.id, target.variantId),
    queryFn: () => api.get<Ledger>(`/api/v1/inventory/${target.variantId}/ledger`),
    enabled: !!store,
    meta: ERROR_SHOWN,
  });

  return (
    <div className="space-y-4">
      <div className="text-sm">
        <p className="font-medium text-fg">{target.productName}</p>
        <p className="text-fg-muted">
          {target.variantLabel}
          {target.sku ? ` · SKU ${target.sku}` : ''}
        </p>
      </div>

      {isLoading ? (
        <TableSkeleton rows={5} label="Cargando el historial…" />
      ) : error ? (
        <LoadError
          title="No se pudo cargar el historial de stock."
          error={error}
          onRetry={() => void refetch()}
          retrying={isFetching}
        />
      ) : !data || data.items.length === 0 ? (
        <EmptyList title="Sin movimientos todavía">
          Cuando cargues stock, lo ajustes o se venda, cada cambio va a quedar anotado acá.
        </EmptyList>
      ) : (
        <>
          <ol className="divide-y divide-border rounded-lg border border-border">
            {data.items.map((m, i) => (
              <MovementRow key={`${m.occurredAtUtc}-${i}`} movement={m} />
            ))}
          </ol>
          {data.items.length >= data.limit && (
            <p className="text-xs text-fg-muted">
              Se muestran los últimos {formatNumber(data.limit)} movimientos.
            </p>
          )}
        </>
      )}
    </div>
  );
}

function MovementRow({ movement: m }: { movement: StockMovement }) {
  const detail = m.reason ?? hintFor(m);
  return (
    <li className="flex items-start gap-3 px-3 py-2.5 text-sm">
      <div className="min-w-0 flex-1">
        <p className="font-medium text-fg">
          {MOVEMENT_LABEL[m.type] ?? m.type}
          {m.orderId && (
            <>
              {' · '}
              <Link to={`/ventas?order=${m.orderId}`} className="text-primary hover:underline">
                Venta {orderLabel({ id: m.orderId, number: m.orderNumber })}
              </Link>
            </>
          )}
        </p>
        {detail && <p className="text-fg-muted">{detail}</p>}
        <p className="text-xs text-fg-subtle">{formatDateTime(m.occurredAtUtc)}</p>
      </div>
      <Delta quantity={m.quantity} />
    </li>
  );
}

/** El cambio en el disponible: +5 en verde, −2 en rojo, nada si no cambió. */
function Delta({ quantity }: { quantity: number }) {
  if (quantity === 0)
    return (
      <span className="shrink-0 tabular-nums text-fg-subtle">
        <span aria-hidden>—</span>
        <span className="sr-only">Sin cambio en el disponible</span>
      </span>
    );
  const units = formatNumber(Math.abs(quantity));
  return (
    <span
      className={cn('shrink-0 font-semibold tabular-nums', quantity > 0 ? 'text-success' : 'text-danger')}
    >
      <span aria-hidden>
        {quantity > 0 ? '+' : '−'}
        {units}
      </span>
      <span className="sr-only">{quantity > 0 ? `Entraron ${units}` : `Salieron ${units}`}</span>
    </span>
  );
}
