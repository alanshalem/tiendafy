import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Home, ShieldOff } from 'lucide-react';
import { api } from '../lib/api';
import { satisfies, type Perm, type PermRequirement } from '../lib/access';
import { useStore } from './StoreContext';
import { NoStoreSelected } from '../components/NoStoreSelected';
import { Spinner } from '@tiendafy/ui';

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
  can: (perm: Perm) => boolean;
  /** Vuelve a pedir los permisos (después de cambiarse el rol a uno mismo). */
  reload: () => void;
}

const PermissionsContext = createContext<PermissionsContextValue | null>(null);

const NO_PERMISSIONS: ReadonlySet<string> = new Set();

export function usePermissions(): PermissionsContextValue {
  const ctx = useContext(PermissionsContext);
  if (!ctx) throw new Error('usePermissions must be used inside <PermissionsProvider>');
  return ctx;
}

export function PermissionsProvider({ children }: { children: ReactNode }) {
  const { store, stores, isLoading: storesLoading } = useStore();
  const storeId = store?.id ?? null;
  const [version, setVersion] = useState(0);
  const reload = useCallback(() => setVersion((v) => v + 1), []);

  // La respuesta queda guardada junto con el pedido que la trajo: "está
  // cargando" es simplemente que la última respuesta no es de este pedido.
  const request = storeId ? `${storeId}:${version}` : null;
  const [answer, setAnswer] = useState<{ request: string; role: string | null; permissions: Set<string> }>();

  useEffect(() => {
    if (!request) return;
    let alive = true;
    api
      .get<MePermissionsDto>('/api/v1/me/permissions')
      .then((d) => {
        if (alive) setAnswer({ request, role: d.role, permissions: new Set(d.permissions) });
      })
      .catch(() => {
        if (alive) setAnswer({ request, role: null, permissions: new Set() });
      });
    return () => {
      alive = false;
    };
  }, [request]);

  const state = !request
    ? // Sin tienda activa: sin permisos. Mientras las tiendas cargan —o ya
      // llegaron y la activa se está eligiendo— seguimos en loading: si no, por
      // un instante parecía no tener permisos y las pantallas lo echaban.
      { role: null, permissions: NO_PERMISSIONS, loading: storesLoading || stores.length > 0 }
    : answer?.request === request
      ? { role: answer.role, permissions: answer.permissions, loading: false }
      : { role: answer?.role ?? null, permissions: answer?.permissions ?? NO_PERMISSIONS, loading: true };

  const value = useMemo<PermissionsContextValue>(
    () => ({
      role: state.role,
      loading: state.loading,
      can: (perm: Perm) => !state.loading && state.permissions.has(perm),
      reload,
    }),
    [state.role, state.loading, state.permissions, reload],
  );

  return <PermissionsContext.Provider value={value}>{children}</PermissionsContext.Provider>;
}

/**
 * Guard de rutas: muestra spinner mientras cargan los permisos y una pantalla
 * amigable si no tiene acceso. `perm` acepta uno o varios (pasa con alguno).
 */
export function RequirePerm({ perm, children }: { perm: PermRequirement; children: ReactNode }) {
  const { can, loading } = usePermissions();
  // Sin la lista de tiendas no hay permisos que mirar: no es "no tenés permiso".
  const { loadError } = useStore();
  if (loadError) return <NoStoreSelected />;

  if (loading) {
    return <Spinner className="py-24" />;
  }

  if (!satisfies(can, perm)) {
    return (
      <div className="flex flex-col items-center gap-3 py-24 text-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-full bg-bg-muted text-fg-muted">
          <ShieldOff className="h-7 w-7" />
        </span>
        <h1 className="text-lg font-bold text-fg">No tenés permiso para ver esta sección</h1>
        <p className="max-w-sm text-sm text-fg-muted">
          Si creés que deberías tener acceso, pedile al dueño o a un administrador de la tienda que ajuste tus
          permisos.
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
