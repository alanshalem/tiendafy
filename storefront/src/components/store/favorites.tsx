'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useAuth } from './auth';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:5080';

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
    const raw = localStorage.getItem(key);
    if (raw) {
      try {
        const p = JSON.parse(raw);
        if (Array.isArray(p)) setIds(p.filter((x) => typeof x === 'string'));
      } catch {
        /* ignore */
      }
    }
  }, [key]);

  // Persistir siempre a localStorage.
  useEffect(() => {
    localStorage.setItem(key, JSON.stringify(ids));
  }, [key, ids]);

  // Al loguearse: subir locales (merge) y adoptar el set del server.
  useEffect(() => {
    if (!ready || !token) return;
    let cancelled = false;
    let local: string[] = [];
    try {
      const raw = localStorage.getItem(key);
      local = raw ? JSON.parse(raw) : [];
    } catch {
      local = [];
    }
    fetch(`${API}/api/v1/shop/favorites/merge`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Tenant-Id': storeKey, Authorization: `Bearer ${token}` },
      body: JSON.stringify({ productIds: local }),
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (!cancelled && d) setIds(d.productIds ?? []); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [ready, token, key, storeKey]);

  const toggle = useCallback(
    (id: string) => {
      setIds((prev) => {
        const has = prev.includes(id);
        if (token) {
          fetch(`${API}/api/v1/shop/favorites/${id}`, {
            method: has ? 'DELETE' : 'PUT',
            headers: { 'X-Tenant-Id': storeKey, Authorization: `Bearer ${token}` },
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
