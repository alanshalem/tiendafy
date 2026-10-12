import { useEffect, useState, useId } from 'react';
import { Download, Loader2, Zap } from 'lucide-react';
import { Input, Modal, useToast } from '@tiendafy/ui';
import { api, errMsg } from '../lib/api';
import { downloadBlob } from '../lib/download';
import {
  declaredValueFromOrder,
  parseAddress,
  shipmentTriggerCls,
  type ShippingOrderLike,
} from '../lib/shipping';
import { ShipmentFooter, shipmentLabelCls } from './ShipmentBits';

interface ShipmentState {
  exists: boolean;
  alreadyExisted?: boolean;
  shipmentId?: number;
  carrier?: string | null;
  carrierTrackingId?: string | null;
  trackingUrl?: string | null;
  status?: string | null;
}

/**
 * Envío Zipnova de una venta: creación (una sola vez — el backend garantiza
 * que no se duplica, porque Zipnova no deduplica y cada envío consume saldo
 * real), estado, tracking y descarga de la etiqueta PDF.
 */
export function ZipnovaShipmentButton({ order }: { order: ShippingOrderLike }) {
  const { toast } = useToast();
  const [state, setState] = useState<ShipmentState | null>(null);
  const [configured, setConfigured] = useState(false);
  const [open, setOpen] = useState(false);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    let alive = true;
    api
      .get<{ configured: boolean }>('/api/v1/admin/shipping/zipnova')
      .then((c) => {
        if (!alive || !c.configured) return;
        setConfigured(true);
        return api
          .get<ShipmentState>(`/api/v1/admin/orders/${order.id}/zipnova-shipment`)
          .then((s) => alive && setState(s));
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [order.id]);

  if (!configured) return null;

  const downloadLabel = async () => {
    setDownloading(true);
    try {
      const blob = await api.download(`/api/v1/admin/orders/${order.id}/zipnova-label`);
      downloadBlob(blob, `etiqueta-zipnova-${state?.shipmentId ?? order.id}.pdf`);
    } catch (e) {
      toast(errMsg(e, 'No se pudo descargar la etiqueta.'), { variant: 'error' });
    } finally {
      setDownloading(false);
    }
  };

  if (state?.exists) {
    return (
      <span className="inline-flex flex-wrap items-center gap-2">
        <span className="inline-flex h-8 items-center gap-1.5 rounded-md bg-bg-muted px-3 text-xs font-medium text-fg">
          <Zap className="h-3.5 w-3.5 text-fg-muted" /> Zipnova #{state.shipmentId}
          {state.carrier ? ` · ${state.carrier}` : ''}
          {state.carrierTrackingId ? ` · ${state.carrierTrackingId}` : ''}
        </span>
        <button
          onClick={downloadLabel}
          disabled={downloading}
          className={`${shipmentTriggerCls} disabled:opacity-50`}
        >
          {downloading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Download className="h-3.5 w-3.5" />
          )}{' '}
          Etiqueta PDF
        </button>
        {state.trackingUrl && (
          <a
            href={state.trackingUrl}
            target="_blank"
            rel="noreferrer"
            className="text-xs font-medium text-primary hover:underline"
          >
            Seguimiento
          </a>
        )}
      </span>
    );
  }

  return (
    <>
      <button onClick={() => setOpen(true)} className={shipmentTriggerCls}>
        <Zap className="h-3.5 w-3.5" /> Crear envío en Zipnova
      </button>
      {open && (
        <ShipmentModal
          order={order}
          onClose={() => setOpen(false)}
          onCreated={(s) => {
            setState(s);
            setOpen(false);
          }}
        />
      )}
    </>
  );
}

function ShipmentModal({
  order,
  onClose,
  onCreated,
}: {
  order: ShippingOrderLike;
  onClose: () => void;
  onCreated: (s: ShipmentState) => void;
}) {
  const fid = useId();
  const { toast } = useToast();
  const parsed = parseAddress(order.shippingAddress);

  const [name, setName] = useState(order.buyerName ?? '');
  const [document, setDocument] = useState(order.docNumber ?? '');
  const [email, setEmail] = useState(order.buyerEmail);
  const [phone, setPhone] = useState(order.buyerPhone ?? '');
  const [street, setStreet] = useState(parsed.street);
  const [number, setNumber] = useState(parsed.number);
  const [extras, setExtras] = useState('');
  const [city, setCity] = useState(parsed.city);
  const [stateName, setStateName] = useState('');
  const [zipcode, setZipcode] = useState(parsed.cp);
  const [declared, setDeclared] = useState(declaredValueFromOrder(order));
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    try {
      const res = await api.post<ShipmentState>(`/api/v1/admin/orders/${order.id}/zipnova-shipment`, {
        name: name.trim(),
        document: document.trim(),
        email: email.trim(),
        phone: phone.trim(),
        street: street.trim(),
        streetNumber: number.trim(),
        streetExtras: extras.trim() || null,
        city: city.trim(),
        state: stateName.trim(),
        zipcode: zipcode.trim(),
        declaredValue: Number(declared) || 0,
      });
      toast(res.alreadyExisted ? 'Esta venta ya tenía un envío en Zipnova' : 'Envío creado en Zipnova', {
        variant: 'success',
      });
      onCreated(res);
    } catch (err) {
      toast(errMsg(err, 'No se pudo crear el envío en Zipnova.'), { variant: 'error' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      size="lg"
      onClose={onClose}
      title="Crear envío en Zipnova"
      footer={<ShipmentFooter busy={busy} onClose={onClose} onSubmit={submit} />}
    >
      <div className="max-h-[62vh] space-y-4 overflow-y-auto pr-1">
        <p className="text-xs text-fg-muted">
          Revisá antes de confirmar:{' '}
          <span className="font-medium text-fg">el envío es real y consume saldo de tu cuenta Zipnova</span>{' '}
          (no hay modo de prueba). Zipnova exige nombre, documento, email y teléfono del destinatario.
        </p>

        <div className="grid gap-2.5 sm:grid-cols-2">
          <div>
            <label htmlFor={`${fid}-1`} className={shipmentLabelCls}>
              Nombre del destinatario
            </label>
            <Input
              id={`${fid}-1`}
              aria-label="Nombre del destinatario"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div>
            <label htmlFor={`${fid}-2`} className={shipmentLabelCls}>
              DNI / documento
            </label>
            <Input
              id={`${fid}-2`}
              aria-label="DNI / documento"
              value={document}
              onChange={(e) => setDocument(e.target.value)}
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
        </div>

        <div className="grid gap-2.5 sm:grid-cols-6">
          <div className="sm:col-span-3">
            <label htmlFor={`${fid}-5`} className={shipmentLabelCls}>
              Calle
            </label>
            <Input
              id={`${fid}-5`}
              aria-label="Calle"
              value={street}
              onChange={(e) => setStreet(e.target.value)}
            />
          </div>
          <div>
            <label htmlFor={`${fid}-6`} className={shipmentLabelCls}>
              Número
            </label>
            <Input
              id={`${fid}-6`}
              aria-label="Número"
              value={number}
              onChange={(e) => setNumber(e.target.value)}
            />
          </div>
          <div className="sm:col-span-2">
            <label htmlFor={`${fid}-7`} className={shipmentLabelCls}>
              Piso / depto (opcional)
            </label>
            <Input
              id={`${fid}-7`}
              aria-label="Piso / depto (opcional)"
              value={extras}
              onChange={(e) => setExtras(e.target.value)}
            />
          </div>
          <div className="sm:col-span-2">
            <label htmlFor={`${fid}-8`} className={shipmentLabelCls}>
              Ciudad
            </label>
            <Input
              id={`${fid}-8`}
              aria-label="Ciudad"
              value={city}
              onChange={(e) => setCity(e.target.value)}
            />
          </div>
          <div className="sm:col-span-2">
            <label htmlFor={`${fid}-9`} className={shipmentLabelCls}>
              Provincia
            </label>
            <Input
              id={`${fid}-9`}
              aria-label="Provincia"
              value={stateName}
              onChange={(e) => setStateName(e.target.value)}
              placeholder="Ej: Santa Fe"
            />
          </div>
          <div>
            <label htmlFor={`${fid}-10`} className={shipmentLabelCls}>
              CP
            </label>
            <Input
              id={`${fid}-10`}
              aria-label="CP"
              value={zipcode}
              onChange={(e) => setZipcode(e.target.value)}
            />
          </div>
          <div>
            <label htmlFor={`${fid}-11`} className={shipmentLabelCls}>
              Valor declarado ($)
            </label>
            <Input
              id={`${fid}-11`}
              aria-label="Valor declarado ($)"
              value={declared}
              onChange={(e) => setDeclared(e.target.value)}
              inputMode="numeric"
            />
          </div>
        </div>
      </div>
    </Modal>
  );
}
