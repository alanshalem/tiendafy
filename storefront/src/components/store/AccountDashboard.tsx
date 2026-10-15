'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ChevronRight, Heart, LogOut, MessageCircle, Package, Search } from 'lucide-react';
import { formatMoney, formatDate } from '@tiendafy/types';
import { useAuth } from './auth';
import { useCart } from './cart-context';
import { usePreviewHref } from './preview';
import { SupportChat } from './SupportChat';
import { AuthModal } from './AuthModal';
import { SavedAddresses } from './SavedAddresses';
import { TrackingLink } from './OrderSummary';

import { clientJsonTenant } from '@/lib/api-client';
import { orderStatusLabel, type CarrierTracking } from '@/lib/orders';
import type { MoneyDto } from '@tiendafy/types';

interface OrderItem {
  productName: string;
  variantDescription: string;
  quantity: number;
  unitPrice: MoneyDto;
}
interface Order {
  id: string;
  /** Número de la tienda (#1042); 0 en una respuesta vieja sin número. */
  number?: number;
  label?: string;
  status: string;
  currency: string;
  createdAtUtc: string;
  tracking: string | null;
  /** El seguimiento con el correo y su link, si se sabe. */
  trackingInfo?: CarrierTracking | null;
  /** Retiro en el local: "despachado" quiere decir que ya se puede pasar a buscar. */
  isPickup?: boolean;
  total: MoneyDto;
  items: OrderItem[];
}

/** Botón secundario con los colores de la tienda (se lee en temas oscuros). */
const BTN_OUTLINE =
  'inline-flex items-center gap-1.5 rounded-full border border-[rgb(var(--color-fg)/0.15)] px-3.5 py-1.5 text-xs font-medium hover:bg-[rgb(var(--color-fg)/0.05)]';

export function AccountDashboard() {
  const { user, token, ready, logout } = useAuth();
  const href = usePreviewHref();
  const { tenantId } = useCart();
  // null = cargando; 'error' = no se pudo traer (no es lo mismo que no tener pedidos).
  const [orders, setOrders] = useState<Order[] | 'error' | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [chatOrder, setChatOrder] = useState<string | null>(null);
  const [auth, setAuth] = useState<'login' | 'register' | null>(null);

  useEffect(() => {
    if (!token) {
      setOrders([]);
      return;
    }
    let cancelled = false;
    clientJsonTenant<{ items: Order[] }>('/api/v1/shop/orders', tenantId, {
      credentials: 'include',
    }).then((d) => {
      if (!cancelled) setOrders(d ? (d.items ?? []) : 'error');
    });
    return () => {
      cancelled = true;
    };
  }, [token, tenantId, attempt]);

  const retry = useCallback(() => {
    setOrders(null);
    setAttempt((n) => n + 1);
  }, []);

  if (ready && !user) {
    return (
      <div className="mx-auto max-w-md py-10 text-center">
        <h1 className="text-2xl font-bold" style={{ fontFamily: 'var(--font-heading)' }}>
          Mi cuenta
        </h1>
        <h2 className="mt-6 text-lg font-semibold">Iniciá sesión para ver tu cuenta</h2>
        <p className="mt-2 text-sm text-fg-muted">
          Desde tu cuenta seguís tus pedidos, guardás tus direcciones y tus favoritos.
        </p>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <button
            type="button"
            onClick={() => setAuth('login')}
            className="rounded-md bg-primary px-6 py-2.5 text-sm font-semibold text-primary-fg"
          >
            Iniciar sesión
          </button>
          <button
            type="button"
            onClick={() => setAuth('register')}
            className="rounded-md border border-[rgb(var(--color-fg)/0.2)] px-6 py-2.5 text-sm font-semibold hover:bg-[rgb(var(--color-fg)/0.05)]"
          >
            Crear cuenta
          </button>
        </div>
        <p className="mt-8 text-sm text-fg-muted">
          ¿Compraste sin cuenta?{' '}
          <Link href={href('/seguimiento')} className="font-semibold text-primary-ink hover:underline">
            Seguí tu pedido con tu email y el número
          </Link>
        </p>
        {auth && <AuthModal initialMode={auth} onClose={() => setAuth(null)} />}
      </div>
    );
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[rgb(var(--color-fg)/0.1)] pb-5">
        <div>
          <h1 className="text-2xl font-bold" style={{ fontFamily: 'var(--font-heading)' }}>
            Hola, {user?.name?.split(' ')[0]}
          </h1>
          <p className="text-sm text-fg-muted">{user?.email}</p>
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
        <p className="py-10 text-center text-sm text-fg-muted">Cargando…</p>
      ) : orders === 'error' ? (
        <div
          role="alert"
          className="flex flex-col items-center gap-3 rounded-2xl border border-[rgb(var(--color-fg)/0.12)] py-12 text-center"
        >
          <p className="text-sm">No pudimos cargar tus pedidos.</p>
          <button type="button" onClick={retry} className={BTN_OUTLINE}>
            Reintentar
          </button>
        </div>
      ) : orders.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-[rgb(var(--color-fg)/0.15)] py-16 text-center text-fg-muted">
          <Package className="h-8 w-8" aria-hidden />
          <p className="text-sm">Todavía no hiciste ningún pedido.</p>
          <Link
            href={href('/seguimiento')}
            className="text-xs font-semibold text-primary-ink hover:underline"
          >
            ¿Compraste sin cuenta? Seguí tu pedido
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {orders.map((o) => (
            <OrderCard
              key={o.id}
              order={o}
              detailHref={href(`/cuenta/pedidos/${o.id}`)}
              onChat={() => setChatOrder(o.id)}
            />
          ))}
        </div>
      )}

      <SavedAddresses tenantId={tenantId} />

      {chatOrder && (
        <SupportChat orderId={chatOrder} tenantId={tenantId} onClose={() => setChatOrder(null)} />
      )}
    </div>
  );
}

function OrderCard({
  order: o,
  detailHref,
  onChat,
}: {
  order: Order;
  detailHref: string;
  onChat: () => void;
}) {
  const label = o.label ?? (o.number ? `#${o.number}` : null);
  return (
    <div className="rounded-2xl border border-[rgb(var(--color-fg)/0.12)] p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2.5">
          {label && <span className="font-semibold">Pedido {label}</span>}
          <span className="rounded-full bg-[rgb(var(--color-fg)/0.08)] px-2.5 py-0.5 text-xs font-semibold">
            {orderStatusLabel(o.status, o.isPickup)}
          </span>
          <span className="text-xs text-fg-muted">
            {formatDate(o.createdAtUtc, { day: '2-digit', month: 'short', year: 'numeric' })}
          </span>
        </div>
        <span className="font-bold">{formatMoney(o.total.amount, o.total.currency)}</span>
      </div>
      <ul className="mt-3 space-y-1 text-sm text-fg-muted">
        {o.items.map((i, k) => (
          <li key={k}>
            {i.quantity}× {i.productName}
            {i.variantDescription && i.variantDescription !== 'Única' ? ` · ${i.variantDescription}` : ''}
          </li>
        ))}
      </ul>
      {(o.trackingInfo || o.tracking) && (
        <p className="mt-2 text-xs text-fg-muted">
          Seguimiento:{' '}
          {o.trackingInfo ? (
            <TrackingLink tracking={o.trackingInfo} />
          ) : (
            <span className="font-medium">{o.tracking}</span>
          )}
        </p>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        <Link href={detailHref} className={BTN_OUTLINE}>
          <Search className="h-3.5 w-3.5" aria-hidden /> Ver detalle
          <ChevronRight className="h-3.5 w-3.5" aria-hidden />
          <span className="sr-only">del pedido {label ?? ''}</span>
        </Link>
        {o.status !== 'PENDINGPAYMENT' && o.status !== 'FAILED' && o.status !== 'CANCELLED' && (
          <button type="button" onClick={onChat} className={BTN_OUTLINE}>
            <MessageCircle className="h-3.5 w-3.5" /> Consultar sobre este pedido
          </button>
        )}
      </div>
    </div>
  );
}
