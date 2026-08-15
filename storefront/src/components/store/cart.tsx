'use client';

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { X, Truck, ShoppingCart, Minus, Plus, Tag } from 'lucide-react';
import { formatMoney } from '@tiendafy/types';

import { API_URL as CART_API } from '@/lib/api-client';
import { readJson, writeJson } from '@/lib/storage';
import { InitialFallback } from './InitialFallback';
import { useFocusTrap } from './useFocusTrap';

export interface CartLine {
  variantId: string;
  productName: string;
  variantLabel: string;
  priceAmount: number; // centavos
  currency: string;
  image: string | null;
  quantity: number;
}

interface CartContextValue {
  lines: CartLine[];
  count: number;
  totalAmount: number;
  currency: string;
  tenantId: string;
  add: (line: Omit<CartLine, 'quantity'>, qty?: number) => void;
  setQty: (variantId: string, qty: number) => void;
  remove: (variantId: string) => void;
  open: boolean;
  setOpen: (open: boolean) => void;
}

const CartContext = createContext<CartContextValue | null>(null);

export function useCart(): CartContextValue {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart must be used inside <CartProvider>');
  return ctx;
}

export function CartProvider({ storeKey, children }: { storeKey: string; children: ReactNode }) {
  const key = `tiendafy.cart.${storeKey}`;
  const [lines, setLines] = useState<CartLine[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setLines(readJson<CartLine[]>(key, []));
  }, [key]);

  // Persistencia SINCRÓNICA en cada mutación (no en un useEffect post-render):
  // "Comprar ahora" agrega y navega al instante — si el write quedara para un
  // effect, el desmontaje de la página podía perder el ítem (lo cazó el E2E).
  const mutate = (fn: (prev: CartLine[]) => CartLine[]) =>
    setLines((prev) => {
      const next = fn(prev);
      writeJson(key, next);
      return next;
    });

  const value = useMemo<CartContextValue>(() => {
    const count = lines.reduce((s, l) => s + l.quantity, 0);
    const totalAmount = lines.reduce((s, l) => s + l.priceAmount * l.quantity, 0);
    return {
      lines,
      count,
      totalAmount,
      currency: lines[0]?.currency ?? 'ARS',
      tenantId: storeKey,
      open,
      setOpen,
      add: (line, qty = 1) =>
        mutate((prev) => {
          const existing = prev.find((l) => l.variantId === line.variantId);
          if (existing) {
            return prev.map((l) =>
              l.variantId === line.variantId ? { ...l, quantity: l.quantity + qty } : l,
            );
          }
          return [...prev, { ...line, quantity: qty }];
        }),
      setQty: (variantId, qty) =>
        mutate((prev) =>
          qty <= 0
            ? prev.filter((l) => l.variantId !== variantId)
            : prev.map((l) => (l.variantId === variantId ? { ...l, quantity: qty } : l)),
        ),
      remove: (variantId) => mutate((prev) => prev.filter((l) => l.variantId !== variantId)),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lines, open, storeKey]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

interface CartConfig {
  freeShippingBar: boolean;
  freeShippingThreshold: number;
  checkoutButtonText: string;
  showSuggested: boolean;
  notice?: string;
}
interface Suggested {
  variantId: string;
  name: string;
  priceAmount: number;
  currency: string;
  image: string | null;
  variantLabel: string;
}

export function CartDrawer({ cart, suggested = [] }: { cart?: CartConfig; suggested?: Suggested[] }) {
  const { lines, open, setOpen, setQty, remove, totalAmount, currency, add, tenantId } = useCart();
  const threshold = cart?.freeShippingThreshold ?? 0;
  const remaining = Math.max(0, threshold - totalAmount);
  const progress = threshold > 0 ? Math.min(100, (totalAmount / threshold) * 100) : 0;

  const [couponInput, setCouponInput] = useState('');
  const [coupon, setCoupon] = useState<{ code: string; discount: number; freeShipping: boolean } | null>(
    null,
  );
  const [couponError, setCouponError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  // A11y: enfoca el drawer al abrir, atrapa el Tab dentro y restaura el foco al cerrar.
  const drawerRef = useFocusTrap<HTMLElement>(open);

  // Cerrar con Escape (consistente con los otros modales del storefront).
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, setOpen]);

  const validateCoupon = async (code: string) => {
    if (!code.trim()) return;
    setChecking(true);
    setCouponError(null);
    try {
      const res = await fetch(`${CART_API}/api/v1/coupons/validate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Tenant-Id': tenantId },
        body: JSON.stringify({ code: code.trim(), subtotal: totalAmount }),
      });
      const data = await res.json();
      if (data.valid) {
        setCoupon({ code: data.code, discount: data.discountAmount, freeShipping: data.freeShipping });
        setCouponError(null);
      } else {
        setCoupon(null);
        setCouponError(data.error ?? 'Cupón inválido.');
      }
    } catch {
      setCouponError('No se pudo validar el cupón.');
    } finally {
      setChecking(false);
    }
  };

  // Re-validar el cupón aplicado si cambia el subtotal (sumar/quitar productos).
  useEffect(() => {
    if (coupon) validateCoupon(coupon.code);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [totalAmount]);

  const discount = coupon?.discount ?? 0;
  const finalTotal = Math.max(0, totalAmount - discount);

  return (
    <>
      <div
        className={`fixed inset-0 z-50 bg-black/40 transition-opacity ${open ? 'opacity-100' : 'pointer-events-none opacity-0'}`}
        onClick={() => setOpen(false)}
      />
      <aside
        ref={drawerRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="cart-drawer-title"
        className={`fixed z-[60] flex flex-col overflow-hidden bg-bg text-fg shadow-2xl outline-none transition-transform
          inset-x-0 bottom-0 h-[88vh] rounded-t-2xl
          sm:inset-x-auto sm:right-0 sm:top-0 sm:bottom-auto sm:h-full sm:w-96 sm:max-w-[92vw] sm:rounded-none
          ${open ? 'translate-y-0 sm:translate-x-0' : 'translate-y-full sm:translate-x-full sm:translate-y-0'}`}
      >
        {/* Handle del bottom sheet (solo mobile). */}
        <div className="mx-auto mt-2.5 h-1 w-10 shrink-0 rounded-full bg-fg/20 sm:hidden" />
        <div className="flex items-center justify-between border-b border-black/10 px-5 py-3.5">
          <h2 id="cart-drawer-title" className="text-lg font-bold">
            Tu carrito
          </h2>
          <button
            onClick={() => setOpen(false)}
            aria-label="Cerrar"
            className="inline-flex leading-none opacity-60 hover:opacity-100"
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        {cart?.freeShippingBar && lines.length > 0 && (
          <div className="border-b border-black/10 px-5 py-3 text-xs">
            {remaining > 0 ? (
              <span className="inline-flex items-center gap-1">
                Te faltan <strong>{formatMoney(remaining, currency)}</strong> para el envío gratis{' '}
                <Truck className="h-4 w-4" />
              </span>
            ) : (
              <span className="font-semibold text-green-600">¡Tenés envío gratis! 🎉</span>
            )}
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-black/10">
              <div
                className="h-full rounded-full bg-primary transition-all"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        )}

        {lines.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center opacity-70">
            <ShoppingCart className="h-10 w-10" />
            <p>Tu carrito está vacío.</p>
          </div>
        ) : (
          <>
            <div className="flex-1 space-y-3 overflow-y-auto px-5 py-4">
              {lines.map((l) => (
                <div key={l.variantId} className="flex gap-3 border-b border-black/10 pb-3">
                  {l.image ? (
                    <img src={l.image} alt="" className="h-16 w-16 rounded-md object-cover" />
                  ) : (
                    <InitialFallback
                      name={l.productName}
                      className="flex h-16 w-16 items-center justify-center rounded-md bg-black/5 text-lg font-bold opacity-50"
                    />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{l.productName}</div>
                    <div className="text-xs opacity-60">{l.variantLabel}</div>
                    <div className="mt-1 flex items-center gap-2">
                      <button
                        onClick={() => setQty(l.variantId, l.quantity - 1)}
                        aria-label="Restar"
                        className="inline-flex h-6 w-6 items-center justify-center rounded border border-black/15"
                      >
                        <Minus className="h-4 w-4" />
                      </button>
                      <span className="w-6 text-center text-sm tabular-nums">{l.quantity}</span>
                      <button
                        onClick={() => setQty(l.variantId, l.quantity + 1)}
                        aria-label="Sumar"
                        className="inline-flex h-6 w-6 items-center justify-center rounded border border-black/15"
                      >
                        <Plus className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => remove(l.variantId)}
                        className="ml-auto text-xs text-red-600 hover:underline"
                      >
                        Quitar
                      </button>
                    </div>
                  </div>
                  <div className="text-sm font-semibold tabular-nums">
                    {formatMoney(l.priceAmount * l.quantity, l.currency)}
                  </div>
                </div>
              ))}
            </div>
            <div className="border-t border-black/10 px-5 py-4">
              {suggested.length > 0 && (
                <div className="mb-4">
                  <div className="mb-2 text-xs font-semibold uppercase tracking-wide opacity-60">
                    También te puede gustar
                  </div>
                  <div className="flex gap-2 overflow-x-auto">
                    {suggested.map((s) => (
                      <button
                        key={s.variantId}
                        onClick={() =>
                          add({
                            variantId: s.variantId,
                            productName: s.name,
                            variantLabel: s.variantLabel,
                            priceAmount: s.priceAmount,
                            currency: s.currency,
                            image: s.image,
                          })
                        }
                        className="w-20 shrink-0 text-left"
                      >
                        {s.image ? (
                          <img src={s.image} alt="" className="h-20 w-20 rounded-md object-cover" />
                        ) : (
                          <InitialFallback
                            name={s.name}
                            className="flex h-20 w-20 items-center justify-center rounded-md bg-black/5 text-base font-bold opacity-40"
                          />
                        )}
                        <div className="mt-1 truncate text-[0.65rem]">{s.name}</div>
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {/* Cupón de descuento */}
              <div className="mb-3">
                {coupon ? (
                  <div className="flex items-center justify-between rounded-md bg-black/5 px-3 py-2 text-sm">
                    <span className="inline-flex items-center gap-1.5 font-medium text-green-600">
                      <Tag className="h-4 w-4" /> {coupon.code}
                      {coupon.freeShipping ? ' · envío gratis' : ''}
                    </span>
                    <button
                      onClick={() => {
                        setCoupon(null);
                        setCouponInput('');
                        setCouponError(null);
                      }}
                      className="text-xs text-red-600 hover:underline"
                    >
                      Quitar
                    </button>
                  </div>
                ) : (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      validateCoupon(couponInput);
                    }}
                    className="flex gap-2"
                  >
                    <input
                      value={couponInput}
                      onChange={(e) => setCouponInput(e.target.value.toUpperCase())}
                      placeholder="Cupón de descuento"
                      aria-label="Cupón de descuento"
                      className="h-9 w-full rounded-md border border-black/15 bg-white px-3 text-sm text-black"
                    />
                    <button
                      type="submit"
                      disabled={checking || !couponInput.trim()}
                      className="h-9 shrink-0 rounded-md border border-black/20 px-3 text-sm font-semibold disabled:opacity-50"
                    >
                      {checking ? '…' : 'Aplicar'}
                    </button>
                  </form>
                )}
                {couponError && <p className="mt-1 text-xs text-red-600">{couponError}</p>}
              </div>

              {discount > 0 && (
                <div className="mb-1 flex items-center justify-between text-sm text-green-600">
                  <span>Descuento ({coupon?.code})</span>
                  <span className="tabular-nums">- {formatMoney(discount, currency)}</span>
                </div>
              )}
              <div className="mb-3 flex items-center justify-between text-base font-bold">
                <span>Total</span>
                <span className="tabular-nums">{formatMoney(finalTotal, currency)}</span>
              </div>
              {cart?.notice && (
                <p className="mb-3 rounded-md bg-black/5 px-3 py-2 text-xs text-black/70">{cart.notice}</p>
              )}
              <button
                onClick={() => {
                  window.location.href = '/checkout';
                }}
                className="w-full rounded-md bg-primary py-3 text-sm font-semibold text-primary-fg"
              >
                {cart?.checkoutButtonText || 'Iniciar compra'}
              </button>
            </div>
          </>
        )}
      </aside>
    </>
  );
}
