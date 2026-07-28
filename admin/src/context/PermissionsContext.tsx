import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Home, Loader2, ShieldOff } from 'lucide-react';
import { api } from '../lib/api';
import { useStore } from './StoreContext';

/** Respuesta de GET /api/v1/me/permissions (rol + claves efectivas en la tienda activa). */
interface MePermissionsDto {
  role: string;
  permissions: string[];
}

interface PermissionsContextValue {
  /** Rol del usuario en la tienda activa (null mientras carga o si falló). */
  role: string | null;
  /** true mientras se resuelven las tiendas o los permisos. */
  loading: boolean;
  /** ¿Tiene el permiso? Devuelve false mientras carga o si la carga falló. */
  can: (perm: string) => boolean;
}

const PermissionsContext = createContext<PermissionsContextValue | null>(null);

export function usePermissions(): PermissionsContextValue {
  const ctx = useContext(PermissionsContext);
  if (!ctx) throw new Error('usePermissions must be used inside <PermissionsProvider>');
  return ctx;
}

/** true si tiene ALGUNO de los permisos pedidos (string o lista). */
export function canAny(can: (p: string) => boolean, perm: string | string[]): boolean {
  return (Array.isArray(perm) ? perm : [perm]).some(can);
}

export function PermissionsProvider({ children }: { children: ReactNode }) {
  const { store, isLoading: storesLoading } = useStore();
  const [state, setState] = useState<{
    role: string | null;
    permissions: Set<string>;
    loading: boolean;
  }>({ role: null, permissions: new Set(), loading: true });

  const storeId = store?.id ?? null;

  useEffect(() => {
    if (!storeId) {
      // Sin tienda activa: sin permisos. Mientras las tiendas cargan seguimos en loading.
      setState({ role: null, permissions: new Set(), loading: storesLoading });
      return;
    }
    let alive = true;
    setState((s) => ({ ...s, loading: true }));
    api
      .get<MePermissionsDto>('/api/v1/me/permissions')
      .then((d) => {
        if (alive) setState({ role: d.role, permissions: new Set(d.permissions), loading: false });
      })
      .catch(() => {
        if (alive) setState({ role: null, permissions: new Set(), loading: false });
      });
    return () => {
      alive = false;
    };
  }, [storeId, storesLoading]);

  const value = useMemo<PermissionsContextValue>(
    () => ({
      role: state.role,
      loading: state.loading,
      can: (perm: string) => !state.loading && state.permissions.has(perm),
    }),
    [state],
  );

  return <PermissionsContext.Provider value={value}>{children}</PermissionsContext.Provider>;
}

/**
 * Guard de rutas: muestra spinner mientras cargan los permisos y una pantalla
 * amigable si el rol no tiene acceso. `perm` acepta string o lista (pasa con alguno).
 */
export function RequirePerm({ perm, children }: { perm: string | string[]; children: ReactNode }) {
  const { can, loading } = usePermissions();

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 text-fg-muted">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  if (!canAny(can, perm)) {
    return (
      <div className="flex flex-col items-center gap-3 py-24 text-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-full bg-bg-muted text-fg-muted">
          <ShieldOff className="h-7 w-7" />
        </span>
        <h1 className="text-lg font-bold text-fg">No tenés permiso para ver esta sección</h1>
        <p className="max-w-sm text-sm text-fg-muted">
          Si creés que deberías tener acceso, pedile al dueño o a un administrador de la tienda que ajuste tu
          rol.
        </p>
        <Link
          to="/"
          className="mt-2 inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-fg hover:opacity-90"
        >
          <Home className="h-4 w-4" /> Ir al inicio
        </Link>
      </div>
    );
  }

  return <>{children}</>;
}
