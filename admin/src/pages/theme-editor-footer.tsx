import { Plus, Trash2 } from 'lucide-react';
import { cn } from '@tiendafy/ui';
import { PAYMENT_LOGOS, type FooterLink, type ThemeConfig } from '@tiendafy/types';
import { LinkPicker } from '../components/LinkPicker';
import {
  BackHeader,
  Field,
  Check,
  Collapsible,
  ColorRow,
  TextInput,
  TextArea,
  StringList,
  sectionSetter,
  useSectionReset,
  QuickStyles,
  type QuickStyle,
} from './theme-editor-inputs';
import { FooterThumb } from './theme-editor-thumbs';
import type { PanelProps } from './theme-editor-pages';

const FOOTER_PRESETS: QuickStyle<ThemeConfig['footer']>[] = [
  {
    name: 'Mínimo',
    patch: {
      layout: 'centered',
      showSocial: false,
      showPages: false,
      showNewsletter: false,
      showPaymentLogos: true,
    },
    thumb: <FooterThumb layout="centered" />,
  },
  {
    name: 'Completo',
    patch: {
      layout: 'centered',
      showSocial: true,
      showPages: true,
      showNewsletter: true,
      showPaymentLogos: true,
    },
    thumb: <FooterThumb layout="centered" />,
  },
  {
    name: 'En columnas',
    recommended: true,
    patch: {
      layout: 'columns',
      showSocial: true,
      showPages: true,
      showNewsletter: true,
      showPaymentLogos: true,
    },
    thumb: <FooterThumb layout="columns" />,
  },
];

const LAYOUTS: { value: ThemeConfig['footer']['layout']; label: string }[] = [
  { value: 'centered', label: 'Todo al centro' },
  { value: 'columns', label: 'En columnas' },
];

export function FooterPanel({ theme, onBack, updateTheme }: PanelProps) {
  const set = sectionSetter(updateTheme, 'footer');
  const reset = useSectionReset(updateTheme);
  const f = theme.footer;
  return (
    <div>
      <BackHeader title="Pie de página" onBack={onBack} onReset={reset('footer', 'el pie de página')} />
      <div className="space-y-5 p-4">
        <QuickStyles presets={FOOTER_PRESETS} current={f} onApply={set} />

        <fieldset>
          <legend className="mb-1.5 text-sm font-medium text-fg">Disposición</legend>
          <div className="grid grid-cols-2 gap-2">
            {LAYOUTS.map((l) => {
              const active = f.layout === l.value;
              return (
                <button
                  key={l.value}
                  type="button"
                  onClick={() => set({ layout: l.value })}
                  aria-pressed={active}
                  className={cn(
                    'rounded-lg border p-1.5 pb-2 text-xs font-medium transition',
                    active
                      ? 'border-primary text-primary ring-2 ring-primary/30'
                      : 'border-border text-fg hover:border-border-strong',
                  )}
                >
                  <span className="mb-1.5 block overflow-hidden rounded">
                    <FooterThumb layout={l.value} dark={!!f.bg} />
                  </span>
                  {l.label}
                </button>
              );
            })}
          </div>
          <p className="mt-1 text-xs text-fg-muted">
            {f.layout === 'columns'
              ? 'En la compu: tu marca y redes, links, contacto y novedades lado a lado. En el celular, uno debajo del otro.'
              : 'Todo apilado al centro: va bien con pocos datos.'}
          </p>
        </fieldset>

        <ColorRow
          label="Color de fondo"
          value={f.bg}
          onChange={(v) => set({ bg: v })}
          onAuto={() => set({ bg: '' })}
          autoLabel="Como la tienda"
          autoValue={theme.colors.bg}
          fallback="#ffffff"
        />

        <Field label="Texto del pie" hint="Quiénes son, qué venden, desde dónde envían.">
          <TextArea value={f.text} onChange={(v) => set({ text: v })} />
        </Field>

        <Collapsible title="Redes sociales" defaultOpen={f.showSocial}>
          <div className="space-y-3">
            <Check
              label="Mostrar redes sociales"
              checked={f.showSocial}
              onChange={(v) => set({ showSocial: v })}
            />
            {f.showSocial && (
              <>
                <Field label="Instagram">
                  <TextInput
                    value={f.instagram}
                    onChange={(v) => set({ instagram: v })}
                    placeholder="https://instagram.com/..."
                  />
                </Field>
                <Field label="Facebook">
                  <TextInput
                    value={f.facebook}
                    onChange={(v) => set({ facebook: v })}
                    placeholder="https://facebook.com/..."
                  />
                </Field>
                <Field label="TikTok">
                  <TextInput
                    value={f.tiktok}
                    onChange={(v) => set({ tiktok: v })}
                    placeholder="https://tiktok.com/@..."
                  />
                </Field>
                <Field label="YouTube">
                  <TextInput
                    value={f.youtube}
                    onChange={(v) => set({ youtube: v })}
                    placeholder="https://youtube.com/@..."
                  />
                </Field>
                <Field label="X (ex Twitter)">
                  <TextInput value={f.x} onChange={(v) => set({ x: v })} placeholder="https://x.com/..." />
                </Field>
                <p className="text-xs text-fg-muted">
                  Solo se muestran las que tengan link. También salen en la página de «en construcción».
                </p>
              </>
            )}
          </div>
        </Collapsible>

        <Collapsible title="Links">
          <div className="space-y-4">
            <FooterLinksEditor links={f.links ?? []} onChange={(links) => set({ links })} />
            <Check
              label="Links a tus páginas de contenido"
              hint="Cómo comprar, preguntas frecuentes, envíos… Arriba compiten por lugar en el menú; acá entran todas."
              checked={f.showPages}
              onChange={(v) => set({ showPages: v })}
            />
          </div>
        </Collapsible>

        <Collapsible title="Suscripción a novedades" defaultOpen={f.showNewsletter}>
          <div className="space-y-3">
            <Check
              label="Pedir el email en el pie"
              hint="Los emails quedan guardados y se pueden usar como audiencia en Email marketing."
              checked={f.showNewsletter}
              onChange={(v) => set({ showNewsletter: v })}
            />
            {f.showNewsletter && (
              <Field label="Título">
                <TextInput
                  value={f.newsletterTitle}
                  onChange={(v) => set({ newsletterTitle: v })}
                  placeholder="Recibí novedades y ofertas"
                />
              </Field>
            )}
          </div>
        </Collapsible>

        <Collapsible title="Medios de pago">
          <div className="space-y-3">
            <Check
              label="Mostrar logos de medios de pago"
              hint="Ver con qué se puede pagar da confianza antes de llegar al checkout."
              checked={f.showPaymentLogos}
              onChange={(v) => set({ showPaymentLogos: v })}
            />
            {f.showPaymentLogos && (
              <PaymentLogoPicker selected={f.paymentLogos} onChange={(v) => set({ paymentLogos: v })} />
            )}
          </div>
        </Collapsible>

        <Collapsible title="Contacto en el pie">
          <div className="space-y-4">
            <StringList
              label="WhatsApp"
              hint="Uno o varios. Número con código de país."
              values={f.whatsapps}
              onChange={(v) => set({ whatsapps: v })}
              placeholder="+54 9 11 1234 5678"
            />
            <StringList
              label="Direcciones"
              values={f.addresses}
              onChange={(v) => set({ addresses: v })}
              placeholder="Av. Corrientes 1234, CABA"
            />
            <StringList
              label="Teléfonos"
              values={f.phones}
              onChange={(v) => set({ phones: v })}
              placeholder="0800 123 4567"
            />
            <StringList
              label="Emails"
              values={f.emails}
              onChange={(v) => set({ emails: v })}
              placeholder="hola@mitienda.com"
            />
          </div>
        </Collapsible>
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
    <div>
      <div className="mb-1 text-sm font-medium text-fg">Links propios</div>
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
