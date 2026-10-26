import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button, Spinner } from '@tiendafy/ui';
import { api } from '../../lib/api';
import type { AiConfig } from '../../lib/ai';
import { qk } from '../../lib/queryKeys';
import { useStore } from '../../context/StoreContext';
import { ERROR_SHOWN, LoadError } from '../../components/LoadError';
import { SETTINGS_CARD, SETTINGS_COLUMNS } from '../../lib/styles';
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
        <div key={store?.id} className={SETTINGS_COLUMNS}>
          <AiProvidersCard providers={config.providers} />
          <AiModelsCard tasks={config.tasks} assignments={config.assignments} />
          <AiBudgetCard settings={config.settings} />
          <AiUsageCard tasks={config.tasks} />
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
          <AiCopyDialog open={copyOpen} onClose={() => setCopyOpen(false)} />
          <HelpLink id="ia" />
        </div>
      )}
    </div>
  );
}
