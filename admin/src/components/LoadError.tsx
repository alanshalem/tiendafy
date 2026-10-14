import { AlertTriangle, RefreshCw } from 'lucide-react';
import { Button, cn } from '@tiendafy/ui';
import { errMsg } from '../lib/api';

/**
 * No se pudo cargar algo: lo dice, con el motivo si la API lo explicó, y deja
 * reintentar. Va en el lugar de la lista o del estado que no llegó.
 *
 * Existe porque un pedido fallido se veía igual que "no hay nada": "Conectá tu
 * cuenta" con la cuenta conectada, "sin configurar" con las credenciales
 * cargadas — y eso invitaba a hacer algo que no hacía falta (reconectar,
 * volver a cargar claves). Las queries que lo muestran llevan
 * `meta: { errorShown: true }` para que el aviso global no lo repita.
 */
export function LoadError({
  title,
  error,
  onRetry,
  retrying = false,
  className,
}: {
  /** La frase entera: "No se pudieron cargar los reclamos." */
  title: string;
  error?: unknown;
  onRetry: () => void;
  retrying?: boolean;
  className?: string;
}) {
  const reason = errMsg(error, '');
  return (
    <div
      role="alert"
      className={cn(
        'flex flex-col items-start gap-3 rounded-lg border border-danger/30 bg-danger/[0.04] p-4 sm:flex-row sm:items-center',
        className,
      )}
    >
      <AlertTriangle className="h-5 w-5 shrink-0 text-danger" aria-hidden />
      <div className="min-w-0 flex-1 text-sm">
        <p className="font-medium text-fg">{title}</p>
        <p className="mt-0.5 text-fg-muted">
          {reason || 'Puede ser la conexión o un problema momentáneo del servidor.'} No es que no haya datos:
          reintentá antes de cambiar nada.
        </p>
      </div>
      <Button variant="secondary" onClick={onRetry} loading={retrying} className="shrink-0">
        <RefreshCw className="h-4 w-4" aria-hidden /> Reintentar
      </Button>
    </div>
  );
}

/** Meta de las queries que muestran su propio LoadError (el aviso global no las repite). */
export const ERROR_SHOWN = { errorShown: true } as const;
