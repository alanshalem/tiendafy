'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useAuth } from './auth';

import { API_URL as API, clientJson } from '@/lib/api-client';
import { readJson, writeJson } from '@/lib/storage';

/**
 * Favoritos del comprador.
 * - Invitado → localStorage por tienda.
 * - Logueado → DB (sync). Al loguearse hace merge de los locales con el server.
 * localStorage siempre se mantiene como cache / fuente del invitado.
 */
interface FavoritesContextValue {
  ids: string[];
  count: number;
  has: (id: string) => boolean;
  toggle: (id: string) => void;
}

const FavoritesContext = createContext<FavoritesContextValue | null>(null);

export function useFavorites(): FavoritesContextValue {
  const ctx = useContext(FavoritesContext);
  if (!ctx) throw new Error('useFavorites must be used inside <FavoritesProvider>');
  return ctx;
}

export function FavoritesProvider({ storeKey, children }: { storeKey: string; children: ReactNode }) {
  const key = `tiendafy.favorites.${storeKey}`;
  const { token, ready } = useAuth();
  const [ids, setIds] = useState<string[]>([]);

  // Carga inicial desde localStorage (invitado o cache del logueado).
  useEffect(() => {
    const stored = readJson<unknown>(key, []);
    if (Array.isArray(stored)) setIds(stored.filter((x): x is string => typeof x === 'string'));
  }, [key]);

  // Persistir siempre a localStorage.
  useEffect(() => {
    writeJson(key, ids);
  }, [key, ids]);

  // Al loguearse: subir locales (merge) y adoptar el set del server.
  useEffect(() => {
    if (!ready || !token) return;
    let cancelled = false;
    const local = readJson<string[]>(key, []);
    clientJson<{ productIds?: string[] }>('/api/v1/shop/favorites/merge', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Tenant-Id': storeKey },
      credentials: 'include',
      body: JSON.stringify({ productIds: local }),
    }).then((d) => {
      if (!cancelled && d) setIds(d.productIds ?? []);
    });
    return () => {
      cancelled = true;
    };
  }, [ready, token, key, storeKey]);

  const toggle = useCallback(
    (id: string) => {
      setIds((prev) => {
        const has = prev.includes(id);
        if (token) {
          fetch(`${API}/api/v1/shop/favorites/${id}`, {
            method: has ? 'DELETE' : 'PUT',
            headers: { 'X-Tenant-Id': storeKey },
            credentials: 'include',
          }).catch(() => {});
        }
        return has ? prev.filter((x) => x !== id) : [id, ...prev];
      });
    },
    [token, storeKey],
  );

  const value = useMemo<FavoritesContextValue>(
    () => ({ ids, count: ids.length, has: (id) => ids.includes(id), toggle }),
    [ids, toggle],
  );

  return <FavoritesContext.Provider value={value}>{children}</FavoritesContext.Provider>;
}
