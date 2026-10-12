import { useEffect, useState } from 'react';
import { ChevronDown, ChevronUp, Eye, EyeOff, GripVertical, Plus, Trash2 } from 'lucide-react';
import { cn } from '@tiendafy/ui';
import { type ThemeConfig, type ThemeMenuItem } from '@tiendafy/types';
import { api } from '../lib/api';
import { useStore } from '../context/StoreContext';
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

/* ---------- Menú del encabezado ---------- */

interface Pg {
  id: string;
  title: string;
}

/**
 * Qué se muestra en el menú y en qué orden.
 *
 * El orden no es sólo estético: lo que no entra a lo ancho del encabezado se va
 * a un desplegable "Más", así que lo de arriba es lo que queda a la vista.
 *
 * Se guardan preferencias, no la lista: los ítems que existen se calculan cada
 * vez (los fijos + las páginas publicadas). Por eso una página nueva aparece
 * sola al final en vez de quedar afuera hasta que alguien se acuerde.
 */
function MenuEditor({
  theme,
  updateTheme,
}: {
  theme: ThemeConfig;
  updateTheme: (u: (t: ThemeConfig) => ThemeConfig) => void;
}) {
  const { store } = useStore();
  const [pages, setPages] = useState<Pg[]>([]);

  useEffect(() => {
    if (!store) return;
    api
      .get<{ items: Pg[] }>('/api/v1/pages/published')
      .then((d) => setPages(d.items ?? []))
      .catch(() => setPages([]));
  }, [store]);

  const all = [
    { id: 'home', label: 'Inicio' },
    { id: 'products', label: 'Productos' },
    { id: 'categories', label: 'Categorías' },
    { id: 'contact', label: 'Contacto' },
    ...pages.map((p) => ({ id: `page:${p.id}`, label: p.title })),
  ];

  const prefs = theme.header.menu ?? [];
  const rank = new Map(prefs.map((m, i) => [m.id, i]));
  const hidden = new Set(prefs.filter((m) => !m.visible).map((m) => m.id));
  const rows = [...all].sort(
    (a, b) => (rank.get(a.id) ?? Number.MAX_SAFE_INTEGER) - (rank.get(b.id) ?? Number.MAX_SAFE_INTEGER),
  );

  // Se guarda la lista entera cada vez: mantener un orden parcial y adivinar
  // dónde entra lo que falta es la clase de estado que después nadie entiende.
  const save = (next: { id: string; label: string }[], hiddenNext: Set<string>) =>
    updateTheme((t) => ({
      ...t,
      header: {
        ...t.header,
        menu: next.map<ThemeMenuItem>((r) => ({ id: r.id, visible: !hiddenNext.has(r.id) })),
      },
    }));

  const move = (index: number, delta: number) => {
    const target = index + delta;
    if (target < 0 || target >= rows.length) return;
    const next = [...rows];
    const moved = next.splice(index, 1)[0];
    if (!moved) return;
    next.splice(target, 0, moved);
    save(next, hidden);
  };

  const toggle = (id: string) => {
    const hiddenNext = new Set(hidden);
    if (hiddenNext.has(id)) hiddenNext.delete(id);
    else hiddenNext.add(id);
    save(rows, hiddenNext);
  };

  return (
    <div>
      <p className="mb-2 text-xs text-fg-muted">
        Arriba va lo más importante: cuando no entran todos, los últimos pasan a un desplegable «Más».
      </p>
      {rows.map((row, i) => {
        const isHidden = hidden.has(row.id);
        return (
          <div
            key={row.id}
            className="mb-1.5 flex items-center gap-2 rounded-md border border-border bg-surface px-2 py-1.5"
          >
            <GripVertical className="h-4 w-4 shrink-0 text-fg-subtle" />
            <div className="flex flex-col text-fg-subtle">
              <button
                onClick={() => move(i, -1)}
                disabled={i === 0}
                aria-label={`Subir ${row.label}`}
                className="leading-none disabled:opacity-30"
              >
                <ChevronUp className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={() => move(i, 1)}
                disabled={i === rows.length - 1}
                aria-label={`Bajar ${row.label}`}
                className="leading-none disabled:opacity-30"
              >
                <ChevronDown className="h-3.5 w-3.5" />
              </button>
            </div>
            <span className={cn('flex-1 truncate text-sm', isHidden && 'text-fg-subtle line-through')}>
              {row.label}
            </span>
            <button
              onClick={() => toggle(row.id)}
              aria-label={isHidden ? `Mostrar ${row.label}` : `Ocultar ${row.label}`}
              className="shrink-0 text-fg-muted hover:text-fg"
            >
              {isHidden ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        );
      })}
      <p className="mt-2 text-xs text-fg-subtle">
        Las páginas de contenido que crees aparecen solas al final. Se editan en Páginas de contenido.
      </p>
    </div>
  );
}
