import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Check, CheckCircle2, Loader2, PackageCheck, Truck, XCircle } from 'lucide-react';
import { Button, Card, cn, Input, useToast } from '@tiendafy/ui';
import { api, errMsg } from '../lib/api';
import { CARRIERS, type DispatchOrder } from '../lib/fulfillment';
import { CameraBox, useScanner } from './Products/Scanner';

/** Lo que pasó con cada pedido de esta tanda (el registro de la sesión). */
interface LogEntry {
  number: string;
  ok: boolean;
  message: string;
}

const STATUS_TEXT: Record<string, string> = {
  FULFILLED: 'ya está despachado',
  PENDINGPAYMENT: 'todavía no está cobrado',
  REFUNDED: 'tiene un reembolso',
  PARTIALLYREFUNDED: 'tiene un reembolso parcial',
  CANCELLED: 'está cancelado',
};

/**
 * Despachar escaneando: primero el pedido (el QR del remito o el número de la
 * etiqueta), después cada producto. Lo equivocado suena al toque; lo
 * completo se despacha con el seguimiento. El servidor vuelve a contar todo
 * antes de marcarlo enviado: el celular no es la última palabra.
 */
export function ScanDispatch({ initialCode }: { initialCode: string | null }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [order, setOrder] = useState<DispatchOrder | null>(null);
  const [picked, setPicked] = useState<Record<string, number>>({});
  const [tracking, setTracking] = useState('');
  const [manual, setManual] = useState('');
  const [resolving, setResolving] = useState(false);
  const [dispatching, setDispatching] = useState(false);
  const [log, setLog] = useState<LogEntry[]>([]);

  const resolveOrder = async (code: string) => {
    setResolving(true);
    try {
      const found = await api.get<DispatchOrder>(
        `/api/v1/fulfillment/orders/resolve?code=${encodeURIComponent(code)}`,
      );
      if (found.status !== 'PAID') {
        toast(`El pedido ${found.number} ${STATUS_TEXT[found.status] ?? 'no está para despachar'}.`, {
          variant: 'error',
        });
        return;
      }
      setOrder(found);
      setPicked({});
      setTracking(found.tracking ?? '');
    } catch (err) {
      toast(errMsg(err, 'No hay ninguna venta con ese código.'), { variant: 'error' });
    } finally {
      setResolving(false);
    }
  };

  // Viniendo de la cola ("Escanear" en un pedido), el pedido ya está elegido.
  const started = useRef(false);
  useEffect(() => {
    if (!initialCode || started.current) return;
    started.current = true;
    void resolveOrder(initialCode);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo al entrar
  }, [initialCode]);

  // useScanner guarda siempre el callback más reciente: ve el pedido y lo juntado de este render.
  const onCode = (raw: string) => {
    const code = raw.trim();
    if (!code) return;
    if (!order) {
      void resolveOrder(code);
      return;
    }
    const item = order.items.find((i) => i.barcode === code || i.sku === code);
    if (!item) {
      toast(`⚠ ${code} NO va en el pedido ${order.number}`, { variant: 'error' });
      return;
    }
    const got = picked[item.variantId] ?? 0;
    if (got >= item.quantity) {
      toast(`Ya juntaste las ${item.quantity} de ${item.productName}: sobra una.`, { variant: 'error' });
      return;
    }
    setPicked((p) => ({ ...p, [item.variantId]: got + 1 }));
  };
  const scanner = useScanner(onCode);

  const complete = !!order && order.items.every((i) => (picked[i.variantId] ?? 0) >= i.quantity);
  const units = order?.items.reduce((s, i) => s + i.quantity, 0) ?? 0;
  const gotUnits = order?.items.reduce((s, i) => s + Math.min(picked[i.variantId] ?? 0, i.quantity), 0) ?? 0;

  const reset = () => {
    setOrder(null);
    setPicked({});
    setTracking('');
  };

  const dispatch = async () => {
    if (!order || !complete) return;
    setDispatching(true);
    try {
      await api.post('/api/v1/fulfillment/scan-dispatch', {
        orderId: order.id,
        scans: order.items.map((i) => ({ variantId: i.variantId, quantity: picked[i.variantId] ?? 0 })),
        tracking: tracking.trim() || null,
      });
      setLog((l) => [{ number: order.number, ok: true, message: 'Despachado' }, ...l]);
      toast(`${order.number} despachado. El comprador ya recibió el aviso.`, { variant: 'success' });
      void queryClient.invalidateQueries({ queryKey: ['fulfillment-queue'] });
      reset();
    } catch (err) {
      const message = errMsg(err, 'No se pudo despachar.');
      setLog((l) => [{ number: order.number, ok: false, message }, ...l]);
      toast(message, { variant: 'error' });
    } finally {
      setDispatching(false);
    }
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_18rem]">
      <Card>
        <p className="text-sm text-fg-muted">
          {order
            ? `Escaneá cada producto del pedido ${order.number} al meterlo en la caja.`
            : 'Escaneá el QR del remito o el número de la etiqueta del pedido.'}
        </p>
        <div className="mt-3">
          <CameraBox {...scanner} />
        </div>
        <form
          className="mt-2 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            onCode(manual);
            setManual('');
          }}
        >
          <Input
            aria-label={order ? 'Código del producto' : 'Código del pedido'}
            placeholder={order ? 'Código de barras o SKU…' : 'Número del pedido (#A1B2C3D4)…'}
            value={manual}
            onChange={(e) => setManual(e.target.value)}
          />
          <Button type="submit" variant="secondary" disabled={resolving}>
            {resolving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'OK'}
          </Button>
        </form>

        {order && (
          <div className="mt-4 space-y-3">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="font-mono font-semibold">{order.number}</span>
              <span className="text-fg-muted">{order.buyerName ?? order.buyerEmail}</span>
              <span className="text-fg-subtle">· {CARRIERS[order.carrier]}</span>
              <span className="ml-auto tabular-nums text-fg-muted" role="status">
                {gotUnits}/{units} unidades
              </span>
              <Button size="sm" variant="ghost" onClick={reset}>
                Cambiar de pedido
              </Button>
            </div>
            <ul className="space-y-1.5">
              {order.items.map((i) => {
                const got = picked[i.variantId] ?? 0;
                const done = got >= i.quantity;
                return (
                  <li
                    key={i.variantId}
                    className={cn(
                      'flex items-center gap-3 rounded-md border px-3 py-2 text-sm',
                      done ? 'border-success/40 bg-success/10' : 'border-border',
                    )}
                  >
                    <span className="w-14 shrink-0 font-mono text-xs text-fg-subtle">
                      {i.location ?? '—'}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-fg">
                      {i.productName}
                      {i.variantDescription && i.variantDescription !== 'Única' && (
                        <span className="text-fg-muted"> · {i.variantDescription}</span>
                      )}
                      <span className="ml-1 font-mono text-xs text-fg-subtle">{i.sku}</span>
                    </span>
                    <span className={cn('tabular-nums', done ? 'text-success' : 'text-fg')}>
                      {done && <Check className="mr-1 inline h-4 w-4" />}
                      {got}/{i.quantity}
                    </span>
                  </li>
                );
              })}
            </ul>
            {complete && (
              <div className="rounded-md border border-success/40 bg-success/10 p-3">
                <p className="flex items-center gap-1.5 text-sm font-medium text-success">
                  <PackageCheck className="h-4 w-4" /> Pedido completo y verificado.
                </p>
                <div className="mt-2 flex flex-wrap items-end gap-2">
                  <div className="min-w-[12rem] flex-1">
                    <Input
                      compact
                      aria-label="Número de seguimiento"
                      placeholder={
                        order.isPickup ? 'Retiro en el local (sin seguimiento)' : 'Número de seguimiento'
                      }
                      value={tracking}
                      onChange={(e) => setTracking(e.target.value)}
                    />
                  </div>
                  <Button onClick={() => void dispatch()} disabled={dispatching}>
                    {dispatching ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Truck className="h-4 w-4" />
                    )}
                    {order.isPickup ? 'Lista para retirar' : 'Despachar'}
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </Card>

      <Card>
        <h2 className="text-sm font-semibold text-fg">En esta tanda</h2>
        {log.length === 0 ? (
          <p className="mt-2 text-xs text-fg-muted">Lo que despaches acá queda anotado, con los errores.</p>
        ) : (
          <>
            <p className="mt-1 text-xs text-fg-muted" role="status">
              {log.filter((l) => l.ok).length} despachados · {log.filter((l) => !l.ok).length} con error
            </p>
            <ul className="mt-2 space-y-1.5 text-sm">
              {log.map((l, i) => (
                <li key={`${l.number}-${i}`} className="flex gap-2">
                  {l.ok ? (
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                  ) : (
                    <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-danger" />
                  )}
                  <span className="min-w-0">
                    <span className="font-mono text-xs">{l.number}</span>{' '}
                    <span className={cn('text-xs', l.ok ? 'text-fg-muted' : 'text-danger')}>{l.message}</span>
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
      </Card>
    </div>
  );
}
