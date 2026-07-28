import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft } from 'lucide-react';
import { Button, useConfirm, useToast } from '@tiendafy/ui';
import { useStore } from '../context/StoreContext';
import { api, ApiRequestError } from '../lib/api';
import { themePresets, type ThemePreset } from '../lib/themePresets';
import { NoStoreSelected } from '../components/NoStoreSelected';

/** Luminancia relativa aproximada (0 oscuro → 1 claro) de un color "R G B". */
function luminance(rgbRaw: string): number {
  const [r, g, b] = rgbRaw.trim().split(/\s+/).map(Number);
  return (0.2126 * (r ?? 0) + 0.7152 * (g ?? 0) + 0.0722 * (b ?? 0)) / 255;
}

/**
 * Header del preset con contraste garantizado en cualquier paleta:
 * - tema claro → barra "tinta" (colorFg) con texto claro (colorBg).
 * - tema oscuro → barra de superficie oscura (colorBgSubtle) con texto claro (colorFg).
 */
function presetHeader(t: ThemePreset['tokens']): { bg: string; textColor: string } {
  const dark = luminance(t.colorBg) < 0.5;
  return dark
    ? { bg: t.colorBgSubtle, textColor: t.colorFg }
    : { bg: t.colorFg, textColor: t.colorBg };
}

/** Convierte un preset (DSL compacto de la galería) al ThemeConfig actual. */
function presetToConfig(preset: ThemePreset) {
  const typeMap: Record<string, string> = {
    hero: 'carousel',
    'featured-products': 'featured',
    'info-bar': 'info-bar',
    newsletter: 'newsletter',
  };
  const hdr = presetHeader(preset.tokens);
  return {
    colors: {
      primary: preset.tokens.colorPrimary,
      accent: '27 21 16',
      useAccent: false,
      bg: preset.tokens.colorBg,
      text: preset.tokens.colorFg,
    },
    fonts: { heading: 'sans', body: 'sans' },
    header: { bg: hdr.bg, textColor: hdr.textColor, sticky: true, logoSize: 'md', showTabsMobile: false },
    announcement: preset.announcement
      ? { show: true, animation: 'static', items: [{ text: preset.announcement, link: '' }] }
      : { show: false, animation: 'static', items: [] },
    sections: preset.sections.map((s, i) => ({
      id: `${typeMap[s.type] ?? s.type}-${i}`,
      type: typeMap[s.type] ?? s.type,
      visible: s.visible,
      data: { title: s.title ?? '', images: [], carousel: true },
    })),
  };
}

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
      {preset.announcement && (
        <div style={{ background: rgb(t.colorPrimary), height: '7%' }} />
      )}
      {/* header (refleja la barra real: bg + texto contrastado) */}
      <div className="flex items-center justify-between px-3" style={{ height: '12%', background: rgb(hdr.bg) }}>
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
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const confirm = useConfirm();
  const navigate = useNavigate();

  // Aplica al BORRADOR (antes publicaba directo: pisaba el diseño en vivo y
  // cualquier borrador sin publicar, sin aviso). Ahora el merchant revisa en el
  // editor y publica cuando quiere.
  const apply = useMutation({
    mutationFn: (preset: ThemePreset) => api.put('/api/v1/theme/draft', presetToConfig(preset)),
    onSuccess: (_, preset) => {
      queryClient.invalidateQueries({ queryKey: ['theme', store?.id] });
      toast(`Diseño "${preset.name}" aplicado al borrador. Revisalo y publicá.`, { variant: 'success' });
      navigate('/canales/tienda-online');
    },
    onError: (err) => {
      toast(err instanceof ApiRequestError ? err.message : 'Error aplicando el diseño', { variant: 'error' });
    },
  });

  const applyWithConfirm = async (preset: ThemePreset) => {
    const ok = await confirm({
      title: 'Usar este diseño',
      message: `Se reemplaza el borrador actual por "${preset.name}" (colores, encabezado y secciones). Tu tienda publicada no cambia hasta que publiques.`,
      confirmLabel: 'Aplicar al borrador',
    });
    if (ok) apply.mutate(preset);
  };

  if (!store) {
    return <NoStoreSelected />;
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">Diseños para tu tienda</h1>
          <p className="mt-0.5 max-w-xl text-sm text-fg-muted">
            Elegí un punto de partida y ajustalo en el editor: colores, secciones
            y textos quedan a tu nombre. El diseño se aplica al borrador — tu
            tienda no cambia hasta que publiques.
          </p>
        </div>
        <Link to="/canales/tienda-online" className="inline-flex shrink-0 items-center gap-1 text-sm font-medium text-primary hover:underline">
          <ChevronLeft className="h-4 w-4" /> Volver al editor
        </Link>
      </div>

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
    </div>
  );
}

export default ThemeGalleryPage;
