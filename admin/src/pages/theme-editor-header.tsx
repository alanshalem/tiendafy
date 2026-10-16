import { cn } from '@tiendafy/ui';
import {
  ANNOUNCEMENT_INTERVAL,
  contrastText,
  HEADER_PAGE_KINDS,
  heroUnderHeader,
  type HeaderPageColor,
  type HeaderPageKind,
  type ItemBase,
  type ThemeConfig,
} from '@tiendafy/types';
import { LinkPicker } from '../components/LinkPicker';
import { MediaUpload } from '../components/upload/MediaUpload';
import { MenuEditor } from './theme-editor-menu';
import { AnnouncementThumb, HeaderThumb } from './theme-editor-thumbs';
import { ItemListEditor } from './theme-editor/sections/ItemListEditor';
import {
  BackHeader,
  Field,
  Check,
  Collapsible,
  SegField,
  Select,
  TextInput,
  ColorRow,
  ContrastNote,
  sectionSetter,
  useSectionReset,
  QuickStyles,
  type QuickStyle,
} from './theme-editor-inputs';

type Header = ThemeConfig['header'];
type Announcement = ThemeConfig['announcement'];
/** Un anuncio, como ítem de la lista del editor (sin nombre propio: ver `renamable`). */
type AnnouncementItem = Announcement['items'][number] & ItemBase;

/** Las tres formas de mostrar los anuncios, con su dibujito y qué hace cada una. */
const ANNOUNCEMENT_MODES: { value: Announcement['animation']; label: string; hint: string }[] = [
  { value: 'static', label: 'Fijo', hint: 'Con varios anuncios, se ven uno al lado del otro.' },
  {
    value: 'marquee',
    label: 'Desplazándose',
    hint: 'Los anuncios pasan en fila, de derecha a izquierda, sin parar.',
  },
  {
    value: 'rotate',
    label: 'Uno por vez',
    hint: 'Se ve un anuncio a la vez y cambia solo al siguiente, con flechas para pasarlos.',
  },
];

/** De 3 a 10 segundos: menos no da tiempo a leer; más, nadie espera a ver el siguiente. */
const INTERVALS = Array.from(
  { length: ANNOUNCEMENT_INTERVAL.max - ANNOUNCEMENT_INTERVAL.min + 1 },
  (_, i) => ANNOUNCEMENT_INTERVAL.min + i,
);

/** Cómo se llama cada tipo de página en el editor. */
const HEADER_PAGE_LABELS: Record<HeaderPageKind, string> = {
  home: 'Inicio',
  listing: 'Listado y categorías',
  product: 'Producto',
  content: 'Páginas de contenido',
  checkout: 'Checkout (pago)',
};

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

/**
 * Una fila de "Colores por página": la muestra (fondo y "Aa" en el color del
 * texto que va a tener), "Igual que el general" y, si no lo es, sus colores.
 * Al apagar "igual", arranca con el fondo general y el texto en automático:
 * el comercio cambia el fondo y el texto se acomoda solo.
 */
function PageColorRow({
  kind,
  header,
  onChange,
}: {
  kind: HeaderPageKind;
  header: Header;
  onChange: (kind: HeaderPageKind, value: HeaderPageColor | undefined) => void;
}) {
  const own = header.pageColors[kind];
  const label = HEADER_PAGE_LABELS[kind];
  const bg = own?.bg ?? header.bg;
  const text = (own ? own.textColor : header.textColor) || contrastText(bg);
  return (
    <div role="group" aria-label={label} className="rounded-md border border-border p-2.5">
      <div className="flex items-center gap-2.5">
        <span
          aria-hidden
          className="flex h-7 w-10 shrink-0 items-center justify-center rounded border border-border-strong text-xs font-bold"
          style={{ background: `rgb(${bg})`, color: `rgb(${text})` }}
        >
          Aa
        </span>
        <span className="min-w-0 flex-1 text-sm font-medium text-fg">{label}</span>
      </div>
      <div className="mt-2">
        <Check
          label="Igual que el general"
          checked={!own}
          onChange={(same) => onChange(kind, same ? undefined : { bg: header.bg, textColor: '' })}
        />
      </div>
      {own && (
        <div className="mt-2.5 space-y-2.5">
          <ColorRow
            label="Fondo"
            value={own.bg}
            onChange={(v) => onChange(kind, { ...own, bg: v })}
            fallback="#1b1510"
          />
          <ColorRow
            label="Texto e íconos"
            value={own.textColor}
            onChange={(v) => onChange(kind, { ...own, textColor: v })}
            onAuto={() => onChange(kind, { ...own, textColor: '' })}
            autoValue={contrastText(own.bg)}
            fallback="#ffffff"
          />
          {own.textColor && <ContrastNote fg={own.textColor} bg={own.bg} label="el menú sobre este fondo" />}
          {kind === 'home' && header.transparentOnHome && (
            <p className="text-xs text-fg-muted">
              Arriba de todo va transparente sobre la foto de portada; este color se ve al bajar.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export function HeaderPanel({
  theme,
  onBack,
  updateTheme,
  onPreviewPage,
}: {
  theme: ThemeConfig;
  onBack: () => void;
  updateTheme: (u: (t: ThemeConfig) => ThemeConfig) => void;
  /** Llevar la vista previa a un tipo de página (para ver su color de encabezado). */
  onPreviewPage?: (kind: HeaderPageKind) => void;
}) {
  const setH = sectionSetter(updateTheme, 'header');
  // Sin colores propios (undefined), la página vuelve a usar los generales.
  const setPageColor = (kind: HeaderPageKind, value: HeaderPageColor | undefined) => {
    updateTheme((t) => {
      const pageColors = { ...t.header.pageColors };
      if (value) pageColors[kind] = value;
      else delete pageColors[kind];
      return { ...t, header: { ...t.header, pageColors } };
    });
    // Que se vea lo que se está cambiando: la vista previa va a esa página.
    onPreviewPage?.(kind);
  };
  const reset = useSectionReset(updateTheme);
  const h = theme.header;
  const setA = sectionSetter(updateTheme, 'announcement');
  const ann = theme.announcement;
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

        <Collapsible title="Colores por página" defaultOpen={Object.keys(h.pageColors).length > 0}>
          <p className="mb-3 text-xs text-fg-muted">
            Para que el encabezado cambie según dónde esté tu cliente: por ejemplo, oscuro solo en el inicio y
            claro en el resto. Al cambiar uno, la vista previa va a esa página.
          </p>
          <div className="space-y-2">
            {HEADER_PAGE_KINDS.map((kind) => (
              <PageColorRow key={kind} kind={kind} header={h} onChange={setPageColor} />
            ))}
          </div>
        </Collapsible>

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

        <Collapsible title="Barra de anuncio" defaultOpen={ann.show}>
          <Check
            label="Mostrar barra de anuncio"
            hint="Una franja arriba de todo con tu promo: envío gratis, cuotas, un cupón."
            checked={ann.show}
            onChange={(v) => setA({ show: v })}
          />
          {ann.show && (
            <div className="mt-3 space-y-3">
              <SegField
                label="Cómo se ven los anuncios"
                value={ann.animation}
                onChange={(animation) => setA({ animation })}
                options={ANNOUNCEMENT_MODES.map((m) => ({
                  value: m.value,
                  label: m.label,
                  visual: (
                    <span className="block w-full overflow-hidden rounded">
                      <AnnouncementThumb mode={m.value} />
                    </span>
                  ),
                }))}
                hint={ANNOUNCEMENT_MODES.find((m) => m.value === ann.animation)?.hint}
              />
              {ann.animation === 'rotate' && (
                <Field
                  label="Cada cuánto cambia"
                  hint="Se frena al pasar el mouse o al tocarla, y siempre tiene botón de pausa. Con un solo anuncio queda fijo."
                >
                  <Select
                    value={String(ann.interval)}
                    onChange={(v) => setA({ interval: Number(v) })}
                    options={INTERVALS.map((n) => ({ value: String(n), label: `${n} segundos` }))}
                  />
                </Field>
              )}
              {ann.animation === 'marquee' && (
                <SegField
                  label="Velocidad"
                  value={ann.speed}
                  onChange={(speed) => setA({ speed })}
                  options={[
                    { value: 'slow', label: 'Lenta' },
                    { value: 'normal', label: 'Normal' },
                    { value: 'fast', label: 'Rápida' },
                  ]}
                  hint="Se frena al pasar el mouse y tiene botón de pausa."
                />
              )}

              <ItemListEditor<AnnouncementItem>
                items={ann.items}
                onChange={(items) => setA({ items })}
                createItem={() => ({ text: '', link: '' })}
                addLabel="Agregar anuncio"
                listLabel="Anuncios"
                renamable={false}
                // El título de cada fila es su texto: es lo que se busca con la vista.
                itemTitle={(it) => it.text.trim() || `Anuncio ${ann.items.indexOf(it) + 1}`}
                renderItem={(it, update) => (
                  <>
                    <Field label="Texto">
                      <TextInput
                        value={it.text}
                        onChange={(v) => update({ text: v })}
                        placeholder="10% OFF EN TU PRIMERA COMPRA"
                      />
                    </Field>
                    <LinkPicker
                      label="Link (opcional)"
                      value={it.link}
                      onChange={(href) => update({ link: href })}
                      newTab={it.newTab}
                      onNewTabChange={(v) => update({ newTab: v || undefined })}
                    />
                  </>
                )}
              />
            </div>
          )}
        </Collapsible>
      </div>
    </div>
  );
}
