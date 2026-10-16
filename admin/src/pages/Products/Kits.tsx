import { useMemo, useState } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Boxes, Plus, Trash2 } from 'lucide-react';
import { Button, Card, Input, useToast, PageHeader, SearchInput } from '@tiendafy/ui';
import { useStore } from '../../context/StoreContext';
import { replaceAt } from '../../lib/arrays';
import { api, errMsg } from '../../lib/api';
import { formatMoney } from '../../lib/format';
import { HelpLink } from '../../components/HelpLink';
import { NoStoreSelected } from '../../components/NoStoreSelected';
import { VariantPicker } from '../../components/VariantPicker';
import { TABLE_CARD, TABLE_HEAD_STICKY, TABLE_SCROLL_X } from '../../lib/styles';
import { usePermissions } from '../../context/PermissionsContext';
import { useListParams, useListSearch } from '../../lib/useListParams';
import { Pagination, pageRangeLabel } from '../../components/Pagination';

const PAGE_SIZE = 25;
const LIST_DEFAULTS = { q: '', pagina: 1 };

interface KitDto {
  kitVariantId: string;
  kitLabel: string;
  kitSku: string;
  components: { componentVariantId: string; label: string; sku: string; quantity: number }[];
}

interface DraftComponent {
  componentVariantId: string;
  label: string;
  sku: string;
  quantity: string;
}

/**
 * Kits/combos (BOM liviano): al venderse la variante-kit, el stock de sus
 * componentes se descuenta solo. El stock del kit sigue siendo propio.
 */
export function KitsPage() {
  const { store } = useStore();
  const { can } = usePermissions();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [editingKit, setEditingKit] = useState<{ variantId: string; label: string } | null>(null);
  const [components, setComponents] = useState<DraftComponent[]>([]);
  // Búsqueda y página en la URL, resueltas por el servidor: antes llegaban
  // todos los kits y se filtraba en el panel.
  const list = useListParams(LIST_DEFAULTS);
  const [listSearch, setListSearch] = useListSearch(list);
  const page = list.values.pagina;
  const q = list.values.q.trim();

  // Costo del kit = suma de sus componentes: sin esto era un número a mano.
  const { data: suggested } = useQuery({
    queryKey: ['kit-costs', store?.id],
    queryFn: () =>
      api.get<{ items: { kitVariantId: string; suggestedCostMinor: number | null }[] }>(
        '/api/v1/products/kits/suggested-costs',
      ),
    // El costo sugerido muestra costos: solo para quien puede verlos.
    enabled: !!store && can('costs.read'),
  });
  const suggestedByKit = new Map((suggested?.items ?? []).map((i) => [i.kitVariantId, i.suggestedCostMinor]));

  const { data: kits } = useQuery({
    queryKey: ['kits', store?.id, page, q],
    queryFn: () => {
      const params = new URLSearchParams({
        limit: String(PAGE_SIZE),
        offset: String((page - 1) * PAGE_SIZE),
      });
      if (q) params.set('q', q);
      return api.get<{ items: KitDto[]; total?: number }>(`/api/v1/products/kits?${params}`);
    },
    enabled: !!store,
    placeholderData: keepPreviousData,
  });
  const total = kits?.total ?? kits?.items.length ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const componentExcluded = useMemo(
    () =>
      new Set([
        ...(editingKit ? [editingKit.variantId] : []),
        ...components.map((c) => c.componentVariantId),
      ]),
    [editingKit, components],
  );

  const save = useMutation({
    mutationFn: () =>
      api.put(`/api/v1/products/variants/${editingKit!.variantId}/kit`, {
        components: components.map((c) => ({
          componentVariantId: c.componentVariantId,
          quantity: Number(c.quantity) || 1,
        })),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['kits', store?.id] });
      toast(components.length === 0 ? 'Kit eliminado' : 'Kit guardado', { variant: 'success' });
      setEditingKit(null);
      setComponents([]);
    },
    onError: (e) => toast(errMsg(e, 'No se pudo guardar el kit'), { variant: 'error' }),
  });

  if (!store) return <NoStoreSelected />;

  // La variante elegida puede ya ser un kit que no está en la página a la
  // vista: se pregunta, y si lo es se abre con sus componentes (abrirla vacía
  // y guardar le borraba la receta).
  const pickKit = async (kit: { variantId: string; label: string }) => {
    try {
      const found = await api.get<{ items: KitDto[] }>(`/api/v1/products/kits?kitVariantId=${kit.variantId}`);
      openEditor(kit, found.items.find((k) => k.kitVariantId === kit.variantId) ?? null);
    } catch (e) {
      toast(errMsg(e, 'No se pudo abrir el kit'), { variant: 'error' });
    }
  };

  const openEditor = (kit: { variantId: string; label: string }, existing: KitDto | null) => {
    setEditingKit(kit);
    setComponents(
      (existing?.components ?? []).map((c) => ({
        componentVariantId: c.componentVariantId,
        label: c.label,
        sku: c.sku,
        quantity: String(c.quantity),
      })),
    );
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="Kits y combos"
        subtitle="Definí qué piezas componen cada kit: al venderse, el stock de los componentes se descuenta solo."
      />

      {!editingKit ? (
        <>
          <Card>
            <h2 className="text-sm font-semibold text-fg">Convertir un producto en kit</h2>
            <div className="mt-2">
              <VariantPicker
                placeholder="Buscar la variante que se vende como kit…"
                onPick={(v) => void pickKit({ variantId: v.variantId, label: v.label })}
              />
            </div>
          </Card>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <SearchInput
              aria-label="Buscar kits"
              placeholder="Buscar kit por nombre, SKU o componente…"
              value={listSearch}
              onChange={(e) => setListSearch(e.target.value)}
            />
            <span className="text-xs text-fg-subtle">
              {pageRangeLabel(page, PAGE_SIZE, total, total === 1 ? 'kit' : 'kits')}
            </span>
          </div>
          <div className={TABLE_CARD}>
            <div className={TABLE_SCROLL_X}>
              <table className="w-full text-sm">
                <thead className={TABLE_HEAD_STICKY}>
                  <tr className="border-b border-border bg-bg-subtle text-left text-fg-muted">
                    <th className="px-4 py-2.5 font-medium">Kit</th>
                    <th className="px-4 py-2.5 font-medium">Componentes</th>
                    <th className="px-4 py-2.5">
                      <span className="sr-only">Acciones</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {(kits?.items ?? []).map((k) => (
                    <tr key={k.kitVariantId} className="border-b border-border last:border-b-0">
                      <td className="px-4 py-2.5 font-medium text-fg">
                        {k.kitLabel}
                        <span className="ml-1 font-mono text-xs text-fg-subtle">{k.kitSku}</span>
                      </td>
                      <td className="px-4 py-2.5 text-fg-muted">
                        {k.components.map((c) => `${c.quantity}× ${c.label}`).join(' + ')}
                        {suggestedByKit.get(k.kitVariantId) != null && (
                          <span className="ml-2 text-xs text-fg-subtle">
                            · costo de componentes: {formatMoney(suggestedByKit.get(k.kitVariantId)!)}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => openEditor({ variantId: k.kitVariantId, label: k.kitLabel }, k)}
                        >
                          Editar
                        </Button>
                      </td>
                    </tr>
                  ))}
                  {(kits?.items ?? []).length === 0 && (
                    <tr>
                      <td colSpan={3} className="px-4 py-10 text-center text-sm text-fg-muted">
                        <Boxes className="mx-auto mb-2 h-6 w-6 opacity-50" />
                        {list.filtered
                          ? 'Ningún kit coincide con la búsqueda.'
                          : 'Sin kits definidos. Buscá arriba el producto que vendés como combo.'}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
          <Pagination
            page={Math.min(page, totalPages)}
            totalPages={totalPages}
            onPage={(pagina) => list.set({ pagina })}
          />
        </>
      ) : (
        <Card>
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-fg">Componentes de: {editingKit.label}</h2>
            <Button variant="ghost" size="sm" onClick={() => setEditingKit(null)}>
              Volver
            </Button>
          </div>

          <div className="mt-3">
            <VariantPicker
              placeholder="Agregar componente (producto o SKU)…"
              exclude={componentExcluded}
              onPick={(v) =>
                setComponents((c) => [
                  ...c,
                  { componentVariantId: v.variantId, label: v.label, sku: v.sku, quantity: '1' },
                ])
              }
            />
          </div>

          <ul className="mt-3 space-y-2">
            {components.map((c, idx) => (
              <li key={c.componentVariantId} className="flex items-center gap-2 text-sm">
                <div className="w-16 shrink-0">
                  <Input
                    aria-label={`Cantidad de ${c.label}`}
                    compact
                    type="number"
                    min={1}
                    className="text-right"
                    value={c.quantity}
                    onChange={(e) =>
                      setComponents((list) => replaceAt(list, idx, { quantity: e.target.value }))
                    }
                  />
                </div>
                <span className="min-w-0 flex-1 truncate text-fg">
                  {c.label} <span className="font-mono text-xs text-fg-subtle">{c.sku}</span>
                </span>
                <button
                  type="button"
                  aria-label={`Quitar ${c.label}`}
                  className="text-fg-subtle hover:text-danger"
                  onClick={() => setComponents((list) => list.filter((_, i) => i !== idx))}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </li>
            ))}
            {components.length === 0 && (
              <li className="text-sm text-fg-muted">
                Sin componentes — guardar así elimina la definición de kit.
              </li>
            )}
          </ul>

          <div className="mt-4 flex justify-end gap-2">
            <Button onClick={() => save.mutate()} loading={save.isPending}>
              <Plus className="h-4 w-4" /> Guardar kit
            </Button>
          </div>
        </Card>
      )}
      <HelpLink id="kits" />
    </div>
  );
}
