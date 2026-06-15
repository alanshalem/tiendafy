import { AlertTriangle, ExternalLink } from 'lucide-react';
import { FormField, Input, Textarea, useToast } from '@tiendafy/ui';
import { SaveBar, SettingsHeader } from './SettingsLayout';
import { useSettings } from './useSettings';

interface ContactData {
  email: string;
  address: string;
  phone: string;
  extraText: string;
}

export function ContactInfoPage() {
  const { toast } = useToast();
  const { value, update, save, dirty } = useSettings<ContactData>('contact', {
    email: '',
    address: '',
    phone: '',
    extraText: '',
  });

  return (
    <div className="mx-auto max-w-2xl pb-20">
      <SettingsHeader title="Información de contacto" />

      <div className="mb-4 flex gap-3 rounded-md border border-warning/30 bg-warning-bg p-4 text-sm">
        <AlertTriangle className="h-4 w-4 shrink-0 text-warning" />
        <p className="text-fg">
          Es obligatorio incluir esta información en tu tienda, según la{' '}
          <span className="font-medium underline">Resolución N° 104/2005 de Defensa del Consumidor</span>.
        </p>
      </div>

      <div className="space-y-4 rounded-lg border border-border bg-surface p-5 shadow-card">
        <FormField label="E-mail de la tienda" hint="Puede ser diferente al que usás para iniciar sesión.">
          <Input type="email" value={value.email} onChange={(e) => update({ email: e.target.value })} placeholder="contacto@mitienda.com" />
        </FormField>
        <FormField label="Dirección del local o showroom">
          <Input value={value.address} onChange={(e) => update({ address: e.target.value })} placeholder="Av. Corrientes 1234, CABA" />
        </FormField>
        <FormField label="Teléfono del local o showroom">
          <Input value={value.phone} onChange={(e) => update({ phone: e.target.value })} placeholder="+54 11 1234-5678" />
        </FormField>
        <FormField label="Texto informativo de contacto" hint="Información adicional para mostrar en el formulario.">
          <Textarea value={value.extraText} onChange={(e) => update({ extraText: e.target.value })} rows={3} />
        </FormField>
      </div>

      <p className="mt-5 inline-flex w-full items-center justify-center gap-1 text-center text-sm text-primary">Más sobre información de contacto <ExternalLink className="h-3.5 w-3.5" /></p>

      <SaveBar
        dirty={dirty}
        onSave={() => {
          save();
          toast('Información de contacto guardada', { variant: 'success' });
        }}
      />
    </div>
  );
}
