import { useState } from 'react';
import { ChevronDown, Plus, Trash2 } from 'lucide-react';
import { cn, useConfirm } from '@tiendafy/ui';
import { type ThemeConfig, baseTheme } from '@tiendafy/types';
import { BackHeader, Field, Check, Select, TextInput, ColorRow, sectionSetter } from './theme-editor-inputs';

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

const HEADER_PRESETS: { name: string; recommended?: boolean; header: Partial<ThemeConfig['header']> }[] = [
  {
    name: 'Clásico',
    recommended: true,
    header: { layout: 'classic', border: 'line', transparentOnHome: false, logoSize: 'md', sticky: true },
  },
  {
    name: 'Centrado',
    header: { layout: 'logo-center', border: 'none', transparentOnHome: false, logoSize: 'md', sticky: true },
  },
  {
    name: 'Inmersivo',
    header: {
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
    header: { layout: 'menu-left', border: 'none', transparentOnHome: false, logoSize: 'sm', sticky: true },
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
  const confirm = useConfirm();
  const setH = sectionSetter(updateTheme, 'header');
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
  const matchesPreset = (h: Partial<ThemeConfig['header']>) =>
    (Object.keys(h) as (keyof ThemeConfig['header'])[]).every((k) => theme.header[k] === h[k]);
  return (
    <div>
      <BackHeader
        title="Encabezado"
        onBack={onBack}
        onReset={async () => {
          if (
            await confirm({
              title: 'Restablecer encabezado',
              message: '¿Volver el encabezado y la barra de anuncio a los valores por defecto?',
              confirmLabel: 'Restablecer',
              variant: 'danger',
            })
          )
            updateTheme((t) => ({ ...t, header: baseTheme.header, announcement: baseTheme.announcement }));
        }}
      />
      <div className="space-y-4 p-4">
        <div>
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-fg-subtle">
            Estilos rápidos
          </div>
          <div className="grid grid-cols-2 gap-2">
            {HEADER_PRESETS.map((p) => (
              <button
                key={p.name}
                type="button"
                onClick={() => setH(p.header)}
                aria-pressed={matchesPreset(p.header)}
                className={cn(
                  'relative rounded-lg border px-3 py-2.5 text-sm font-medium transition',
                  matchesPreset(p.header)
                    ? 'border-primary text-primary ring-2 ring-primary/30'
                    : 'border-border text-fg hover:border-border-strong',
                )}
              >
                {p.name}
                {p.recommended && (
                  <span className="absolute -top-2 right-1.5 rounded-full bg-primary px-1.5 py-0.5 text-[0.6rem] font-semibold text-primary-fg">
                    Recomendado
                  </span>
                )}
              </button>
            ))}
          </div>
          <p className="mt-2 text-xs text-fg-muted">Ajustá los detalles abajo.</p>
        </div>
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
            <Check
              label="Mostrar ícono de cuenta"
              checked={theme.header.showAccount}
              onChange={(v) => setH({ showAccount: v })}
            />
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
                    <Field label="Link (opcional)">
                      <TextInput
                        value={it.link}
                        onChange={(v) => updateItem(i, { link: v })}
                        placeholder="/productos"
                      />
                    </Field>
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
