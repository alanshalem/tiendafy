'use client';

import { useEffect, useState } from 'react';
import { Heart } from 'lucide-react';
import type { ProductListConfig } from '@/lib/theme';

import { ProductCard, type StoreProduct } from './sections';
import { useFavorites } from './favorites';
import { useCart } from './cart';
import { EmptyState } from './EmptyState';
import { ProductCardSkeleton } from './Skeletons';

import { fetchProductsByIdsClient } from '@/lib/catalog-client';

/** Lista de favoritos: trae por id los productos guardados y los muestra. */
export function FavoritesList({ productList }: { productList: ProductListConfig }) {
  const { ids } = useFavorites();
  const { tenantId } = useCart();
  const [products, setProducts] = useState<StoreProduct[] | null>(null);

  useEffect(() => {
    if (ids.length === 0) {
      setProducts([]);
      return;
    }
    let cancelled = false;
    fetchProductsByIdsClient(ids, tenantId).then((list) => {
      if (!cancelled) setProducts(list);
    });
    return () => {
      cancelled = true;
    };
  }, [ids, tenantId]);

  if (products === null) {
    return (
      <div className="grid grid-cols-2 gap-x-5 gap-y-8 sm:grid-cols-3 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <ProductCardSkeleton key={i} />
        ))}
      </div>
    );
  }

  if (products.length === 0) {
    return (
      <EmptyState
        icon={<Heart className="h-8 w-8" />}
        title="Todavía no guardaste favoritos"
        message="Tocá el corazón en cualquier producto para guardarlo acá y encontrarlo rápido."
        cta={{ href: '/productos', label: 'Explorar productos' }}
      />
    );
  }

  return (
    <div className="grid grid-cols-2 gap-x-5 gap-y-8 sm:grid-cols-3 lg:grid-cols-4">
      {products.map((p, i) => (
        <div key={p.id} className="tf-in" style={{ animationDelay: `${Math.min(i, 8) * 50}ms` }}>
          <ProductCard product={p} list={productList} />
        </div>
      ))}
    </div>
  );
}
