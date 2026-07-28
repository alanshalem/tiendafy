import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { Tenant } from '@tiendafy/types';
import { api, setActiveTenant } from '../lib/api';

interface StoreContextValue {
  /** Tienda activa del panel. Null hasta elegir (o si no hay tiendas). */
  store: Tenant | null;
  stores: Tenant[];
  selectStore: (store: Tenant) => void;
  isLoading: boolean;
}

const StoreContext = createContext<StoreContextValue | null>(null);

const STORAGE_KEY = 'tiendafy.selectedStore';

export function useStore(): StoreContextValue {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useStore must be used inside <StoreProvider>');
  return ctx;
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [store, setStore] = useState<Tenant | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['tenants'],
    queryFn: () => api.get<{ items: Tenant[] }>('/api/v1/tenants?limit=50'),
  });

  const stores = data?.items ?? [];

  // Restaurar selección previa; si no hay, auto-seleccionar la primera.
  // El header X-Tenant-Id se setea ACÁ (sync) para que las queries que
  // refetchean al cambiar store.id ya usen el tenant correcto (sin race).
  useEffect(() => {
    // Sin tiendas (p.ej. se eliminaron todas): limpiar selección, header y
    // localStorage para que el switcher no muestre nombres viejos al recargar.
    if (stores.length === 0) {
      setStore((current) => {
        if (current) {
          setActiveTenant(null);
          localStorage.removeItem(STORAGE_KEY);
        }
        return null;
      });
      return;
    }
    setStore((current) => {
      const target = current
        ? (stores.find((s) => s.id === current.id) ?? stores[0]!)
        : (stores.find((s) => s.id === localStorage.getItem(STORAGE_KEY)) ?? stores[0]!);
      setActiveTenant(target.id);
      return target;
    });
  }, [stores]);

  // Backup: mantener el header en sync con la tienda activa.
  useEffect(() => {
    setActiveTenant(store?.id ?? null);
  }, [store]);

  const selectStore = useCallback(
    (next: Tenant) => {
      if (next.id === store?.id) return;
      setActiveTenant(next.id); // sync, ANTES de que las queries (key store.id) refetcheen
      setStore(next);
      localStorage.setItem(STORAGE_KEY, next.id);
    },
    [store?.id],
  );

  return (
    <StoreContext.Provider value={{ store, stores, selectStore, isLoading }}>
      {children}
    </StoreContext.Provider>
  );
}
