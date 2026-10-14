import { Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Store } from 'lucide-react';
import { Tabs } from '@tiendafy/ui';
import { api } from '../lib/api';
import { useStore } from '../context/StoreContext';
import { usePermissions } from '../context/PermissionsContext';
import type { Perm } from '../lib/access';
import { HelpLink } from '../components/HelpLink';
import { ERROR_SHOWN, LoadError } from '../components/LoadError';
import { VentasTab } from './mercadolibre-ventas';
import { PreguntasTab } from './mercadolibre-preguntas';
import { PublicacionesTab } from './mercadolibre-publicaciones';
import { ReclamosTab } from './mercadolibre-reclamos';

interface MeliStatus {
  connected: boolean;
  nickname: string | null;
}

// ---- Página ------------------------------------------------------------------

type Tab = 'ventas' | 'preguntas' | 'publicaciones' | 'reclamos';

/** Atender (ventas, preguntas, reclamos) y publicar son permisos distintos. */
const TABS: { id: Tab; label: string; perm: Perm }[] = [
  { id: 'ventas', label: 'Ventas', perm: 'meli.operate' },
  { id: 'preguntas', label: 'Preguntas', perm: 'meli.operate' },
  { id: 'publicaciones', label: 'Publicaciones', perm: 'meli.publish' },
  { id: 'reclamos', label: 'Reclamos', perm: 'meli.operate' },
];

export function MercadoLibrePage() {
  const { store } = useStore();
  const { can } = usePermissions();
  const tabs = TABS.filter((t) => can(t.perm));
  // Antes un error al preguntar el estado se tomaba como "no conectada" y la
  // pantalla invitaba a conectar una cuenta que ya estaba conectada.
  const {
    data: status,
    error,
    isError,
    refetch,
    isFetching,
  } = useQuery({
    queryKey: ['meli-status', store?.id],
    queryFn: () => api.get<MeliStatus>('/api/v1/admin/meli/status'),
    enabled: !!store,
    meta: ERROR_SHOWN,
  });

  // La pestaña vive en la URL para poder mandar a alguien directo a la que
  // resuelve su problema — desde Configuración, por ejemplo, a vincular
  // publicaciones — y para que el botón Atrás del browser haga lo esperable.
  const [params, setParams] = useSearchParams();
  const requested = params.get('tab');
  const tab: Tab = tabs.find((t) => t.id === requested)?.id ?? tabs[0]?.id ?? 'ventas';
  const setTab = (next: Tab) => {
    params.set('tab', next);
    setParams(params, { replace: true });
  };

  if (isError && !status)
    return (
      <div className="mx-auto max-w-xl py-16">
        <h1 className="mb-4 text-2xl font-bold tracking-tight">Mercado Libre</h1>
        <LoadError
          title="No se pudo cargar el estado de Mercado Libre."
          error={error}
          onRetry={() => void refetch()}
          retrying={isFetching}
        />
      </div>
    );
  if (!status) return null;

  if (!status.connected) {
    return (
      <div className="mx-auto max-w-xl py-16 text-center">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-warning-bg text-warning">
          <Store className="h-7 w-7" />
        </span>
        <h1 className="mt-4 text-2xl font-bold tracking-tight">Mercado Libre</h1>
        <p className="mt-2 text-fg-muted">
          Conectá tu cuenta de vendedor y mirá tus ventas, preguntas y mensajes de Mercado Libre sin salir del
          panel. Vinculando publicaciones, el stock queda unificado.
        </p>
        <Link
          to="/configuracion/mercadolibre"
          className="mt-5 inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-fg hover:bg-primary-hover"
        >
          Conectar mi cuenta
        </Link>
        <HelpLink id="mercadolibre" />
      </div>
    );
  }

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Mercado Libre</h1>
          <p className="mt-0.5 text-sm text-fg-muted">
            Conectado como <span className="font-medium text-fg">{status.nickname}</span>
          </p>
        </div>
        {/* max-w-full: sin tope, la fila de pestañas se quedaba con el ancho de
            su contenido y en un celular "Reclamos" caía fuera de la pantalla;
            con tope, la fila corre de costado. */}
        <Tabs items={tabs} value={tab} onChange={setTab} className="max-w-full" />
      </div>

      {tab === 'ventas' && <VentasTab />}
      {tab === 'preguntas' && <PreguntasTab />}
      {tab === 'publicaciones' && <PublicacionesTab />}
      {tab === 'reclamos' && <ReclamosTab />}

      <HelpLink id="mercadolibre" />
    </div>
  );
}
