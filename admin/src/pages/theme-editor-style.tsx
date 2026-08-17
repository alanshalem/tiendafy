import { cn } from '@tiendafy/ui';
import { type ThemeConfig } from '@tiendafy/types';
import { BackHeader, INPUT_BASE } from './theme-editor-inputs';
import type { PanelProps } from './theme-editor-pages';

export function BorderRadiusPanel({ theme, onBack, updateTheme }: PanelProps) {
  const radiusOpts: { value: ThemeConfig['borderRadius']; label: string; sample: string }[] = [
    { value: 'rounded', label: 'Redondeado', sample: 'rounded-xl' },
    { value: 'soft', label: 'Suave', sample: 'rounded' },
    { value: 'sharp', label: 'Cuadrado', sample: 'rounded-none' },
  ];
  const iconKits: { value: ThemeConfig['iconKit']; label: string; desc: string }[] = [
    { value: 'lucide', label: 'Clásico', desc: 'Líneas limpias (por defecto)' },
    { value: 'feather', label: 'Fino', desc: 'Trazo liviano y minimal' },
    { value: 'tabler', label: 'Marcado', desc: 'Contorno con más presencia' },
    { value: 'phosphor', label: 'Relleno', desc: 'Íconos sólidos redondeados' },
    { value: 'heroicons', label: 'Sólido', desc: 'Sólidos y compactos' },
  ];
  return (
    <div>
      <BackHeader title="Estilo y movimiento" onBack={onBack} />
      <div className="space-y-6 p-4">
        <div>
          <div className="mb-2 text-sm font-semibold text-fg">Bordes</div>
          <p className="mb-3 text-xs text-fg-muted">
            Cards, botones, imágenes e inputs. Los íconos circulares no cambian.
          </p>
          <div className="grid grid-cols-3 gap-2">
            {radiusOpts.map((o) => {
              const active = theme.borderRadius === o.value;
              return (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => updateTheme((t) => ({ ...t, borderRadius: o.value }))}
                  aria-pressed={active}
                  className={cn(
                    'flex flex-col items-center gap-2.5 rounded-lg border p-3 text-xs font-medium transition',
                    active
                      ? 'border-primary ring-2 ring-primary/30'
                      : 'border-border hover:border-border-strong',
                  )}
                >
                  <span className={cn('h-11 w-11 border-2 border-fg/50 bg-fg/5', o.sample)} />
                  {o.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="border-t border-border pt-4">
          <div className="mb-2 text-sm font-semibold text-fg">Íconos</div>
          <p className="mb-3 text-xs text-fg-muted">
            Cambia el estilo de todos los íconos de la tienda (carrito, corazón, cuenta, contacto, etc.).
            Miralo en la vista previa.
          </p>
          <div className="grid gap-2">
            {iconKits.map((k) => {
              const active = theme.iconKit === k.value;
              return (
                <button
                  key={k.value}
                  type="button"
                  onClick={() => updateTheme((t) => ({ ...t, iconKit: k.value }))}
                  aria-pressed={active}
                  className={cn(
                    'flex items-center justify-between rounded-lg border px-3 py-2.5 text-left transition',
                    active
                      ? 'border-primary ring-2 ring-primary/30'
                      : 'border-border hover:border-border-strong',
                  )}
                >
                  <span>
                    <span className="block text-sm font-medium text-fg">{k.label}</span>
                    <span className="block text-xs text-fg-muted">{k.desc}</span>
                  </span>
                  {active && <span className="text-xs font-semibold text-primary">Activo</span>}
                </button>
              );
            })}
          </div>
        </div>

        <div className="border-t border-border pt-4">
          <div className="mb-2 text-sm font-semibold text-fg">Movimiento</div>
          <p className="mb-3 text-xs text-fg-muted">
            Animaciones de entrada al cargar y scrollear.{' '}
            <span className="text-primary">Recomendado: Sutil.</span>
          </p>
          <SegGroup
            value={theme.motion}
            onChange={(v) => updateTheme((t) => ({ ...t, motion: v }))}
            options={[
              { value: 'none', label: 'Sin' },
              { value: 'subtle', label: 'Sutil' },
              { value: 'dynamic', label: 'Dinámico' },
            ]}
          />
        </div>

        <div className="border-t border-border pt-4">
          <div className="mb-2 text-sm font-semibold text-fg">Densidad</div>
          <p className="mb-3 text-xs text-fg-muted">
            Cuánto aire entre secciones de la tienda.{' '}
            <span className="text-primary">Recomendado: Cómodo.</span>
          </p>
          <SegGroup
            value={theme.density}
            onChange={(v) => updateTheme((t) => ({ ...t, density: v }))}
            options={[
              { value: 'compact', label: 'Compacto' },
              { value: 'cozy', label: 'Cómodo' },
              { value: 'spacious', label: 'Amplio' },
            ]}
          />
        </div>
      </div>
    </div>
  );
}

export function CssPanel({ theme, onBack, updateTheme }: PanelProps) {
  return (
    <div>
      <BackHeader title="Edición avanzada de CSS" onBack={onBack} />
      <div className="space-y-2 p-4">
        <p className="text-xs text-fg-muted">
          CSS personalizado inyectado en tu tienda. Para usuarios avanzados.
        </p>
        <textarea
          value={theme.customCss}
          onChange={(e) => updateTheme((t) => ({ ...t, customCss: e.target.value }))}
          rows={14}
          aria-label="CSS personalizado"
          placeholder={'.product-card { border-radius: 16px; }'}
          className={`w-full p-3 font-mono text-xs ${INPUT_BASE}`}
        />
      </div>
    </div>
  );
}

/** Grupo de opciones tipo segmented (3 botones). */
function SegGroup<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="grid grid-cols-3 gap-2">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          aria-pressed={value === o.value}
          className={cn(
            'rounded-lg border px-2 py-2 text-xs font-medium transition',
            value === o.value
              ? 'border-primary text-primary ring-2 ring-primary/30'
              : 'border-border text-fg hover:border-border-strong',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
