import { SettingsHeader } from './SettingsLayout';
import { HelpLink } from '../../components/HelpLink';
import { MercadoPagoConnect } from './MercadoPagoConnect';

/**
 * Medios de pago: hoy el único integrado de verdad es Mercado Pago (OAuth por
 * tienda, webhooks, reembolsos). Cuando exista otro medio real, se agrega acá
 * — nada de listas decorativas de pasarelas que el checkout no usa.
 */
export function PaymentMethodsPage() {
  return (
    <div className="mx-auto max-w-3xl pb-10">
      <SettingsHeader title="Medios de pago" />
      <MercadoPagoConnect />
      <HelpLink id="payments" />
    </div>
  );
}
