import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@tiendafy/ui';
import type { SectionStyle, ThemeSection } from '@tiendafy/types';
import { ColorRow, Field, Select } from '../../theme-editor-inputs';

/** Lo que cambia SectionStyleFields: el estilo y en qué dispositivos se ve. */
export type SectionEnvelopePatch = Pick<ThemeSection, 'style' | 'hideOn'>;

const DEVICE_OPTIONS = [
  { value: 'all', label: 'Celulares y computadoras' },
  { value: 'mobile-only', label: 'Solo en celulares' },
  { value: 'desktop-only', label: 'Solo en computadoras' },
];
const SPACING_OPTIONS = [
  { value: '', label: 'Normal' },
  { value: 'none', label: 'Sin espacio' },
  { value: 'sm', label: 'Chico' },
  { value: 'md', label: 'Mediano' },
  { value: 'lg', label: 'Grande' },
];

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
}: {
  section: Pick<ThemeSection, 'style' | 'hideOn'>;
  onChange: (patch: SectionEnvelopePatch) => void;
  defaultOpen?: boolean;
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
          <Field label="Mostrar en">
            <Select
              value={device}
              onChange={(v) =>
                onChange({
                  style: section.style,
                  hideOn: v === 'mobile-only' ? 'desktop' : v === 'desktop-only' ? 'mobile' : undefined,
                })
              }
              options={DEVICE_OPTIONS}
            />
          </Field>
          <Field label="Fondo">
            <Select
              value={style.background ?? 'none'}
              onChange={(v) =>
                setStyle({
                  background: v as SectionStyle['background'],
                  backgroundColor: v === 'custom' ? (style.backgroundColor ?? '245 245 245') : undefined,
                })
              }
              options={[
                { value: 'none', label: 'Sin fondo' },
                { value: 'subtle', label: 'Gris suave' },
                { value: 'accent', label: 'Color de la marca, tenue' },
                { value: 'custom', label: 'Otro color' },
              ]}
            />
          </Field>
          {style.background === 'custom' && (
            <ColorRow
              label="Color del fondo"
              hint="El texto se ajusta solo para que se lea."
              value={style.backgroundColor ?? '245 245 245'}
              fallback="#f5f5f5"
              onChange={(rgb) => setStyle({ backgroundColor: rgb })}
            />
          )}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Espacio arriba">
              <Select
                value={style.paddingTop ?? ''}
                onChange={(v) => setStyle({ paddingTop: (v || undefined) as SectionStyle['paddingTop'] })}
                options={SPACING_OPTIONS}
              />
            </Field>
            <Field label="Espacio abajo">
              <Select
                value={style.paddingBottom ?? ''}
                onChange={(v) =>
                  setStyle({ paddingBottom: (v || undefined) as SectionStyle['paddingBottom'] })
                }
                options={SPACING_OPTIONS}
              />
            </Field>
          </div>
          <Field label="Alineación de los títulos">
            <Select
              value={style.align ?? ''}
              onChange={(v) => setStyle({ align: (v || undefined) as SectionStyle['align'] })}
              options={[
                { value: '', label: 'Como viene' },
                { value: 'left', label: 'A la izquierda' },
                { value: 'center', label: 'Centrados' },
              ]}
            />
          </Field>
        </div>
      )}
    </div>
  );
}
