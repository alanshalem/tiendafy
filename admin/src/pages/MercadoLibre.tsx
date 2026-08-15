import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Store } from 'lucide-react';
import { Tabs } from '@tiendafy/ui';
import { api } from '../lib/api';
import { useStore } from '../context/StoreContext';
import { HelpLink } from '../components/HelpLink';
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

const TABS: { id: Tab; label: string }[] = [
  { id: 'ventas', label: 'Ventas' },
  { id: 'preguntas', label: 'Preguntas' },
  { id: 'publicaciones', label: 'Publicaciones' },
  { id: 'reclamos', label: 'Reclamos' },
];

export function MercadoLibrePage() {
  const { store } = useStore();
  const [status, setStatus] = useState<MeliStatus | null>(null);
  const [tab, setTab] = useState<Tab>('ventas');

  useEffect(() => {
    if (!store) return;
    api
      .get<MeliStatus>('/api/v1/admin/meli/status')
      .then(setStatus)
      .catch(() => setStatus({ connected: false, nickname: null }));
  }, [store]);

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
        <Tabs items={TABS} value={tab} onChange={setTab} />
      </div>

      {tab === 'ventas' && <VentasTab />}
      {tab === 'preguntas' && <PreguntasTab />}
      {tab === 'publicaciones' && <PublicacionesTab />}
      {tab === 'reclamos' && <ReclamosTab />}

      <HelpLink id="mercadolibre" />
    </div>
  );
}
