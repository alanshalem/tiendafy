'use client';

import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { readJson, writeJson } from '@/lib/storage';
import { CART_SYNC_EVENT, cartStorageKey } from '@/lib/cart-storage';
import { hardNavigate } from '@/lib/navigation';
import { track, type TrackItem } from '@/lib/track';
import {
  fetchVariantSnapshots,
  lineIssue,
  mergePriceChanges,
  reprice,
  type Availability,
  type LineIssue,
  type PriceChange,
} from '@/lib/cart-pricing';

/*
 * El estado del carrito, aparte del cajón que lo muestra (cart.tsx). Lo usan
 * casi todas las piezas de la tienda —el ícono del encabezado, la card, el
 * menú de categorías, el formulario de novedades— y antes, para leer el
 * contador, cada una arrastraba el cajón entero con sus sugeridos, el cupón
 * y los vistos recientemente.
 */

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
