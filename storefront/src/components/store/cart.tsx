'use client';

import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { X, Truck, ShoppingCart, Minus, Plus, Tag } from 'lucide-react';
import { formatMoney } from '@tiendafy/types';

import { readJson, removeKey, writeJson } from '@/lib/storage';
import { CART_SYNC_EVENT, cartStorageKey, couponStorageKey } from '@/lib/cart-storage';
import { hardNavigate } from '@/lib/navigation';
import { track, type TrackItem } from '@/lib/track';
import Image from 'next/image';
import Link from 'next/link';
import { InitialFallback } from './InitialFallback';
import { PreviewContext, usePreviewHref } from './preview';
import { useFocusTrap } from './useFocusTrap';
import { useStoreOffers } from './store-offers-context';
import { PriceWithoutTaxes } from './StoreLegalInfo';
import { RecentlyViewed } from './RecentlyViewed';
import { validateCoupon as validateCouponApi } from '@/lib/coupons';
import {
  fetchVariantSnapshots,
  issueText,
  lineIssue,
  mergePriceChanges,
  reprice,
  type Availability,
  type LineIssue,
  type PriceChange,
} from '@/lib/cart-pricing';

export { cartStorageKey, couponStorageKey };

export interface StoredCoupon {
  code: string;
  discount: number; // centavos
  freeShipping: boolean;
}

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
  /** false hasta leer el carrito guardado: antes de eso `lines` vacío no significa "vacío". */
  hydrated: boolean;
  count: number;
  totalAmount: number;
  currency: string;
  tenantId: string;
  add: (line: Omit<CartLine, 'quantity'>, qty?: number) => void;
  setQty: (variantId: string, qty: number) => void;
  remove: (variantId: string) => void;
  open: boolean;
  setOpen: (open: boolean) => void;
  /** Trae precio y stock vigentes y actualiza las líneas (ver lib/cart-pricing). */
  refreshPrices: () => Promise<void>;
  /** Precios que cambiaron desde que se agregaron, para avisarle al comprador. */
  priceChanges: PriceChange[];
  /** Lo que impide comprar cada línea (agotada, despublicada, menos stock). */
  issues: Record<string, LineIssue>;
  /** true si alguna línea tiene un problema: no se puede seguir a pagar. */
  blocked: boolean;
  /** Unidades por variante según la última consulta (null = no se consultó). */
  availability: Availability | null;
  /** Ir a pagar: mide el inicio de la compra y entra al checkout con carga completa. */
  beginCheckout: (url?: string) => void;
}

const toTrackItem = (l: Omit<CartLine, 'quantity'>, quantity: number): TrackItem => ({
  id: l.variantId,
  name: l.productName,
  variant: l.variantLabel,
  price: l.priceAmount,
  currency: l.currency,
  quantity,
});

const CartContext = createContext<CartContextValue | null>(null);

export function useCart(): CartContextValue {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart must be used inside <CartProvider>');
  return ctx;
}

export function CartProvider({ storeKey, children }: { storeKey: string; children: ReactNode }) {
  const key = cartStorageKey(storeKey);
  const [lines, setLines] = useState<CartLine[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [open, setOpen] = useState(false);
  // Lo último que se guardó, leído y escrito en el momento (ver mutate).
  const current = useRef<CartLine[]>([]);

  useEffect(() => {
    const load = () => {
      current.current = readJson<CartLine[]>(key, []);
      setLines(current.current);
    };
    load();
    setHydrated(true);
    // El guardado puede cambiar por afuera de este carrito: la pantalla de
    // "listo" lo vacía al confirmar la compra, el checkout lo reprecia, u otra
    // pestaña de la misma tienda compra. Sin esto el ícono seguía diciendo 3
    // productos de una compra que ya estaba pagada.
    const onSync = (e: Event) => {
      if ((e as CustomEvent<{ key?: string }>).detail?.key === key) load();
    };
    const onStorage = (e: StorageEvent) => {
      if (e.key === key || e.key === null) load();
    };
    window.addEventListener(CART_SYNC_EVENT, onSync);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener(CART_SYNC_EVENT, onSync);
      window.removeEventListener('storage', onStorage);
    };
  }, [key]);

  // Persistencia SINCRÓNICA en cada mutación (no en un useEffect post-render
  // ni dentro del updater de setState, que React puede correr más tarde):
  // "Comprar ahora" agrega y navega al instante — si el write quedara para
  // después, el desmontaje de la página podía perder el ítem (lo cazó el E2E).
  const mutate = (fn: (prev: CartLine[]) => CartLine[]) => {
    const next = fn(current.current);
    current.current = next;
    writeJson(key, next);
    setLines(next);
  };

  const [priceChanges, setPriceChanges] = useState<PriceChange[]>([]);
  const [availability, setAvailability] = useState<Availability | null>(null);

  // Se aplica sobre las líneas de ESE momento (no las de cuando salió el
  // pedido): si mientras tanto el comprador cambió una cantidad, se respeta.
  const refreshPrices = async () => {
    const snapshots = await fetchVariantSnapshots(
      storeKey,
      current.current.map((l) => l.variantId),
    );
    if (!snapshots) return;
    const result = reprice(current.current, snapshots);
    if (result.changes.length > 0) mutate(() => result.lines);
    setPriceChanges((prev) => mergePriceChanges(prev, result.changes));
    setAvailability(result.availability);
  };

  const value = useMemo<CartContextValue>(() => {
    const count = lines.reduce((s, l) => s + l.quantity, 0);
    const totalAmount = lines.reduce((s, l) => s + l.priceAmount * l.quantity, 0);
    const issues: Record<string, LineIssue> = {};
    for (const l of lines) {
      const issue = lineIssue(l, availability);
      if (issue) issues[l.variantId] = issue;
    }
    return {
      lines,
      hydrated,
      count,
      totalAmount,
      currency: lines[0]?.currency ?? 'ARS',
      tenantId: storeKey,
      open,
      setOpen,
      refreshPrices,
      // Solo de lo que sigue en el carrito.
      priceChanges: priceChanges.filter((c) => lines.some((l) => l.variantId === c.variantId)),
      issues,
      blocked: Object.keys(issues).length > 0,
      availability,
      beginCheckout: (url = '/checkout') => {
        track({ type: 'begin_checkout', items: current.current.map((l) => toTrackItem(l, l.quantity)) });
        // Carga completa a propósito: la página de pago no hereda los scripts
        // de medición que cargó la anterior (ver lib/navigation).
        hardNavigate(url);
      },
      add: (line, qty = 1) => {
        track({ type: 'add_to_cart', item: toTrackItem(line, qty) });
        mutate((prev) => {
          const existing = prev.find((l) => l.variantId === line.variantId);
          if (existing) {
            return prev.map((l) =>
              l.variantId === line.variantId ? { ...l, quantity: l.quantity + qty } : l,
            );
          }
          return [...prev, { ...line, quantity: qty }];
        });
      },
      setQty: (variantId, qty) =>
        mutate((prev) =>
          qty <= 0
            ? prev.filter((l) => l.variantId !== variantId)
            : prev.map((l) => (l.variantId === variantId ? { ...l, quantity: qty } : l)),
        ),
      remove: (variantId) => mutate((prev) => prev.filter((l) => l.variantId !== variantId)),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lines, hydrated, open, storeKey, priceChanges, availability]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

/** "El precio de X cambió de $A a $B": lo que el comprador tiene que ver antes de pagar. */
export function PriceChangeNotice({
  changes,
  className = '',
}: {
  changes: PriceChange[];
  className?: string;
}) {
  if (changes.length === 0) return null;
  return (
    <div
      role="status"
      className={`space-y-1 rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-fg ${className}`}
    >
      {changes.map((c) => (
        <p key={c.variantId}>
          El precio de <strong>{c.productName}</strong> cambió de {formatMoney(c.from, c.currency)} a{' '}
          {formatMoney(c.to, c.currency)}.
        </p>
      ))}
    </div>
  );
}

/** El problema de una línea (agotada, despublicada, menos stock), si tiene. */
export function LineIssueText({ issue }: { issue: LineIssue | undefined }) {
  if (!issue) return null;
  return <p className="mt-1 text-xs font-medium text-danger">{issueText(issue)}</p>;
}

interface CartConfig {
  showCoupon: boolean;
  showContinue: boolean;
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
  slug?: string;
  stock?: number | null;
  variantCount?: number;
}

/** El producto de muestra del carrito en la vista previa (ver CartDrawer). */
export function sampleCartLine(product?: Suggested): CartLine {
  return product
    ? {
        variantId: product.variantId,
        productName: product.name,
        variantLabel: product.variantLabel,
        priceAmount: product.priceAmount,
        currency: product.currency,
        image: product.image,
        quantity: 1,
      }
    : {
        variantId: 'muestra',
        productName: 'Producto de ejemplo',
        variantLabel: '',
        priceAmount: 1250000,
        currency: 'ARS',
        image: null,
        quantity: 1,
      };
}

const noop = () => {};

export function CartDrawer({
  cart,
  suggested: all = [],
  sample,
  whatsapp,
}: {
  cart?: CartConfig;
  suggested?: Suggested[];
  /** Vista previa: el producto con el que se muestra el carrito si está vacío. */
  sample?: Suggested;
  /** WhatsApp de la tienda: la salida cuando todavía no cobra online. */
  whatsapp?: string;
}) {
  const offers = useStoreOffers();
  // Un sugerido agotado no se ofrece; uno con varias variantes lleva a su
  // ficha (agregar "la primera" era venderle un talle que no eligió).
  const suggested = all.filter((s) => !(s.stock != null && s.stock <= 0));
  const href = usePreviewHref();
  const preview = useContext(PreviewContext);
  const {
    lines: realLines,
    open,
    setOpen,
    setQty: realSetQty,
    remove: realRemove,
    totalAmount: realTotal,
    currency,
    add,
    tenantId,
    refreshPrices,
    priceChanges,
    issues,
    blocked,
    availability,
    beginCheckout,
  } = useCart();
  // En la vista previa del editor el carrito suele estar vacío, y vacío no
  // muestra nada de lo que se configura (cupón, sugeridos, envío gratis,
  // mensaje, texto del botón): parecía que esas opciones no hacían nada. Se
  // muestra con un producto de muestra, sin tocar el carrito de verdad.
  const sampleLines = preview && realLines.length === 0 ? [sampleCartLine(sample ?? all[0])] : null;
  const lines = sampleLines ?? realLines;
  const totalAmount = sampleLines ? sampleLines[0]!.priceAmount : realTotal;
  const setQty = sampleLines ? noop : realSetQty;
  const remove = sampleLines ? noop : realRemove;
  // El umbral sale de los medios de envío (ver lib/store-offers): el mismo
  // número con el que el checkout pone el envío en cero.
  const threshold = cart?.freeShippingThreshold ?? 0;
  const remaining = Math.max(0, threshold - totalAmount);
  const progress = threshold > 0 ? Math.min(100, (totalAmount / threshold) * 100) : 0;

  const couponKey = couponStorageKey(tenantId);
  const [couponInput, setCouponInput] = useState('');
  const [coupon, setCouponState] = useState<StoredCoupon | null>(null);
  const [couponError, setCouponError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  // Guardar y leer van juntos: el cupón sobrevive al viaje al checkout.
  const setCoupon = (next: StoredCoupon | null) => {
    setCouponState(next);
    if (next) writeJson(couponKey, next);
    else removeKey(couponKey);
  };

  useEffect(() => {
    setCouponState(readJson<StoredCoupon | null>(couponKey, null));
  }, [couponKey]);

  // A11y: enfoca el drawer al abrir, atrapa el Tab dentro y restaura el foco al cerrar.
  const drawerRef = useFocusTrap<HTMLDivElement>(open);

  // Cada vez que se abre, los precios y el stock se traen de nuevo: lo
  // guardado es de cuando se agregó, quizás hace días.
  useEffect(() => {
    if (open && realLines.length > 0) void refreshPrices();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

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
    const r = await validateCouponApi(tenantId, code.trim(), totalAmount);
    if (r.ok) {
      setCoupon({ code: r.code, discount: r.discount, freeShipping: r.freeShipping });
      setCouponError(null);
    } else {
      setCoupon(null);
      setCouponError(r.error);
    }
    setChecking(false);
  };

  // Re-validar el cupón aplicado si cambia el subtotal (sumar/quitar productos);
  // si el carrito quedó vacío, el cupón se descarta con él.
  useEffect(() => {
    if (!coupon) return;
    if (realLines.length === 0) setCoupon(null);
    else validateCoupon(coupon.code);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [realTotal, realLines.length]);

  const discount = coupon?.discount ?? 0;
  const finalTotal = Math.max(0, totalAmount - discount);

  return (
    <>
      <div
        className={`fixed inset-0 z-50 bg-black/40 transition-opacity ${open ? 'opacity-100' : 'pointer-events-none opacity-0'}`}
        onClick={() => setOpen(false)}
      />
      {/* Un div con rol de diálogo y no un <aside>: aside es una región
          "complementaria" del documento, y el carrito es un diálogo modal. */}
      <div
        ref={drawerRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="cart-drawer-title"
        // Cerrado queda fuera de pantalla pero en el DOM (para la animación):
        // sin esto sus botones se alcanzaban con Tab y un lector de pantalla
        // anunciaba un diálogo que no se ve.
        inert={!open}
        aria-hidden={!open}
        className={`fixed z-[60] flex flex-col overflow-hidden bg-bg text-fg shadow-2xl outline-none transition-transform
          inset-x-0 bottom-0 h-[88vh] rounded-t-2xl
          sm:inset-x-auto sm:right-0 sm:top-0 sm:bottom-auto sm:h-full sm:w-96 sm:max-w-[92vw] sm:rounded-none
          ${open ? 'translate-y-0 sm:translate-x-0' : 'translate-y-full sm:translate-x-full sm:translate-y-0'}`}
      >
        {/* Handle del bottom sheet (solo mobile). */}
        <div className="mx-auto mt-2.5 h-1 w-10 shrink-0 rounded-full bg-fg/20 sm:hidden" />
        <div className="flex items-center justify-between border-b border-fg/10 px-5 py-3.5">
          <h2 id="cart-drawer-title" className="text-lg font-bold">
            Tu carrito
          </h2>
          <button
            onClick={() => setOpen(false)}
            aria-label="Cerrar"
            className="-m-2 inline-flex p-2 leading-none opacity-60 hover:opacity-100"
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        {cart?.freeShippingBar && threshold > 0 && lines.length > 0 && (
          <div className="border-b border-fg/10 px-5 py-3 text-xs">
            {remaining > 0 ? (
              <span className="inline-flex items-center gap-1">
                Te faltan <strong>{formatMoney(remaining, currency)}</strong> para el envío gratis{' '}
                <Truck className="h-4 w-4" />
              </span>
            ) : (
              <span className="font-semibold text-success">
                ¡Tenés envío gratis
                {offers?.freeShipping?.methodName ? ` con ${offers.freeShipping.methodName}` : ''}!
              </span>
            )}
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-fg/10">
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
            {open && <RecentlyViewed variant="compact" limit={6} onNavigate={() => setOpen(false)} />}
          </div>
        ) : (
          <>
            <div className="flex-1 space-y-3 overflow-y-auto px-5 py-4">
              <PriceChangeNotice changes={priceChanges} />
              {sampleLines && (
                <p className="rounded-md bg-fg/5 px-3 py-2 text-xs text-fg-muted">
                  Vista previa con un producto de muestra: así se ve el carrito con algo adentro.
                </p>
              )}
              {lines.map((l) => (
                <div key={l.variantId} className="flex gap-3 border-b border-fg/10 pb-3">
                  {l.image ? (
                    <Image
                      src={l.image}
                      alt=""
                      width={64}
                      height={64}
                      className="h-16 w-16 rounded-md object-cover"
                    />
                  ) : (
                    <InitialFallback
                      name={l.productName}
                      className="flex h-16 w-16 items-center justify-center rounded-md bg-fg/5 text-lg font-bold text-fg-muted"
                    />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{l.productName}</div>
                    <div className="text-xs text-fg-muted">{l.variantLabel}</div>
                    {/* Los botones se ven de 24 px pero se tocan de 40: el
                        relleno con margen negativo agranda el área sin mover
                        nada (el mismo truco que el header). */}
                    <div className="mt-1 flex items-center gap-2">
                      <button
                        onClick={() => setQty(l.variantId, l.quantity - 1)}
                        aria-label="Restar"
                        className="-m-2 inline-flex p-2"
                      >
                        <span className="inline-flex h-6 w-6 items-center justify-center rounded border border-fg/15">
                          <Minus className="h-4 w-4" />
                        </span>
                      </button>
                      <span className="w-6 text-center text-sm tabular-nums">{l.quantity}</span>
                      <button
                        onClick={() => setQty(l.variantId, l.quantity + 1)}
                        aria-label="Sumar"
                        // Con el stock a la vista, no deja pedir más de lo que hay.
                        disabled={l.quantity >= (availability?.[l.variantId] ?? Infinity)}
                        className="-m-2 inline-flex p-2 disabled:opacity-40"
                      >
                        <span className="inline-flex h-6 w-6 items-center justify-center rounded border border-fg/15">
                          <Plus className="h-4 w-4" />
                        </span>
                      </button>
                      <button
                        onClick={() => remove(l.variantId)}
                        className="-my-2.5 ml-auto py-2.5 text-xs text-danger hover:underline"
                      >
                        Quitar
                      </button>
                    </div>
                    <LineIssueText issue={issues[l.variantId]} />
                  </div>
                  <div className="text-sm font-semibold tabular-nums">
                    {formatMoney(l.priceAmount * l.quantity, l.currency)}
                  </div>
                </div>
              ))}
            </div>
            <div className="border-t border-fg/10 px-5 py-4">
              {suggested.length > 0 && (
                <div className="mb-4">
                  <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-fg-muted">
                    También te puede gustar
                  </div>
                  <div className="flex gap-2 overflow-x-auto">
                    {suggested.map((s) => {
                      const body = (
                        <>
                          {s.image ? (
                            <Image
                              src={s.image}
                              alt=""
                              width={80}
                              height={80}
                              className="h-20 w-20 rounded-md object-cover"
                            />
                          ) : (
                            <InitialFallback
                              name={s.name}
                              className="flex h-20 w-20 items-center justify-center rounded-md bg-fg/5 text-base font-bold text-fg-muted"
                            />
                          )}
                          <div className="mt-1 truncate text-[0.65rem]">{s.name}</div>
                        </>
                      );
                      return (s.variantCount ?? 1) > 1 && s.slug ? (
                        <Link
                          key={s.variantId}
                          href={href(`/productos/${s.slug}`)}
                          onClick={() => setOpen(false)}
                          className="w-20 shrink-0 text-left"
                        >
                          {body}
                        </Link>
                      ) : (
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
                          {body}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
              {/* Cupón de descuento */}
              <div className={cart?.showCoupon === false ? 'hidden' : 'mb-3'}>
                {coupon ? (
                  <div className="flex items-center justify-between rounded-md bg-fg/5 px-3 py-2 text-sm">
                    <span className="inline-flex items-center gap-1.5 font-medium text-success">
                      <Tag className="h-4 w-4" /> {coupon.code}
                      {coupon.freeShipping ? ' · envío gratis' : ''}
                    </span>
                    <button
                      onClick={() => {
                        setCoupon(null);
                        setCouponInput('');
                        setCouponError(null);
                      }}
                      className="text-xs text-danger hover:underline"
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
                      className="h-9 w-full rounded-md border border-fg/20 bg-fg/[0.03] px-3 text-sm text-fg placeholder:text-fg-muted"
                    />
                    <button
                      type="submit"
                      disabled={checking || !couponInput.trim()}
                      className="h-9 shrink-0 rounded-md border border-fg/20 px-3 text-sm font-semibold disabled:opacity-50"
                    >
                      {checking ? '…' : 'Aplicar'}
                    </button>
                  </form>
                )}
                {couponError && <p className="mt-1 text-xs text-danger">{couponError}</p>}
              </div>

              {discount > 0 && (
                <div className="mb-1 flex items-center justify-between text-sm text-success">
                  <span>Descuento ({coupon?.code})</span>
                  <span className="tabular-nums">- {formatMoney(discount, currency)}</span>
                </div>
              )}
              {/* "Subtotal" y no "Total": el envío todavía no se eligió, y llamar
                  total a algo que después crece es lo que hace abandonar. */}
              <div className="flex items-center justify-between text-base font-bold">
                <span>Subtotal</span>
                <span className="tabular-nums">{formatMoney(finalTotal, currency)}</span>
              </div>
              <PriceWithoutTaxes amount={finalTotal} currency={currency} className="text-right" />
              <p className="mb-3 text-xs text-fg-muted">
                {threshold > 0 && remaining === 0
                  ? `Envío gratis${offers?.freeShipping?.methodName ? ` con ${offers.freeShipping.methodName}` : ''}.`
                  : 'El envío se calcula en el próximo paso.'}
              </p>
              {cart?.notice && (
                <p className="mb-3 rounded-md bg-fg/5 px-3 py-2 text-xs text-fg-muted">{cart.notice}</p>
              )}
              {blocked && (
                <p className="mb-2 text-xs font-medium text-danger">
                  Revisá los productos marcados para poder seguir.
                </p>
              )}
              {offers && !offers.canCheckout ? (
                // La tienda todavía no cobra online: se dice ACÁ, antes de que el
                // comprador llene el checkout, y la compra sigue por WhatsApp.
                <div className="space-y-2">
                  <p className="text-xs text-fg-muted">
                    Esta tienda todavía no cobra online. Escribinos y coordinamos el pago y la entrega.
                  </p>
                  {whatsapp && (
                    <a
                      href={`https://wa.me/${whatsapp.replace(/\D/g, '')}?text=${encodeURIComponent(
                        `¡Hola! Quiero comprar: ${lines.map((l) => `${l.quantity} × ${l.productName}`).join(', ')}.`,
                      )}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block w-full rounded-md bg-primary py-3 text-center text-sm font-semibold text-primary-fg"
                    >
                      Comprar por WhatsApp
                    </a>
                  )}
                </div>
              ) : (
                <button
                  onClick={() => beginCheckout()}
                  disabled={blocked}
                  className="w-full rounded-md bg-primary py-3 text-sm font-semibold text-primary-fg disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {cart?.checkoutButtonText || 'Iniciar compra'}
                </button>
              )}
              {/* Volver al catálogo sin tener que cerrar el panel a mano. */}
              {cart?.showContinue !== false && (
                <button
                  onClick={() => setOpen(false)}
                  className="mt-2 w-full rounded-md py-2.5 text-sm font-medium opacity-70 hover:opacity-100"
                >
                  Seguir comprando
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </>
  );
}
