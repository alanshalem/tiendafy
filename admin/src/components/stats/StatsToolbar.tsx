import { useState, type ReactNode } from 'react';
import { Calendar, ChevronDown, Clock, Filter } from 'lucide-react';
import { cn } from '@tiendafy/ui';

const RANGES = ['Hoy', 'Ayer', 'Últimos 7 días', 'Últimos 30 días', 'Este mes', 'Este año'];
const COMPARISONS = ['Ninguna', 'Período anterior', 'Mismo período año anterior'];

/** Barra de filtros de las páginas de estadísticas (fecha + comparación). */
export function StatsToolbar({ updatedAt }: { updatedAt?: string }) {
  const [range, setRange] = useState('Últimos 7 días');
  const [comparison, setComparison] = useState('Ninguna');

  return (
    <div className="flex flex-wrap items-center gap-3 border-b border-border pb-3 text-sm">
      <Field label="Fecha">
        <Select value={range} onChange={setRange} options={RANGES} icon={<Calendar className="h-3.5 w-3.5" />} />
      </Field>
      <Field label="Comparación">
        <Select value={comparison} onChange={setComparison} options={COMPARISONS} />
      </Field>
      <button
        type="button"
        className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border-strong bg-surface px-3 font-medium text-fg hover:bg-bg-muted"
      >
        <Filter className="h-4 w-4" /> Filtros
      </button>
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
      {icon && <span className="pointer-events-none absolute left-2.5 flex items-center text-fg-muted">{icon}</span>}
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
