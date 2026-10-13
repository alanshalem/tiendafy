import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { MoreVertical, Pencil, Power, Trash2, Plus } from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  Checkbox,
  Dropdown,
  FormField,
  Input,
  Modal,
  PageHeader,
  Select,
  Table,
  useConfirm,
  useToast,
  type BadgeVariant,
  type TableColumn,
} from '@tiendafy/ui';
import { formatMoney, formatDate } from '../lib/format';
import { useStore } from '../context/StoreContext';
import { usePermissions } from '../context/PermissionsContext';
import { HelpLink } from '../components/HelpLink';
import { api, errMsg } from '../lib/api';
import { toCents } from '../lib/price';
import { EmptyState } from '../components/EmptyState';
import { NoStoreSelected } from '../components/NoStoreSelected';
import { Pagination, pageRangeLabel } from '../components/Pagination';

type CouponType = 'Percentage' | 'FixedAmount' | 'FreeShipping';

interface Coupon {
  id: string;
  code: string;
  type: CouponType;
  value: number;
  minPurchase: number;
  startsAtUtc: string | null;
  endsAtUtc: string | null;
  maxUses: number | null;
  usedCount: number;
  active: boolean;
  createdAtUtc: string;
}

const pesos = (cents: number) => formatMoney(cents, 'ARS');

function describe(c: Coupon): string {
  if (c.type === 'Percentage') return `${c.value}% de descuento`;
  if (c.type === 'FixedAmount') return `${pesos(c.value)} de descuento`;
  return 'Envío gratis';
}

function vigencia(c: Coupon): string {
  const d = (s: string | null) => (s ? formatDate(s) : null);
  const from = d(c.startsAtUtc);
  const to = d(c.endsAtUtc);
  if (from && to) return `${from} – ${to}`;
  if (to) return `Hasta ${to}`;
  if (from) return `Desde ${from}`;
  return 'Sin vencimiento';
}

/** Cupones por página. */
const PAGE_SIZE = 25;

export function DiscountsPage() {
  const { store } = useStore();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const confirm = useConfirm();
  const canEdit = usePermissions().can('discounts.write');
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<Coupon | null>(null);

  const [page, setPage] = useState(1);
  const { data, isLoading } = useQuery({
    queryKey: ['coupons', store?.id, page],
    queryFn: () =>
      api.get<{ items: Coupon[]; total: number }>(
        `/api/v1/coupons?limit=${PAGE_SIZE}&offset=${(page - 1) * PAGE_SIZE}`,
      ),
    enabled: !!store,
  });
  const totalPages = Math.max(1, Math.ceil((data?.total ?? 0) / PAGE_SIZE));
  const [search, setSearch] = useState('');
  const coupons = (data?.items ?? []).filter(
    (c) => search.trim() === '' || c.code.toLowerCase().includes(search.trim().toLowerCase()),
  );

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['coupons', store?.id] });

  const toggle = useMutation({
    mutationFn: (c: Coupon) => api.post(`/api/v1/coupons/${c.id}/toggle`, {}),
    onSuccess: () => {
      refresh();
      toast('Cupón actualizado', { variant: 'success' });
    },
    onError: (e) => toast(errMsg(e), { variant: 'error' }),
  });
  const remove = useMutation({
    mutationFn: (c: Coupon) => api.delete(`/api/v1/coupons/${c.id}`),
    onSuccess: () => {
      refresh();
      toast('Cupón eliminado', { variant: 'success' });
    },
    onError: (e) => toast(errMsg(e), { variant: 'error' }),
  });

  const statusVariant = (c: Coupon): BadgeVariant => (c.active ? 'success' : 'neutral');

  const columns: TableColumn<Coupon>[] = [
    {
      key: 'code',
      header: 'Código',
      cell: (c) => <span className="font-mono font-semibold text-fg">{c.code}</span>,
    },
    { key: 'type', header: 'Descuento', cell: (c) => describe(c) },
    {
      key: 'minPurchase',
      header: 'Compra mínima',
      cell: (c) => (c.minPurchase > 0 ? pesos(c.minPurchase) : <span className="text-fg-subtle">—</span>),
    },
    {
      key: 'endsAtUtc',
      header: 'Vigencia',
      cell: (c) => <span className="text-sm text-fg-muted">{vigencia(c)}</span>,
    },
    {
      key: 'usedCount',
      header: 'Usos',
      cell: (c) => `${c.usedCount}${c.maxUses != null ? ` / ${c.maxUses}` : ''}`,
    },
    {
      key: 'active',
      header: 'Estado',
      cell: (c) => <Badge variant={statusVariant(c)}>{c.active ? 'Activo' : 'Pausado'}</Badge>,
    },
    {
      key: 'createdAtUtc',
      header: '',
      cell: (c) =>
        canEdit && (
          <div className="flex justify-end">
            <Dropdown>
              <Dropdown.Trigger label={`Acciones de ${c.code}`}>
                <MoreVertical className="h-4 w-4" />
              </Dropdown.Trigger>
              <Dropdown.Menu align="end">
                <Dropdown.Item onSelect={() => setEditing(c)}>
                  <Pencil className="mr-2 inline h-4 w-4" /> Editar
                </Dropdown.Item>
                <Dropdown.Item onSelect={() => toggle.mutate(c)}>
                  <Power className="mr-2 inline h-4 w-4" /> {c.active ? 'Pausar' : 'Activar'}
                </Dropdown.Item>
                <Dropdown.Item
                  destructive
                  onSelect={async () => {
                    if (
                      await confirm({
                        title: 'Eliminar cupón',
                        message: `¿Eliminar el cupón ${c.code}?`,
                        confirmLabel: 'Eliminar',
                        variant: 'danger',
                      })
                    )
                      remove.mutate(c);
                  }}
                >
                  <Trash2 className="mr-2 inline h-4 w-4" /> Eliminar
                </Dropdown.Item>
              </Dropdown.Menu>
            </Dropdown>
          </div>
        ),
    },
  ];

  if (!store) return <NoStoreSelected />;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Cupones de descuento"
        subtitle="Monto fijo, porcentaje o envío gratis, con vigencia y límite de usos."
        actions={
          <div className="flex items-center gap-3">
            {(data?.total ?? 0) > 0 && (
              <span className="text-xs text-fg-subtle">
                {pageRangeLabel(page, PAGE_SIZE, data!.total, data!.total === 1 ? 'cupón' : 'cupones')}
              </span>
            )}
            {canEdit && (
              <Button onClick={() => setCreateOpen(true)}>
                <span className="inline-flex items-center gap-1.5">
                  <Plus className="h-4 w-4" /> Crear cupón
                </span>
              </Button>
            )}
          </div>
        }
      />

      {isLoading ? (
        <Card>
          <p className="px-4 py-12 text-center text-sm text-fg-muted">Cargando...</p>
        </Card>
      ) : coupons.length === 0 ? (
        <EmptyState
          kicker="Descuentos"
          title="Creá tu primer cupón"
          body="Un código que tus clientes ingresan en el carrito para obtener un descuento o envío gratis."
          action={canEdit ? { label: 'Crear cupón', onClick: () => setCreateOpen(true) } : undefined}
        />
      ) : (
        <Card flush>
          <Input
            placeholder="Buscar cupón por código…"
            className="mb-3"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <Table columns={columns} rows={coupons} rowKey={(c) => c.id} emptyState="No hay cupones." />
          <Pagination page={page} totalPages={totalPages} onPage={setPage} />
        </Card>
      )}

      {/* La key vuelve a montar el formulario en cada apertura: arranca con los
          datos de ese momento, sin un efecto que los copie después. */}
      <CouponModal
        key={createOpen ? 'alta' : 'alta-cerrada'}
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onSaved={refresh}
      />
      <CouponModal
        key={editing?.id ?? 'edicion-cerrada'}
        open={!!editing}
        coupon={editing ?? undefined}
        onClose={() => setEditing(null)}
        onSaved={refresh}
      />
      <HelpLink id="cupones" />
    </div>
  );
}

function toDateInput(iso: string | null): string {
  return iso ? new Date(iso).toISOString().slice(0, 10) : '';
}

function CouponModal({
  open,
  coupon,
  onClose,
  onSaved,
}: {
  open: boolean;
  coupon?: Coupon;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  // Crear = vacío, editar = datos del cupón (ver la key en quien lo abre).
  const [code, setCode] = useState(coupon?.code ?? '');
  const [type, setType] = useState<CouponType>(coupon?.type ?? 'Percentage');
  const [value, setValue] = useState(
    coupon
      ? coupon.type === 'FixedAmount'
        ? String(coupon.value / 100)
        : coupon.type === 'Percentage'
          ? String(coupon.value)
          : ''
      : '',
  );
  const [minPurchase, setMinPurchase] = useState(
    coupon && coupon.minPurchase > 0 ? String(coupon.minPurchase / 100) : '',
  );
  const [startsAt, setStartsAt] = useState(toDateInput(coupon?.startsAtUtc ?? null));
  const [endsAt, setEndsAt] = useState(toDateInput(coupon?.endsAtUtc ?? null));
  const [maxUses, setMaxUses] = useState(coupon?.maxUses != null ? String(coupon.maxUses) : '');
  const [active, setActive] = useState(coupon?.active ?? true);
  const [error, setError] = useState<string>();
  const isEdit = !!coupon;

  const save = useMutation({
    mutationFn: () => {
      const body = {
        code: code.trim(),
        type,
        value:
          type === 'Percentage' ? Math.round(Number(value)) : type === 'FixedAmount' ? toCents(value) : 0,
        minPurchase: minPurchase ? toCents(minPurchase) : 0,
        startsAtUtc: startsAt ? new Date(`${startsAt}T00:00:00`).toISOString() : null,
        endsAtUtc: endsAt ? new Date(`${endsAt}T23:59:59`).toISOString() : null,
        maxUses: maxUses ? parseInt(maxUses, 10) : null,
        active,
      };
      return isEdit ? api.put(`/api/v1/coupons/${coupon!.id}`, body) : api.post('/api/v1/coupons', body);
    },
    onSuccess: () => {
      onSaved();
      toast(isEdit ? 'Cupón actualizado' : 'Cupón creado', { variant: 'success' });
      onClose();
    },
    onError: (e) => setError(errMsg(e, 'Error inesperado')),
  });

  const valueValid =
    type === 'FreeShipping'
      ? true
      : type === 'Percentage'
        ? Number(value) >= 1 && Number(value) <= 100
        : parseFloat(value.replace(',', '.')) > 0;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? 'Editar cupón' : 'Crear cupón'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            loading={save.isPending}
            disabled={!code.trim() || !valueValid}
            onClick={() => save.mutate()}
          >
            {isEdit ? 'Guardar' : 'Crear'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <FormField label="Código" required error={error} hint="Lo que el cliente escribe en el carrito.">
          <Input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="VERANO20"
          />
        </FormField>

        <FormField label="Tipo de descuento" required>
          <Select
            value={type}
            onChange={(e) => setType(e.target.value as CouponType)}
            options={[
              { value: 'Percentage', label: 'Porcentaje (%)' },
              { value: 'FixedAmount', label: 'Monto fijo ($)' },
              { value: 'FreeShipping', label: 'Envío gratis' },
            ]}
          />
        </FormField>

        {type !== 'FreeShipping' && (
          <FormField label={type === 'Percentage' ? 'Porcentaje' : 'Monto del descuento (ARS)'} required>
            <Input
              inputMode="decimal"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder={type === 'Percentage' ? '20' : '5000'}
            />
          </FormField>
        )}

        <div className="grid grid-cols-2 gap-4">
          <FormField label="Compra mínima (ARS)" hint="Opcional">
            <Input
              inputMode="decimal"
              value={minPurchase}
              onChange={(e) => setMinPurchase(e.target.value)}
              placeholder="—"
            />
          </FormField>
          <FormField label="Límite de usos" hint="Opcional">
            <Input
              inputMode="numeric"
              value={maxUses}
              onChange={(e) => setMaxUses(e.target.value.replace(/\D/g, ''))}
              placeholder="Sin límite"
            />
          </FormField>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <FormField label="Válido desde" hint="Opcional">
            <Input type="date" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />
          </FormField>
          <FormField label="Válido hasta" hint="Opcional">
            <Input type="date" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} />
          </FormField>
        </div>

        <label className="flex items-center gap-2 text-sm font-medium text-fg">
          <Checkbox checked={active} onChange={(e) => setActive(e.target.checked)} />
          Activo
        </label>
      </div>
    </Modal>
  );
}
