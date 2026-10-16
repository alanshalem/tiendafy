'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { formatMoney } from '@tiendafy/types';
import { productGridClass } from '@/lib/theme-style';
import { fetchProductsByIdsClient } from '@/lib/catalog-client';
import {
  readRecentlyViewed,
  recentlyViewedKey,
  recordProductView,
  RECENTLY_VIEWED_EVENT,
} from '@/lib/recently-viewed';
import { useCart } from './cart-context';
import { ProductCard, type StoreProduct } from './ProductCard';
import { useProductListConfig } from './ProductListContext';
import { usePreviewHref } from './preview';
import { StoreImage } from './StoreImage';
import { InitialFallback } from './InitialFallback';

/**
 * Los ids vistos en esta tienda, del último al primero. Se actualiza solo si
 * otro componente suma una vista (la ficha) o si cambia en otra pestaña.
 */
function useRecentlyViewedIds(tenantId: string): string[] {
  const [ids, setIds] = useState<string[]>([]);
  useEffect(() => {
    if (!tenantId) return;
    const load = () => setIds(readRecentlyViewed(tenantId));
    load();
    const onChange = (e: Event) => {
      if ((e as CustomEvent<{ tenantId?: string }>).detail?.tenantId === tenantId) load();
    };
    const onStorage = (e: StorageEvent) => {
      if (e.key === recentlyViewedKey(tenantId) || e.key === null) load();
    };
    window.addEventListener(RECENTLY_VIEWED_EVENT, onChange);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener(RECENTLY_VIEWED_EVENT, onChange);
      window.removeEventListener('storage', onStorage);
    };
  }, [tenantId]);
  return ids;
}

/**
 * "Vistos recientemente". Con `recordId` (la ficha de un producto) además
 * cuenta esa vista, y no lo muestra a él: ya se está viendo.
 *
 * Los productos se piden de nuevo por id (ver lib/recently-viewed): lo
 * despublicado no vuelve y el precio es el de hoy. Sin nada para mostrar, no
 * ocupa lugar.
 */
export function RecentlyViewed({
  recordId,
  excludeIds = [],
  title = 'Vistos recientemente',
  limit = 8,
  variant = 'grid',
  onNavigate,
}: {
  recordId?: string;
  excludeIds?: string[];
  title?: string;
  limit?: number;
  /** grid: cards como en el listado. compact: una fila chica que se desliza (el carrito). */
  variant?: 'grid' | 'compact';
  onNavigate?: () => void;
}) {
  const { tenantId } = useCart();
  const ids = useRecentlyViewedIds(tenantId);
  // Los productos, con la lista de ids que los trajo: si cambia, lo viejo no se muestra.
  const [loaded, setLoaded] = useState<{ key: string; products: StoreProduct[] }>({ key: '', products: [] });

  useEffect(() => {
    if (recordId && tenantId) recordProductView(tenantId, recordId);
  }, [recordId, tenantId]);

  const hidden = new Set([...(recordId ? [recordId] : []), ...excludeIds]);
  const wanted = ids.filter((id) => !hidden.has(id)).slice(0, limit);
  const key = wanted.join(',');

  useEffect(() => {
    if (!tenantId || !key) return;
    let current = true;
    void fetchProductsByIdsClient(key.split(','), tenantId).then((found) => {
      if (current) setLoaded({ key, products: found });
    });
    return () => {
      current = false;
    };
  }, [key, tenantId]);

  const products = key && loaded.key === key ? loaded.products : [];
  if (products.length === 0) return null;
  return variant === 'compact' ? (
    <CompactList title={title} products={products} onNavigate={onNavigate} />
  ) : (
    <GridList title={title} products={products} />
  );
}

function GridList({ title, products }: { title: string; products: StoreProduct[] }) {
  const list = useProductListConfig();
  return (
    <section aria-label={title} className="mt-12">
      <h2 className="mb-4 text-lg font-bold" style={{ fontFamily: 'var(--font-heading)' }}>
        {title}
      </h2>
      <div className={`grid gap-x-5 gap-y-8 ${productGridClass(list)}`}>
        {products.map((p) => (
          <ProductCard key={p.id} product={p} list={list} />
        ))}
      </div>
    </section>
  );
}

function CompactList({
  title,
  products,
  onNavigate,
}: {
  title: string;
  products: StoreProduct[];
  onNavigate?: () => void;
}) {
  const href = usePreviewHref();
  return (
    <section aria-label={title} className="w-full text-left">
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-fg-muted">{title}</h3>
      <ul className="flex gap-3 overflow-x-auto pb-1">
        {products.map((p) => (
          <li key={p.id} className="w-24 shrink-0">
            <Link href={href(`/productos/${p.slug}`)} onClick={onNavigate} className="block">
              <span className="relative block aspect-square overflow-hidden rounded-md bg-fg/5">
                {p.image ? (
                  <StoreImage src={p.image} alt="" sizes="96px" className="object-cover" />
                ) : (
                  <InitialFallback
                    name={p.name}
                    className="flex h-full w-full items-center justify-center text-lg font-bold text-fg-muted"
                  />
                )}
              </span>
              <span className="mt-1 line-clamp-2 text-xs">{p.name}</span>
              <span className="text-xs font-semibold">{formatMoney(p.priceAmount, p.currency)}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
