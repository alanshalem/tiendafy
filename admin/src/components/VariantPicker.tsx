import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Input } from '@tiendafy/ui';
import { useStore } from '../context/StoreContext';
import { Z_ANCHORED } from '../lib/styles';
import { variantLabel, type CatalogProduct } from '../lib/products';
import { api } from '../lib/api';
import { useDebouncedValue } from '../lib/useDebouncedValue';

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
  const q = useDebouncedValue(search).trim();

  // La búsqueda va a la base: traerse el catálogo entero para filtrar en el
  // navegador funcionaba con 400 productos y no con 5.000.
  const { data: products } = useQuery({
    queryKey: ['variant-search', store?.id, q],
    queryFn: () =>
      api.get<{ items: CatalogProduct[] }>(`/api/v1/products?limit=10&q=${encodeURIComponent(q)}`),
    enabled: !!store && q.length >= 2,
  });

  const matches = useMemo(
    () =>
      (products?.items ?? [])
        .flatMap((p) => p.variants.map((v) => ({ variantId: v.id, label: variantLabel(p, v), sku: v.sku })))
        .filter((v) => !exclude?.has(v.variantId))
        .slice(0, 8),
    [products, exclude],
  );

  return (
    <div className="relative">
      <Input placeholder={placeholder} value={search} onChange={(e) => setSearch(e.target.value)} />
      {matches.length > 0 && (
        // Sin un z por encima del chrome fijo, la lista queda debajo del
        // encabezado de la tabla que suele haber abajo en la misma pantalla.
        <div
          className={`absolute ${Z_ANCHORED} mt-1 w-full overflow-hidden rounded-md border border-border bg-surface shadow-card`}
        >
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
