import { Switch, useToast } from '@tiendafy/ui';
import { ExternalLink } from 'lucide-react';
import { SaveBar, SettingsHeader } from './SettingsLayout';
import { useSettings } from './useSettings';

interface EmailItem {
  id: string;
  title: string;
  body: string;
}
interface EmailGroup {
  heading: string;
  items: EmailItem[];
}

const groups: EmailGroup[] = [
  {
    heading: 'Promociones',
    items: [{ id: 'abandoned', title: 'Carritos abandonados', body: 'Recordá una compra no finalizada a tus clientes.' }],
  },
  {
    heading: 'Cuenta de usuarios',
    items: [
      { id: 'activation', title: 'Activación de cuenta', body: 'Ayuda al cliente a confirmar su cuenta.' },
      { id: 'reset', title: 'Cambio de contraseña', body: 'Ayuda al usuario a recuperar su acceso.' },
      { id: 'welcome', title: 'Bienvenida', body: 'Confirma que la cuenta fue creada con éxito.' },
    ],
  },
  {
    heading: 'Ventas',
    items: [
      { id: 'order', title: 'Confirmación de compra', body: 'Confirma el pedido apenas se realiza la compra.' },
      { id: 'payment', title: 'Confirmación de pago', body: 'Confirma cuando el pago fue acreditado.' },
      { id: 'list', title: 'Lista para retirar', body: 'Avisa a tu cliente que su pedido está listo.' },
      { id: 'shipment', title: 'Confirmación de envío', body: 'Notifica a tu cliente cuando el pedido fue despachado.' },
      { id: 'cancel', title: 'Cancelación de compra', body: 'Notifica cuando un pedido fue cancelado.' },
      { id: 'invoice', title: 'Factura', body: 'Informa al cliente al facturar una venta.' },
    ],
  },
];

export function AutoEmailsPage() {
  const { toast } = useToast();
  const { value, update, save, dirty } = useSettings<{ enabled: Record<string, boolean> }>('emails', {
    enabled: { order: true, payment: true, shipment: true, welcome: true, activation: true, reset: true },
  });

  const toggle = (id: string, on: boolean) => update({ enabled: { ...value.enabled, [id]: on } });

  return (
    <div className="mx-auto max-w-3xl pb-20">
      <SettingsHeader
        title="E-mails automáticos"
        description="Estos e-mails se envían a tus clientes en cada instancia de una compra."
      />

      <div className="space-y-6">
        {groups.map((group) => (
          <div key={group.heading}>
            <h2 className="mb-3 text-base font-semibold text-fg">{group.heading}</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              {group.items.map((item) => (
                <div key={item.id} className="rounded-lg border border-border bg-surface p-4 shadow-card">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold text-fg">{item.title}</div>
                      <p className="mt-0.5 text-xs text-fg-muted">{item.body}</p>
                      <button className="mt-2 text-xs font-medium text-primary hover:underline">Editar contenido</button>
                    </div>
                    <Switch checked={value.enabled[item.id] ?? false} onChange={(on) => toggle(item.id, on)} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <p className="inline-flex w-full items-center justify-center gap-1 mt-6 text-center text-sm text-primary">Más sobre e-mails automáticos <ExternalLink className="h-3.5 w-3.5" /></p>

      <SaveBar
        dirty={dirty}
        onSave={() => {
          save();
          toast('E-mails guardados', { variant: 'success' });
        }}
      />
    </div>
  );
}
