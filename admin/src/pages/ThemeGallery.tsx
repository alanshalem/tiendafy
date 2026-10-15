import { Link, useNavigate } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { ChevronLeft } from 'lucide-react';
import { Button, useConfirm, useToast, PageHeader } from '@tiendafy/ui';
import { HelpLink } from '../components/HelpLink';
import { useStore } from '../context/StoreContext';
import { type ThemeConfig } from '@tiendafy/types';
import { api, errMsg } from '../lib/api';
import {
  applyPreset,
  listInWords,
  presetChanges,
  presetHeader,
  themePresets,
  type ThemePreset,
} from '../lib/themePresets';
import { readDraftVersion, withDefaults } from './theme-editor/useThemeDraft';
import { NoStoreSelected } from '../components/NoStoreSelected';

/** Mini-mock del storefront pintado con los colores del preset. */
function PresetPreview({ preset }: { preset: ThemePreset }) {
  const t = preset.tokens;
  const rgb = (raw: string) => `rgb(${raw})`;
  const hdr = presetHeader(t);
  const heroVariant = preset.sections.find((s) => s.type === 'hero')?.variant;

  return (
    <div
      className="overflow-hidden rounded-t-[0.45rem]"
      style={{ background: rgb(t.colorBg), aspectRatio: '4 / 3' }}
      aria-hidden="true"
    >
      {preset.announcement && <div style={{ background: rgb(t.colorPrimary), height: '7%' }} />}
      {/* header (refleja la barra real: bg + texto contrastado) */}
      <div
        className="flex items-center justify-between px-3"
        style={{ height: '12%', background: rgb(hdr.bg) }}
      >
        <div className="h-1.5 w-12 rounded-full" style={{ background: rgb(hdr.textColor) }} />
        <div className="flex gap-1.5">
          <div className="h-1 w-6 rounded-full opacity-60" style={{ background: rgb(hdr.textColor) }} />
          <div className="h-1 w-6 rounded-full opacity-60" style={{ background: rgb(hdr.textColor) }} />
        </div>
      </div>
      {/* hero */}
      <div
        className="flex flex-col items-center justify-center gap-1.5"
        style={{
          height: '34%',
          background: heroVariant === 'banner' ? rgb(t.colorPrimary) : rgb(t.colorBgSubtle),
          alignItems: heroVariant === 'minimal' ? 'flex-start' : 'center',
          paddingInline: '12%',
        }}
      >
        <div
          className="h-2.5 w-24 rounded-sm"
          style={{ background: heroVariant === 'banner' ? rgb(t.colorBg) : rgb(t.colorFg) }}
        />
        <div
          className="h-1.5 w-32 rounded-sm opacity-60"
          style={{ background: heroVariant === 'banner' ? rgb(t.colorBg) : rgb(t.colorFg) }}
        />
      </div>
      {/* grid de productos */}
      <div className="grid grid-cols-3 gap-2 px-3 pt-3">
        {[0, 1, 2].map((i) => (
          <div key={i}>
            <div
              className="aspect-square rounded-sm"
              style={{ background: rgb(t.colorBgSubtle), border: `1px solid rgb(${t.colorFg} / 0.15)` }}
            />
            <div className="mt-1 h-1 w-3/4 rounded-full opacity-60" style={{ background: rgb(t.colorFg) }} />
            <div className="mt-0.5 h-1 w-1/2 rounded-full" style={{ background: rgb(t.colorPrimary) }} />
          </div>
        ))}
      </div>
    </div>
  );
}

export function ThemeGalleryPage() {
  const { store } = useStore();
  const { toast } = useToast();
  const confirm = useConfirm();
  const navigate = useNavigate();

  // Aplica al BORRADOR (antes publicaba directo: pisaba el diseño en vivo y
  // cualquier borrador sin publicar, sin aviso). Y lo mezcla con lo que ya
  // hay: solo cambia el diseño, no el pie, el contacto ni el carrito. Va con
  // la versión del borrador que se leyó, así no pisa una edición que esté
  // haciendo otra pestaña.
  const apply = useMutation({
    mutationFn: async (preset: ThemePreset) => {
      const raw = await api.get<Partial<ThemeConfig>>('/api/v1/theme/draft');
      const version = readDraftVersion(raw);
      const next = applyPreset(withDefaults(raw), preset);
      await api.put('/api/v1/theme/draft', version === undefined ? next : { ...next, draftVersion: version });
    },
    onSuccess: (_, preset) => {
      toast(`Diseño "${preset.name}" aplicado al borrador. Revisalo y publicá.`, { variant: 'success' });
      navigate('/canales/tienda-online');
    },
    onError: (err) => {
      toast(errMsg(err, 'Error aplicando el diseño'), { variant: 'error' });
    },
  });

  const applyWithConfirm = async (preset: ThemePreset) => {
    const ok = await confirm({
      title: 'Usar este diseño',
      message:
        `"${preset.name}" cambia en tu borrador: ${listInWords(presetChanges(preset))}. ` +
        'El resto (pie de página, contacto, carrito, listado, WhatsApp y CSS propio) queda como está. ' +
        'Tu tienda publicada no cambia hasta que publiques.',
      confirmLabel: 'Aplicar al borrador',
    });
    if (ok) apply.mutate(preset);
  };

  if (!store) {
    return <NoStoreSelected />;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        back={
          <Link
            to="/canales/tienda-online"
            className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
          >
            <ChevronLeft className="h-4 w-4" /> Volver al editor
          </Link>
        }
        title="Diseños para tu tienda"
        subtitle="Elegí un punto de partida y ajustalo en el editor: colores, secciones y textos quedan a tu nombre. El diseño se aplica al borrador — tu tienda no cambia hasta que publiques."
      />

      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {themePresets.map((preset) => (
          <div
            key={preset.id}
            className="group overflow-hidden rounded-lg border border-border bg-surface shadow-card transition-shadow hover:shadow-overlay"
          >
            <PresetPreview preset={preset} />
            <div className="border-t border-border p-4">
              <div className="flex items-baseline justify-between gap-2">
                <h2 className="font-semibold text-fg">{preset.name}</h2>
                <span className="text-xs font-semibold uppercase tracking-wider text-fg-subtle">
                  {preset.category}
                </span>
              </div>
              <p className="mt-1 text-sm text-fg-muted">{preset.description}</p>
              <Button
                className="mt-3 w-full"
                variant="secondary"
                loading={apply.isPending && apply.variables?.id === preset.id}
                onClick={() => applyWithConfirm(preset)}
              >
                Usar este diseño
              </Button>
            </div>
          </div>
        ))}
      </div>
      <HelpLink id="tema" />
    </div>
  );
}

export default ThemeGalleryPage;
