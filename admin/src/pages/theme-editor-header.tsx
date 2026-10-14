import { useState } from 'react';
import { ChevronDown, Plus, Trash2 } from 'lucide-react';
import { cn } from '@tiendafy/ui';
import { type ThemeConfig } from '@tiendafy/types';
import { LinkPicker } from '../components/LinkPicker';
import { MenuEditor } from './theme-editor-menu';
import {
  BackHeader,
  Field,
  Check,
  Select,
  TextInput,
  ColorRow,
  ContrastNote,
  sectionSetter,
  useSectionReset,
  QuickStyles,
  type QuickStyle,
} from './theme-editor-inputs';

/** Sección plegable para paneles largos (ej. Encabezado). Título clickeable + cuerpo. */
function Collapsible({
  title,
  children,
  defaultOpen = true,
}: {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-t border-border pt-4">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between text-sm font-semibold text-fg"
      >
        {title}
        <ChevronDown className={cn('h-4 w-4 text-fg-muted transition-transform', open ? 'rotate-180' : '')} />
      </button>
      {open && <div className="mt-3">{children}</div>}
    </div>
  );
}

const HEADER_PRESETS: QuickStyle<ThemeConfig['header']>[] = [
  {
    name: 'Clásico',
    recommended: true,
    patch: { layout: 'classic', border: 'line', transparentOnHome: false, logoSize: 'md', sticky: true },
  },
  {
    name: 'Centrado',
    patch: { layout: 'logo-center', border: 'none', transparentOnHome: false, logoSize: 'md', sticky: true },
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
  },
  {
    name: 'Minimal',
    patch: { layout: 'menu-left', border: 'none', transparentOnHome: false, logoSize: 'sm', sticky: true },
  },
];

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
  return (
    <div>
      <BackHeader
        title="Encabezado"
        onBack={onBack}
        onReset={reset(['header', 'announcement'], 'el encabezado y la barra de anuncio')}
      />
      <div className="space-y-4 p-4">
        <QuickStyles presets={HEADER_PRESETS} current={theme.header} onApply={setH} />
        <ColorRow
          label="Color de fondo del encabezado"
          value={theme.header.bg}
          onChange={(v) => updateTheme((t) => ({ ...t, header: { ...t.header, bg: v } }))}
          fallback="#1b1510"
        />
        <Check
          label="Encabezado siempre visible al navegar"
          checked={theme.header.sticky}
          onChange={(v) => updateTheme((t) => ({ ...t, header: { ...t.header, sticky: v } }))}
        />
        <Check
          label="Mostrar menú de solapas en celulares"
          checked={theme.header.showTabsMobile}
          onChange={(v) => updateTheme((t) => ({ ...t, header: { ...t.header, showTabsMobile: v } }))}
        />
        <Field label="Tamaño del logo">
          <Select
            value={theme.header.logoSize}
            onChange={(v) =>
              updateTheme((t) => ({ ...t, header: { ...t.header, logoSize: v as 'sm' | 'md' | 'lg' } }))
            }
            options={[
              { value: 'sm', label: 'Chico' },
              { value: 'md', label: 'Predeterminado' },
              { value: 'lg', label: 'Grande' },
            ]}
          />
        </Field>

        <Collapsible title="Disposición y estilo">
          <div className="space-y-3">
            <Field label="Disposición">
              <Select
                value={theme.header.layout}
                onChange={(v) => setH({ layout: v as ThemeConfig['header']['layout'] })}
                options={[
                  { value: 'classic', label: 'Logo izquierda · menú centro' },
                  { value: 'logo-center', label: 'Logo centrado' },
                  { value: 'menu-left', label: 'Logo y menú a la izquierda' },
                  { value: 'menu-right', label: 'Menú a la derecha' },
                ]}
              />
            </Field>
            <ColorRow
              label="Color del texto del menú"
              value={theme.header.textColor}
              onChange={(v) => setH({ textColor: v })}
              fallback="#ffffff"
            />
            {/* Solo cuando el encabezado es opaco: sobre una foto el contraste
                depende de la foto y de la transparencia, no de estos dos. */}
            {!theme.header.transparentOnHome && theme.header.textColor && (
              <ContrastNote
                fg={theme.header.textColor}
                bg={theme.header.bg}
                label="el menú sobre el encabezado"
              />
            )}
            <Check
              label="Encabezado transparente sobre el inicio"
              checked={theme.header.transparentOnHome}
              onChange={(v) => setH({ transparentOnHome: v })}
            />
            {theme.header.transparentOnHome && (
              <Field label="Nivel de transparencia">
                <Select
                  value={theme.header.transparentLevel || 'full'}
                  onChange={(v) => setH({ transparentLevel: v as ThemeConfig['header']['transparentLevel'] })}
                  options={[
                    { value: 'full', label: 'Totalmente transparente' },
                    { value: 'light', label: 'Leve tinte' },
                    { value: 'medium', label: 'Tinte medio' },
                  ]}
                />
              </Field>
            )}
            <Field label="Borde inferior">
              <Select
                value={theme.header.border}
                onChange={(v) => setH({ border: v as ThemeConfig['header']['border'] })}
                options={[
                  { value: 'none', label: 'Ninguno' },
                  { value: 'line', label: 'Línea' },
                  { value: 'shadow', label: 'Sombra' },
                ]}
              />
            </Field>
          </div>
        </Collapsible>

        <Collapsible title="Menú">
          <MenuEditor theme={theme} updateTheme={updateTheme} />
        </Collapsible>

        <Collapsible title="Buscador y acciones">
          <div className="space-y-3">
            <Check
              label="Mostrar buscador en el encabezado"
              checked={theme.header.showSearch}
              onChange={(v) => setH({ showSearch: v })}
            />
            <Check
              label="Mostrar carrito"
              checked={theme.header.showCart}
              onChange={(v) => setH({ showCart: v })}
            />
            {theme.header.showCart && (
              <Field label="Estilo del carrito">
                <Select
                  value={theme.header.cartStyle}
                  onChange={(v) => setH({ cartStyle: v as ThemeConfig['header']['cartStyle'] })}
                  options={[
                    { value: 'icon', label: 'Solo ícono' },
                    { value: 'text', label: 'Ícono y texto «Carrito»' },
                  ]}
                />
              </Field>
            )}
          </div>
        </Collapsible>

        <Collapsible title="Barra de anuncio" defaultOpen={false}>
          <Check
            label="Mostrar barra de anuncio"
            checked={theme.announcement.show}
            onChange={(v) => updateTheme((t) => ({ ...t, announcement: { ...t.announcement, show: v } }))}
          />
          {theme.announcement.show && (
            <div className="mt-3 space-y-3">
              <Field label="Animación">
                <Select
                  value={theme.announcement.animation}
                  onChange={(v) =>
                    updateTheme((t) => ({
                      ...t,
                      announcement: {
                        ...t.announcement,
                        animation: v as ThemeConfig['announcement']['animation'],
                      },
                    }))
                  }
                  options={[
                    { value: 'static', label: 'Fija (centrada)' },
                    { value: 'marquee', label: 'En movimiento (derecha → izquierda)' },
                  ]}
                />
              </Field>

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
                          aria-label="Quitar anuncio"
                          onClick={() => removeItem(i)}
                          className="rounded p-1 text-fg-muted hover:bg-danger/10 hover:text-danger"
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
                className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline"
              >
                <Plus className="h-4 w-4" /> Agregar anuncio
              </button>
              {theme.announcement.animation === 'marquee' && (
                <p className="text-xs text-fg-muted">
                  Con varios anuncios y movimiento, se muestran en fila desplazándose en loop.
                </p>
              )}
            </div>
          )}
        </Collapsible>
      </div>
    </div>
  );
}
