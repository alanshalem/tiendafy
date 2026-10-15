import { useId } from 'react';
import { Link } from 'react-router-dom';
import { Button, cn, Modal } from '@tiendafy/ui';
import { usePermissions } from '../../context/PermissionsContext';
import { SETTINGS_BASE } from '../../lib/access';

/**
 * Filtros del listado de productos. Todos se resuelven EN LA BASE: el listado
 * trae una página por request, así que filtrar en el navegador solo alcanzaría
 * a las veinte filas visibles.
 */
export interface ProductFilters {
  category: string;
  stock: 'all' | 'in' | 'out';
  priceType: 'all' | 'promo' | 'noPromo';
  /** Estado real del producto: es lo que decide si se ve en la tienda. */
  status: 'all' | 'active' | 'draft' | 'archived';
  /** Qué le falta completar. Por ahora, la foto. */
  missing: 'all' | 'image';
}

export const defaultFilters: ProductFilters = {
  category: '',
  stock: 'all',
  priceType: 'all',
  status: 'all',
  missing: 'all',
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
    key: 'status',
    label: 'Estado',
    options: [
      { value: 'all', label: 'Todos' },
      { value: 'active', label: 'Publicados' },
      { value: 'draft', label: 'Borradores' },
      { value: 'archived', label: 'Archivados' },
    ],
  },
  {
    key: 'missing',
    label: 'Qué falta completar',
    options: [
      { value: 'all', label: 'Todo' },
      { value: 'image', label: 'Sin foto' },
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

export function FilterPanel({
  open,
  onClose,
  categories,
  onApply,
  onClear,
  draft,
  setDraft,
}: FilterPanelProps) {
  const fid = useId();
  const { can } = usePermissions();
  return (
    // Panel lateral sobre el <dialog> de Modal: foco atrapado, Escape y fondo
    // los da el navegador. Antes era un cajón con un div fijo de fondo, que no
    // cerraba con Escape y dejaba que el Tab se escapara al listado de atrás.
    <Modal
      open={open}
      onClose={onClose}
      placement="right"
      title="Filtrar productos"
      footer={
        <>
          <Button variant="secondary" onClick={onClear}>
            Borrar filtros
          </Button>
          <Button onClick={() => onApply(draft)}>Filtrar</Button>
        </>
      }
    >
      <div className="space-y-6">
        <div>
          <label htmlFor={`${fid}-1`} className="mb-1.5 block text-sm font-medium text-fg">
            Categoría
          </label>
          <select
            id={`${fid}-1`}
            aria-label="Categoría"
            value={draft.category}
            onChange={(e) => setDraft({ ...draft, category: e.target.value })}
            className="h-10 w-full appearance-none rounded-md border border-border-strong bg-surface px-3 text-sm text-fg focus:outline-none focus:ring-2 focus:ring-primary"
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

        {/* Los campos propios existen: son la ficha técnica, en Configuración.
              Antes esto decía "Próximamente". */}
        {can('catalog.write') && (
          <Link
            to={`${SETTINGS_BASE}/ficha-tecnica`}
            className="block rounded-md border border-dashed border-primary/40 bg-primary/[0.03] p-4 text-sm hover:bg-primary/[0.06]"
          >
            <span className="font-semibold text-primary">Crear campo personalizado</span>
            <span className="mt-1 block text-fg-muted">
              Agregá atributos a tus productos (material, garantía, talle…) desde Configuración → Ficha
              técnica.
            </span>
          </Link>
        )}
      </div>
    </Modal>
  );
}
