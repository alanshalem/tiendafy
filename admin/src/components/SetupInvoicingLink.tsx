import { Link } from 'react-router-dom';
import { Settings2 } from 'lucide-react';
import { cn } from '@tiendafy/ui';
import { FISCAL_SETTINGS_PATH } from '../lib/useFiscalReady';

/**
 * El reemplazo de "Facturar" / "Facturar ahora" mientras la facturación
 * electrónica no esté lista: en vez de un botón que solo puede dar error, el
 * camino a terminar de configurarla.
 */
export function SetupInvoicingLink({ className, compact }: { className?: string; compact?: boolean }) {
  return (
    <Link
      to={FISCAL_SETTINGS_PATH}
      title="La facturación electrónica todavía no está lista: faltan los datos del emisor, el certificado o el punto de venta."
      className={cn(
        'inline-flex items-center gap-1.5 whitespace-nowrap rounded-md border border-border font-medium text-fg hover:bg-bg-muted',
        compact ? 'px-2.5 py-1 text-xs' : 'px-3 py-1.5 text-sm',
        className,
      )}
    >
      <Settings2 className={compact ? 'h-3.5 w-3.5' : 'h-4 w-4'} aria-hidden="true" /> Configurá la
      facturación
    </Link>
  );
}
