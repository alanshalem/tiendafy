import { cn } from '@tiendafy/ui';
import { PAYMENT_LOGOS } from '@tiendafy/types';
import {
  BackHeader,
  Field,
  Check,
  TextInput,
  TextArea,
  StringList,
  sectionSetter,
  useSectionReset,
} from './theme-editor-inputs';
import type { PanelProps } from './theme-editor-pages';

export function FooterPanel({ theme, onBack, updateTheme }: PanelProps) {
  const set = sectionSetter(updateTheme, 'footer');
  const reset = useSectionReset(updateTheme);
  return (
    <div>
      <BackHeader title="Pie de página" onBack={onBack} onReset={reset('footer', 'el pie de página')} />
      <div className="space-y-4 p-4">
        <Field label="Texto del pie">
          <TextArea value={theme.footer.text} onChange={(v) => set({ text: v })} />
        </Field>
        <Check
          label="Mostrar redes sociales"
          checked={theme.footer.showSocial}
          onChange={(v) => set({ showSocial: v })}
        />
        {theme.footer.showSocial && (
          <>
            <Field label="Instagram (URL)">
              <TextInput
                value={theme.footer.instagram}
                onChange={(v) => set({ instagram: v })}
                placeholder="https://instagram.com/..."
              />
            </Field>
            <Field label="Facebook (URL)">
              <TextInput
                value={theme.footer.facebook}
                onChange={(v) => set({ facebook: v })}
                placeholder="https://facebook.com/..."
              />
            </Field>
          </>
        )}
        <Check
          label="Mostrar logos de medios de pago"
          checked={theme.footer.showPaymentLogos}
          onChange={(v) => set({ showPaymentLogos: v })}
        />
        {theme.footer.showPaymentLogos && (
          <PaymentLogoPicker
            selected={theme.footer.paymentLogos}
            onChange={(v) => set({ paymentLogos: v })}
          />
        )}

        <div className="border-t border-border pt-4">
          <div className="mb-3 text-sm font-semibold text-fg">Contacto en el pie</div>
          <div className="space-y-4">
            <StringList
              label="WhatsApp"
              hint="Uno o varios. Número con código de país."
              values={theme.footer.whatsapps}
              onChange={(v) => set({ whatsapps: v })}
              placeholder="+54 9 11 1234 5678"
            />
            <StringList
              label="Direcciones"
              values={theme.footer.addresses}
              onChange={(v) => set({ addresses: v })}
              placeholder="Av. Corrientes 1234, CABA"
            />
            <StringList
              label="Teléfonos"
              values={theme.footer.phones}
              onChange={(v) => set({ phones: v })}
              placeholder="0800 123 4567"
            />
            <StringList
              label="Emails"
              values={theme.footer.emails}
              onChange={(v) => set({ emails: v })}
              placeholder="hola@mitienda.com"
            />
          </div>
        </div>
      </div>
    </div>
  );
}

/** Grilla de logos de medios de pago. Click = seleccionar/deseleccionar. */
function PaymentLogoPicker({ selected, onChange }: { selected: string[]; onChange: (v: string[]) => void }) {
  const toggle = (slug: string) =>
    onChange(selected.includes(slug) ? selected.filter((s) => s !== slug) : [...selected, slug]);
  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs text-fg-muted">Elegí qué logos mostrar ({selected.length})</span>
        {selected.length > 0 && (
          <button type="button" onClick={() => onChange([])} className="text-xs text-fg-subtle hover:text-fg">
            Limpiar
          </button>
        )}
      </div>
      <div className="grid grid-cols-3 gap-2">
        {PAYMENT_LOGOS.map((logo) => {
          const on = selected.includes(logo.slug);
          return (
            <button
              key={logo.slug}
              type="button"
              onClick={() => toggle(logo.slug)}
              title={logo.label}
              aria-pressed={on}
              className={cn(
                'flex h-12 items-center justify-center rounded-md border bg-white p-2 transition',
                on ? 'border-primary ring-2 ring-primary/30' : 'border-border opacity-50 hover:opacity-100',
              )}
            >
              <img
                src={`/payment-logos/${logo.slug}.svg`}
                alt={logo.label}
                className="max-h-full max-w-full object-contain"
              />
            </button>
          );
        })}
      </div>
    </div>
  );
}
