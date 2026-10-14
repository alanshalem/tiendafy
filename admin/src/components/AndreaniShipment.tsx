import { useEffect, useState, useId } from 'react';
import { Download, Loader2, Truck } from 'lucide-react';
import { Input, Modal, Switch, useToast } from '@tiendafy/ui';
import { api, errMsg } from '../lib/api';
import { downloadBlob } from '../lib/download';
import { useModalFormGuard } from '../lib/useUnsavedChanges';
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
  trackingNumber?: string;
  allTrackingNumbers?: string[];
  status?: string;
  label?: string;
  hasLabel?: boolean;
  branchName?: string | null;
}

/**
 * Envío de Andreani de una venta: se genera una sola vez, se descarga la
 * etiqueta y se consulta el seguimiento.
 *
 * El backend garantiza que no se duplique, y acá importa más que en otros
 * carriers: <b>Andreani no tiene endpoint de cancelación</b>. Un envío de más
 * no se puede anular por API y se factura igual.
 */
export function AndreaniShipmentButton({ order }: { order: ShippingOrderLike }) {
  const { toast } = useToast();
  const [state, setState] = useState<ShipmentState | null>(null);
  const [configured, setConfigured] = useState(false);
  const [canShip, setCanShip] = useState(false);
  const [open, setOpen] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [tracking, setTracking] = useState(false);

  useEffect(() => {
    let alive = true;
    api
      .get<{ configured: boolean; canCreateShipments?: boolean }>('/api/v1/admin/shipping/andreani')
      .then((c) => {
        if (!alive || !c.configured) return;
        setConfigured(true);
        setCanShip(Boolean(c.canCreateShipments));
        return api
          .get<ShipmentState>(`/api/v1/admin/orders/${order.id}/andreani-shipment`)
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
      const blob = await api.download(`/api/v1/admin/orders/${order.id}/andreani-label`);
      downloadBlob(blob, `etiqueta-andreani-${state?.trackingNumber ?? order.id}.pdf`);
    } catch (e) {
      toast(errMsg(e, 'No se pudo descargar la etiqueta.'), { variant: 'error' });
    } finally {
      setDownloading(false);
    }
  };

  const refreshTracking = async () => {
    setTracking(true);
    try {
      const res = await api.get<{ status: string; label: string }>(
        `/api/v1/admin/orders/${order.id}/andreani-tracking`,
      );
      setState((s) => (s ? { ...s, status: res.status, label: res.label } : s));
      toast(`Andreani: ${res.label}`, { variant: 'info' });
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
          <Truck className="h-3.5 w-3.5 text-fg-muted" /> Andreani {state.trackingNumber}
          {state.label ? ` · ${state.label}` : ''}
          {/* Un envío puede tener varios bultos, cada uno con su número. */}
          {(state.allTrackingNumbers?.length ?? 0) > 1 ? ` · ${state.allTrackingNumbers!.length} bultos` : ''}
        </span>
        {state.hasLabel && (
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
        )}
        <button
          onClick={refreshTracking}
          disabled={tracking}
          className={`${shipmentTriggerCls} disabled:opacity-50`}
        >
          {tracking && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Seguimiento
        </button>
      </span>
    );
  }

  if (!canShip) {
    return (
      <span className="text-xs text-warning">
        Completá los datos del remitente en Medios de envío para despachar con Andreani.
      </span>
    );
  }

  return (
    <>
      <button onClick={() => setOpen(true)} className={shipmentTriggerCls}>
        <Truck className="h-3.5 w-3.5" /> Crear envío en Andreani
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
  const [docType, setDocType] = useState('DNI');
  const [docNumber, setDocNumber] = useState(order.docNumber ?? '');
  const [email, setEmail] = useState(order.buyerEmail);
  const [phone, setPhone] = useState(order.buyerPhone ?? '');
  const [street, setStreet] = useState(parsed.street);
  const [number, setNumber] = useState(parsed.number);
  const [extras, setExtras] = useState('');
  const [city, setCity] = useState(parsed.city);
  const [zipcode, setZipcode] = useState(parsed.cp);
  const [declared, setDeclared] = useState(declaredValueFromOrder(order));
  const [toBranch, setToBranch] = useState(false);
  const [branchId, setBranchId] = useState('');
  const [busy, setBusy] = useState(false);
  // Lo precargado de la venta no cuenta: solo lo que la persona corrigió.
  const { dirty, close } = useModalFormGuard(
    {
      name,
      docType,
      docNumber,
      email,
      phone,
      street,
      number,
      extras,
      city,
      zipcode,
      declared,
      toBranch,
      branchId,
    },
    onClose,
  );

  // Andreani corta el email del destinatario en 40 caracteres. Es la causa
  // número uno de rechazos, así que se avisa acá y no cuando falla el despacho.
  const emailTooLong = email.trim().length > 40;

  const submit = async () => {
    setBusy(true);
    try {
      const res = await api.post<ShipmentState>(`/api/v1/admin/orders/${order.id}/andreani-shipment`, {
        name: name.trim(),
        email: email.trim(),
        documentType: docType.trim(),
        documentNumber: docNumber.trim(),
        phone: phone.trim(),
        street: street.trim(),
        streetNumber: number.trim(),
        city: city.trim(),
        postalCode: zipcode.trim(),
        extras: extras.trim() || null,
        declaredValue: Number(declared) || 0,
        toBranch,
        branchId: toBranch ? branchId.trim() : null,
      });
      toast(res.alreadyExisted ? 'Esta venta ya tenía un envío en Andreani' : 'Envío creado en Andreani', {
        variant: 'success',
      });
      onCreated(res);
    } catch (err) {
      toast(errMsg(err, 'No se pudo crear el envío en Andreani.'), { variant: 'error' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      size="lg"
      onClose={onClose}
      dirty={dirty}
      title="Crear envío en Andreani"
      footer={<ShipmentFooter busy={busy || emailTooLong} onClose={close} onSubmit={submit} />}
    >
      <div className="space-y-3">
        <p className="rounded-md bg-warning-bg px-3 py-2 text-xs text-warning">
          Andreani no permite cancelar un envío por API. Revisá los datos antes de generarlo.
        </p>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor={`${fid}-1`} className={shipmentLabelCls}>
              Nombre del destinatario
            </label>
            <Input
              id={`${fid}-1`}
              aria-label="Nombre del destinatario"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={40}
            />
          </div>
          <div>
            <label htmlFor={`${fid}-2`} className={shipmentLabelCls}>
              Email
            </label>
            <Input
              id={`${fid}-2`}
              aria-label="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            {emailTooLong && (
              <p className="mt-1 text-xs text-danger">
                Andreani no acepta emails de más de 40 caracteres ({email.trim().length}).
              </p>
            )}
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <label htmlFor={`${fid}-3`} className={shipmentLabelCls}>
              Tipo de doc.
            </label>
            <Input
              id={`${fid}-3`}
              aria-label="Tipo de doc."
              value={docType}
              onChange={(e) => setDocType(e.target.value)}
            />
          </div>
          <div>
            <label htmlFor={`${fid}-4`} className={shipmentLabelCls}>
              Número
            </label>
            <Input
              id={`${fid}-4`}
              aria-label="Número"
              value={docNumber}
              onChange={(e) => setDocNumber(e.target.value)}
            />
          </div>
          <div>
            <label htmlFor={`${fid}-5`} className={shipmentLabelCls}>
              Teléfono
            </label>
            <Input
              id={`${fid}-5`}
              aria-label="Teléfono"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              maxLength={15}
            />
          </div>
        </div>

        <Switch
          checked={toBranch}
          onChange={setToBranch}
          label="Retiro en sucursal de Andreani"
          description="Usa el contrato de sucursal en vez del de domicilio."
        />

        {toBranch ? (
          <div>
            <label htmlFor={`${fid}-6`} className={shipmentLabelCls}>
              ID de la sucursal de retiro
            </label>
            <Input
              id={`${fid}-6`}
              aria-label="ID de la sucursal de retiro"
              value={branchId}
              onChange={(e) => setBranchId(e.target.value)}
            />
          </div>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-4">
              <div className="sm:col-span-2">
                <label htmlFor={`${fid}-7`} className={shipmentLabelCls}>
                  Calle
                </label>
                <Input
                  id={`${fid}-7`}
                  aria-label="Calle"
                  value={street}
                  onChange={(e) => setStreet(e.target.value)}
                  maxLength={40}
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
                  maxLength={40}
                />
              </div>
              <div>
                <label htmlFor={`${fid}-9`} className={shipmentLabelCls}>
                  Código postal
                </label>
                <Input
                  id={`${fid}-9`}
                  aria-label="Código postal"
                  value={zipcode}
                  onChange={(e) => setZipcode(e.target.value)}
                  maxLength={4}
                />
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor={`${fid}-10`} className={shipmentLabelCls}>
                  Localidad
                </label>
                <Input
                  id={`${fid}-10`}
                  aria-label="Localidad"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  maxLength={40}
                />
              </div>
              <div>
                <label htmlFor={`${fid}-11`} className={shipmentLabelCls}>
                  Piso, depto. u observaciones
                </label>
                <Input
                  id={`${fid}-11`}
                  aria-label="Piso, depto. u observaciones"
                  value={extras}
                  onChange={(e) => setExtras(e.target.value)}
                  maxLength={40}
                />
              </div>
            </div>
          </>
        )}

        <div className="sm:w-1/2">
          <label htmlFor={`${fid}-12`} className={shipmentLabelCls}>
            Valor declarado
          </label>
          <Input
            id={`${fid}-12`}
            aria-label="Valor declarado"
            value={declared}
            onChange={(e) => setDeclared(e.target.value)}
            inputMode="decimal"
          />
        </div>
      </div>
    </Modal>
  );
}
