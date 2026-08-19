import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Input } from '@tiendafy/ui';
import { useStore } from '../context/StoreContext';
import { fetchAllProducts, variantLabel, type CatalogProduct } from '../lib/products';

export interface VariantOption {
  variantId: string;
  label: string;
  sku: string;
}

/**
 * Typeahead de variantes del catálogo (antes copiado entre Compras y Kits):
 * busca por label o SKU desde 2 caracteres, muestra hasta 8 y limpia el input
 * al elegir. `exclude` saca las que ya están agregadas.
 */
export function VariantPicker({
  placeholder,
  onPick,
  exclude,
}: {
  placeholder: string;
  onPick: (variant: VariantOption) => void;
  exclude?: Set<string>;
}) {
  const { store } = useStore();
  const [search, setSearch] = useState('');

  const { data: products } = useQuery({
    queryKey: ['products', store?.id],
    queryFn: () => fetchAllProducts<CatalogProduct>(),
    enabled: !!store,
  });

  const allVariants = useMemo(
    () =>
      (products ?? []).flatMap((p) =>
        p.variants.map((v) => ({ variantId: v.id, label: variantLabel(p, v), sku: v.sku })),
      ),
    [products],
  );

  const matches = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (q.length < 2) return [];
    return allVariants
      .filter((v) => !exclude?.has(v.variantId))
      .filter((v) => v.label.toLowerCase().includes(q) || v.sku.toLowerCase().includes(q))
      .slice(0, 8);
  }, [search, allVariants, exclude]);

  return (
    <div className="relative">
      <Input placeholder={placeholder} value={search} onChange={(e) => setSearch(e.target.value)} />
      {matches.length > 0 && (
        <div className="absolute z-10 mt-1 w-full overflow-hidden rounded-md border border-border bg-surface shadow-card">
          {matches.map((v) => (
            <button
              key={v.variantId}
              type="button"
              className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-bg-subtle"
              onClick={() => {
                onPick(v);
                setSearch('');
              }}
            >
              <span className="text-fg">{v.label}</span>
              <span className="text-xs text-fg-subtle">{v.sku}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
