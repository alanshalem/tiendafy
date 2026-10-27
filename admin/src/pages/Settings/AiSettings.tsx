import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button, Spinner } from '@tiendafy/ui';
import { api } from '../../lib/api';
import type { AiConfig } from '../../lib/ai';
import { qk } from '../../lib/queryKeys';
import { useStore } from '../../context/StoreContext';
import { ERROR_SHOWN, LoadError } from '../../components/LoadError';
import { SETTINGS_CARD } from '../../lib/styles';
import { HelpLink } from '../../components/HelpLink';
import { SettingsHeader } from './SettingsLayout';
import { AiProvidersCard } from './AiProvidersCard';
import { AiModelsCard } from './AiModelsCard';
import { AiBudgetCard } from './AiBudgetCard';
import { AiUsageCard } from './AiUsageCard';
import { AiCopyDialog } from './AiCopyDialog';

/** Configuración → Inteligencia artificial: claves, modelos por tarea, presupuesto, consumo y copia a otras tiendas. */
export function AiSettingsPage() {
  const { store } = useStore();
  const [copyOpen, setCopyOpen] = useState(false);

  const query = useQuery({
    queryKey: qk.aiConfig(store?.id),
    queryFn: () => api.get<AiConfig>('/api/v1/ai/config'),
    enabled: !!store,
    meta: ERROR_SHOWN,
  });
  const config = query.data;

  if (query.error && !config)
    return (
      <LoadError
        title="No se pudo cargar la configuración de inteligencia artificial."
        error={query.error}
        onRetry={() => void query.refetch()}
        retrying={query.isFetching}
      />
    );

  return (
    <div className="space-y-5">
      <SettingsHeader
        title="Inteligencia artificial"
        description="Claves, modelos, tope mensual y consumo de la IA. Las respuestas y los textos que sugiere siempre los revisás vos antes de usarlos."
      />
      {!config ? (
        <p className="flex items-center gap-2 text-sm text-fg-muted">
          <Spinner inline /> Cargando…
        </p>
      ) : (
        // key: lo que se tipeó y no se guardó (clave, modelos, tope) es de esta tienda; al cambiar de tienda se descarta.
        <div key={store?.id} className="space-y-5">
          {/* En pantallas anchas, dos columnas parejas: claves, presupuesto y copiar
              apiladas a la izquierda, y los modelos (la tarjeta más alta) a la derecha
              a lo alto de las tres. El alto que sobre va a la última fila, no entre
              tarjetas. Más angosto, una abajo de otra en el orden de armado. */}
          <div className="grid items-start gap-4 2xl:grid-cols-2 2xl:grid-rows-[auto_auto_1fr]">
            <AiProvidersCard providers={config.providers} />
            <div className="2xl:col-start-2 2xl:row-span-3 2xl:row-start-1">
              <AiModelsCard tasks={config.tasks} assignments={config.assignments} />
            </div>
            <AiBudgetCard settings={config.settings} />
            <section className={SETTINGS_CARD}>
              <h2 className="text-base font-semibold text-fg">Copiar a mis otras tiendas</h2>
              <p className="mt-1 text-sm text-fg-muted">
                Si tenés más de una tienda, pasá las claves, los modelos o el presupuesto de esta a las otras
                sin cargarlos de nuevo.
              </p>
              <div className="mt-3">
                <Button variant="secondary" onClick={() => setCopyOpen(true)}>
                  Copiar a mis otras tiendas
                </Button>
              </div>
            </section>
          </div>
          <AiUsageCard tasks={config.tasks} />
          <AiCopyDialog open={copyOpen} onClose={() => setCopyOpen(false)} />
          <HelpLink id="ia" />
        </div>
      )}
    </div>
  );
}
