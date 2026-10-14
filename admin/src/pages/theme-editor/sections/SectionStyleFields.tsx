import { useState, type CSSProperties } from 'react';
import { AlignCenter, AlignLeft, ChevronDown, Monitor, MonitorSmartphone, Smartphone } from 'lucide-react';
import { cn } from '@tiendafy/ui';
import type { SectionStyle, ThemeSection } from '@tiendafy/types';
import { ColorRow } from '../../theme-editor-inputs';
import { ChoiceGroup, type Choice } from './choice-group';

/** Lo que cambia SectionStyleFields: el estilo y en qué dispositivos se ve. */
export type SectionEnvelopePatch = Pick<ThemeSection, 'style' | 'hideOn'>;

const ICON = 'h-5 w-5';
const DEVICE_OPTIONS: Choice<'all' | 'mobile-only' | 'desktop-only'>[] = [
  {
    value: 'all',
    label: 'Todos',
    title: 'Celulares y computadoras',
    icon: <MonitorSmartphone className={ICON} />,
  },
  {
    value: 'mobile-only',
    label: 'Celular',
    title: 'Solo en celulares',
    icon: <Smartphone className={ICON} />,
  },
  {
    value: 'desktop-only',
    label: 'Computadora',
    title: 'Solo en computadoras',
    icon: <Monitor className={ICON} />,
  },
];
const SPACING_OPTIONS: Choice<'' | NonNullable<SectionStyle['paddingTop']>>[] = [
  { value: '', label: 'Normal', title: 'Normal (como viene la sección)' },
  { value: 'none', label: 'Nada', title: 'Sin espacio' },
  { value: 'sm', label: 'Chico' },
  { value: 'md', label: 'Medio', title: 'Mediano' },
  { value: 'lg', label: 'Grande' },
];

/** Una muestra del fondo: el color de la página, gris, el de la marca o uno propio. */
function Swatch({ className, style }: { className?: string; style?: CSSProperties }) {
  return (
    <span className={cn('block h-5 w-7 rounded border border-border-strong', className)} style={style} />
  );
}

/** Sin claves vacías: un estilo sin nada es `undefined` (la sección como fue diseñada). */
function cleanStyle(style: SectionStyle): SectionStyle | undefined {
  const out = Object.fromEntries(
    Object.entries(style).filter(([, v]) => v !== undefined && v !== ''),
  ) as SectionStyle;
  if (out.background !== 'custom') delete out.backgroundColor;
  if (out.background === 'none') delete out.background;
  return Object.keys(out).length > 0 ? out : undefined;
}

/**
 * "Diseño de la sección": fondo, espaciado, alineación y en qué dispositivos
 * se ve. Es lo mismo para todos los tipos, así que vive una vez y SectionPanel
 * lo pone debajo del editor de cada uno. Arranca cerrado: es ajuste fino.
 *
 *   <SectionStyleFields section={section} onChange={(patch) => …} />
 *
 * `onChange` recibe `{ style, hideOn }` (cualquiera puede venir `undefined`
 * = sacarlo).
 */
export function SectionStyleFields({
  section,
  onChange,
  defaultOpen = false,
  showAlign = true,
}: {
  section: Pick<ThemeSection, 'style' | 'hideOn'>;
  onChange: (patch: SectionEnvelopePatch) => void;
  defaultOpen?: boolean;
  /** Sin título (un carrusel, la barra de envíos), alinear los títulos no cambia nada: no se ofrece. */
  showAlign?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const style = section.style ?? {};
  const setStyle = (patch: Partial<SectionStyle>) =>
    onChange({ style: cleanStyle({ ...style, ...patch }), hideOn: section.hideOn });
  const device =
    section.hideOn === 'desktop' ? 'mobile-only' : section.hideOn === 'mobile' ? 'desktop-only' : 'all';

  return (
    <div className="rounded-md border border-border">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex h-11 w-full items-center justify-between px-3 text-left text-sm font-semibold text-fg hover:bg-bg-muted"
      >
        Diseño de la sección
        <ChevronDown
          className={cn('h-4 w-4 text-fg-subtle transition-transform', open && 'rotate-180')}
          aria-hidden
        />
      </button>
      {open && (
        <div className="space-y-4 border-t border-border p-3">
          <ChoiceGroup
            label="Mostrar en"
            value={device}
            onChange={(v) =>
              onChange({
                style: section.style,
                hideOn: v === 'mobile-only' ? 'desktop' : v === 'desktop-only' ? 'mobile' : undefined,
              })
            }
            options={DEVICE_OPTIONS}
          />
          <ChoiceGroup
            label="Fondo"
            value={style.background ?? 'none'}
            onChange={(v) =>
              setStyle({
                background: v,
                backgroundColor: v === 'custom' ? (style.backgroundColor ?? '245 245 245') : undefined,
              })
            }
            options={[
              {
                value: 'none',
                label: 'Ninguno',
                title: 'Sin fondo',
                icon: <Swatch className="bg-surface" />,
              },
              { value: 'subtle', label: 'Gris', title: 'Gris suave', icon: <Swatch className="bg-fg/10" /> },
              {
                value: 'accent',
                label: 'Marca',
                title: 'Color de la marca, tenue',
                icon: <Swatch className="bg-primary/20" />,
              },
              {
                value: 'custom',
                label: 'Otro',
                title: 'Otro color',
                icon: (
                  <Swatch
                    style={{
                      background: style.backgroundColor
                        ? `rgb(${style.backgroundColor})`
                        : 'conic-gradient(#f87171, #facc15, #4ade80, #60a5fa, #c084fc, #f87171)',
                    }}
                  />
                ),
              },
            ]}
          />
          {style.background === 'custom' && (
            <ColorRow
              label="Color del fondo"
              hint="El texto se ajusta solo para que se lea."
              value={style.backgroundColor ?? '245 245 245'}
              fallback="#f5f5f5"
              onChange={(rgb) => setStyle({ backgroundColor: rgb })}
            />
          )}
          <ChoiceGroup
            label="Espacio arriba"
            value={style.paddingTop ?? ''}
            onChange={(v) => setStyle({ paddingTop: v || undefined })}
            options={SPACING_OPTIONS}
            columns={5}
          />
          <ChoiceGroup
            label="Espacio abajo"
            value={style.paddingBottom ?? ''}
            onChange={(v) => setStyle({ paddingBottom: v || undefined })}
            options={SPACING_OPTIONS}
            columns={5}
          />
          {showAlign && (
            <ChoiceGroup
              label="Alineación de los títulos"
              value={style.align ?? ''}
              onChange={(v) => setStyle({ align: v || undefined })}
              options={[
                { value: '', label: 'Como viene', title: 'Como viene la sección' },
                {
                  value: 'left',
                  label: 'Izquierda',
                  title: 'A la izquierda',
                  icon: <AlignLeft className={ICON} />,
                },
                {
                  value: 'center',
                  label: 'Centro',
                  title: 'Centrados',
                  icon: <AlignCenter className={ICON} />,
                },
              ]}
            />
          )}
        </div>
      )}
    </div>
  );
}
