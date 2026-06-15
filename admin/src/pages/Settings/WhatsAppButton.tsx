import { Checkbox, useToast } from '@tiendafy/ui';
import { ExternalLink } from 'lucide-react';
import { SaveBar, SettingsHeader } from './SettingsLayout';
import { useSettings } from './useSettings';

interface WhatsAppData {
  countryCode: string;
  phone: string;
  show: boolean;
}

export function WhatsAppButtonPage() {
  const { toast } = useToast();
  const { value, update, save, dirty } = useSettings<WhatsAppData>('whatsapp', {
    countryCode: '+54',
    phone: '',
    show: true,
  });

  return (
    <div className="mx-auto max-w-2xl pb-20">
      <SettingsHeader title="Botón de WhatsApp" />

      <div className="rounded-lg border border-border bg-surface p-5 shadow-card">
        <h2 className="text-base font-semibold text-fg">Botón de WhatsApp</h2>
        <div className="mt-3">
          <label className="mb-1.5 block text-sm font-medium text-fg">Número de teléfono</label>
          <div className="flex items-center rounded-md border border-border-strong bg-surface focus-within:ring-2 focus-within:ring-primary">
            <span className="border-r border-border px-3 text-sm text-fg-muted">{value.countryCode}</span>
            <input
              value={value.phone}
              onChange={(e) => update({ phone: e.target.value.replace(/[^\d]/g, '') })}
              placeholder="1123456789"
              inputMode="tel"
              className="h-10 w-full bg-transparent px-3 text-sm focus:outline-none"
            />
          </div>
        </div>
        <div className="mt-3">
          <Checkbox
            label="Mostrar un botón en la tienda para que puedan escribirte por WhatsApp"
            checked={value.show}
            onChange={(e) => update({ show: e.target.checked })}
          />
        </div>
      </div>

      <p className="inline-flex w-full items-center justify-center gap-1 mt-5 text-center text-sm text-primary">¿Cómo agregar el botón de WhatsApp? <ExternalLink className="h-3.5 w-3.5" /></p>

      <SaveBar
        dirty={dirty}
        onSave={() => {
          save();
          toast('Botón de WhatsApp guardado', { variant: 'success' });
        }}
      />
    </div>
  );
}
