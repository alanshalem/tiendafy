import { SettingsHeader } from './SettingsLayout';
import { SETTINGS_COLUMNS } from '../../lib/styles';
import { HelpLink } from '../../components/HelpLink';
import { MercadoPagoConnect } from './MercadoPagoConnect';
import { WebhookHealth } from './WebhookHealth';
import { PaywayConnect } from './PaywayConnect';

/**
 * Medios de pago. Solo entran los que el checkout usa de verdad — nada de
 * listas decorativas de pasarelas. Hoy son dos, y funcionan distinto: Mercado
 * Pago se conecta por OAuth y avisa por webhook; Payway se configura con
 * claves fijas y hay que preguntarle el estado de cada pago.
 */
export function PaymentMethodsPage() {
  return (
    <div className="pb-10">
      <SettingsHeader title="Medios de pago" />
      <div className={SETTINGS_COLUMNS}>
        <div>
          <MercadoPagoConnect />
          <WebhookHealth />
        </div>
        <PaywayConnect />
      </div>
      <HelpLink id="payments" />
      <HelpLink id="payway" className="mt-2" />
    </div>
  );
}
