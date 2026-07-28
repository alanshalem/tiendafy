'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Heart, LogOut, MessageCircle, Package } from 'lucide-react';
import { formatMoney, formatDate } from '@tiendafy/types';
import { useAuth } from './auth';
import { useCart } from './cart';
import { usePreviewHref } from './preview';
import { EmptyState } from './EmptyState';
import { SupportChat } from './SupportChat';

import { clientJson } from '@/lib/api-client';

interface OrderItem {
  productName: string;
  variantDescription: string;
  quantity: number;
  unitPrice: { amount: number; currency: string };
}
interface Order {
  id: string;
  status: string;
  currency: string;
  createdAtUtc: string;
  tracking: string | null;
  total: { amount: number; currency: string };
  items: OrderItem[];
}

const STATUS: Record<string, { label: string; cls: string }> = {
  PENDINGPAYMENT: { label: 'Pago pendiente', cls: 'bg-amber-100 text-amber-700' },
  PAID: { label: 'Pagado', cls: 'bg-green-100 text-green-700' },
  FULFILLED: { label: 'Enviado', cls: 'bg-blue-100 text-blue-700' },
  REFUNDED: { label: 'Reembolsado', cls: 'bg-gray-200 text-gray-700' },
  FAILED: { label: 'Fallido', cls: 'bg-red-100 text-red-700' },
  CANCELLED: { label: 'Cancelado', cls: 'bg-gray-200 text-gray-700' },
  CHARGEDBACK: { label: 'Contracargo', cls: 'bg-red-100 text-red-700' },
};

const money = formatMoney;

export function AccountDashboard() {
  const { user, token, ready, logout } = useAuth();
  const href = usePreviewHref();
  const { tenantId } = useCart();
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [chatOrder, setChatOrder] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setOrders([]);
      return;
    }
    let cancelled = false;
    clientJson<{ items: Order[] }>('/api/v1/shop/orders', {
      headers: { 'X-Tenant-Id': tenantId },
      credentials: 'include',
    }).then((d) => {
      if (!cancelled) setOrders(d?.items ?? []);
    });
    return () => {
      cancelled = true;
    };
  }, [token, tenantId]);

  if (ready && !user) {
    return (
      <EmptyState
        title="Iniciá sesión para ver tu cuenta"
        message="Desde tu cuenta seguís tus pedidos y favoritos."
        cta={{ href: href('/'), label: 'Volver al inicio' }}
      />
    );
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-black/10 pb-5">
        <div>
          <h1 className="text-2xl font-bold" style={{ fontFamily: 'var(--font-heading)' }}>
            Hola, {user?.name?.split(' ')[0]}
          </h1>
          <p className="text-sm opacity-60">{user?.email}</p>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <Link
            href={href('/favoritos')}
            className="inline-flex items-center gap-1.5 opacity-80 hover:opacity-100"
          >
            <Heart className="h-4 w-4" /> Favoritos
          </Link>
          <button
            onClick={() => logout()}
            className="inline-flex items-center gap-1.5 opacity-80 hover:opacity-100"
          >
            <LogOut className="h-4 w-4" /> Salir
          </button>
        </div>
      </div>

      <h2 className="mt-6 mb-3 text-lg font-bold">Mis pedidos</h2>
      {orders === null ? (
        <p className="py-10 text-center text-sm opacity-60">Cargando…</p>
      ) : orders.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-black/10 py-16 text-center opacity-70">
          <Package className="h-8 w-8 opacity-50" />
          <p className="text-sm">Todavía no hiciste ningún pedido.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {orders.map((o) => {
            const st = STATUS[o.status] ?? { label: o.status, cls: 'bg-gray-200 text-gray-700' };
            return (
              <div key={o.id} className="rounded-2xl border border-black/10 p-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${st.cls}`}>
                      {st.label}
                    </span>
                    <span className="text-xs opacity-50">
                      {formatDate(o.createdAtUtc, { day: '2-digit', month: 'short', year: 'numeric' })}
                    </span>
                  </div>
                  <span className="font-bold">{money(o.total.amount, o.total.currency)}</span>
                </div>
                <ul className="mt-3 space-y-1 text-sm opacity-75">
                  {o.items.map((i, k) => (
                    <li key={k}>
                      {i.quantity}× {i.productName}
                      {i.variantDescription && i.variantDescription !== 'Única'
                        ? ` · ${i.variantDescription}`
                        : ''}
                    </li>
                  ))}
                </ul>
                {o.tracking && (
                  <p className="mt-2 text-xs opacity-60">
                    Seguimiento: <span className="font-medium">{o.tracking}</span>
                  </p>
                )}
                {o.status !== 'PENDINGPAYMENT' && o.status !== 'FAILED' && o.status !== 'CANCELLED' && (
                  <button
                    onClick={() => setChatOrder(o.id)}
                    className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-black/15 px-3.5 py-1.5 text-xs font-medium hover:bg-black/5"
                  >
                    <MessageCircle className="h-3.5 w-3.5" /> Consultar sobre este pedido
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {chatOrder && (
        <SupportChat orderId={chatOrder} tenantId={tenantId} onClose={() => setChatOrder(null)} />
      )}
    </div>
  );
}
