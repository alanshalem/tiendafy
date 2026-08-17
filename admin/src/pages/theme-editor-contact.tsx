import { cn } from '@tiendafy/ui';
import { HelpLink } from '../components/HelpLink';
import { BackHeader, Field, Check, TextInput, TextArea, sectionSetter } from './theme-editor-inputs';
import type { PanelProps } from './theme-editor-pages';

const WHATSAPP_MESSAGES = [
  '¡Hola! Tengo una consulta.',
  '¡Hola! Quiero hacer un pedido.',
  'Hola, ¿hacen envíos a mi zona?',
  'Hola, quería consultar por un producto.',
  '¡Hola! ¿Tienen stock disponible?',
];

export function WhatsAppPanel({ theme, onBack, updateTheme }: PanelProps) {
  const set = sectionSetter(updateTheme, 'whatsappButton');
  const w = theme.whatsappButton;
  return (
    <div>
      <BackHeader title="Botón de WhatsApp" onBack={onBack} />
      <div className="space-y-4 p-4">
        <p className="text-xs text-fg-muted">
          Botón flotante fijo abajo a la derecha del storefront. Tu cliente lo toca y te escribe directo.
        </p>
        <Check label="Mostrar botón de WhatsApp" checked={w.enabled} onChange={(v) => set({ enabled: v })} />
        {w.enabled && (
          <>
            <Field label="Número de WhatsApp">
              <TextInput
                value={w.phone}
                onChange={(v) => set({ phone: v })}
                placeholder="+54 9 11 1234 5678"
              />
            </Field>
            <Field label="Mensaje inicial">
              <TextArea value={w.message} onChange={(v) => set({ message: v })} />
            </Field>
            <Check
              label="Vista previa al pasar el mouse"
              checked={w.showPreview}
              onChange={(v) => set({ showPreview: v })}
            />
            <p className="-mt-2 text-xs text-fg-muted">
              En compu, al pasar el mouse por el botón se abre un mini-chat estilo WhatsApp con el mensaje.
            </p>
            <div>
              <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-fg-subtle">
                Mensajes listos
              </div>
              <div className="space-y-1.5">
                {WHATSAPP_MESSAGES.map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => set({ message: m })}
                    aria-pressed={w.message === m}
                    className={cn(
                      'block w-full rounded-md border px-3 py-2 text-left text-sm transition',
                      w.message === m
                        ? 'border-primary text-primary ring-2 ring-primary/30'
                        : 'border-border text-fg hover:border-border-strong',
                    )}
                  >
                    {m}
                  </button>
                ))}
              </div>
            </div>
          </>
        )}
        <HelpLink id="whatsapp" className="mt-2" />
      </div>
    </div>
  );
}
