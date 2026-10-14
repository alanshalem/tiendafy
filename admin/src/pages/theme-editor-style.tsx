import { cn } from '@tiendafy/ui';
import { useId } from 'react';
import { baseTheme, contrastText, readableOn, type ThemeConfig } from '@tiendafy/types';
import { BackHeader, INPUT_BASE, SegGroup, useSectionReset } from './theme-editor-inputs';
import type { PanelProps } from './theme-editor-pages';

export function BorderRadiusPanel({ theme, onBack, updateTheme }: PanelProps) {
  const reset = useSectionReset(updateTheme);
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
      <BackHeader
        title="Estilo y movimiento"
        onBack={onBack}
        onReset={reset(
          ['borderRadius', 'buttons', 'iconKit', 'motion', 'density'],
          'el estilo y el movimiento',
        )}
      />
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

        <ButtonStyleSection theme={theme} updateTheme={updateTheme} />

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

type Buttons = ThemeConfig['buttons'];

/** Radio de la muestra según la forma (y los bordes globales en 'auto'). */
function sampleRadius(b: Buttons, global: ThemeConfig['borderRadius']): string {
  if (b.shape === 'square') return '0px';
  if (b.shape === 'pill') return '9999px';
  if (b.shape === 'rounded') return '0.5rem';
  return global === 'sharp' ? '0px' : global === 'soft' ? '0.125rem' : '0.5rem';
}

/**
 * Botones principales de la tienda (Comprar, Agregar, Pagar…): forma, relleno
 * y texto. Con una muestra que usa el color de la marca: elegir "contorno" sin
 * verlo es elegir a ciegas.
 */
function ButtonStyleSection({
  theme,
  updateTheme,
}: {
  theme: ThemeConfig;
  updateTheme: PanelProps['updateTheme'];
}) {
  const b = theme.buttons ?? baseTheme.buttons;
  const set = (patch: Partial<Buttons>) =>
    updateTheme((t) => ({ ...t, buttons: { ...(t.buttons ?? baseTheme.buttons), ...patch } }));
  const primary = theme.colors.primary;
  const ink = readableOn(primary, [theme.colors.bg]);
  const outline = b.variant === 'outline';
  const ids = useId();
  return (
    <div className="border-t border-border pt-4">
      <div className="mb-2 text-sm font-semibold text-fg">Botones</div>
      <p className="mb-3 text-xs text-fg-muted">
        Comprar, agregar al carrito, pagar y el resto de los principales.
      </p>

      {/* Muestra en vivo, sobre el fondo de la tienda. */}
      <div
        className="mb-3 flex items-center justify-center rounded-lg border border-border p-4"
        style={{ background: `rgb(${theme.colors.bg})` }}
        aria-hidden
      >
        <span
          data-testid="muestra-boton"
          className="inline-flex h-10 items-center px-5 text-sm font-semibold"
          style={{
            borderRadius: sampleRadius(b, theme.borderRadius),
            background: outline ? 'transparent' : `rgb(${primary})`,
            color: outline ? `rgb(${ink})` : `rgb(${contrastText(primary)})`,
            border: outline ? '1.5px solid currentColor' : '0',
            textTransform: b.textCase === 'uppercase' ? 'uppercase' : 'none',
            letterSpacing: b.textCase === 'uppercase' ? '0.06em' : 'normal',
          }}
        >
          Agregar al carrito
        </span>
      </div>

      <div className="space-y-3">
        <div>
          <div className="mb-1.5 text-xs font-medium text-fg-muted" id={`${ids}-forma`}>
            Forma
          </div>
          <SegGroup
            labelledBy={`${ids}-forma`}
            columns={4}
            value={b.shape}
            onChange={(shape) => set({ shape })}
            options={[
              { value: 'auto', label: 'Como los bordes' },
              { value: 'square', label: 'Recto' },
              { value: 'rounded', label: 'Redondeado' },
              { value: 'pill', label: 'Píldora' },
            ]}
          />
        </div>
        <div>
          <div className="mb-1.5 text-xs font-medium text-fg-muted" id={`${ids}-relleno`}>
            Relleno
          </div>
          <SegGroup
            labelledBy={`${ids}-relleno`}
            columns={2}
            value={b.variant}
            onChange={(variant) => set({ variant })}
            options={[
              { value: 'filled', label: 'Lleno' },
              { value: 'outline', label: 'Solo contorno' },
            ]}
          />
        </div>
        <div>
          <div className="mb-1.5 text-xs font-medium text-fg-muted" id={`${ids}-texto`}>
            Texto
          </div>
          <SegGroup
            labelledBy={`${ids}-texto`}
            columns={2}
            value={b.textCase}
            onChange={(textCase) => set({ textCase })}
            options={[
              { value: 'normal', label: 'Normal' },
              { value: 'uppercase', label: 'MAYÚSCULAS' },
            ]}
          />
        </div>
      </div>
    </div>
  );
}

export function CssPanel({ theme, onBack, updateTheme }: PanelProps) {
  const reset = useSectionReset(updateTheme);
  return (
    <div>
      <BackHeader
        title="Edición avanzada de CSS"
        onBack={onBack}
        onReset={reset('customCss', 'el CSS personalizado')}
      />
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
