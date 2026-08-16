import { type ReactNode } from 'react';
import { Calendar, ChevronDown, Clock } from 'lucide-react';
import { cn } from '@tiendafy/ui';

/* ============================================================
   Rango de fechas REAL de las páginas de estadísticas.
   (Antes esta barra era un mockup: los selects no filtraban nada.)
   ============================================================ */

interface StatsRange {
  preset: string;
  /** yyyy-mm-dd (fecha local del merchant). */
  from: string;
  to: string;
}

const iso = (d: Date) => {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};
const daysAgo = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
};

const PRESETS: { label: string; range: () => { from: string; to: string } }[] = [
  { label: 'Hoy', range: () => ({ from: iso(new Date()), to: iso(new Date()) }) },
  { label: 'Últimos 7 días', range: () => ({ from: iso(daysAgo(6)), to: iso(new Date()) }) },
  { label: 'Últimos 30 días', range: () => ({ from: iso(daysAgo(29)), to: iso(new Date()) }) },
  { label: 'Últimos 90 días', range: () => ({ from: iso(daysAgo(89)), to: iso(new Date()) }) },
  {
    label: 'Este mes',
    range: () => {
      const d = new Date();
      return { from: iso(new Date(d.getFullYear(), d.getMonth(), 1)), to: iso(d) };
    },
  },
  {
    label: 'Este año',
    range: () => {
      const d = new Date();
      return { from: iso(new Date(d.getFullYear(), 0, 1)), to: iso(d) };
    },
  },
];

export function defaultStatsRange(preset = 'Últimos 30 días'): StatsRange {
  const p = PRESETS.find((x) => x.label === preset) ?? PRESETS[2]!;
  return { preset: p.label, ...p.range() };
}

/** Querystring `from=…&to=…` para los endpoints de stats. */
export function rangeQuery(r: StatsRange): string {
  return `from=${r.from}&to=${r.to}`;
}

/** Texto legible del período elegido (para el subtítulo de la página). */
export function rangeLabel(r: StatsRange): string {
  if (r.preset !== 'Personalizado') return r.preset.toLowerCase();
  const f = (s: string) => {
    const [y, m, d] = s.split('-');
    return `${d}/${m}/${y}`;
  };
  return `del ${f(r.from)} al ${f(r.to)}`;
}

/** Barra de filtros de estadísticas: presets + rango personalizado, controlada. */
export function StatsToolbar({
  value,
  onChange,
  updatedAt,
}: {
  value: StatsRange;
  onChange: (r: StatsRange) => void;
  updatedAt?: string;
}) {
  const setPreset = (label: string) => {
    if (label === 'Personalizado') {
      onChange({ ...value, preset: 'Personalizado' });
      return;
    }
    const p = PRESETS.find((x) => x.label === label);
    if (p) onChange({ preset: label, ...p.range() });
  };
  const setDate = (key: 'from' | 'to', v: string) => {
    if (!v) return;
    onChange({ ...value, preset: 'Personalizado', [key]: v });
  };
  const today = iso(new Date());

  return (
    <div className="flex flex-wrap items-center gap-3 border-b border-border pb-3 text-sm">
      <Field label="Fecha">
        <Select
          value={value.preset}
          onChange={setPreset}
          options={[...PRESETS.map((p) => p.label), 'Personalizado']}
          icon={<Calendar className="h-3.5 w-3.5" />}
        />
      </Field>
      <Field label="Desde">
        <input
          type="date"
          value={value.from}
          max={value.to || today}
          onChange={(e) => setDate('from', e.target.value)}
          className="h-9 rounded-md border border-border-strong bg-surface px-2.5 text-sm text-fg focus:outline-none focus:ring-2 focus:ring-primary"
        />
      </Field>
      <Field label="Hasta">
        <input
          type="date"
          value={value.to}
          min={value.from}
          max={today}
          onChange={(e) => setDate('to', e.target.value)}
          className="h-9 rounded-md border border-border-strong bg-surface px-2.5 text-sm text-fg focus:outline-none focus:ring-2 focus:ring-primary"
        />
      </Field>
      {updatedAt && (
        <span className="ml-auto flex items-center gap-1.5 text-xs text-fg-subtle">
          <Clock className="h-3.5 w-3.5" /> Última actualización: {updatedAt}
        </span>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex items-center gap-2">
      <span className="text-fg-muted">{label}</span>
      {children}
    </label>
  );
}

function Select({
  value,
  onChange,
  options,
  icon,
}: {
  value: string;
  onChange: (v: string) => void;
  options: string[];
  icon?: ReactNode;
}) {
  return (
    <span className="relative inline-flex items-center">
      {icon && (
        <span className="pointer-events-none absolute left-2.5 flex items-center text-fg-muted">{icon}</span>
      )}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={cn(
          'h-9 appearance-none rounded-md border border-border-strong bg-surface pr-8 text-sm font-medium text-fg',
          'focus:outline-none focus:ring-2 focus:ring-primary',
          icon ? 'pl-7' : 'pl-3',
        )}
      >
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2 h-3.5 w-3.5 text-fg-subtle" />
    </span>
  );
}

/** KPI grande con sparkline (Visitas, Ventas, Facturación...). */
export function KpiCard({
  title,
  value,
  children,
}: {
  title: string;
  value: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-border bg-surface p-5 shadow-card">
      <div className="flex items-center gap-1.5 text-sm font-semibold text-fg">
        {title}
        <span className="inline-flex h-3.5 w-3.5 items-center justify-center rounded-full border border-fg-subtle text-[0.55rem] font-bold text-fg-subtle">
          i
        </span>
      </div>
      <div className="mt-2 text-3xl font-bold tracking-tight text-fg">{value}</div>
      {children && <div className="mt-3">{children}</div>}
    </div>
  );
}

export function StatsPageHeader({ title }: { title: string }) {
  return <h1 className="text-2xl font-bold text-fg">{title}</h1>;
}
