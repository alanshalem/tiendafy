import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { X } from 'lucide-react';
import { Input } from '@tiendafy/ui';
import { useStore } from '../context/StoreContext';
import { Z_ANCHORED } from '../lib/styles';
import { api } from '../lib/api';
import { useDebouncedValue } from '../lib/useDebouncedValue';

interface CouponOption {
  id: string;
  code: string;
  active: boolean;
}

/** Sugerencias que se muestran a la vez. */
const SUGGESTIONS = 8;

/**
 * Elegir un cupón activo buscándolo por código (campañas de email, posts de
 * redes). Antes era un desplegable con los cupones que traía la primera
 * página de la API: con más de 50, el que se buscaba no estaba.
 *
 * La búsqueda va a la base (la misma de la lista de cupones). Elegido, se
 * muestra el código con una X para sacarlo; vacío es "sin cupón".
 */
export function CouponPicker({
  value,
  onChange,
  label,
  id,
}: {
  value: string;
  onChange: (code: string) => void;
  label: string;
  id?: string;
}) {
  const { store } = useStore();
  const [search, setSearch] = useState('');
  const [focused, setFocused] = useState(false);
  const q = useDebouncedValue(search).trim();

  const { data, isFetching } = useQuery({
    queryKey: ['coupon-search', store?.id, q],
    queryFn: () => {
      // Se piden algunos de más: los inactivos se descartan acá.
      const params = new URLSearchParams({ limit: String(SUGGESTIONS * 2) });
      if (q) params.set('q', q);
      return api.get<{ items: CouponOption[] }>(`/api/v1/coupons?${params}`);
    },
    enabled: !!store && focused && !value,
  });
  const matches = (data?.items ?? []).filter((c) => c.active).slice(0, SUGGESTIONS);

  if (value) {
    return (
      <div className="flex h-10 items-center justify-between gap-2 rounded-md border border-border-strong bg-surface px-3 text-sm">
        <span className="font-mono font-medium text-fg">{value}</span>
        <button
          type="button"
          aria-label={`Sacar el cupón ${value}`}
          onClick={() => onChange('')}
          className="rounded-sm p-0.5 text-fg-muted hover:bg-bg-muted hover:text-fg"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    );
  }

  return (
    <div className="relative">
      <Input
        id={id}
        type="search"
        aria-label={label}
        placeholder="Buscar cupón por código…"
        autoComplete="off"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        onFocus={() => setFocused(true)}
        // Con demora: si no, el click en una sugerencia llega cuando la lista
        // ya se cerró.
        onBlur={() => setTimeout(() => setFocused(false), 150)}
      />
      {focused && (matches.length > 0 || (q && !isFetching)) && (
        <div
          role="listbox"
          aria-label={`${label}: sugerencias`}
          className={`absolute ${Z_ANCHORED} mt-1 w-full overflow-hidden rounded-md border border-border bg-surface shadow-card`}
        >
          {matches.length === 0 ? (
            <p className="px-3 py-2 text-sm text-fg-muted">Ningún cupón activo con ese código.</p>
          ) : (
            matches.map((c) => (
              <button
                key={c.id}
                type="button"
                role="option"
                aria-selected={false}
                className="flex w-full items-center px-3 py-2 text-left font-mono text-sm text-fg hover:bg-bg-subtle"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onChange(c.code);
                  setSearch('');
                  setFocused(false);
                }}
              >
                {c.code}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
