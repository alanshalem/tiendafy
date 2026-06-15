import { Checkbox, Switch, Textarea, useToast } from '@tiendafy/ui';
import { ExternalLink } from 'lucide-react';
import { SaveBar, SettingsHeader } from './SettingsLayout';
import { useSettings } from './useSettings';

interface MessageData {
  show: boolean;
  text: string;
  hideDeliveryTimes: boolean;
}

export function CustomerMessagePage() {
  const { toast } = useToast();
  const { value, update, save, dirty } = useSettings<MessageData>('customerMessage', {
    show: true,
    text: '¡Gracias por su compra!',
    hideDeliveryTimes: false,
  });

  return (
    <div className="mx-auto max-w-2xl pb-20">
      <SettingsHeader
        title="Mensaje para clientes"
        description="Configurá un mensaje para mostrar a tus clientes antes de que finalicen la compra."
      />

      <div className="space-y-4">
        <div className="rounded-lg border border-border bg-surface p-5 shadow-card">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-fg">Mostrar un mensaje</h2>
            <Switch checked={value.show} onChange={(show) => update({ show })} />
          </div>
          <p className="mt-1 text-sm text-fg-muted">Tu cliente lo verá en el calculador de envíos y en el checkout.</p>
          {value.show && (
            <div className="mt-4">
              <label className="mb-1.5 block text-sm font-medium text-fg">Escribí acá:</label>
              <Textarea value={value.text} onChange={(e) => update({ text: e.target.value })} rows={3} />
            </div>
          )}
        </div>

        <div className="rounded-lg border border-border bg-surface p-5 shadow-card">
          <h2 className="text-base font-semibold text-fg">Tiempos de entrega</h2>
          <div className="mt-3">
            <Checkbox
              label="Ocultar los tiempos de entrega de cada medio de envío."
              checked={value.hideDeliveryTimes}
              onChange={(e) => update({ hideDeliveryTimes: e.target.checked })}
            />
          </div>
        </div>
      </div>

      <p className="inline-flex w-full items-center justify-center gap-1 mt-5 text-center text-sm text-primary">Más sobre mensaje informativo <ExternalLink className="h-3.5 w-3.5" /></p>

      <SaveBar
        dirty={dirty}
        onSave={() => {
          save();
          toast('Mensaje guardado', { variant: 'success' });
        }}
      />
    </div>
  );
}
