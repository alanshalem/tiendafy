import { X } from 'lucide-react';
import { cn } from '@tiendafy/ui';

export interface ProductFilters {
  category: string;
  stock: 'all' | 'in' | 'out';
  priceType: 'all' | 'promo' | 'noPromo';
  visibility: 'all' | 'visible' | 'hidden';
  shipping: 'all' | 'free' | 'paid';
}

export const defaultFilters: ProductFilters = {
  category: '',
  stock: 'all',
  priceType: 'all',
  visibility: 'all',
  shipping: 'all',
};

const chipGroups: {
  key: keyof ProductFilters;
  label: string;
  options: { value: string; label: string }[];
}[] = [
  {
    key: 'stock',
    label: 'Disponibilidad en stock',
    options: [
      { value: 'all', label: 'Todas' },
      { value: 'in', label: 'En stock' },
      { value: 'out', label: 'Fuera de stock' },
    ],
  },
  {
    key: 'priceType',
    label: 'Tipo de precio',
    options: [
      { value: 'all', label: 'Todas' },
      { value: 'promo', label: 'Promocional' },
      { value: 'noPromo', label: 'Sin promoción' },
    ],
  },
  {
    key: 'visibility',
    label: 'Visibilidad en la tienda',
    options: [
      { value: 'all', label: 'Todas' },
      { value: 'visible', label: 'Visibles' },
      { value: 'hidden', label: 'Ocultos' },
    ],
  },
  {
    key: 'shipping',
    label: 'Tipo de envío',
    options: [
      { value: 'all', label: 'Todas' },
      { value: 'free', label: 'Gratis' },
      { value: 'paid', label: 'Pago' },
    ],
  },
];

interface FilterPanelProps {
  open: boolean;
  onClose: () => void;
  filters: ProductFilters;
  categories: { id: string; name: string; path: string; depth: number }[];
  onApply: (filters: ProductFilters) => void;
  onClear: () => void;
  draft: ProductFilters;
  setDraft: (f: ProductFilters) => void;
}

export function FilterPanel({ open, onClose, categories, onApply, onClear, draft, setDraft }: FilterPanelProps) {
  return (
    <>
      <div
        className={cn(
          'fixed inset-0 z-40 bg-black/40 transition-opacity',
          open ? 'opacity-100' : 'pointer-events-none opacity-0',
        )}
        onClick={onClose}
      />
      <aside
        className={cn(
          'fixed right-0 top-0 z-50 flex h-full w-96 max-w-[90vw] flex-col bg-surface shadow-overlay transition-transform',
          open ? 'translate-x-0' : 'translate-x-full',
        )}
      >
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 className="text-base font-semibold text-fg">Filtrar productos</h2>
          <button type="button" onClick={onClose} aria-label="Cerrar" className="text-fg-muted hover:text-fg">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 space-y-6 overflow-y-auto px-5 py-5">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-fg">Categoría</label>
            <select
              value={draft.category}
              onChange={(e) => setDraft({ ...draft, category: e.target.value })}
              className="h-10 w-full appearance-none rounded-md border border-border-strong bg-surface px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="">Todas</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {'— '.repeat(c.depth - 1)}
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          {chipGroups.map((group) => (
            <div key={group.key}>
              <div className="mb-2 text-sm font-medium text-fg">{group.label}</div>
              <div className="flex flex-wrap gap-2">
                {group.options.map((opt) => {
                  const active = draft[group.key] === opt.value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setDraft({ ...draft, [group.key]: opt.value })}
                      className={cn(
                        'rounded-full border px-3 py-1.5 text-sm font-medium transition-colors',
                        active
                          ? 'border-primary bg-primary text-primary-fg'
                          : 'border-border-strong text-fg-muted hover:bg-bg-muted',
                      )}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}

          <div className="rounded-md border border-dashed border-primary/40 bg-primary/[0.03] p-4 text-sm">
            <div className="font-semibold text-primary">Crear campo personalizado</div>
            <p className="mt-1 text-fg-muted">Agregá diferentes atributos a tus productos. (Próximamente)</p>
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t border-border px-5 py-4">
          <button
            type="button"
            onClick={onClear}
            className="inline-flex h-10 items-center rounded-md border border-border-strong px-4 text-sm font-medium text-fg hover:bg-bg-muted"
          >
            Borrar filtros
          </button>
          <button
            type="button"
            onClick={() => onApply(draft)}
            className="inline-flex h-10 items-center rounded-md bg-primary px-5 text-sm font-semibold text-primary-fg hover:bg-primary-hover"
          >
            Filtrar
          </button>
        </div>
      </aside>
    </>
  );
}
