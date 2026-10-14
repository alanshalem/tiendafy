import { cn } from '@tiendafy/ui';
import { HelpLink } from '../components/HelpLink';
import {
  BackHeader,
  Field,
  Check,
  SegField,
  TextInput,
  TextArea,
  sectionSetter,
  useSectionReset,
} from './theme-editor-inputs';
import type { PanelProps } from './theme-editor-pages';

/** Una pantallita con el botón verde en la esquina elegida. */
function CornerSample({ left = false }: { left?: boolean }) {
  return (
    <span className="relative block h-6 w-10 rounded-sm border border-fg/20 bg-fg/5" aria-hidden>
      <span
        className={cn(
          'absolute bottom-0.5 h-2.5 w-2.5 rounded-full bg-[#25D366]',
          left ? 'left-0.5' : 'right-0.5',
        )}
      />
    </span>
  );
}

const WHATSAPP_MESSAGES = [
  '¡Hola! Tengo una consulta.',
  '¡Hola! Quiero hacer un pedido.',
  'Hola, ¿hacen envíos a mi zona?',
  'Hola, quería consultar por un producto.',
  '¡Hola! ¿Tienen stock disponible?',
];

export function WhatsAppPanel({ theme, onBack, updateTheme }: PanelProps) {
  const set = sectionSetter(updateTheme, 'whatsappButton');
  const reset = useSectionReset(updateTheme);
  const w = theme.whatsappButton;
  return (
    <div>
      <BackHeader
        title="Botón de WhatsApp"
        onBack={onBack}
        onReset={reset('whatsappButton', 'el botón de WhatsApp')}
      />
      <div className="space-y-4 p-4">
        <p className="text-xs text-fg-muted">
          Un botón flotante en una esquina de abajo de tu tienda. Tu cliente lo toca y te escribe directo.
        </p>
        <Check label="Mostrar botón de WhatsApp" checked={w.enabled} onChange={(v) => set({ enabled: v })} />
        {w.enabled && (
          <>
            <Field
              label="Número de WhatsApp"
              hint="Con código de país y de área, sin el 15. Ej: +54 9 11 1234 5678."
            >
              <TextInput
                value={w.phone}
                onChange={(v) => set({ phone: v })}
                placeholder="+54 9 11 1234 5678"
              />
            </Field>
            {!w.phone.replace(/\D/g, '') && (
              <p className="rounded-md bg-warning-bg px-2.5 py-2 text-xs text-fg">
                Sin número el botón no aparece en tu tienda (en la vista previa sí, para que veas dónde va).
              </p>
            )}
            <SegField
              label="Posición"
              columns={2}
              value={w.position}
              onChange={(position) => set({ position })}
              options={[
                { value: 'left', label: 'Abajo a la izquierda', visual: <CornerSample left /> },
                { value: 'right', label: 'Abajo a la derecha', visual: <CornerSample /> },
              ]}
              hint="A la izquierda no compite con otros botones flotantes (otro chat, avisos)."
            />
            <Field label="Texto al lado del ícono (opcional)" hint="Vacío, va solo el ícono redondo.">
              <TextInput
                value={w.label}
                onChange={(v) => set({ label: v })}
                placeholder="¿Te ayudamos?"
                maxLength={30}
              />
            </Field>
            <Field label="Mensaje inicial">
              <TextArea value={w.message} onChange={(v) => set({ message: v })} />
            </Field>
            <Check
              label="Mini-chat al pasar el mouse"
              hint="En la compu, al pasar el mouse por el botón se abre un chat estilo WhatsApp con el mensaje."
              checked={w.showPreview}
              onChange={(v) => set({ showPreview: v })}
            />
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
