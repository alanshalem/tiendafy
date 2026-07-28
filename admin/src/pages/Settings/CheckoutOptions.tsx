import { Checkbox, Radio, RadioGroup, Switch, Textarea, useToast } from '@tiendafy/ui';
import { SaveBar, SettingsHeader } from './SettingsLayout';
import { HelpLink } from '../../components/HelpLink';
import { useSettings } from './useSettings';

interface CheckoutData {
  singleColumn: boolean;
  requirePhone: boolean;
  billingType: 'consumerFinal' | 'always';
  customerNote: boolean;
  customerNoteLabel: string;
  trackingMessage: boolean;
  trackingMessageText: string;
  restrict: 'all' | 'registered';
  allowChangePayment: boolean;
  acceleratedCheckout: boolean;
}

export function CheckoutOptionsPage() {
  const { toast } = useToast();
  const { value, update, save, dirty } = useSettings<CheckoutData>('checkoutOptions', {
    singleColumn: false,
    requirePhone: true,
    billingType: 'consumerFinal',
    customerNote: true,
    customerNoteLabel: 'Aclaraciones sobre tu pedido',
    trackingMessage: true,
    trackingMessageText: '',
    restrict: 'all',
    allowChangePayment: false,
    acceleratedCheckout: true,
  });

  return (
    <div className="mx-auto max-w-2xl pb-20">
      <SettingsHeader
        title="Opciones del checkout"
        description="Configurá las opciones disponibles para solicitar información adicional a tu cliente durante el proceso de compra."
      />

      <div className="space-y-4">
        <Section title="Diseño">
          <Checkbox
            label="Usar una columna en el diseño en el checkout"
            checked={value.singleColumn}
            onChange={(e) => update({ singleColumn: e.target.checked })}
          />
        </Section>

        <Section title="Información del cliente">
          <div className="space-y-3">
            <div>
              <div className="mb-1.5 text-sm font-medium text-fg">Teléfono</div>
              <Checkbox
                label="Pedir teléfono no obligatorio"
                checked={!value.requirePhone}
                onChange={(e) => update({ requirePhone: !e.target.checked })}
              />
            </div>
            <div>
              <div className="mb-1.5 text-sm font-medium text-fg">Facturación</div>
              <RadioGroup legend="">
                <Radio
                  name="billing"
                  label="Pedir datos para Consumidor Final (DNI / CUIT)"
                  checked={value.billingType === 'consumerFinal'}
                  onChange={() => update({ billingType: 'consumerFinal' })}
                />
                <Radio
                  name="billing"
                  label="Pedir siempre datos de facturación"
                  checked={value.billingType === 'always'}
                  onChange={() => update({ billingType: 'always' })}
                />
              </RadioGroup>
            </div>
          </div>
        </Section>

        <Section
          title="Nota del cliente"
          toggle={
            <Switch checked={value.customerNote} onChange={(customerNote) => update({ customerNote })} />
          }
          description="Tu cliente puede dejar notas sobre su pedido (texto/aclaraciones) en el carrito."
        >
          {value.customerNote && (
            <input
              value={value.customerNoteLabel}
              onChange={(e) => update({ customerNoteLabel: e.target.value })}
              placeholder="Nombre del campo"
              className="h-10 w-full rounded-md border border-border-strong bg-surface px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
          )}
        </Section>

        <Section
          title="Mensaje en la página de seguimiento"
          toggle={
            <Switch
              checked={value.trackingMessage}
              onChange={(trackingMessage) => update({ trackingMessage })}
            />
          }
          description="Esta página permite a tu cliente saber el estado de su compra."
        >
          {value.trackingMessage && (
            <Textarea
              value={value.trackingMessageText}
              onChange={(e) => update({ trackingMessageText: e.target.value })}
              rows={2}
              placeholder="Aclará por tu cuenta el momento de la entrega o el estado del pedido."
            />
          )}
        </Section>

        <Section title="Restringir compras" description="Definí quiénes pueden comprar en tu tienda.">
          <RadioGroup legend="">
            <Radio
              name="restrict"
              label="Todos los clientes"
              checked={value.restrict === 'all'}
              onChange={() => update({ restrict: 'all' })}
            />
            <Radio
              name="restrict"
              label="Solo clientes registrados"
              checked={value.restrict === 'registered'}
              onChange={() => update({ restrict: 'registered' })}
            />
          </RadioGroup>
        </Section>

        <Section title="Cambiar medio de pago">
          <Checkbox
            label="Permitir que tus clientes elijan otro medio de pago desde la página de seguimiento si la compra está pendiente"
            checked={value.allowChangePayment}
            onChange={(e) => update({ allowChangePayment: e.target.checked })}
          />
        </Section>

        <Section
          title="Checkout acelerado"
          toggle={
            <Switch
              checked={value.acceleratedCheckout}
              onChange={(acceleratedCheckout) => update({ acceleratedCheckout })}
            />
          }
          description="Autocompleta datos personales y direcciones. Tus clientes pueden comprar más rápido guardando sus datos de forma segura."
        />
      </div>

      <HelpLink id="checkout" />

      <SaveBar
        dirty={dirty}
        onSave={() => {
          save();
          toast('Opciones del checkout guardadas', { variant: 'success' });
        }}
      />
    </div>
  );
}

function Section({
  title,
  description,
  toggle,
  children,
}: {
  title: string;
  description?: string;
  toggle?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-border bg-surface p-5 shadow-card">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-fg">{title}</h3>
          {description && <p className="mt-0.5 text-sm text-fg-muted">{description}</p>}
        </div>
        {toggle}
      </div>
      {children && <div className="mt-4">{children}</div>}
    </div>
  );
}
