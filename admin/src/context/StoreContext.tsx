import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { qk } from '../lib/queryKeys';
import type { Tenant } from '@tiendafy/types';
import { api, setActiveTenant } from '../lib/api';

interface StoreContextValue {
  /** Tienda activa del panel. Null hasta elegir (o si no hay tiendas). */
  store: Tenant | null;
  stores: Tenant[];
  selectStore: (store: Tenant) => void;
  isLoading: boolean;
  /**
   * No se pudo traer la lista de tiendas. No es "no hay tiendas": las
   * pantallas dicen que falló la carga en vez de "Elegí una tienda".
   */
  loadError: unknown;
  retry: () => void;
}

const StoreContext = createContext<StoreContextValue | null>(null);

const STORAGE_KEY = 'tiendafy.selectedStore';

export function useStore(): StoreContextValue {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useStore must be used inside <StoreProvider>');
  return ctx;
}

export function StoreProvider({ children }: { children: ReactNode }) {
  // La tienda elegida (o la que quedó guardada). La activa se deriva de esto y
  // de la lista: si la elegida ya no existe, la primera.
  const [chosenId, setChosenId] = useState<string | null>(() => localStorage.getItem(STORAGE_KEY));

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: qk.tenants(),
    // El selector las quiere todas: 200 es el techo de la API (antes se pedían
    // 50 y el servidor igual mandaba todas).
    queryFn: () => api.get<{ items: Tenant[] }>('/api/v1/tenants?limit=200'),
    meta: { errorShown: true },
  });

  // Memoizado: con `?? []` suelto, mientras carga era un array nuevo en cada
  // render y todo lo que depende de la lista se recalculaba.
  const stores = useMemo(() => data?.items ?? [], [data]);

  const store = useMemo(
    () => (stores.length === 0 ? null : (stores.find((s) => s.id === chosenId) ?? stores[0]!)),
    [stores, chosenId],
  );

  // El header X-Tenant-Id sigue a la tienda activa en el MISMO render en que
  // cambia: las queries que dependen de store.id refetchean con el tenant
  // correcto, sin esperar a un efecto (sin race).
  setActiveTenant(store?.id ?? null);

  // Sin tiendas (p. ej. se eliminaron todas): que al recargar el switcher no
  // busque una tienda que ya no existe. Si la lista no llegó, no se sabe:
  // la elegida se conserva.
  useEffect(() => {
    if (!isLoading && !isError && stores.length === 0) localStorage.removeItem(STORAGE_KEY);
  }, [isLoading, isError, stores.length]);
  const loadError = isError && !data ? error : null;
  const retry = useCallback(() => void refetch(), [refetch]);

  const selectStore = useCallback(
    (next: Tenant) => {
      if (next.id === store?.id) return;
      setActiveTenant(next.id); // sync, ANTES de que las queries (key store.id) refetcheen
      setChosenId(next.id);
      localStorage.setItem(STORAGE_KEY, next.id);
    },
    [store?.id],
  );

  return (
    <StoreContext.Provider value={{ store, stores, selectStore, isLoading, loadError, retry }}>
      {children}
    </StoreContext.Provider>
  );
}
