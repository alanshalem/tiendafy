import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { CheckCircle2 } from 'lucide-react';
import { Button, useConfirm, useToast } from '@tiendafy/ui';
import { api, errMsg } from '../../lib/api';
import { useStore } from '../../context/StoreContext';
import { LoadError } from '../../components/LoadError';

/** Config mínima que la card necesita para pintar estado. */
export interface CarrierConfigBase {
  configured: boolean;
  active?: boolean;
  /**
   * No se pudo leer la config. Antes se mostraba como "sin configurar" e
   * invitaba a volver a cargar credenciales que ya estaban cargadas.
   */
  loadError?: unknown;
}

/** Carga la config del carrier y expone load() para refrescar tras guardar/desconectar. */
export function useCarrierConfig<T extends CarrierConfigBase>(url: string) {
  const { store } = useStore();
  const [config, setConfig] = useState<T | null>(null);

  const load = useCallback(() => {
    api
      .get<T>(url)
      .then(setConfig)
      .catch((error: unknown) => setConfig({ configured: false, loadError: error ?? true } as T));
  }, [url]);

  useEffect(() => {
    if (store) load();
  }, [store, load]);

  return { config, load };
}

/**
 * Card de integración de un carrier en Medios de envío (Correo Argentino,
 * Zipnova): icono, badges de estado, descripción y botones Desconectar /
 * Configurar. El modal de configuración lo aporta cada carrier.
 */
export function CarrierCard({
  className,
  icon,
  title,
  tag,
  extraBadges,
  description,
  config,
  disconnect,
  onConfigure,
}: {
  className?: string;
  icon: ReactNode;
  title: string;
  tag: string;
  extraBadges?: ReactNode;
  description: string;
  config: CarrierConfigBase;
  disconnect: { url: string; confirmMessage: string; successToast: string; onDone: () => void };
  onConfigure: () => void;
}) {
  const { toast } = useToast();
  const confirm = useConfirm();

  const doDisconnect = async () => {
    const ok = await confirm({
      title: `Desconectar ${title}`,
      message: disconnect.confirmMessage,
      confirmLabel: 'Desconectar',
      variant: 'danger',
    });
    if (!ok) return;
    try {
      await api.delete(disconnect.url);
      toast(disconnect.successToast, { variant: 'success' });
      disconnect.onDone();
    } catch (err) {
      toast(errMsg(err, 'No se pudo desconectar.'), { variant: 'error' });
    }
  };

  // Sin saber cómo está, no se ofrece configurar ni desconectar: se reintenta.
  // (onDone es el load() de useCarrierConfig en las tres tarjetas.)
  if (config.loadError)
    return (
      <LoadError
        className={className}
        title={`No se pudo cargar la configuración de ${title}.`}
        error={config.loadError}
        onRetry={disconnect.onDone}
      />
    );

  return (
    <div className={`${className ?? ''} rounded-lg border border-border bg-surface p-4 shadow-card`}>
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-bg-muted text-fg-muted">
          {icon}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold text-fg">{title}</span>
            <span className="rounded-full bg-bg-muted px-2 py-0.5 text-[11px] font-medium text-fg-muted">
              {tag}
            </span>
            {config.configured && config.active && (
              <span className="inline-flex items-center gap-1 rounded-full bg-success-bg px-2 py-0.5 text-[11px] font-semibold text-success">
                <CheckCircle2 className="h-3 w-3" /> Activo
              </span>
            )}
            {config.configured && !config.active && (
              <span className="rounded-full bg-bg-muted px-2 py-0.5 text-[11px] font-semibold text-fg-muted">
                Pausado
              </span>
            )}
            {extraBadges}
          </div>
          <p className="mt-0.5 text-sm text-fg-muted">{description}</p>
        </div>
        <div className="flex shrink-0 gap-2">
          {config.configured && (
            <Button variant="secondary" onClick={doDisconnect}>
              Desconectar
            </Button>
          )}
          <Button onClick={onConfigure}>{config.configured ? 'Editar' : 'Configurar'}</Button>
        </div>
      </div>
    </div>
  );
}
