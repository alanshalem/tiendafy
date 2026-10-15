import { useEffect, useState, useId } from 'react';
import { Send } from 'lucide-react';
import { Button, Input, Modal, Select, Spinner, useToast } from '@tiendafy/ui';
import { api, errMsg } from '../lib/api';
import { useModalFormGuard } from '../lib/useUnsavedChanges';
import {
  declaredValueFromOrder,
  parseAddress,
  shipmentTriggerCls,
  type ShippingOrderLike,
} from '../lib/shipping';
import { ShipmentFooter, shipmentLabelCls } from './ShipmentBits';

const CORREO_PROVINCES: { value: string; label: string }[] = [
  { value: 'B', label: 'Buenos Aires' },
  { value: 'C', label: 'CABA' },
  { value: 'K', label: 'Catamarca' },
  { value: 'H', label: 'Chaco' },
  { value: 'U', label: 'Chubut' },
  { value: 'X', label: 'Córdoba' },
  { value: 'W', label: 'Corrientes' },
  { value: 'E', label: 'Entre Ríos' },
  { value: 'P', label: 'Formosa' },
  { value: 'Y', label: 'Jujuy' },
  { value: 'L', label: 'La Pampa' },
  { value: 'F', label: 'La Rioja' },
  { value: 'M', label: 'Mendoza' },
  { value: 'N', label: 'Misiones' },
  { value: 'Q', label: 'Neuquén' },
  { value: 'R', label: 'Río Negro' },
  { value: 'A', label: 'Salta' },
  { value: 'J', label: 'San Juan' },
  { value: 'D', label: 'San Luis' },
  { value: 'Z', label: 'Santa Cruz' },
  { value: 'S', label: 'Santa Fe' },
  { value: 'G', label: 'Santiago del Estero' },
  { value: 'V', label: 'Tierra del Fuego' },
  { value: 'T', label: 'Tucumán' },
];

interface ShipmentState {
  exists: boolean;
  alreadyExisted?: boolean;
  deliveryType?: 'D' | 'S';
  agency?: string | null;
  createdAt?: string | null;
}

interface TrackingResponse {
  items: { trackingNumber: string | null; events: { event: string | null; date: string | null }[] }[];
}

/**
 * Alta del envío de una venta en MiCorreo (POST /shipping/import). Precarga
 * los datos del comprador y la dirección parseada BEST-EFFORT — el merchant
 * revisa y corrige antes de confirmar (la dirección de la orden es texto
 * libre; MiCorreo la exige estructurada). Después del alta, el pago del
 * envío y la etiqueta se terminan en la plataforma MiCorreo.
 *
 * El alta queda registrada: una venta se da de alta una sola vez (el backend
 * lo garantiza; no se sabe si MiCorreo deduplica). Con el número de
 * seguimiento cargado en la venta, se consulta el seguimiento desde acá.
 */
export function CorreoShipmentButton({ order }: { order: ShippingOrderLike }) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [configured, setConfigured] = useState(false);
  const [state, setState] = useState<ShipmentState | null>(null);
  const [tracking, setTracking] = useState(false);

  useEffect(() => {
    let alive = true;
    api
      .get<{ configured: boolean; active?: boolean }>('/api/v1/admin/shipping/correo')
      .then((c) => {
        if (!alive || !c.configured) return;
        setConfigured(true);
        return api
          .get<ShipmentState>(`/api/v1/admin/orders/${order.id}/correo-shipment`)
          .then((s) => alive && setState(s));
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [order.id]);

  if (!configured) return null;

  const trackingNumber = order.tracking?.trim();

  const refreshTracking = async () => {
    if (!trackingNumber) return;
    setTracking(true);
    try {
      const res = await api.get<TrackingResponse>(
        `/api/v1/admin/shipping/correo/tracking?shippingId=${encodeURIComponent(trackingNumber)}`,
      );
      // El backend los ordena del más nuevo al más viejo.
      const last = res.items.flatMap((i) => i.events).find((e) => e.event);
      toast(
        last
          ? `Correo Argentino: ${last.event}${last.date ? ` (${last.date})` : ''}`
          : 'Correo Argentino todavía no tiene novedades de este envío.',
        { variant: 'info' },
      );
    } catch (e) {
      toast(errMsg(e, 'No se pudo consultar el seguimiento.'), { variant: 'error' });
    } finally {
      setTracking(false);
    }
  };

  if (state?.exists) {
    return (
      <span className="inline-flex flex-wrap items-center gap-2">
        <span className="inline-flex h-8 items-center gap-1.5 rounded-md bg-bg-muted px-3 text-xs font-medium text-fg">
          <Send className="h-3.5 w-3.5 text-fg-muted" /> Correo Argentino · alta en MiCorreo
          {state.deliveryType === 'S' && state.agency ? ` · sucursal ${state.agency}` : ''}
        </span>
        {trackingNumber ? (
          <button
            onClick={refreshTracking}
            disabled={tracking}
            className={`${shipmentTriggerCls} disabled:opacity-50`}
          >
            {tracking && <Spinner inline size={14} />} Seguimiento
          </button>
        ) : (
          <span className="text-xs text-fg-muted">
            Cargá el número de seguimiento de MiCorreo en la venta para consultarlo acá.
          </span>
        )}
      </span>
    );
  }

  return (
    <>
      <button onClick={() => setOpen(true)} className={shipmentTriggerCls}>
        <Send className="h-3.5 w-3.5" /> Crear envío en Correo Argentino
      </button>
      {open && (
        <ShipmentModal
          order={order}
          onClose={(created) => {
            setOpen(false);
            if (created) setState(created);
          }}
        />
      )}
    </>
  );
}

function ShipmentModal({
  order,
  onClose,
}: {
  order: ShippingOrderLike;
  /** Con el alta hecha, la recibe para que el botón pase a mostrarla. */
  onClose: (created?: ShipmentState) => void;
}) {
  const fid = useId();
  const { toast } = useToast();
  const parsed = parseAddress(order.shippingAddress);
  const isAgencyMethod = /sucursal/i.test(order.shippingMethod ?? '');
  const agencyCodeInAddress = order.shippingAddress?.match(/\(([A-Z]\d{3,5})\)/)?.[1] ?? '';

  const [deliveryType, setDeliveryType] = useState(isAgencyMethod ? 'S' : 'D');
  const [name, setName] = useState(order.buyerName ?? '');
  const [email, setEmail] = useState(order.buyerEmail);
  const [phone, setPhone] = useState(order.buyerPhone ?? '');
  const [street, setStreet] = useState(parsed.street);
  const [number, setNumber] = useState(parsed.number);
  const [floor, setFloor] = useState('');
  const [apartment, setApartment] = useState('');
  const [city, setCity] = useState(parsed.city);
  const [province, setProvince] = useState('B');
  const [cp, setCp] = useState(parsed.cp);
  const [agency, setAgency] = useState(agencyCodeInAddress);
  const [declared, setDeclared] = useState(declaredValueFromOrder(order));
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<ShipmentState | null>(null);
  // Cerrar después del alta le pasa el envío al botón, que pasa a mostrarlo.
  const finish = () => onClose(done ?? undefined);
  // Creado el envío, lo que queda en el form ya no se pierde: cerrar no pregunta.
  const { dirty, close } = useModalFormGuard(
    {
      deliveryType,
      name,
      email,
      phone,
      street,
      number,
      floor,
      apartment,
      city,
      province,
      cp,
      agency,
      declared,
    },
    () => onClose(),
    { enabled: !done },
  );

  const submit = async () => {
    setBusy(true);
    try {
      const res = await api.post<ShipmentState>(`/api/v1/admin/orders/${order.id}/correo-shipment`, {
        deliveryType,
        recipientName: name.trim(),
        recipientEmail: email.trim(),
        recipientPhone: phone.trim() || null,
        streetName: street.trim() || null,
        streetNumber: number.trim() || null,
        floor: floor.trim() || null,
        apartment: apartment.trim() || null,
        city: city.trim() || null,
        provinceCode: province,
        postalCode: cp.trim() || null,
        agency: agency.trim() || null,
        declaredValue: Number(declared) || 0,
      });
      setDone(res);
      toast(
        res.alreadyExisted ? 'Esta venta ya estaba dada de alta en MiCorreo' : 'Envío creado en MiCorreo',
        {
          variant: 'success',
        },
      );
    } catch (err) {
      toast(errMsg(err, 'No se pudo crear el envío en MiCorreo.'), { variant: 'error' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      size="lg"
      onClose={finish}
      dirty={dirty}
      title="Crear envío en Correo Argentino"
      footer={
        done ? (
          <Button onClick={finish}>Listo</Button>
        ) : (
          <ShipmentFooter busy={busy} onClose={close} onSubmit={submit} />
        )
      }
    >
      {done ? (
        <div className="space-y-2 text-sm text-fg">
          <p className="font-semibold text-success">El envío quedó importado en MiCorreo. ✓</p>
          <p className="text-fg-muted">
            Para terminar, entrá a tu cuenta de MiCorreo: ahí pagás el envío, generás la etiqueta y obtenés el
            número de seguimiento. Después cargalo en esta venta con “Marcar enviada” y vas a poder consultar
            el seguimiento desde acá.
          </p>
        </div>
      ) : (
        <div className="max-h-[62vh] space-y-4 overflow-y-auto pr-1">
          <p className="text-xs text-fg-muted">
            Revisá los datos antes de confirmar: la dirección se precarga desde la venta pero puede necesitar
            ajustes (MiCorreo la pide separada en campos).
          </p>

          <div className="grid gap-2.5 sm:grid-cols-3">
            <div className="sm:col-span-1">
              <label htmlFor={`${fid}-1`} className={shipmentLabelCls}>
                Tipo de entrega
              </label>
              <Select
                id={`${fid}-1`}
                aria-label="Tipo de entrega"
                value={deliveryType}
                onChange={(e) => setDeliveryType(e.target.value)}
                options={[
                  { value: 'D', label: 'A domicilio' },
                  { value: 'S', label: 'A sucursal' },
                ]}
              />
            </div>
            <div>
              <label htmlFor={`${fid}-2`} className={shipmentLabelCls}>
                Nombre del destinatario
              </label>
              <Input
                id={`${fid}-2`}
                aria-label="Nombre del destinatario"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div>
              <label htmlFor={`${fid}-3`} className={shipmentLabelCls}>
                Email
              </label>
              <Input
                id={`${fid}-3`}
                aria-label="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div>
              <label htmlFor={`${fid}-4`} className={shipmentLabelCls}>
                Teléfono
              </label>
              <Input
                id={`${fid}-4`}
                aria-label="Teléfono"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            </div>
            <div>
              <label htmlFor={`${fid}-5`} className={shipmentLabelCls}>
                Valor declarado ($)
              </label>
              <Input
                id={`${fid}-5`}
                aria-label="Valor declarado ($)"
                value={declared}
                onChange={(e) => setDeclared(e.target.value)}
                inputMode="numeric"
              />
            </div>
          </div>

          {deliveryType === 'S' ? (
            <div>
              <label htmlFor={`${fid}-6`} className={shipmentLabelCls}>
                Código de sucursal (ej: B0107)
              </label>
              <Input
                id={`${fid}-6`}
                aria-label="Código de sucursal (ej: B0107)"
                value={agency}
                onChange={(e) => setAgency(e.target.value.toUpperCase())}
              />
              <p className="mt-1 text-xs text-fg-subtle">
                Si el comprador eligió sucursal en el checkout, el código figura en la dirección de la venta.
              </p>
            </div>
          ) : (
            <div className="grid gap-2.5 sm:grid-cols-6">
              <div className="sm:col-span-3">
                <label htmlFor={`${fid}-7`} className={shipmentLabelCls}>
                  Calle
                </label>
                <Input
                  id={`${fid}-7`}
                  aria-label="Calle"
                  value={street}
                  onChange={(e) => setStreet(e.target.value)}
                />
              </div>
              <div>
                <label htmlFor={`${fid}-8`} className={shipmentLabelCls}>
                  Número
                </label>
                <Input
                  id={`${fid}-8`}
                  aria-label="Número"
                  value={number}
                  onChange={(e) => setNumber(e.target.value)}
                />
              </div>
              <div>
                <label htmlFor={`${fid}-9`} className={shipmentLabelCls}>
                  Piso
                </label>
                <Input
                  id={`${fid}-9`}
                  aria-label="Piso"
                  value={floor}
                  onChange={(e) => setFloor(e.target.value)}
                />
              </div>
              <div>
                <label htmlFor={`${fid}-10`} className={shipmentLabelCls}>
                  Depto
                </label>
                <Input
                  id={`${fid}-10`}
                  aria-label="Depto"
                  value={apartment}
                  onChange={(e) => setApartment(e.target.value)}
                />
              </div>
              <div className="sm:col-span-2">
                <label htmlFor={`${fid}-11`} className={shipmentLabelCls}>
                  Ciudad
                </label>
                <Input
                  id={`${fid}-11`}
                  aria-label="Ciudad"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                />
              </div>
              <div className="sm:col-span-2">
                <label htmlFor={`${fid}-12`} className={shipmentLabelCls}>
                  Provincia
                </label>
                <Select
                  id={`${fid}-12`}
                  aria-label="Provincia"
                  value={province}
                  onChange={(e) => setProvince(e.target.value)}
                  options={CORREO_PROVINCES}
                />
              </div>
              <div className="sm:col-span-2">
                <label htmlFor={`${fid}-13`} className={shipmentLabelCls}>
                  Código postal
                </label>
                <Input
                  id={`${fid}-13`}
                  aria-label="Código postal"
                  value={cp}
                  onChange={(e) => setCp(e.target.value)}
                />
              </div>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
