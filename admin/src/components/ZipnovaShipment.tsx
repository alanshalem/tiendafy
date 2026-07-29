import { useEffect, useState } from 'react';
import { Download, Loader2, Zap } from 'lucide-react';
import { Button, Input, Modal, useToast } from '@tiendafy/ui';
import { api, errMsg } from '../lib/api';

interface OrderLike {
  id: string;
  buyerEmail: string;
  buyerName: string | null;
  buyerPhone: string | null;
  docNumber: string | null;
  shippingMethod: string | null;
  shippingAddress: string | null;
  total: { amount: number; currency: string };
}

interface ShipmentState {
  exists: boolean;
  alreadyExisted?: boolean;
  shipmentId?: number;
  carrier?: string | null;
  carrierTrackingId?: string | null;
  trackingUrl?: string | null;
  status?: string | null;
}

/** "Av. Corrientes 1234, 2B, CABA, CP 1043" → campos sueltos (mejor esfuerzo). */
function parseAddress(raw: string | null): { street: string; number: string; city: string; cp: string } {
  const out = { street: '', number: '', city: '', cp: '' };
  if (!raw) return out;
  const parts = raw.split(',').map((p) => p.trim());
  const cpPart = parts.find((p) => /^CP\s/i.test(p));
  if (cpPart) out.cp = cpPart.replace(/^CP\s*/i, '');
  const m = (parts[0] ?? '').match(/^(.*?)\s+(\d+[a-zA-Z]?)$/);
  if (m) {
    out.street = m[1] ?? '';
    out.number = m[2] ?? '';
  } else {
    out.street = parts[0] ?? '';
  }
  const rest = parts.slice(1).filter((p) => !/^CP\s/i.test(p));
  out.city = rest[rest.length - 1] ?? '';
  return out;
}

/**
 * Envío Zipnova de una venta: creación (una sola vez — el backend garantiza
 * que no se duplica, porque Zipnova no deduplica y cada envío consume saldo
 * real), estado, tracking y descarga de la etiqueta PDF.
 */
export function ZipnovaShipmentButton({ order }: { order: OrderLike }) {
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
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `etiqueta-zipnova-${state?.shipmentId ?? order.id}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
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
          className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border-strong bg-surface px-3 text-xs font-semibold text-fg hover:bg-bg-muted disabled:opacity-50"
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
      <button
        onClick={() => setOpen(true)}
        className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border-strong bg-surface px-3 text-xs font-semibold text-fg hover:bg-bg-muted"
      >
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
  order: OrderLike;
  onClose: () => void;
  onCreated: (s: ShipmentState) => void;
}) {
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
  const [declared, setDeclared] = useState(String(Math.round(order.total.amount / 100)));
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

  const label = 'mb-1 block text-xs font-medium text-fg';

  return (
    <Modal
      open
      size="lg"
      onClose={onClose}
      title="Crear envío en Zipnova"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={submit} disabled={busy}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" />} Crear envío
          </Button>
        </>
      }
    >
      <div className="max-h-[62vh] space-y-4 overflow-y-auto pr-1">
        <p className="text-xs text-fg-muted">
          Revisá antes de confirmar:{' '}
          <span className="font-medium text-fg">el envío es real y consume saldo de tu cuenta Zipnova</span>{' '}
          (no hay modo de prueba). Zipnova exige nombre, documento, email y teléfono del destinatario.
        </p>

        <div className="grid gap-2.5 sm:grid-cols-2">
          <div>
            <label className={label}>Nombre del destinatario</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <label className={label}>DNI / documento</label>
            <Input value={document} onChange={(e) => setDocument(e.target.value)} />
          </div>
          <div>
            <label className={label}>Email</label>
            <Input value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div>
            <label className={label}>Teléfono</label>
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>
        </div>

        <div className="grid gap-2.5 sm:grid-cols-6">
          <div className="sm:col-span-3">
            <label className={label}>Calle</label>
            <Input value={street} onChange={(e) => setStreet(e.target.value)} />
          </div>
          <div>
            <label className={label}>Número</label>
            <Input value={number} onChange={(e) => setNumber(e.target.value)} />
          </div>
          <div className="sm:col-span-2">
            <label className={label}>Piso / depto (opcional)</label>
            <Input value={extras} onChange={(e) => setExtras(e.target.value)} />
          </div>
          <div className="sm:col-span-2">
            <label className={label}>Ciudad</label>
            <Input value={city} onChange={(e) => setCity(e.target.value)} />
          </div>
          <div className="sm:col-span-2">
            <label className={label}>Provincia</label>
            <Input
              value={stateName}
              onChange={(e) => setStateName(e.target.value)}
              placeholder="Ej: Santa Fe"
            />
          </div>
          <div>
            <label className={label}>CP</label>
            <Input value={zipcode} onChange={(e) => setZipcode(e.target.value)} />
          </div>
          <div>
            <label className={label}>Valor declarado ($)</label>
            <Input value={declared} onChange={(e) => setDeclared(e.target.value)} inputMode="numeric" />
          </div>
        </div>
      </div>
    </Modal>
  );
}
