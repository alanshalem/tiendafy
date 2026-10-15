import { useState, useId } from 'react';
import { Calculator, Loader2, Pencil, Plus, Store, Trash2, Truck } from 'lucide-react';
import { Button, Modal, Switch, cn, useConfirm, useToast } from '@tiendafy/ui';
import { api, errMsg } from '../../lib/api';
import { formatMoney } from '../../lib/format';
import { useStore } from '../../context/StoreContext';
import { SettingsHeader } from './SettingsLayout';
import { HelpLink } from '../../components/HelpLink';
import { CorreoArgentinoCard } from './CorreoArgentino';
import { ZipnovaCard } from './Zipnova';
import { AndreaniCard } from './Andreani';
import type { MoneyDto } from '@tiendafy/types';
import { useServerLoad } from '../../lib/useServerLoad';
import { useModalFormGuard } from '../../lib/useUnsavedChanges';
import { TableSkeleton } from '../../components/Skeleton';

type ShippingKind = 'DELIVERY' | 'PICKUP';

/** Forma wire del GET: price es Money { amount en centavos, currency }. */
interface ShippingMethod {
  id: string;
  name: string;
  kind: ShippingKind;
  price: MoneyDto;
  description: string | null;
  pickupAddress: string | null;
  active: boolean;
  sortOrder: number;
  /** "Gratis desde $X" (centavos): con ese subtotal de productos, no se cobra. */
  freeAbove?: MoneyDto | null;
}

/** Body de POST/PUT: price es decimal en unidad mayor (ej. 1500.50). */
interface ShippingMethodRequest {
  name: string;
  kind: ShippingKind;
  price: number;
  description?: string | null;
  pickupAddress?: string | null;
  active?: boolean;
  sortOrder?: number;
  /** Unidad mayor, como el precio. null = siempre cobra su precio. */
  freeAbove?: number | null;
}

const KIND_LABEL: Record<ShippingKind, string> = {
  DELIVERY: 'Envío a domicilio',
  PICKUP: 'Retiro en punto',
};

export function ShippingMethodsPage() {
  const { store } = useStore();
  const { toast } = useToast();
  const confirm = useConfirm();

  const [items, setItems] = useState<ShippingMethod[] | null>(null);
  // null = cerrado, 'new' = alta, ShippingMethod = edición.
  const [editing, setEditing] = useState<ShippingMethod | 'new' | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  const { loading, reload: load } = useServerLoad(
    store?.id ?? null,
    () => api.get<{ items: ShippingMethod[] }>('/api/v1/admin/shipping/methods'),
    (data) => setItems(data.items ?? []),
    (err) => {
      setItems(null);
      toast(errMsg(err, 'No se pudieron cargar los medios de envío.'), { variant: 'error' });
    },
  );

  const remove = async (method: ShippingMethod) => {
    const ok = await confirm({
      title: 'Eliminar medio de envío',
      message: `Vas a eliminar "${method.name}". Los compradores ya no van a poder elegirlo en el checkout.`,
      confirmLabel: 'Eliminar',
      variant: 'danger',
    });
    if (!ok) return;
    setDeleting(method.id);
    try {
      await api.delete(`/api/v1/admin/shipping/methods/${method.id}`);
      toast('Medio de envío eliminado', { variant: 'success' });
      await load();
    } catch (err) {
      toast(errMsg(err, 'No se pudo eliminar el medio de envío.'), { variant: 'error' });
    } finally {
      setDeleting(null);
    }
  };

  return (
    <div className="pb-10">
      <SettingsHeader
        title="Medios de envío"
        description="Definí cómo entregás los pedidos. El comprador los elige en el checkout."
      />

      {/* La pregunta que se hace cualquiera al abrir esta pantalla: si abajo
          están Correo Argentino, Zipnova y Andreani, para qué sirve cargar
          además un medio a mano. Son dos cosas distintas y se usan juntas. */}
      <div className="mb-6 rounded-lg border border-border bg-surface p-4 shadow-card">
        <h3 className="text-sm font-semibold text-fg">
          Hay dos maneras de cobrar el envío, y no compiten entre sí
        </h3>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div className="rounded-md border border-border bg-bg-subtle p-3">
            <div className="flex items-center gap-1.5 text-sm font-semibold text-fg">
              <Truck className="h-4 w-4 text-fg-muted" /> Tarifas que ponés vos
            </div>
            <p className="mt-1 text-sm text-fg-muted">
              Un precio fijo que elegís y un plazo que escribís. No se consulta con nadie: aparecen siempre,
              vaya donde vaya el pedido.
            </p>
            <p className="mt-1.5 text-xs text-fg-subtle">
              Sirven para el retiro en tu local, tu propio reparto en la zona, un precio único para todo el
              país, o envío gratis (poné 0).
            </p>
          </div>
          <div className="rounded-md border border-border bg-bg-subtle p-3">
            <div className="flex items-center gap-1.5 text-sm font-semibold text-fg">
              <Calculator className="h-4 w-4 text-fg-muted" /> Correos que cotizan solos
            </div>
            <p className="mt-1 text-sm text-fg-muted">
              Calculan el precio en el checkout según el código postal del comprador y lo que pesa el carrito.
              Después, desde la venta, sacás la etiqueta y el seguimiento.
            </p>
            <p className="mt-1.5 text-xs text-fg-subtle">
              Sirven para vender a todo el país sin tener que adivinar cuánto sale cada envío.
            </p>
          </div>
        </div>
        <p className="mt-3 text-xs text-fg-muted">
          En el checkout se muestran todas juntas y el comprador elige. Lo habitual es tener las dos: una
          tarifa propia para el retiro o tu zona, y un correo para el resto del país.
        </p>
      </div>

      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-fg">Tus tarifas</h2>
          <p className="text-sm text-fg-muted">Precio y plazo fijos, puestos por vos.</p>
        </div>
        {items && items.length > 0 && (
          <Button onClick={() => setEditing('new')}>
            <Plus className="h-4 w-4" /> Agregar medio de envío
          </Button>
        )}
      </div>

      {loading ? (
        <div className="rounded-lg border border-border bg-surface shadow-card">
          <TableSkeleton rows={3} label="Cargando medios de envío…" />
        </div>
      ) : !items || items.length === 0 ? (
        <div className="rounded-lg border border-border bg-surface p-10 text-center shadow-card">
          <Truck className="mx-auto h-10 w-10 text-fg-muted" />
          <h3 className="mt-3 text-base font-semibold text-fg">Todavía no tenés medios de envío</h3>
          <p className="mx-auto mt-1 max-w-sm text-sm text-fg-muted">
            Creá al menos uno —un envío a domicilio o un punto de retiro— para que tus clientes puedan
            completar la compra.
          </p>
          <Button className="mt-4" onClick={() => setEditing('new')}>
            <Plus className="h-4 w-4" /> Agregar medio de envío
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((m) => {
            const Icon = m.kind === 'PICKUP' ? Store : Truck;
            return (
              <div
                key={m.id}
                className={cn(
                  'flex items-start gap-3 rounded-lg border border-border bg-surface p-4 shadow-card',
                  !m.active && 'opacity-70',
                )}
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-bg-muted text-fg-muted">
                  <Icon className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-fg">{m.name}</span>
                    <span className="rounded-full bg-bg-muted px-2 py-0.5 text-[11px] font-medium text-fg-muted">
                      {KIND_LABEL[m.kind]}
                    </span>
                    {!m.active && (
                      <span className="rounded-full bg-bg-muted px-2 py-0.5 text-[11px] font-semibold text-fg-muted">
                        Inactivo
                      </span>
                    )}
                  </div>
                  <div className="mt-0.5 text-sm text-fg">
                    {m.price.amount === 0 ? (
                      <span className="font-medium text-success">Gratis</span>
                    ) : (
                      <span className="font-medium">{formatMoney(m.price.amount, m.price.currency)}</span>
                    )}
                    {m.description && <span className="text-fg-muted"> · {m.description}</span>}
                  </div>
                  {m.freeAbove && (
                    <p className="mt-0.5 text-xs font-medium text-success">
                      Gratis desde {formatMoney(m.freeAbove.amount, m.freeAbove.currency)}
                    </p>
                  )}
                  {m.kind === 'PICKUP' && m.pickupAddress && (
                    <p className="mt-0.5 truncate text-xs text-fg-muted">{m.pickupAddress}</p>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setEditing(m)}
                    title="Editar"
                    className="inline-flex h-8 w-8 items-center justify-center rounded-md text-fg-muted hover:bg-bg-muted hover:text-fg"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => remove(m)}
                    disabled={deleting === m.id}
                    title="Eliminar"
                    className="inline-flex h-8 w-8 items-center justify-center rounded-md text-fg-muted hover:bg-danger/10 hover:text-danger disabled:opacity-50"
                  >
                    {deleting === m.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Trash2 className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {editing !== null && (
        <MethodDialog
          method={editing === 'new' ? null : editing}
          nextSortOrder={items?.length ?? 0}
          onClose={() => setEditing(null)}
          onSaved={async (created) => {
            setEditing(null);
            toast(created ? 'Medio de envío creado' : 'Cambios guardados', { variant: 'success' });
            await load();
          }}
        />
      )}
      <div className="mb-3 mt-8">
        <h2 className="text-base font-semibold text-fg">Correos que cotizan solos</h2>
        <p className="text-sm text-fg-muted">
          Conectá el que uses. No hace falta ninguno para vender, pero sin alguno el comprador de otra
          provincia solo puede elegir entre tus tarifas fijas.
        </p>
      </div>
      <CorreoArgentinoCard />
      <ZipnovaCard />
      <AndreaniCard />
      <HelpLink id="correoArgentino" />
      <HelpLink id="zipnova" className="mt-2" />
      <HelpLink id="andreani" className="mt-2" />
    </div>
  );
}

/** Modal de alta/edición. `method` null = crear. */
function MethodDialog({
  method,
  nextSortOrder,
  onClose,
  onSaved,
}: {
  method: ShippingMethod | null;
  nextSortOrder: number;
  onClose: () => void;
  onSaved: (created: boolean) => void;
}) {
  const fid = useId();
  const { toast } = useToast();
  const [name, setName] = useState(method?.name ?? '');
  const [kind, setKind] = useState<ShippingKind>(method?.kind ?? 'DELIVERY');
  // El wire trae centavos; el input trabaja en unidad mayor (lo que se manda al API).
  const [price, setPrice] = useState(method ? String(method.price.amount / 100) : '');
  const [description, setDescription] = useState(method?.description ?? '');
  const [pickupAddress, setPickupAddress] = useState(method?.pickupAddress ?? '');
  const [active, setActive] = useState(method?.active ?? true);
  const [freeAbove, setFreeAbove] = useState(method?.freeAbove ? String(method.freeAbove.amount / 100) : '');
  const [busy, setBusy] = useState(false);
  const [touched, setTouched] = useState(false);
  const { dirty, close } = useModalFormGuard(
    { name, kind, price, description, pickupAddress, active, freeAbove },
    onClose,
  );

  const parsedPrice = price.trim() === '' ? 0 : Number(price.replace(',', '.'));
  const priceValid = Number.isFinite(parsedPrice) && parsedPrice >= 0;
  const nameValid = name.trim().length > 0;
  const pickupValid = kind !== 'PICKUP' || pickupAddress.trim().length > 0;
  const parsedFreeAbove = freeAbove.trim() === '' ? null : Number(freeAbove.replace(/\D/g, ''));
  const freeAboveValid =
    parsedFreeAbove === null || (Number.isFinite(parsedFreeAbove) && parsedFreeAbove >= 0);
  const valid = nameValid && priceValid && pickupValid && freeAboveValid;

  const submit = async () => {
    setTouched(true);
    if (!valid || busy) return;
    setBusy(true);
    const body: ShippingMethodRequest = {
      name: name.trim(),
      kind,
      price: parsedPrice,
      description: description.trim() === '' ? null : description.trim(),
      pickupAddress: kind === 'PICKUP' ? pickupAddress.trim() : null,
      active,
      sortOrder: method?.sortOrder ?? nextSortOrder,
      freeAbove: parsedFreeAbove && parsedFreeAbove > 0 ? parsedFreeAbove : null,
    };
    try {
      if (method) await api.put<ShippingMethod>(`/api/v1/admin/shipping/methods/${method.id}`, body);
      else await api.post<ShippingMethod>('/api/v1/admin/shipping/methods', body);
      onSaved(!method);
    } catch (err) {
      toast(errMsg(err, 'No se pudo guardar el medio de envío.'), { variant: 'error' });
      setBusy(false);
    }
  };

  const inputCls =
    'h-10 w-full rounded-md border border-border-strong bg-surface px-3 text-sm text-fg focus:outline-none focus:ring-2 focus:ring-primary';

  return (
    <Modal
      open
      onClose={onClose}
      dirty={dirty}
      title={method ? 'Editar medio de envío' : 'Agregar medio de envío'}
      footer={
        <>
          <Button variant="secondary" onClick={close} disabled={busy}>
            Cancelar
          </Button>
          <Button onClick={submit} disabled={busy}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            {method ? 'Guardar cambios' : 'Crear medio de envío'}
          </Button>
        </>
      }
    >
      <p className="text-sm text-fg-muted">
        Una tarifa tuya: el precio lo ponés acá y no se consulta con ningún correo. El comprador la va a ver
        con este nombre en el checkout.
      </p>

      <div className="mt-4 space-y-3">
        <div>
          <label htmlFor={`${fid}-1`} className="mb-1 block text-sm font-medium text-fg">
            Nombre
          </label>
          <input
            id={`${fid}-1`}
            aria-label="Nombre"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ej.: Envío express CABA"
            className={inputCls}
            autoFocus
          />
          {touched && !nameValid && <p className="mt-1 text-xs text-danger">Ingresá un nombre.</p>}
        </div>

        <div>
          <label htmlFor={`${fid}-2`} className="mb-1 block text-sm font-medium text-fg">
            Tipo
          </label>
          <select
            id={`${fid}-2`}
            aria-label="Tipo"
            value={kind}
            onChange={(e) => setKind(e.target.value as ShippingKind)}
            className={inputCls}
          >
            <option value="DELIVERY">Envío a domicilio</option>
            <option value="PICKUP">Retiro en punto</option>
          </select>
        </div>

        <div>
          <label htmlFor={`${fid}-3`} className="mb-1 block text-sm font-medium text-fg">
            Precio
          </label>
          <input
            id={`${fid}-3`}
            aria-label="Precio"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            inputMode="decimal"
            placeholder="0 = gratis"
            className={inputCls}
          />
          {touched && !priceValid ? (
            <p className="mt-1 text-xs text-danger">Ingresá un precio válido (0 o más).</p>
          ) : (
            <p className="mt-1 text-xs text-fg-muted">Dejalo en 0 para ofrecerlo gratis.</p>
          )}
        </div>

        {parsedPrice > 0 && (
          <div>
            <label htmlFor={`${fid}-6`} className="mb-1 block text-sm font-medium text-fg">
              Gratis desde (opcional)
            </label>
            <input
              id={`${fid}-6`}
              aria-label="Gratis desde (opcional)"
              value={freeAbove}
              onChange={(e) => setFreeAbove(e.target.value)}
              inputMode="decimal"
              placeholder="Ej.: 50000"
              className={inputCls}
            />
            {touched && !freeAboveValid ? (
              <p className="mt-1 text-xs text-danger">Ingresá un monto válido.</p>
            ) : (
              <p className="mt-1 text-xs text-fg-muted">
                Con compras de este monto o más (en productos, antes de cupones), este envío no se cobra. Es
                lo que muestra la barra «te faltan $X para el envío gratis» del carrito: con varios medios, la
                barra usa el monto más bajo.
              </p>
            )}
          </div>
        )}

        <div>
          <label htmlFor={`${fid}-4`} className="mb-1 block text-sm font-medium text-fg">
            Plazo o descripción (opcional)
          </label>
          <input
            id={`${fid}-4`}
            aria-label="Plazo o descripción (opcional)"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Llega en 3 a 5 días hábiles"
            className={inputCls}
          />
        </div>

        {kind === 'PICKUP' && (
          <div>
            <label htmlFor={`${fid}-5`} className="mb-1 block text-sm font-medium text-fg">
              Dirección y horarios de retiro
            </label>
            <textarea
              id={`${fid}-5`}
              aria-label="Dirección y horarios de retiro"
              value={pickupAddress}
              onChange={(e) => setPickupAddress(e.target.value)}
              rows={2}
              placeholder="Av. Corrientes 1234, CABA · Lun a Vie de 10 a 18 h"
              className="w-full rounded-md border border-border-strong bg-surface px-3 py-2 text-sm text-fg focus:outline-none focus:ring-2 focus:ring-primary"
            />
            {touched && !pickupValid && (
              <p className="mt-1 text-xs text-danger">Indicá dónde y cuándo se retira el pedido.</p>
            )}
          </div>
        )}

        <div className="flex items-center justify-between rounded-md border border-border bg-bg-muted/40 px-3 py-2.5">
          <div>
            <div className="text-sm font-medium text-fg">Activo</div>
            <div className="text-xs text-fg-muted">Si lo desactivás, deja de aparecer en el checkout.</div>
          </div>
          <Switch aria-label="Activo" checked={active} onChange={setActive} />
        </div>
      </div>
    </Modal>
  );
}
