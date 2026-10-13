import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Pencil, Plus, Tags, Trash2 } from 'lucide-react';
import { Badge, Button, FormField, Input, Modal, Select, Textarea, useConfirm, useToast } from '@tiendafy/ui';
import { useStore } from '../../context/StoreContext';
import { api, errMsg } from '../../lib/api';
import { formatMoney } from '../../lib/format';
import { NoStoreSelected } from '../../components/NoStoreSelected';
import { HelpLink } from '../../components/HelpLink';
import { Pagination, pageRangeLabel } from '../../components/Pagination';
import { TABLE_CARD, TABLE_HEAD_STICKY } from '../../lib/styles';
import { useDebouncedValue } from '../../lib/useDebouncedValue';
import { parseMoneyInput } from '../../lib/price';

// ---------------------------------------------------------------- Tipos wire

interface PriceListRow {
  id: string;
  name: string;
  currency: string;
  basedOnPriceListId: string | null;
  basedOnName: string | null;
  adjustmentPercent: number;
  rounding: string;
  notes: string | null;
  active: boolean;
  sortOrder: number;
  manualPrices: number;
}

interface PricedVariantRow {
  variantId: string;
  productId: string;
  productName: string;
  sku: string;
  variantDescription: string;
  basePriceMinor: number;
  priceMinor: number;
  isManual: boolean;
  currency: string;
}

const ROUNDING_LABEL: Record<string, string> = {
  none: 'Sin redondear',
  '100': 'A los $100',
  '1000': 'A los $1.000',
  '990': 'Terminación $990',
};

const PRICES_PAGE_SIZE = 50;

export function PriceListsPage() {
  const { store } = useStore();
  const [openList, setOpenList] = useState<PriceListRow | null>(null);

  if (!store) return <NoStoreSelected />;

  return (
    <div className="space-y-4">
      {openList ? (
        <ListPrices list={openList} onBack={() => setOpenList(null)} />
      ) : (
        <ListsOverview onOpen={setOpenList} />
      )}
    </div>
  );
}

// -------------------------------------------------------------- Las listas

function ListsOverview({ onOpen }: { onOpen: (list: PriceListRow) => void }) {
  const { store } = useStore();
  const qc = useQueryClient();
  const { toast } = useToast();
  const confirm = useConfirm();
  const [editing, setEditing] = useState<PriceListRow | null>(null);
  const [creating, setCreating] = useState(false);

  const { data } = useQuery({
    queryKey: ['price-lists', store?.id],
    queryFn: () => api.get<{ items: PriceListRow[] }>('/api/v1/price-lists'),
    enabled: !!store,
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/api/v1/price-lists/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['price-lists', store?.id] });
      toast('Lista borrada', { variant: 'success' });
    },
    onError: (e) => toast(errMsg(e, 'No se pudo borrar'), { variant: 'error' }),
  });

  const lists = data?.items ?? [];

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-[18rem] flex-1">
          <h1 className="text-xl font-semibold">Listas de precios</h1>
          <p className="mt-0.5 text-sm text-fg-muted">
            Un precio distinto para mayoristas, revendedores o un canal, sin duplicar el catálogo. Cada lista
            es un porcentaje sobre el precio del producto (o sobre otra lista), así que cuando cambiás un
            precio, todas las listas se mueven con él.
          </p>
        </div>
        <Button onClick={() => setCreating(true)}>
          <Plus className="h-4 w-4" /> Nueva lista
        </Button>
      </div>

      {lists.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-surface/50 p-10 text-center">
          <Tags className="mx-auto h-8 w-8 text-fg-subtle" />
          <p className="mt-2 text-sm font-medium">Todavía no hay listas de precios</p>
          <p className="mt-1 text-sm text-fg-muted">
            El precio que cargás en cada producto es el que ve todo el mundo. Creá una lista —&ldquo;Mayorista
            −30%&rdquo;, por ejemplo— y asignásela a los clientes que corresponda desde su ficha: las ventas
            manuales van a usar ese precio solas.
          </p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {lists.map((l) => (
            <div key={l.id} className="rounded-lg border border-border bg-surface p-4 shadow-card">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-medium">{l.name}</span>
                    {!l.active && <Badge variant="neutral">Inactiva</Badge>}
                  </div>
                  <p className="mt-0.5 text-sm text-fg-muted">
                    {l.adjustmentPercent === 0
                      ? 'Mismo precio que'
                      : `${l.adjustmentPercent > 0 ? '+' : '−'}${Math.abs(l.adjustmentPercent)}% sobre`}{' '}
                    {l.basedOnName ?? 'el precio del producto'}
                  </p>
                  <p className="mt-0.5 text-xs text-fg-subtle">
                    {l.currency} · {ROUNDING_LABEL[l.rounding] ?? l.rounding}
                    {l.manualPrices > 0 &&
                      ` · ${l.manualPrices} precio${l.manualPrices === 1 ? '' : 's'} a mano`}
                  </p>
                </div>
                <div className="flex shrink-0 gap-1">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setEditing(l)}
                    aria-label={`Editar ${l.name}`}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    aria-label={`Borrar ${l.name}`}
                    onClick={async () => {
                      const ok = await confirm({
                        title: `Borrar ${l.name}`,
                        message:
                          'Se borra la lista y los precios que le escribiste a mano. Los clientes que la tenían asignada vuelven al precio del producto.',
                        confirmLabel: 'Borrar',
                        variant: 'danger',
                      });
                      if (ok) remove.mutate(l.id);
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>

              {l.notes && <p className="mt-2 text-sm text-fg-muted">{l.notes}</p>}

              <Button size="sm" variant="secondary" className="mt-3" onClick={() => onOpen(l)}>
                Ver precios
              </Button>
            </div>
          ))}
        </div>
      )}

      <HelpLink id="listasDePrecios" />

      {(creating || editing) && (
        <PriceListModal
          list={editing ?? undefined}
          lists={lists}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
        />
      )}
    </>
  );
}

function PriceListModal({
  list,
  lists,
  onClose,
}: {
  list?: PriceListRow;
  lists: PriceListRow[];
  onClose: () => void;
}) {
  const { store } = useStore();
  const qc = useQueryClient();
  const { toast } = useToast();
  const editing = !!list;

  const [name, setName] = useState(list?.name ?? '');
  const [currency, setCurrency] = useState(list?.currency ?? 'ARS');
  const [basedOn, setBasedOn] = useState(list?.basedOnPriceListId ?? '');
  const [percent, setPercent] = useState(String(list?.adjustmentPercent ?? -30));
  const [rounding, setRounding] = useState(list?.rounding ?? 'none');
  const [notes, setNotes] = useState(list?.notes ?? '');
  const [active, setActive] = useState(list?.active ?? true);

  const percentNumber = Number(percent.replace(',', '.'));
  const invalid = name.trim().length < 2 || !Number.isFinite(percentNumber) || percentNumber <= -100;

  // Una lista no se puede basar en sí misma ni en las que ya se basan en ella;
  // el backend lo rechaza igual, pero mostrarlo evita el viaje.
  const baseOptions = useMemo(() => {
    const descendants = new Set<string>();
    if (list) {
      descendants.add(list.id);
      let grew = true;
      while (grew) {
        grew = false;
        for (const l of lists) {
          if (l.basedOnPriceListId && descendants.has(l.basedOnPriceListId) && !descendants.has(l.id)) {
            descendants.add(l.id);
            grew = true;
          }
        }
      }
    }
    return [
      { value: '', label: 'El precio del producto' },
      ...lists.filter((l) => !descendants.has(l.id)).map((l) => ({ value: l.id, label: l.name })),
    ];
  }, [list, lists]);

  const save = useMutation({
    mutationFn: () => {
      const body = {
        name: name.trim(),
        currency,
        basedOnPriceListId: basedOn || null,
        adjustmentPercent: percentNumber,
        rounding,
        notes: notes.trim() || null,
        active,
        sortOrder: list?.sortOrder ?? 0,
      };
      return editing
        ? api.patch(`/api/v1/price-lists/${list!.id}`, body)
        : api.post('/api/v1/price-lists', body);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['price-lists', store?.id] });
      toast(editing ? 'Lista actualizada' : 'Lista creada', { variant: 'success' });
      onClose();
    },
    onError: (e) => toast(errMsg(e, 'No se pudo guardar'), { variant: 'error' }),
  });

  // Un ejemplo con un número redondo dice más que la descripción del campo.
  const preview = Number.isFinite(percentNumber) ? Math.round(100000 * (1 + percentNumber / 100)) : 0;

  return (
    <Modal open onClose={onClose} title={editing ? 'Editar lista' : 'Nueva lista de precios'}>
      <div className="space-y-3">
        <FormField label="Nombre" required>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Mayorista" autoFocus />
        </FormField>

        <FormField
          label="Se calcula sobre"
          hint="Una lista sobre otra encadena los porcentajes: mayorista −30% y distribuidor −10% sobre mayorista da −37%, no −40%."
        >
          <Select value={basedOn} onChange={(e) => setBasedOn(e.target.value)} options={baseOptions} />
        </FormField>

        <div className="grid gap-3 sm:grid-cols-2">
          <FormField label="Ajuste (%)" hint="Negativo para descuento.">
            <Input value={percent} onChange={(e) => setPercent(e.target.value)} inputMode="decimal" />
          </FormField>
          <FormField label="Redondeo">
            <Select
              value={rounding}
              onChange={(e) => setRounding(e.target.value)}
              options={Object.entries(ROUNDING_LABEL).map(([value, label]) => ({ value, label }))}
            />
          </FormField>
        </div>

        {Number.isFinite(percentNumber) && (
          <p className="rounded-md bg-bg-subtle px-3 py-2 text-sm text-fg-muted">
            Un producto de {formatMoney(100000, currency)} queda en{' '}
            <span className="font-medium text-fg">{formatMoney(preview, currency)}</span> antes de redondear.
          </p>
        )}

        <FormField label="Moneda">
          <Select
            value={currency}
            onChange={(e) => setCurrency(e.target.value)}
            options={[
              { value: 'ARS', label: 'Pesos (ARS)' },
              { value: 'USD', label: 'Dólares (USD)' },
            ]}
          />
        </FormField>

        <FormField label="Notas" hint="Para quién es esta lista, desde cuándo rige.">
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
        </FormField>

        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
          Lista activa
        </label>
        {!active && (
          <p className="text-xs text-fg-subtle">
            Una lista apagada deja de aplicarse: los clientes que la tienen asignada vuelven al precio del
            producto sin que haya que desasignarla uno por uno.
          </p>
        )}
      </div>

      <div className="mt-5 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>
          Cancelar
        </Button>
        <Button onClick={() => save.mutate()} disabled={invalid || save.isPending} loading={save.isPending}>
          Guardar
        </Button>
      </div>
    </Modal>
  );
}

// ------------------------------------------------------ Precios de una lista

function ListPrices({ list, onBack }: { list: PriceListRow; onBack: () => void }) {
  const { store } = useStore();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const debounced = useDebouncedValue(search, 300).trim();

  const { data } = useQuery({
    queryKey: ['price-list-prices', store?.id, list.id, debounced, page],
    queryFn: () => {
      const params = new URLSearchParams({
        limit: String(PRICES_PAGE_SIZE),
        offset: String((page - 1) * PRICES_PAGE_SIZE),
      });
      if (debounced) params.set('q', debounced);
      return api.get<{ items: PricedVariantRow[]; total: number }>(
        `/api/v1/price-lists/${list.id}/prices?${params}`,
      );
    },
    enabled: !!store,
    placeholderData: (previous) => previous,
  });

  const savePrice = useMutation({
    mutationFn: ({ variantId, priceMinor }: { variantId: string; priceMinor: number | null }) =>
      api.put(`/api/v1/price-lists/${list.id}/prices/${variantId}`, { priceMinor }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['price-list-prices', store?.id, list.id] });
      qc.invalidateQueries({ queryKey: ['price-lists', store?.id] });
    },
    onError: (e) => toast(errMsg(e, 'No se pudo guardar el precio'), { variant: 'error' }),
  });

  const rows = data?.items ?? [];
  // El total cuenta productos; las filas son variantes, así que solo se pagina.
  const totalPages = Math.max(1, Math.ceil((data?.total ?? 0) / PRICES_PAGE_SIZE));

  const commit = (row: PricedVariantRow) => {
    const raw = draft[row.variantId];
    if (raw === undefined) return;
    setDraft((cur) => {
      const next = { ...cur };
      delete next[row.variantId];
      return next;
    });

    if (raw.trim() === '') {
      if (row.isManual) savePrice.mutate({ variantId: row.variantId, priceMinor: null });
      return;
    }
    const minor = parseMoneyInput(raw);
    if (!Number.isFinite(minor) || minor <= 0) {
      toast('Ese precio no es un número válido.', { variant: 'error' });
      return;
    }
    if (minor === row.priceMinor && row.isManual) return;
    savePrice.mutate({ variantId: row.variantId, priceMinor: minor });
  };

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-[18rem] flex-1">
          <button
            type="button"
            onClick={onBack}
            className="flex items-center gap-1 text-sm text-fg-muted hover:text-fg"
          >
            <ArrowLeft className="h-4 w-4" /> Listas de precios
          </button>
          <h1 className="mt-1 text-xl font-semibold">{list.name}</h1>
          <p className="mt-0.5 text-sm text-fg-muted">
            Los precios los calcula la regla de la lista. Escribí uno solo si ese producto necesita otro
            número: ese queda fijo y deja de moverse con el precio del producto. Vaciá la casilla para que
            vuelva a la regla.
          </p>
          {(data?.total ?? 0) > 0 && (
            <p className="mt-1 text-xs text-fg-subtle">
              {pageRangeLabel(
                page,
                PRICES_PAGE_SIZE,
                data!.total,
                data!.total === 1 ? 'producto' : 'productos',
              )}
            </p>
          )}
        </div>
        <Input
          className="w-64"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          placeholder="Buscar por nombre o SKU..."
        />
      </div>

      {rows.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-surface/50 p-10 text-center text-sm text-fg-muted">
          {debounced
            ? 'Ningún producto coincide con la búsqueda.'
            : 'Todavía no hay productos en el catálogo.'}
        </div>
      ) : (
        <div className={TABLE_CARD}>
          <table className="w-full text-sm">
            <thead className={TABLE_HEAD_STICKY}>
              <tr className="text-left text-xs uppercase tracking-wide text-fg-muted">
                <th className="px-4 py-2 font-medium">Producto</th>
                <th className="px-4 py-2 text-right font-medium">Precio del producto</th>
                <th className="px-4 py-2 text-right font-medium">Precio en esta lista</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((row) => (
                <tr key={row.variantId}>
                  <td className="px-4 py-2">
                    <div className="truncate">
                      {row.productName}
                      {row.variantDescription && (
                        <span className="text-fg-muted"> · {row.variantDescription}</span>
                      )}
                    </div>
                    <div className="font-mono text-xs text-fg-subtle">{row.sku}</div>
                  </td>
                  <td className="whitespace-nowrap px-4 py-2 text-right tabular-nums text-fg-muted">
                    {formatMoney(row.basePriceMinor, row.currency)}
                  </td>
                  <td className="px-4 py-2">
                    <div className="flex items-center justify-end gap-2">
                      {row.isManual && <Badge variant="warning">A mano</Badge>}
                      <div className="w-32">
                        <Input
                          aria-label={`Precio de ${row.productName}${row.variantDescription ? ` · ${row.variantDescription}` : ''}`}
                          compact
                          inputMode="decimal"
                          className="text-right"
                          value={draft[row.variantId] ?? String(row.priceMinor / 100)}
                          onChange={(e) => setDraft((cur) => ({ ...cur, [row.variantId]: e.target.value }))}
                          onBlur={() => commit(row)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') e.currentTarget.blur();
                          }}
                        />
                      </div>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Pagination page={page} totalPages={totalPages} onPage={setPage} />
    </>
  );
}
