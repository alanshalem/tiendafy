import { Plus, Trash2 } from 'lucide-react';
import { cn } from '@tiendafy/ui';
import { PAYMENT_LOGOS, type FooterLink, type ThemeConfig } from '@tiendafy/types';
import { LinkPicker } from '../components/LinkPicker';
import {
  BackHeader,
  Field,
  Check,
  TextInput,
  TextArea,
  StringList,
  sectionSetter,
  useSectionReset,
  QuickStyles,
  type QuickStyle,
} from './theme-editor-inputs';
import type { PanelProps } from './theme-editor-pages';

const FOOTER_PRESETS: QuickStyle<ThemeConfig['footer']>[] = [
  {
    name: 'Mínimo',
    patch: { showSocial: false, showPages: false, showNewsletter: false, showPaymentLogos: true },
  },
  {
    name: 'Completo',
    recommended: true,
    patch: { showSocial: true, showPages: true, showNewsletter: true, showPaymentLogos: true },
  },
];

export function FooterPanel({ theme, onBack, updateTheme }: PanelProps) {
  const set = sectionSetter(updateTheme, 'footer');
  const reset = useSectionReset(updateTheme);
  return (
    <div>
      <BackHeader title="Pie de página" onBack={onBack} onReset={reset('footer', 'el pie de página')} />
      <div className="space-y-4 p-4">
        <QuickStyles presets={FOOTER_PRESETS} current={theme.footer} onApply={set} />
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
            <Field label="TikTok (URL)">
              <TextInput
                value={theme.footer.tiktok}
                onChange={(v) => set({ tiktok: v })}
                placeholder="https://tiktok.com/@..."
              />
            </Field>
            <Field label="YouTube (URL)">
              <TextInput
                value={theme.footer.youtube}
                onChange={(v) => set({ youtube: v })}
                placeholder="https://youtube.com/@..."
              />
            </Field>
            <Field label="X (URL)">
              <TextInput
                value={theme.footer.x}
                onChange={(v) => set({ x: v })}
                placeholder="https://x.com/..."
              />
            </Field>
          </>
        )}
        <FooterLinksEditor links={theme.footer.links ?? []} onChange={(links) => set({ links })} />
        <Check
          label="Mostrar links a tus páginas de contenido"
          checked={theme.footer.showPages}
          onChange={(v) => set({ showPages: v })}
        />
        <p className="-mt-2 text-xs text-fg-muted">
          Cómo comprar, preguntas frecuentes, envíos… Arriba compiten por lugar en el menú; acá entran todas.
        </p>

        <div className="border-t border-border pt-4">
          <div className="mb-3 text-sm font-semibold text-fg">Suscripción a novedades</div>
          <Check
            label="Pedir el email en el pie"
            checked={theme.footer.showNewsletter}
            onChange={(v) => set({ showNewsletter: v })}
          />
          <p className="mb-3 mt-1 text-xs text-fg-muted">
            Los emails quedan guardados y se pueden usar como audiencia en Email marketing.
          </p>
          {theme.footer.showNewsletter && (
            <Field label="Título">
              <TextInput
                value={theme.footer.newsletterTitle}
                onChange={(v) => set({ newsletterTitle: v })}
                placeholder="Recibí novedades y ofertas"
              />
            </Field>
          )}
        </div>
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

/**
 * Links propios del pie: Envíos, Mayoristas, un catálogo en PDF… Antes el pie
 * solo tenía las páginas de contenido y las legales: cualquier otro destino
 * no tenía dónde ir.
 */
function FooterLinksEditor({
  links,
  onChange,
}: {
  links: FooterLink[];
  onChange: (v: FooterLink[]) => void;
}) {
  const update = (i: number, patch: Partial<FooterLink>) =>
    onChange(links.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  return (
    <div className="border-t border-border pt-4">
      <div className="mb-1 text-sm font-semibold text-fg">Links del pie</div>
      <p className="mb-3 text-xs text-fg-muted">
        Cualquier destino: una categoría, un producto, una página o un sitio de afuera.
      </p>
      <div className="space-y-3">
        {links.map((l, i) => (
          <div key={i} className="space-y-2 rounded-md border border-border p-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wide text-fg-subtle">
                Link {i + 1}
              </span>
              <button
                type="button"
                onClick={() => onChange(links.filter((_, idx) => idx !== i))}
                aria-label={`Quitar link ${i + 1}`}
                className="flex h-10 w-10 items-center justify-center rounded text-fg-muted hover:bg-danger/10 hover:text-danger"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
            <Field label="Texto">
              <TextInput value={l.label} onChange={(v) => update(i, { label: v })} placeholder="Envíos" />
            </Field>
            <LinkPicker
              label="A dónde lleva"
              value={l.href}
              onChange={(href, pick) =>
                // Sin texto todavía: se propone el nombre de lo elegido.
                update(i, { href, ...(!l.label.trim() && pick?.label ? { label: pick.label } : {}) })
              }
              newTab={l.newTab}
              onNewTabChange={(v) => update(i, { newTab: v || undefined })}
            />
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={() => onChange([...links, { label: '', href: '' }])}
        className="mt-2 inline-flex min-h-10 items-center gap-1.5 text-sm font-medium text-primary hover:underline"
      >
        <Plus className="h-4 w-4" /> Agregar link
      </button>
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
