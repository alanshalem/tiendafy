import { cn } from '@tiendafy/ui';
import { type ThemeConfig } from '@tiendafy/types';
import { BackHeader, Check, ColorRow, ContrastNote, contrastText } from './theme-editor-inputs';

// Paletas curadas. `group` separa claras de oscuras en el panel.
const presets = [
  // --- Claras ---
  {
    name: 'Bermellón',
    group: 'light',
    primary: '232 80 30',
    bg: '255 255 255',
    text: '17 24 39',
    header: '27 21 16',
  },
  {
    name: 'Mono',
    group: 'light',
    primary: '17 17 17',
    bg: '255 255 255',
    text: '17 17 17',
    header: '17 17 17',
  },
  {
    name: 'Arena',
    group: 'light',
    primary: '194 65 12',
    bg: '254 252 248',
    text: '41 37 36',
    header: '68 64 60',
  },
  {
    name: 'Cielo',
    group: 'light',
    primary: '12 74 110',
    bg: '248 251 253',
    text: '23 37 47',
    header: '12 74 110',
  },
  {
    name: 'Bosque',
    group: 'light',
    primary: '30 91 63',
    bg: '250 252 248',
    text: '26 36 30',
    header: '30 91 63',
  },
  {
    name: 'Menta',
    group: 'light',
    primary: '13 148 136',
    bg: '247 254 252',
    text: '19 78 74',
    header: '17 94 89',
  },
  {
    name: 'Esmeralda',
    group: 'light',
    primary: '5 150 105',
    bg: '247 254 250',
    text: '6 78 59',
    header: '6 78 59',
  },
  {
    name: 'Turquesa',
    group: 'light',
    primary: '8 145 178',
    bg: '247 254 255',
    text: '22 60 70',
    header: '14 116 144',
  },
  {
    name: 'Rosa',
    group: 'light',
    primary: '214 109 132',
    bg: '255 251 252',
    text: '52 36 41',
    header: '52 36 41',
  },
  {
    name: 'Coral',
    group: 'light',
    primary: '244 63 94',
    bg: '255 250 251',
    text: '76 5 25',
    header: '76 5 25',
  },
  {
    name: 'Vino',
    group: 'light',
    primary: '159 18 57',
    bg: '254 252 252',
    text: '50 12 24',
    header: '76 5 25',
  },
  {
    name: 'Lavanda',
    group: 'light',
    primary: '124 58 237',
    bg: '250 250 255',
    text: '30 27 75',
    header: '49 46 129',
  },
  {
    name: 'Índigo',
    group: 'light',
    primary: '67 56 202',
    bg: '249 250 255',
    text: '30 27 75',
    header: '49 46 129',
  },
  {
    name: 'Mostaza',
    group: 'light',
    primary: '202 138 4',
    bg: '254 252 245',
    text: '41 37 28',
    header: '66 50 12',
  },
  // --- Oscuras ---
  {
    name: 'Obsidiana',
    group: 'dark',
    primary: '232 80 30',
    bg: '10 10 10',
    text: '245 245 245',
    header: '0 0 0',
  },
  {
    name: 'Noche',
    group: 'dark',
    primary: '163 230 53',
    bg: '14 14 14',
    text: '245 245 245',
    header: '0 0 0',
  },
  {
    name: 'Carbón',
    group: 'dark',
    primary: '249 115 22',
    bg: '24 24 27',
    text: '244 244 245',
    header: '9 9 11',
  },
  {
    name: 'Marino',
    group: 'dark',
    primary: '56 189 248',
    bg: '15 23 42',
    text: '226 232 240',
    header: '2 6 23',
  },
  {
    name: 'Grafito',
    group: 'dark',
    primary: '129 140 248',
    bg: '17 17 19',
    text: '237 237 240',
    header: '9 9 11',
  },
  {
    name: 'Viña',
    group: 'dark',
    primary: '244 63 94',
    bg: '20 12 16',
    text: '245 240 242',
    header: '10 6 8',
  },
];

export function ColorsPanel({
  theme,
  onBack,
  onReset,
  setColor,
  onToggleAccent,
  applyPreset,
}: {
  theme: ThemeConfig;
  onBack: () => void;
  onReset: () => void;
  setColor: (k: keyof ThemeConfig['colors'], v: string) => void;
  onToggleAccent: (on: boolean) => void;
  applyPreset: (p: (typeof presets)[number]) => void;
}) {
  return (
    <div>
      <BackHeader title="Colores de tu marca" onBack={onBack} onReset={onReset} />
      <div className="space-y-5 p-4">
        <ColorRow
          label="Color principal"
          hint="Botones, destacados, líneas."
          value={theme.colors.primary}
          onChange={(v) => setColor('primary', v)}
          fallback="#e8501e"
        />
        <Check
          label="Usar color de acento"
          checked={theme.colors.useAccent}
          onChange={(v) => onToggleAccent(v)}
        />
        {theme.colors.useAccent && (
          <ColorRow
            label="Color de acento"
            value={theme.colors.accent}
            onChange={(v) => setColor('accent', v)}
            fallback="#1b1510"
          />
        )}
        <div className="border-t border-border pt-4">
          <div className="mb-3 text-sm font-semibold text-fg">Colores de contraste</div>
          <div className="space-y-3">
            <ColorRow
              label="Color de fondo"
              value={theme.colors.bg}
              onChange={(v) => setColor('bg', v)}
              fallback="#ffffff"
            />
            <ColorRow
              label="Color de textos"
              value={theme.colors.text}
              onChange={(v) => setColor('text', v)}
              fallback="#111827"
            />
            <ContrastNote fg={theme.colors.text} bg={theme.colors.bg} label="el texto sobre el fondo" />
            <ContrastNote
              fg={contrastText(theme.colors.primary)}
              bg={theme.colors.primary}
              label="el texto de los botones"
            />
          </div>
        </div>
        <div className="border-t border-border pt-4">
          <div className="mb-2 text-sm font-semibold text-fg">Vista previa</div>
          <div
            className="rounded-lg border border-border p-3"
            style={{ background: `rgb(${theme.colors.bg})`, color: `rgb(${theme.colors.text})` }}
          >
            <div className="text-sm font-semibold">Producto de ejemplo</div>
            <div className="mt-0.5 text-xs" style={{ opacity: 0.7 }}>
              $ 12.500
            </div>
            <button
              className="mt-2 w-full rounded-md py-1.5 text-xs font-semibold"
              style={{
                background: `rgb(${theme.colors.primary})`,
                color: contrastText(theme.colors.primary),
              }}
            >
              Agregar al carrito
            </button>
          </div>
        </div>
        <div className="border-t border-border pt-4">
          <div className="mb-1 text-sm font-semibold text-fg">Combinaciones predeterminadas</div>
          <p className="mb-3 text-xs text-fg-muted">
            Un click para arrancar de una base. El nombre va en el fondo y color de texto reales de la paleta.
          </p>
          {(['light', 'dark'] as const).map((grp) => (
            <div key={grp} className="mb-4 last:mb-0">
              <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-fg-subtle">
                {grp === 'light' ? 'Claras' : 'Oscuras'}
              </div>
              <div className="grid grid-cols-2 gap-2">
                {presets
                  .filter((p) => p.group === grp)
                  .map((p) => {
                    const active =
                      theme.colors.primary === p.primary &&
                      theme.colors.bg === p.bg &&
                      theme.colors.text === p.text;
                    return (
                      <button
                        key={p.name}
                        type="button"
                        onClick={() => applyPreset(p)}
                        aria-pressed={active}
                        title={p.name}
                        className={cn(
                          'overflow-hidden rounded-lg border transition',
                          active
                            ? 'border-primary ring-2 ring-primary/30'
                            : 'border-border hover:border-border-strong',
                        )}
                      >
                        <div className="flex h-7">
                          <div className="flex-1" style={{ background: `rgb(${p.primary})` }} />
                          <div className="w-1/3" style={{ background: `rgb(${p.header})` }} />
                        </div>
                        <div
                          className="flex items-center justify-between px-2.5 py-2"
                          style={{ background: `rgb(${p.bg})`, color: `rgb(${p.text})` }}
                        >
                          <span className="text-sm font-semibold">{p.name}</span>
                          <span className="text-xs opacity-60">Aa</span>
                        </div>
                      </button>
                    );
                  })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
