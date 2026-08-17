import { cn } from '@tiendafy/ui';
import { type ThemeConfig, FONT_OPTIONS } from '@tiendafy/types';
import { BackHeader, Field, Select } from './theme-editor-inputs';

// Catálogo compartido (@tiendafy/types). Copia mutable para el <Select> (options no-readonly).
const fontOptions: { value: string; label: string }[] = [...FONT_OPTIONS];

// Familias CSS para previsualizar en el panel (mismas que el storefront).
const FONT_CSS: Record<string, string> = {
  sans: 'ui-sans-serif, system-ui, sans-serif',
  serif: 'Georgia, "Times New Roman", serif',
  display: 'Georgia, serif',
  mono: 'ui-monospace, monospace',
  poppins: "'Poppins', sans-serif",
  montserrat: "'Montserrat', sans-serif",
  dmsans: "'DM Sans', sans-serif",
  manrope: "'Manrope', sans-serif",
  worksans: "'Work Sans', sans-serif",
  spacegrotesk: "'Space Grotesk', sans-serif",
  playfair: "'Playfair Display', serif",
  lora: "'Lora', serif",
  cormorant: "'Cormorant Garamond', serif",
  dmserif: "'DM Serif Display', serif",
  bebas: "'Bebas Neue', sans-serif",
  archivoblack: "'Archivo Black', sans-serif",
};

// Combinaciones de tipografías que funcionan bien juntas (título + cuerpo).
// Curadas según pares clásicos de diseño, usando sólo fuentes ya cargadas.
const FONT_PAIRINGS: { name: string; heading: string; body: string }[] = [
  { name: 'Editorial', heading: 'playfair', body: 'dmsans' },
  { name: 'Moderno', heading: 'spacegrotesk', body: 'worksans' },
  { name: 'Elegante', heading: 'cormorant', body: 'montserrat' },
  { name: 'Impacto', heading: 'bebas', body: 'montserrat' },
  { name: 'Minimalista', heading: 'manrope', body: 'manrope' },
  { name: 'Clásico', heading: 'dmserif', body: 'dmsans' },
  { name: 'Boutique', heading: 'playfair', body: 'montserrat' },
  { name: 'Tecnológico', heading: 'spacegrotesk', body: 'dmsans' },
  { name: 'Cálido', heading: 'lora', body: 'worksans' },
  { name: 'Amigable', heading: 'poppins', body: 'dmsans' },
  { name: 'Lujo', heading: 'cormorant', body: 'worksans' },
  { name: 'Deportivo', heading: 'archivoblack', body: 'worksans' },
  { name: 'Revista', heading: 'dmserif', body: 'montserrat' },
  { name: 'Sobrio', heading: 'montserrat', body: 'lora' },
  { name: 'Fashion', heading: 'bebas', body: 'worksans' },
];

export function FontsPanel({
  theme,
  onBack,
  updateTheme,
}: {
  theme: ThemeConfig;
  onBack: () => void;
  updateTheme: (u: (t: ThemeConfig) => ThemeConfig) => void;
}) {
  const setFont = (k: 'heading' | 'body', v: string) =>
    updateTheme((t) => ({ ...t, fonts: { ...t.fonts, [k]: v } }));
  const applyPair = (heading: string, body: string) =>
    updateTheme((t) => ({ ...t, fonts: { ...t.fonts, heading, body } }));
  return (
    <div>
      <BackHeader title="Tipo de letra" onBack={onBack} />
      <div className="space-y-5 p-4">
        <div>
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-fg-subtle">
            Combinaciones listas
          </div>
          <p className="mb-3 text-xs text-fg-muted">
            Pares de tipografías que combinan bien. Tocá una para aplicarla.
          </p>
          <div className="grid grid-cols-2 gap-2">
            {FONT_PAIRINGS.map((p) => {
              const active = theme.fonts.heading === p.heading && theme.fonts.body === p.body;
              return (
                <button
                  key={p.name}
                  type="button"
                  onClick={() => applyPair(p.heading, p.body)}
                  aria-pressed={active}
                  className={cn(
                    'rounded-lg border p-3 text-left transition',
                    active
                      ? 'border-primary ring-2 ring-primary/30'
                      : 'border-border hover:border-border-strong',
                  )}
                >
                  <div className="text-lg leading-tight text-fg" style={{ fontFamily: FONT_CSS[p.heading] }}>
                    {p.name}
                  </div>
                  <div className="mt-0.5 text-xs text-fg-muted" style={{ fontFamily: FONT_CSS[p.body] }}>
                    Texto de muestra
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <div className="border-t border-border pt-4">
          <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-fg-subtle">
            Personalizado
          </div>
          <div className="space-y-4">
            <Field label="Títulos de páginas y banners">
              <Select
                value={theme.fonts.heading}
                onChange={(v) => setFont('heading', v)}
                options={fontOptions}
              />
            </Field>
            <Field label="Texto en el resto del sitio">
              <Select value={theme.fonts.body} onChange={(v) => setFont('body', v)} options={fontOptions} />
            </Field>
          </div>
        </div>
      </div>
    </div>
  );
}
