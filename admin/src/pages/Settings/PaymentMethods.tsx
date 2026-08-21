import { SettingsHeader } from './SettingsLayout';
import { HelpLink } from '../../components/HelpLink';
import { MercadoPagoConnect } from './MercadoPagoConnect';
import { PaywayConnect } from './PaywayConnect';

/**
 * Medios de pago. Solo entran los que el checkout usa de verdad — nada de
 * listas decorativas de pasarelas. Hoy son dos, y funcionan distinto: Mercado
 * Pago se conecta por OAuth y avisa por webhook; Payway se configura con
 * claves fijas y hay que preguntarle el estado de cada pago.
 */
export function PaymentMethodsPage() {
  return (
    <div className="mx-auto max-w-3xl pb-10">
      <SettingsHeader title="Medios de pago" />
      <MercadoPagoConnect />
      <PaywayConnect />
      <HelpLink id="payments" />
    </div>
  );
}
