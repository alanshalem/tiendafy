import { useQuery } from '@tanstack/react-query';
import { api } from './api';
import { useStore } from '../context/StoreContext';

/** Configuración › Facturación: adonde manda todo "Facturar" mientras no se pueda facturar. */
export const FISCAL_SETTINGS_PATH = '/configuracion/facturacion';

/**
 * ¿La tienda ya puede facturar? (emisor, certificado activo y punto de venta).
 *
 * Mientras la facturación esté a medio configurar, apretar "Facturar" solo
 * puede dar error: en su lugar se ofrece "Configurá la facturación" (ver
 * components/SetupInvoicingLink). Si no se sabe (la API no contestó), se
 * asume que sí: mejor un error explicado del backend que esconder el botón a
 * quien ya tiene todo listo.
 */
export function useFiscalReady(): boolean {
  const { store } = useStore();
  const { data } = useQuery({
    queryKey: ['fiscal-readiness', store?.id],
    queryFn: () => api.get<{ ready: boolean }>('/api/v1/fiscal/readiness'),
    enabled: !!store,
    staleTime: 60_000,
    retry: false,
  });
  return data?.ready ?? true;
}
