import { useState } from 'react';
import { AlertTriangle, Loader2, RotateCw } from 'lucide-react';
import { Button, useToast } from '@tiendafy/ui';
import { api, errMsg } from '../../lib/api';
import { useStore } from '../../context/StoreContext';
import { usePermissions } from '../../context/PermissionsContext';
import { formatDateTime } from '../../lib/format';
import { useServerLoad } from '../../lib/useServerLoad';

/**
 * Avisos de Mercado Pago que no se pudieron procesar.
 *
 * Cuando alguien paga, Mercado Pago nos avisa una vez. Si ese aviso falla
 * tantas veces que el sistema se da por vencido, la venta queda cobrada pero
 * sin registrar, y hasta ahora no había forma de enterarse: no falla nada, no
 * llega ningún mail, el pedido simplemente se queda esperando para siempre.
 *
 * Este bloque solo aparece cuando hay alguno. Si está todo bien, no se ve nada
 * —un panel que avisa siempre deja de avisar—.
 */

interface StuckEvent {
  id: string;
  dataId: string;
  attempts: number;
  lastError: string | null;
  createdAtUtc: string;
}

interface Health {
  connected: boolean;
  pending: number;
  stuck: number;
  last: string | null;
  stuckEvents: StuckEvent[];
}

export function WebhookHealth() {
  const { store } = useStore();
  const { can } = usePermissions();
  const { toast } = useToast();

  const [health, setHealth] = useState<Health | null>(null);
  const [retrying, setRetrying] = useState<string | null>(null);

  const { reload: load } = useServerLoad(
    store?.id ?? null,
    () => api.get<Health>('/api/v1/payments/mercadopago/webhooks/health'),
    setHealth,
    () => setHealth(null), // sin permiso o sin conexión: no es un error que mostrar acá
  );

  if (!health?.connected || health.stuck === 0) return null;

  const retry = async (ev: StuckEvent) => {
    setRetrying(ev.id);
    try {
      await api.post(`/api/v1/payments/mercadopago/webhooks/${ev.id}/retry`, {});
      toast('Lo volvimos a poner en cola', { variant: 'success' });
      await load();
    } catch (e) {
      toast(errMsg(e, 'No se pudo reintentar.'), { variant: 'error' });
    } finally {
      setRetrying(null);
    }
  };

  return (
    <section className="mt-6 rounded-lg border border-amber-500/40 bg-amber-500/5 p-5">
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold">
            {health.stuck === 1
              ? 'Hay un aviso de pago que no se pudo procesar'
              : `Hay ${health.stuck} avisos de pago que no se pudieron procesar`}
          </h3>
          <p className="mt-1 text-sm text-fg-muted">
            Puede haber una venta cobrada que no quedó registrada. Revisá el pago en Mercado Pago y, si ya
            está todo en orden, volvé a intentarlo desde acá.
          </p>

          <ul className="mt-4 space-y-2">
            {health.stuckEvents.map((ev) => (
              <li
                key={ev.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-md bg-bg px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="font-mono text-xs">Pago {ev.dataId}</p>
                  <p className="mt-0.5 text-xs text-fg-muted">
                    {formatDateTime(ev.createdAtUtc)} · {ev.attempts} intentos
                    {ev.lastError ? ` · ${ev.lastError}` : ''}
                  </p>
                </div>
                {can('payments.write') && (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => retry(ev)}
                    disabled={retrying !== null}
                  >
                    {retrying === ev.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                    ) : (
                      <RotateCw className="h-4 w-4" aria-hidden="true" />
                    )}
                    Reintentar
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
