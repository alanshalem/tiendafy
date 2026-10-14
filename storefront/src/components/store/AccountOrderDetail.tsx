'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, FileText, Loader2, MessageCircle, RotateCcw, ShoppingCart, Undo2 } from 'lucide-react';
import { useAuth } from './auth';
import { useCart } from './cart';
import { usePreviewHref } from './preview';
import { SupportChat } from './SupportChat';
import { OrderSummary, OrderTimeline } from './OrderSummary';
import { OrderPaymentInstructions } from './OrderPaymentInstructions';
import { EmptyState } from './EmptyState';
import { API_URL, tenantHeaders } from '@/lib/api-client';
import { repentHref, type OrderView } from '@/lib/orders';

const BTN =
  'inline-flex items-center gap-2 rounded-md border border-[rgb(var(--color-fg)/0.18)] px-4 py-2.5 text-sm font-medium hover:bg-[rgb(var(--color-fg)/0.05)] disabled:opacity-60';

type State = { kind: 'loading' } | { kind: 'missing' } | { kind: 'error' } | { kind: 'ok'; order: OrderView };

/**
 * El detalle de un pedido en "Mi cuenta": qué compró, cuánto pagó, cómo
 * llega y en qué está, con la factura, "volver a comprar" y el
 * arrepentimiento a mano.
 */
export function AccountOrderDetail({ orderId }: { orderId: string }) {
  const { user, ready } = useAuth();
  const href = usePreviewHref();
  const { tenantId, add, refreshPrices, setOpen } = useCart();
  const [state, setState] = useState<State>({ kind: 'loading' });
  const [chat, setChat] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    let active = true;
    fetch(`${API_URL}/api/v1/shop/orders/${orderId}`, {
      headers: tenantHeaders(tenantId),
      credentials: 'include',
    })
      .then(async (r) => {
        if (!active) return;
        if (r.ok) setState({ kind: 'ok', order: (await r.json()) as OrderView });
        else setState({ kind: r.status === 404 ? 'missing' : 'error' });
      })
      .catch(() => active && setState({ kind: 'error' }));
    return () => {
      active = false;
    };
  }, [orderId, tenantId, user]);

  const back = (
    <Link
      href={href('/cuenta')}
      className="inline-flex items-center gap-1.5 text-sm text-fg-muted hover:underline"
    >
      <ArrowLeft className="h-4 w-4" aria-hidden /> Mis pedidos
    </Link>
  );

  if (ready && !user) {
    return (
      <EmptyState
        title="Iniciá sesión para ver este pedido"
        message="El detalle de tus pedidos está en tu cuenta. ¿Compraste sin cuenta? Seguilo con tu email y el número."
        cta={{ href: href('/seguimiento'), label: 'Seguí tu pedido' }}
      />
    );
  }
  if (state.kind === 'loading') return <p className="py-16 text-center text-sm text-fg-muted">Cargando…</p>;
  if (state.kind !== 'ok') {
    return (
      <div>
        {back}
        <EmptyState
          title={state.kind === 'missing' ? 'No encontramos este pedido' : 'No pudimos cargar el pedido'}
          message={
            state.kind === 'missing'
              ? 'Puede que sea de otra cuenta. Revisá la lista de tus pedidos.'
              : 'Probá de nuevo en un rato.'
          }
          cta={{ href: href('/cuenta'), label: 'Volver a mi cuenta' }}
        />
      </div>
    );
  }

  const { order } = state;

  // Los mismos productos al carrito, con el precio de entonces como punto de
  // partida: refreshPrices trae el de hoy y avisa si cambió o si ya no hay.
  const buyAgain = async () => {
    for (const i of order.items) {
      add(
        {
          variantId: i.variantId,
          productName: i.productName,
          variantLabel: i.variantDescription,
          priceAmount: i.unitPrice.amount,
          currency: i.unitPrice.currency,
          image: i.image,
        },
        i.quantity,
      );
    }
    setOpen(true);
    await refreshPrices();
  };

  // La factura sale de la API con la sesión y la tienda en headers: un link
  // común no los manda, así que se baja y se ofrece como archivo.
  const downloadInvoice = async () => {
    setDownloading(true);
    setDownloadError(null);
    try {
      const res = await fetch(`${API_URL}/api/v1/shop/orders/${order.id}/invoice.pdf`, {
        headers: tenantHeaders(tenantId),
        credentials: 'include',
      });
      if (!res.ok) throw new Error(String(res.status));
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement('a');
      a.href = url;
      a.download = `factura-pedido-${order.number || order.id.slice(0, 8)}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setDownloadError('No se pudo descargar la factura. Probá de nuevo.');
    } finally {
      setDownloading(false);
    }
  };

  const canChat = !['PENDINGPAYMENT', 'FAILED', 'CANCELLED'].includes(order.status);

  return (
    <div className="mx-auto max-w-2xl">
      {back}
      <h1 className="mt-3 text-2xl font-bold" style={{ fontFamily: 'var(--font-heading)' }}>
        Pedido {order.label}
      </h1>

      <div className="mt-5 grid gap-4">
        <OrderTimeline steps={order.timeline} />
        <OrderSummary order={order}>
          <OrderPaymentInstructions order={order} />
        </OrderSummary>
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        <button type="button" onClick={buyAgain} className={BTN}>
          <ShoppingCart className="h-4 w-4" aria-hidden /> Volver a comprar
        </button>
        {order.invoiceAvailable && (
          <button type="button" onClick={downloadInvoice} disabled={downloading} className={BTN}>
            {downloading ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <FileText className="h-4 w-4" aria-hidden />
            )}
            Descargar factura
          </button>
        )}
        {canChat && (
          <button type="button" onClick={() => setChat(true)} className={BTN}>
            <MessageCircle className="h-4 w-4" aria-hidden /> Consultar sobre este pedido
          </button>
        )}
        {order.canRepent && (
          <Link href={href(repentHref(order.number || order.label))} className={BTN}>
            <Undo2 className="h-4 w-4" aria-hidden /> Arrepentirme / devolver
          </Link>
        )}
      </div>
      {downloadError && (
        <p role="alert" className="mt-2 inline-flex items-center gap-1.5 text-sm text-red-500">
          <RotateCcw className="h-4 w-4" aria-hidden /> {downloadError}
        </p>
      )}

      {chat && <SupportChat orderId={order.id} tenantId={tenantId} onClose={() => setChat(false)} />}
    </div>
  );
}
