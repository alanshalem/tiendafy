import { Plus, Trash2 } from 'lucide-react';
import { cn } from '@tiendafy/ui';
import { contrastText, heroUnderHeader, type ThemeConfig } from '@tiendafy/types';
import { LinkPicker } from '../components/LinkPicker';
import { MediaUpload } from '../components/upload/MediaUpload';
import { MenuEditor } from './theme-editor-menu';
import { HeaderThumb } from './theme-editor-thumbs';
import {
  BackHeader,
  Field,
  Check,
  Collapsible,
  SegField,
  TextInput,
  ColorRow,
  ContrastNote,
  sectionSetter,
  useSectionReset,
  QuickStyles,
  type QuickStyle,
} from './theme-editor-inputs';

type Header = ThemeConfig['header'];

const HEADER_PRESETS: QuickStyle<Header>[] = [
  {
    name: 'Clásico',
    recommended: true,
    patch: { layout: 'classic', border: 'line', transparentOnHome: false, logoSize: 'md', sticky: true },
    thumb: <HeaderThumb layout="classic" border="line" />,
  },
  {
    name: 'Centrado',
    patch: { layout: 'logo-center', border: 'none', transparentOnHome: false, logoSize: 'md', sticky: true },
    thumb: <HeaderThumb layout="logo-center" />,
  },
  {
    name: 'Inmersivo',
    patch: {
      layout: 'classic',
      border: 'none',
      transparentOnHome: true,
      transparentLevel: 'full',
      logoSize: 'lg',
      sticky: true,
    },
    thumb: <HeaderThumb layout="classic" logoSize="lg" transparent />,
  },
  {
    name: 'Minimal',
    patch: { layout: 'menu-left', border: 'none', transparentOnHome: false, logoSize: 'sm', sticky: true },
    thumb: <HeaderThumb layout="menu-left" logoSize="sm" />,
  },
];

/** Las cuatro disposiciones, con su dibujo: un nombre solo obligaba a imaginárselas. */
const LAYOUTS: { value: Header['layout']; label: string }[] = [
  { value: 'classic', label: 'Menú al centro' },
  { value: 'logo-center', label: 'Logo al centro' },
  { value: 'menu-left', label: 'Menú junto al logo' },
  { value: 'menu-right', label: 'Menú a la derecha' },
];

/** "Aa" del tamaño de cada opción: se ve la diferencia antes de elegir. */
const LOGO_SIZES: { value: Header['logoSize']; label: string; className: string }[] = [
  { value: 'sm', label: 'Chico', className: 'text-xs' },
  { value: 'md', label: 'Mediano', className: 'text-base' },
  { value: 'lg', label: 'Grande', className: 'text-2xl' },
];

/** Muestra del borde inferior: una barra con nada, una línea o una sombra debajo. */
function BorderSample({ border }: { border: Header['border'] }) {
  return (
    <span className="relative block h-5 w-10" aria-hidden>
      <span
        className={cn(
          'absolute inset-x-0 top-0 h-3.5 rounded-t-sm bg-fg/70',
          border === 'shadow' && 'shadow-[0_4px_6px_rgb(0_0_0/0.35)]',
        )}
      />
      {border === 'line' && <span className="absolute inset-x-0 top-3.5 h-px bg-primary" />}
    </span>
  );
}

/** Muestra del nivel de transparencia: el encabezado sobre una foto. */
function LevelSample({ level }: { level: Header['transparentLevel'] }) {
  const alpha = level === 'medium' ? 0.55 : level === 'light' ? 0.3 : 0;
  return (
    <span className="relative block h-5 w-10 overflow-hidden rounded-sm bg-[#5d6878]" aria-hidden>
      <span className="absolute inset-x-0 top-0 h-2.5" style={{ background: `rgb(17 17 17 / ${alpha})` }} />
      <span className="absolute left-1 top-1 h-0.5 w-3 rounded-full bg-white/90" />
    </span>
  );
}

export function HeaderPanel({
  theme,
  onBack,
  updateTheme,
}: {
  theme: ThemeConfig;
  onBack: () => void;
  updateTheme: (u: (t: ThemeConfig) => ThemeConfig) => void;
}) {
  const setH = sectionSetter(updateTheme, 'header');
  const reset = useSectionReset(updateTheme);
  const h = theme.header;
  // Editar / quitar un anuncio por índice (evita repetir el map/filter en cada campo).
  const updateItem = (i: number, patch: Partial<ThemeConfig['announcement']['items'][number]>) =>
    updateTheme((t) => ({
      ...t,
      announcement: {
        ...t.announcement,
        items: t.announcement.items.map((x, idx) => (idx === i ? { ...x, ...patch } : x)),
      },
    }));
  const removeItem = (i: number) =>
    updateTheme((t) => ({
      ...t,
      announcement: { ...t.announcement, items: t.announcement.items.filter((_, idx) => idx !== i) },
    }));
  // Transparente solo se nota sobre una foto o un video de portada.
  const hasHero = heroUnderHeader(theme.sections);
  return (
    <div>
      <BackHeader
        title="Encabezado"
        onBack={onBack}
        onReset={reset(['header', 'announcement'], 'el encabezado y la barra de anuncio')}
      />
      <div className="space-y-5 p-4">
        <QuickStyles presets={HEADER_PRESETS} current={h} onApply={setH} />

        <fieldset>
          <legend className="mb-1.5 text-sm font-medium text-fg">Disposición en la computadora</legend>
          <div className="grid grid-cols-2 gap-2">
            {LAYOUTS.map((l) => {
              const active = h.layout === l.value;
              return (
                <button
                  key={l.value}
                  type="button"
                  onClick={() => setH({ layout: l.value })}
                  aria-pressed={active}
                  className={cn(
                    'rounded-lg border p-1.5 pb-2 text-xs font-medium transition',
                    active
                      ? 'border-primary text-primary ring-2 ring-primary/30'
                      : 'border-border text-fg hover:border-border-strong',
                  )}
                >
                  <span className="mb-1.5 block overflow-hidden rounded">
                    <HeaderThumb layout={l.value} logoSize={h.logoSize} />
                  </span>
                  {l.label}
                </button>
              );
            })}
          </div>
          <p className="mt-1 text-xs text-fg-muted">
            En el celular va siempre igual: el menú (☰) a la izquierda, el logo y los íconos.
          </p>
        </fieldset>

        <SegField
          label="Tamaño del logo"
          value={h.logoSize}
          onChange={(logoSize) => setH({ logoSize })}
          options={LOGO_SIZES.map((s) => ({
            value: s.value,
            label: s.label,
            visual: (
              <span className={cn('font-bold leading-none', s.className)} aria-hidden>
                Aa
              </span>
            ),
          }))}
        />

        <div className="space-y-3 border-t border-border pt-4">
          <div className="text-sm font-semibold text-fg">Colores</div>
          <ColorRow
            label="Fondo del encabezado"
            value={h.bg}
            onChange={(v) => setH({ bg: v })}
            fallback="#1b1510"
          />
          <ColorRow
            label="Texto e íconos"
            value={h.textColor}
            onChange={(v) => setH({ textColor: v })}
            onAuto={() => setH({ textColor: '' })}
            autoValue={contrastText(h.bg)}
            fallback="#ffffff"
          />
          {h.textColor && <ContrastNote fg={h.textColor} bg={h.bg} label="el menú sobre el encabezado" />}
          <SegField
            label="Borde inferior"
            value={h.border}
            onChange={(border) => setH({ border })}
            options={(['none', 'line', 'shadow'] as const).map((b) => ({
              value: b,
              label: b === 'none' ? 'Ninguno' : b === 'line' ? 'Línea' : 'Sombra',
              visual: <BorderSample border={b} />,
            }))}
          />
        </div>

        <div className="space-y-3 border-t border-border pt-4">
          <div className="text-sm font-semibold text-fg">Comportamiento</div>
          <Check
            label="Siempre visible al navegar"
            hint="Queda pegado arriba al bajar por la página, con el carrito siempre a mano."
            checked={h.sticky}
            onChange={(v) => setH({ sticky: v })}
          />
          <Check
            label="Menú desplegable (☰) en celulares"
            hint="Apagado, en el celular solo se ven el logo y los íconos: nadie llega a tus categorías."
            checked={h.showTabsMobile}
            onChange={(v) => setH({ showTabsMobile: v })}
          />
          <Check
            label="Transparente sobre la foto de portada"
            hint="En el inicio, el encabezado va encima de la foto y se vuelve sólido al bajar."
            checked={h.transparentOnHome}
            onChange={(v) => setH({ transparentOnHome: v })}
          />
          {h.transparentOnHome && (
            <div className="space-y-3 rounded-md border border-border p-3">
              {!hasHero && (
                <p className="rounded-md bg-warning-bg px-2.5 py-2 text-xs text-fg">
                  Tu inicio no arranca con una foto: hasta que lo haga (un carrusel con fotos o un video de
                  portada), el encabezado se ve sólido.
                </p>
              )}
              <SegField
                label="Velo detrás del menú"
                value={h.transparentLevel || 'full'}
                onChange={(transparentLevel) => setH({ transparentLevel })}
                options={(['full', 'light', 'medium'] as const).map((l) => ({
                  value: l,
                  label: l === 'full' ? 'Sin velo' : l === 'light' ? 'Leve' : 'Medio',
                  visual: <LevelSample level={l} />,
                }))}
                hint="Sobre una foto clara, un velo ayuda a que el menú se lea."
              />
              <Field
                label="Logo sobre la foto (opcional)"
                hint="Sobre la foto el menú va en blanco: subí la versión clara de tu logo. Vacío = el de siempre."
              >
                <MediaUpload
                  kind="logo"
                  value={h.transparentLogo}
                  onChange={(url) => setH({ transparentLogo: url })}
                />
              </Field>
            </div>
          )}
        </div>

        <Collapsible title="Menú">
          <MenuEditor theme={theme} updateTheme={updateTheme} />
        </Collapsible>

        <Collapsible title="Buscador y carrito">
          <div className="space-y-3">
            <Check
              label="Buscador en el encabezado"
              hint="En el celular aparece como una lupa."
              checked={h.showSearch}
              onChange={(v) => setH({ showSearch: v })}
            />
            <Check label="Mostrar carrito" checked={h.showCart} onChange={(v) => setH({ showCart: v })} />
            {h.showCart && (
              <SegField
                label="Estilo del carrito"
                columns={2}
                value={h.cartStyle}
                onChange={(cartStyle) => setH({ cartStyle })}
                options={[
                  { value: 'icon', label: 'Solo ícono' },
                  { value: 'text', label: 'Ícono y «Carrito»' },
                ]}
              />
            )}
          </div>
        </Collapsible>

        <Collapsible title="Barra de anuncio" defaultOpen={theme.announcement.show}>
          <Check
            label="Mostrar barra de anuncio"
            hint="Una franja arriba de todo con tu promo: envío gratis, cuotas, un cupón."
            checked={theme.announcement.show}
            onChange={(v) => updateTheme((t) => ({ ...t, announcement: { ...t.announcement, show: v } }))}
          />
          {theme.announcement.show && (
            <div className="mt-3 space-y-3">
              <SegField
                label="Animación"
                columns={2}
                value={theme.announcement.animation}
                onChange={(animation) =>
                  updateTheme((t) => ({ ...t, announcement: { ...t.announcement, animation } }))
                }
                options={[
                  { value: 'static', label: 'Fija, al centro' },
                  { value: 'marquee', label: 'En movimiento' },
                ]}
                hint={
                  theme.announcement.animation === 'marquee'
                    ? 'Los anuncios pasan en fila, de derecha a izquierda, sin parar.'
                    : 'Con varios anuncios, se ven uno al lado del otro.'
                }
              />

              <div className="space-y-3">
                {theme.announcement.items.map((it, i) => (
                  <div key={i} className="space-y-2 rounded-md border border-border p-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold uppercase tracking-wide text-fg-subtle">
                        Anuncio {i + 1}
                      </span>
                      {theme.announcement.items.length > 1 && (
                        <button
                          type="button"
                          aria-label={`Quitar anuncio ${i + 1}`}
                          onClick={() => removeItem(i)}
                          className="flex h-10 w-10 items-center justify-center rounded text-fg-muted hover:bg-danger/10 hover:text-danger"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                    <Field label="Texto">
                      <TextInput
                        value={it.text}
                        onChange={(v) => updateItem(i, { text: v })}
                        placeholder="10% OFF EN TU PRIMERA COMPRA"
                      />
                    </Field>
                    <LinkPicker
                      label="Link (opcional)"
                      value={it.link}
                      onChange={(href) => updateItem(i, { link: href })}
                      newTab={it.newTab}
                      onNewTabChange={(v) => updateItem(i, { newTab: v || undefined })}
                    />
                  </div>
                ))}
              </div>

              <button
                type="button"
                onClick={() =>
                  updateTheme((t) => ({
                    ...t,
                    announcement: {
                      ...t.announcement,
                      items: [...t.announcement.items, { text: '', link: '' }],
                    },
                  }))
                }
                className="inline-flex min-h-10 items-center gap-1.5 text-sm font-semibold text-primary hover:underline"
              >
                <Plus className="h-4 w-4" /> Agregar anuncio
              </button>
            </div>
          )}
        </Collapsible>
      </div>
    </div>
  );
}
